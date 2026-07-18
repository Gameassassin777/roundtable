import * as THREE from 'three';

// The anime-background pipeline (Calvin's idea, formalized).
//
// Anime studios build 3D layouts, render them ONCE, then flatten/clean the
// render into painted 2D background art — characters and effects live on top.
// This game can do the same because the camera is static and the scene only
// changes per story beat: render the static world to a texture on scene
// change, run a heavy painterly pass over it ONCE, and display the result as
// a full-screen backdrop. Only the living layer (fog banks, motes, precip)
// stays real-time 3D.
//
// Two wins over running a painterly filter live (the Susurrus approach):
//   - Quality: an 8-sector Kuwahara at radius 6-7 (~2300 taps/pixel) is far
//     too heavy for 60fps mobile, but free when it runs once per scene.
//   - Cost: per-frame rendering collapses from 200+ shadowed instanced meshes
//     to one textured quad + a few dozen sprites.
//
// THE FILM STACK. Because the bake runs once per scene, it can afford the
// post pipeline a live renderer cannot. Five passes:
//   1. SCENE  — the raw render (MSAA 4x, ACES baked in by the scene render).
//   2. GRADE  — S-curve contrast + saturation + shadow lift, per palette, so
//      every scene gets a deliberate value structure instead of fog murk.
//   3. PAINT  — the Kuwahara (unchanged): flatten interiors into strokes.
//   4. BLOOM  — bright-pass the PAINTED image, blur at quarter res, so glow
//      pools / crystals / neon / the sun actually bleed light. Blooming the
//      paint (not the raw render) softens stroke edges = more painterly, and
//      rescues the tiny bright points the Kuwahara eats.
//   5. COMPOSITE — paint + bloom, then interleaved-gradient-noise dither
//      (kills 8-bit sky banding) and a static canvas grain (sells "painting",
//      hides digital cleanliness). All of it frozen into the texture — zero
//      per-frame cost.
//
// The Kuwahara filter (Papari 8-sector variant): for each pixel, split the
// neighbourhood into 8 angular sectors, compute each sector's mean and
// variance, output the mean of the LOWEST-variance sector. Edges survive
// (one sector always lies fully on one side of an edge) while interior detail
// collapses into flat painted strokes. References: Maxime Heckel's "On
// crafting painterly shaders"; Codrops "Susurrus" write-up.

const COPY_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Pass 2 — the grade. Input is the ACES-tonemapped scene render (ACES stays
// baked by the scene materials, exactly as before the stack existed), so this
// works display-referred: an S-curve for value snap, saturation for mood, and
// a shadow-only colour lift so dark scenes stay readable but never grey.
const GRADE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uSat;    // saturation multiplier (~1.0 flat .. 1.2 lush)
uniform float uCon;    // S-curve blend (0 none .. ~0.25 punchy)
uniform vec3 uLift;    // shadow tint colour; black = no lift
varying vec2 vUv;

void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;

    // S-curve (smoothstep Hermite) around mid grey — the classic filmic snap.
    c = mix(c, c * c * (3.0 - 2.0 * c), uCon);

    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSat);

    // Lift only the shadows toward the tint — highlights stay clean.
    float shadowMask = 1.0 - smoothstep(0.0, 0.42, l);
    c += uLift * shadowMask * 0.10;

    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

const KUWAHARA_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 texelSize;
uniform float radius;
varying vec2 vUv;
const float PI = 3.14159265359;

void main() {
    float best = 1e9;
    vec3 outCol = texture2D(tDiffuse, vUv).rgb;

    // Outer loop over sectors is CONSTANT-bound so this stays GLSL ES 1.00
    // safe (no dynamically-indexed local arrays — they are not portable).
    for (int k = 0; k < 8; k++) {
        float a0 = (float(k)        / 8.0) * 2.0 * PI - PI;
        float a1 = (float(k) + 1.0) / 8.0 * 2.0 * PI - PI;
        vec3 sum = vec3(0.0);
        vec3 sq  = vec3(0.0);
        float n = 0.0;
        for (float y = -7.0; y <= 7.0; y++) {
            for (float x = -7.0; x <= 7.0; x++) {
                float d = length(vec2(x, y));
                if (d > radius || d < 0.5) continue;
                float ang = atan(y, x);
                if (ang < a0 || ang >= a1) continue;
                vec3 c = texture2D(tDiffuse, vUv + vec2(x, y) * texelSize).rgb;
                sum += c; sq += c * c; n += 1.0;
            }
        }
        if (n > 0.0) {
            vec3 m = sum / n;
            vec3 v = sq / n - m * m;
            float tv = v.r + v.g + v.b;
            if (tv < best) { best = tv; outCol = m; }
        }
    }

    // Gentle posterize: nudges the flattened strokes toward hand-mixed paint
    // pools without visible banding.
    outCol = mix(outCol, floor(outCol * 9.0 + 0.5) / 9.0, 0.30);
    gl_FragColor = vec4(outCol, 1.0);
}
`;

// Pass 4a — bright-pass with a soft knee, so the glow pools and sun bloom
// without the mid sky bleeding everywhere.
const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float w = smoothstep(uThreshold, uThreshold + uKnee, l);
    gl_FragColor = vec4(c * w, 1.0);
}
`;

// Pass 4b — 9-tap separable gaussian, run H+V twice for a wide soft halo.
const BLUR_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uDir;      // (texelX, 0) or (0, texelY)
varying vec2 vUv;
void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;
    vec2 o1 = uDir * 1.3846153846;
    vec2 o2 = uDir * 3.2307692308;
    c += texture2D(tDiffuse, vUv + o1).rgb * 0.3162162162;
    c += texture2D(tDiffuse, vUv - o1).rgb * 0.3162162162;
    c += texture2D(tDiffuse, vUv + o2).rgb * 0.0702702703;
    c += texture2D(tDiffuse, vUv - o2).rgb * 0.0702702703;
    gl_FragColor = vec4(c, 1.0);
}
`;

// Pass 5 — composite: paint + bloom, IGN dither against 8-bit banding (the
// smooth sky gradient posterizes without it), and a luminance-masked canvas
// grain: most visible in mid-tones, gone in deep black and blown white —
// how real tooth reads. Interleaved gradient noise (Jimenez) is the cheap
// blue-noise stand-in; one line, no textures, GLSL ES 1.00 safe.
const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tPaint;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uGrain;
varying vec2 vUv;

float ign(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
float grain(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec3 c = texture2D(tPaint, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom;

    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float midMask = 0.35 + 0.65 * (1.0 - abs(l * 2.0 - 1.0));
    c += (grain(floor(gl_FragCoord.xy * 0.75)) - 0.5) * uGrain * midMask;

    c += (ign(gl_FragCoord.xy) - 0.5) * (2.0 / 255.0);
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

const BACKDROP_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    // Clip-space fullscreen quad pinned to the far plane: always behind the
    // live layer, never moves with the camera.
    gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

const BACKDROP_FRAG = /* glsl */ `
uniform sampler2D tPaint;
uniform vec2 uOffset;   // Ken Burns drift, driven from the render loop
uniform float uScale;
varying vec2 vUv;
void main() {
    vec2 uv = (vUv - 0.5) * uScale + 0.5 + uOffset;
    gl_FragColor = texture2D(tPaint, uv);
}
`;

/** Per-scene look knobs, fed from ScenePalette. All optional — defaults are a safe neutral grade. */
export type BakeFx = {
    saturation?: number;   // ~1.05 .. 1.2
    contrast?: number;     // 0.1 .. 0.26
    lift?: number;         // shadow tint colour (hex), black = none
    bloom?: number;        // 0 off .. ~1 strong
};

/** Total bake pixels cap — supersampling steps itself down on huge viewports
 *  so the once-per-scene stack never stalls a low-end phone. */
const MAX_PIXELS = 2.1e6;

const fsMat = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
    new THREE.ShaderMaterial({ vertexShader: COPY_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });

/** Bakes the static scene into a painted, graded, bloomed texture. Reuses its targets. */
export class PainterlyBaker {
    private rtScene: THREE.WebGLRenderTarget | null = null;
    private rtGrade: THREE.WebGLRenderTarget | null = null;
    private rtPaint: THREE.WebGLRenderTarget | null = null;
    private rtBloomA: THREE.WebGLRenderTarget | null = null;
    private rtBloomB: THREE.WebGLRenderTarget | null = null;
    private rtFinal: THREE.WebGLRenderTarget | null = null;
    private matGrade: THREE.ShaderMaterial;
    private matPaint: THREE.ShaderMaterial;
    private matBright: THREE.ShaderMaterial;
    private matBlur: THREE.ShaderMaterial;
    private matComp: THREE.ShaderMaterial;
    private quad: THREE.Mesh;
    private fsScene: THREE.Scene;
    private fsCam: THREE.OrthographicCamera;
    private w = 0; private h = 0;

    constructor() {
        this.matGrade = fsMat(GRADE_FRAG, {
            tDiffuse: { value: null },
            uSat: { value: 1.1 },
            uCon: { value: 0.16 },
            uLift: { value: new THREE.Color(0x000000) }
        });
        this.matPaint = fsMat(KUWAHARA_FRAG, {
            tDiffuse: { value: null },
            texelSize: { value: new THREE.Vector2() },
            radius: { value: 6.0 }
        });
        this.matBright = fsMat(BRIGHT_FRAG, {
            tDiffuse: { value: null },
            uThreshold: { value: 0.68 },
            uKnee: { value: 0.32 }
        });
        this.matBlur = fsMat(BLUR_FRAG, {
            tDiffuse: { value: null },
            uDir: { value: new THREE.Vector2() }
        });
        this.matComp = fsMat(COMPOSITE_FRAG, {
            tPaint: { value: null },
            tBloom: { value: null },
            uBloom: { value: 0.65 },
            uGrain: { value: 0.02 }
        });
        this.fsScene = new THREE.Scene();
        // One quad, material swapped per pass — the stack is a straight chain.
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matPaint);
        this.quad.frustumCulled = false;
        this.fsScene.add(this.quad);
        this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }

    private ensure(w: number, h: number) {
        if (this.w === w && this.h === h && this.rtScene && this.rtFinal) return;
        for (const rt of [this.rtScene, this.rtGrade, this.rtPaint, this.rtBloomA, this.rtBloomB, this.rtFinal]) rt?.dispose();
        // MSAA on the scene target so the bake starts from clean edges —
        // the paint pass flattens detail, but aliased stairsteps read as noise
        // sectors and smear.
        this.rtScene = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
        this.rtGrade = new THREE.WebGLRenderTarget(w, h);
        this.rtPaint = new THREE.WebGLRenderTarget(w, h);
        // Bloom at quarter res: glow is low-frequency by nature, and the
        // downsample is most of the blur.
        const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
        this.rtBloomA = new THREE.WebGLRenderTarget(bw, bh);
        this.rtBloomB = new THREE.WebGLRenderTarget(bw, bh);
        this.rtFinal = new THREE.WebGLRenderTarget(w, h);
        this.rtFinal.texture.colorSpace = THREE.SRGBColorSpace;
        this.w = w; this.h = h;
    }

    /**
     * Render `scene` through `camera` and run the film stack over it. The
     * caller is responsible for hiding the live layer first. Tone mapping is
     * applied in the scene render (so the bake bakes the ACES look in), then
     * disabled for the post passes so it isn't applied twice.
     */
    bake(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number, fx: BakeFx = {}): THREE.Texture {
        // Supersample step-down: shrink the request until it fits the pixel
        // cap. The backdrop is a fullscreen quad — any resolution displays fine.
        const k = Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)));
        const W = Math.max(1, Math.round(w * k));
        const H = Math.max(1, Math.round(h * k));
        this.ensure(W, H);
        const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);

        const prevTarget = renderer.getRenderTarget();
        const prevTone = renderer.toneMapping;

        // 1. SCENE
        renderer.setRenderTarget(this.rtScene!);
        renderer.render(scene, camera);

        renderer.toneMapping = THREE.NoToneMapping;
        const pass = (mat: THREE.ShaderMaterial, dst: THREE.WebGLRenderTarget) => {
            this.quad.material = mat;
            renderer.setRenderTarget(dst);
            renderer.render(this.fsScene, this.fsCam);
        };

        // 2. GRADE
        this.matGrade.uniforms.tDiffuse.value = this.rtScene!.texture;
        this.matGrade.uniforms.uSat.value = fx.saturation ?? 1.1;
        this.matGrade.uniforms.uCon.value = fx.contrast ?? 0.16;
        (this.matGrade.uniforms.uLift.value as THREE.Color).setHex(fx.lift ?? 0x000000);
        pass(this.matGrade, this.rtGrade!);

        // 3. PAINT
        this.matPaint.uniforms.tDiffuse.value = this.rtGrade!.texture;
        this.matPaint.uniforms.texelSize.value.set(1 / W, 1 / H);
        pass(this.matPaint, this.rtPaint!);

        // 4. BLOOM (bright-pass, then H+V gaussian twice)
        this.matBright.uniforms.tDiffuse.value = this.rtPaint!.texture;
        pass(this.matBright, this.rtBloomA!);
        const bx = 1 / this.rtBloomA!.width, by = 1 / this.rtBloomA!.height;
        for (let i = 0; i < 2; i++) {
            this.matBlur.uniforms.tDiffuse.value = this.rtBloomA!.texture;
            this.matBlur.uniforms.uDir.value.set(bx, 0);
            pass(this.matBlur, this.rtBloomB!);
            this.matBlur.uniforms.tDiffuse.value = this.rtBloomB!.texture;
            this.matBlur.uniforms.uDir.value.set(0, by);
            pass(this.matBlur, this.rtBloomA!);
        }

        // 5. COMPOSITE
        this.matComp.uniforms.tPaint.value = this.rtPaint!.texture;
        this.matComp.uniforms.tBloom.value = this.rtBloomA!.texture;
        this.matComp.uniforms.uBloom.value = fx.bloom ?? 0.65;
        pass(this.matComp, this.rtFinal!);

        renderer.setRenderTarget(prevTarget);
        renderer.toneMapping = prevTone;
        if (typeof performance !== 'undefined') {
            console.debug(`[stage] bake ${W}x${H} in ${(performance.now() - t0).toFixed(0)}ms`);
        }
        return this.rtFinal!.texture;
    }

    dispose() {
        for (const rt of [this.rtScene, this.rtGrade, this.rtPaint, this.rtBloomA, this.rtBloomB, this.rtFinal]) rt?.dispose();
        for (const m of [this.matGrade, this.matPaint, this.matBright, this.matBlur, this.matComp]) m.dispose();
        this.quad.geometry.dispose();
    }
}

/** Full-screen backdrop mesh that displays the baked painting behind the live layer. */
export function createBackdrop(): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
        vertexShader: BACKDROP_VERT,
        fragmentShader: BACKDROP_FRAG,
        uniforms: {
            tPaint: { value: null },
            uOffset: { value: new THREE.Vector2(0, 0) },
            // Bake is rendered slightly wide (see diorama); <1 zooms back in,
            // leaving margin for the drift so edges never show.
            uScale: { value: 0.94 }
        },
        depthTest: false, depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -100;
    mesh.userData.isBackdrop = true;
    return mesh;
}
