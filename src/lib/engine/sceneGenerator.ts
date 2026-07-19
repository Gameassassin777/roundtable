import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { mix, luminance, extractTraits, applyVisual, type ScenePalette, type SceneTags, type SceneTraits, type SceneVisual } from './scenePalette';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The stage. See CLAUDE.md — the diorama carries ALL scene atmosphere.
//
// Previous version drew a flat beige plane in beige fog and branched on a dead
// vocabulary ('crypt', 'eerie') that the app no longer emits — so 12 of 13
// biomes rendered nothing at all. Every biome below must put real, visible,
// coloured mass on screen.

/** Deterministic RNG so a given place looks the same every time you return. */
function mulberry32(seed: number) {
    return () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const hashStr = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
};

const mark = (o: THREE.Object3D) => { o.userData.procedural = true; return o; };

/** Families with hand-authored geometry. Anything else the AI invents gets the
 *  synthetic set — NOT the crossroads set, which would give an invented
 *  "obsidian cathedral" a dirt road and a signpost. */
const KNOWN_BIOMES = new Set([
    'forest', 'desert', 'arctic', 'sea', 'mountain', 'underground',
    'urban', 'swamp', 'plains', 'ruin', 'void', 'fire', 'crossroads'
]);

function disposeProcedural(scene: THREE.Scene) {
    const toRemove = scene.children.filter(c => c.userData.procedural);
    for (const c of toRemove) {
        scene.remove(c);
        c.traverse((n: any) => {
            if (n.geometry) n.geometry.dispose();
            if (n.material) {
                if (Array.isArray(n.material)) n.material.forEach((m: any) => m.dispose());
                else n.material.dispose();
            }
        });
    }
}

/**
 * A spot on the ground. Multi-part props (trunk + canopy) MUST share one of
 * these, or each scatter() consumes its own rnd() sequence and the parts land
 * in different places — floating canopies over bare trunks.
 */
type Spot = { x: number; z: number; s: number; r: number; j: number };

/**
 * `n` spots around the camera clearing, BIASED TOWARD THE VIEW.
 *
 * The camera sits near origin looking down -z and never turns. On a phone the
 * horizontal FOV is only ~32deg (THREE's fov is vertical; a tall aspect
 * squeezes the horizontal wedge), so a full 360deg scatter puts ~90% of the
 * props behind the camera and leaves the frame empty. Raising counts doesn't
 * fix that — the distribution is what's wrong. Weight the front arc, keep a
 * few behind for parallax at the edges.
 */
function spots(n: number, min: number, max: number, rnd: () => number): Spot[] {
    return Array.from({ length: n }, () => {
        // 80% in a 170deg arc centred on -z; 20% anywhere (edge + parallax).
        const ang = rnd() < 0.8
            ? -Math.PI / 2 + (rnd() - 0.5) * (Math.PI * 0.95)
            : rnd() * Math.PI * 2;
        // sqrt keeps them from bunching at the far edge of the annulus
        const rad = min + Math.sqrt(rnd()) * (max - min);
        return { x: Math.cos(ang) * rad, z: Math.sin(ang) * rad, s: 0.7 + rnd() * 0.9, r: rnd() * Math.PI, j: rnd() };
    });
}

/** Evenly-spaced ring of spots — 'artificial' order: something BUILT this. */
function ringSpots(n: number, radius: number, rnd: () => number): Spot[] {
    return Array.from({ length: n }, (_, i) => {
        const ang = (i / n) * Math.PI * 2 + rnd() * 0.06;
        return {
            x: Math.cos(ang) * radius, z: Math.sin(ang) * radius,
            s: 0.9 + rnd() * 0.25, r: -ang + Math.PI / 2, j: rnd()
        };
    });
}

/** Scatter one instance per spot. Two calls with the SAME spots stay aligned. */
function scatterAt(
    geo: THREE.BufferGeometry, mat: THREE.Material, at: Spot[],
    place: (m: THREE.Object3D, p: Spot, i: number) => void
): THREE.InstancedMesh {
    const inst = new THREE.InstancedMesh(geo, mat, at.length);
    const dummy = new THREE.Object3D();
    at.forEach((p, i) => {
        dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
        place(dummy, p, i);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    // InstancedMesh derives its bounding sphere from the BASE geometry, not the
    // instance transforms — so THREE sees a ~2-unit sphere at the origin and
    // frustum-culls the whole batch (every tree at once) the moment the origin
    // leaves the frustum. computeBoundingSphere() on an InstancedMesh does walk
    // the instance matrices, so call it and stop guessing.
    inst.computeBoundingSphere();
    inst.frustumCulled = false;
    inst.castShadow = true;
    inst.receiveShadow = true;
    return mark(inst) as THREE.InstancedMesh;
}

// ---------- sky ----------

/**
 * A real sky: zenith->horizon gradient, a sun/moon disc with a scattering halo,
 * a hot band along the horizon, and stars at night. BackSide + fog:false so it
 * sits behind everything and never gets hazed.
 *
 * A flat clear-colour was the single biggest "this is a web page" tell — light
 * with no visible source reads as fill, not as a world.
 */
function buildSky(pal: ScenePalette) {
    const geo = new THREE.SphereGeometry(160, 32, 24);
    // Blinx skies are DESIGNED, not gradient wallpaper: a saturated mid band
    // between horizon and zenith (dusk purples, noon cyans), so the sky has
    // three voices instead of a two-stop lerp. The mid band leans slightly
    // toward the sun colour — scattered light, not a grey midpoint.
    const midHex = mix(mix(pal.fog, pal.sky, 0.5), pal.sunColor, 0.10);
    const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
            top:        { value: new THREE.Color(pal.sky) },
            mid:        { value: new THREE.Color(midHex) },
            bottom:     { value: new THREE.Color(pal.fog) },
            sunDir:     { value: new THREE.Vector3(...pal.sunDir) },
            sunColor:   { value: new THREE.Color(pal.sunColor) },
            sunSize:    { value: pal.sunSize },
            sunGlow:    { value: pal.sunGlow },
            horizonGlow:{ value: pal.horizonGlow },
            starAmount: { value: pal.starAmount },
            cloud:      { value: pal.cloud },
            cloudColor: { value: new THREE.Color(pal.cloudColor) },
            time:       { value: 0 }
        },
        vertexShader: `
            varying vec3 vDir;
            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vDir = normalize(wp.xyz);
                gl_Position = projectionMatrix * viewMatrix * wp;
            }`,
        fragmentShader: `
            uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor;
            uniform float sunSize; uniform float sunGlow; uniform float horizonGlow; uniform float starAmount;
            uniform float cloud; uniform vec3 cloudColor; uniform float time;
            varying vec3 vDir;

            // cheap hash-based starfield
            float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }

            // --- value noise + fbm for cloud ---
            float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float vnoise(vec2 p){
                vec2 i = floor(p), f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(mix(h2(i), h2(i + vec2(1,0)), u.x),
                           mix(h2(i + vec2(0,1)), h2(i + vec2(1,1)), u.x), u.y);
            }
            float fbm(vec2 p){
                float v = 0.0, a = 0.5;
                for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
                return v;
            }
            float stars(vec3 d){
                vec3 g = floor(d * 260.0);
                float h = hash(g);
                float s = smoothstep(0.9975, 1.0, h);
                float tw = 0.65 + 0.35 * sin(h * 100.0);
                return s * tw;
            }

            void main() {
                vec3 d = normalize(vDir);
                float h = clamp(d.y * 1.45 + 0.30, 0.0, 1.0);
                // Three voices: horizon haze -> saturated mid band -> zenith.
                vec3 col = h < 0.5 ? mix(bottom, mid, h * 2.0)
                                   : mix(mid, top, (h - 0.5) * 2.0);

                float mu = clamp(dot(d, normalize(sunDir)), -1.0, 1.0);

                // horizon scattering: hottest low in the sky toward the sun
                float band = pow(1.0 - clamp(abs(d.y) * 2.4, 0.0, 1.0), 2.0);
                float toward = pow(max(mu, 0.0), 2.5);
                col += sunColor * band * toward * horizonGlow * 0.85;

                // stars — behind the sun halo, fading out toward the horizon
                if (starAmount > 0.001) {
                    float up = smoothstep(-0.05, 0.35, d.y);
                    col += vec3(stars(d)) * starAmount * up * 0.9;
                }

                // --- cloud: planar projection onto the dome, drifting ---
                if (cloud > 0.001 && d.y > 0.0) {
                    // project the view dir onto a plane above the camera; the
                    // 1/y term is what gives clouds real perspective toward the
                    // horizon instead of a flat pasted texture.
                    vec2 uv = d.xz / max(d.y, 0.055) * 0.55;
                    uv += vec2(time * 0.0055, time * 0.0022);
                    float n = fbm(uv * 0.85);
                    float cov = smoothstep(0.52 - cloud * 0.30, 0.78, n);
                    float fade = smoothstep(0.0, 0.28, d.y);           // hide the stretch at the horizon
                    float lit = pow(max(mu, 0.0), 3.0);                 // silver lining toward the sun
                    vec3 cc = mix(cloudColor, sunColor, lit * 0.55);
                    col = mix(col, cc, cov * fade * cloud);
                }

                // broad halo, then the disc itself. sunGlow <= 0 means "no sun
                // in this sky at all" (enclosed scenes) — gate the disc too, and
                // never shrink sunSize toward zero instead: smoothstep with
                // edge0 == edge1 divides by zero and flood-fills the dome.
                float halo = pow(max(mu, 0.0), 220.0);
                col += sunColor * halo * sunGlow;
                if (sunGlow > 0.001) {
                    float disc = smoothstep(cos(sunSize * 1.9), cos(sunSize), mu);
                    // Big bodies are WORLDS, not lights: a giant moon gets mare
                    // blotches, a fat dusk sun gets a molten mottle. fbm inside
                    // the disc only — the halo stays clean.
                    if (sunSize > 0.045) {
                        vec2 muv = d.xz / max(d.y + 0.35, 0.12);
                        float mare = fbm(muv * 6.0 + 13.7);
                        float crater = smoothstep(0.45, 0.75, mare) * 0.28;
                        col = mix(col, sunColor * 1.9 * (1.0 - crater), disc);
                    } else {
                        col = mix(col, sunColor * 1.9, disc);
                    }
                }

                // Dither the source gradient too — 8-bit smooth skies
                // posterize into bands long before the film stack's own
                // dither can rescue them.
                col += (hash(d * 612.3) - 0.5) * (2.0 / 255.0);

                gl_FragColor = vec4(col, 1.0);
            }`
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.userData.isSky = true;
    dome.userData.skyMat = mat;
    dome.renderOrder = -1;
    return mark(dome) as THREE.Mesh;
}

// ---------- the sky hem: one giant + one jagged skyline (law D7) ----------

/**
 * Sky = one gradient + ONE giant + one jagged hem. The giant is a soft flat
 * disc (moon/planet per palette), deliberately low-detail, pale lavender-pink
 * family, with ONE darker irregular blot painted on it — and it hangs LOW so
 * the skyline card always bites a piece out of it: a moon behind things is a
 * moon with a world in front of it. The hem is the far flat layer of the
 * near-sharp / mid-painted / far-soft / flat-sky stack — near-black, irregular
 * (towers, gables, crenellations), never a straight line.
 */
function buildSkyHem(scene: THREE.Scene, pal: ScenePalette, rnd: () => number, traits: SceneTraits, biome: string): number | null {
    if (traits.enclosed || traits.space || traits.submerged) return null;
    if (biome === 'void' || biome === 'underground' || biome === 'sea') return null;

    // --- the skyline hem: a far flat card of near-black rooftops ---
    const hemCol = new THREE.Color(mix(mix(pal.fog, pal.sky, 0.2), 0x000000, 0.78));
    const H_W = 1024, H_H = 192;
    const hcv = document.createElement('canvas'); hcv.width = H_W; hcv.height = H_H;
    const hctx = hcv.getContext('2d')!;
    hctx.clearRect(0, 0, H_W, H_H);
    hctx.fillStyle = `rgb(${Math.round(hemCol.r * 255)},${Math.round(hemCol.g * 255)},${Math.round(hemCol.b * 255)})`;
    hctx.beginPath();
    hctx.moveTo(0, H_H);
    let hx = 0;
    let hy = H_H * (0.45 + rnd() * 0.2);
    hctx.lineTo(hx, hy);
    while (hx < H_W) {
        const w = 14 + rnd() * 46;
        const kind = rnd();
        if (kind < 0.30) {
            // a tower: tall block, maybe gabled
            const th = H_H * (0.18 + rnd() * 0.42);
            hctx.lineTo(hx, th);
            hctx.lineTo(hx + w, th);
            if (rnd() < 0.5) { hctx.lineTo(hx + w / 2, th - H_H * (0.08 + rnd() * 0.10)); hctx.lineTo(hx + w, th); }
        } else if (kind < 0.55) {
            // crenellations: a run of little merlon teeth
            const bh = H_H * (0.38 + rnd() * 0.22);
            hctx.lineTo(hx, bh);
            const teeth = 2 + Math.floor(rnd() * 4);
            const tw = w / (teeth * 2);
            for (let t2 = 0; t2 < teeth; t2++) {
                hctx.lineTo(hx + t2 * tw * 2, bh - H_H * 0.07);
                hctx.lineTo(hx + t2 * tw * 2 + tw, bh - H_H * 0.07);
                hctx.lineTo(hx + t2 * tw * 2 + tw, bh);
                hctx.lineTo(hx + (t2 + 1) * tw * 2, bh);
            }
            hctx.lineTo(hx + w, bh);
        } else if (kind < 0.75) {
            // a gable: one confident triangle
            const ph = H_H * (0.30 + rnd() * 0.30);
            hctx.lineTo(hx + w / 2, ph - H_H * (0.10 + rnd() * 0.12));
            hctx.lineTo(hx + w, ph);
        } else {
            // a long low roofline, sagging a little
            const nh = Math.max(H_H * 0.15, Math.min(H_H * 0.8, hy + (rnd() - 0.5) * H_H * 0.16));
            hctx.lineTo(hx + w, nh);
            hy = nh;
        }
        hx += w;
    }
    hctx.lineTo(H_W, H_H);
    hctx.closePath();
    hctx.fill();
    const hemTex = new THREE.CanvasTexture(hcv);
    hemTex.needsUpdate = true;
    const hem = new THREE.Mesh(
        new THREE.PlaneGeometry(240, 20),
        new THREE.MeshBasicMaterial({ map: hemTex, transparent: true, fog: false, depthWrite: false })
    );
    hem.position.set(0, 8, -95);
    scene.add(mark(hem));

    // --- the giant: one soft disc, LOW, always cut by the hem ---
    // If the sky dome already carries a BIG designed sun, that IS the giant —
    // one giant per sky, never two. A small day sun doesn't count: the sky
    // still gets its pale planet.
    const domeHasGiant = pal.sunGlow > 0.35 && pal.sunSize > 0.055;
    if (!domeHasGiant) {
        const GS = 256;
        const gcv = document.createElement('canvas'); gcv.width = gcv.height = GS;
        const gctx = gcv.getContext('2d')!;
        // Pale lavender-pink family, clearly DIMMER than any lit pool — a
        // blank white hole reads as a rendering bug, not a moon.
        const giantCol = new THREE.Color(mix(mix(mix(pal.fog, pal.sunColor, 0.25), 0xffffff, 0.28), 0xe4d4f8, 0.35));
        // The continent is mauve-grey, only ~15-25% darker than the disc —
        // 50% dark read as a centered PUPIL (shots21). Off-center, low contrast.
        const blotCol = new THREE.Color(mix(mix(giantCol.getHex(), 0x8a7a96, 0.35), 0x000000, 0.12));
        const gc = (c: THREE.Color, a: number) =>
            `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
        // flat body, feather-soft rim (the far layer spends NO sharpness)
        const body = gctx.createRadialGradient(GS / 2, GS / 2, GS * 0.30, GS / 2, GS / 2, GS * 0.5);
        body.addColorStop(0, gc(giantCol, 0.88));
        body.addColorStop(0.82, gc(giantCol, 0.84));
        body.addColorStop(1, gc(giantCol, 0));
        gctx.fillStyle = body;
        gctx.beginPath(); gctx.arc(GS / 2, GS / 2, GS * 0.5, 0, Math.PI * 2); gctx.fill();
        // ONE landmass: 2-3 overlapping soft irregular blobs fused, drifting
        // off toward a limb — never centered, never a compass circle.
        const bx = GS * (0.58 + rnd() * 0.10), by = GS * (0.38 + rnd() * 0.12);
        for (let b = 0; b < 3; b++) {
            const cx2 = bx + (rnd() - 0.5) * GS * 0.20;
            const cy2 = by + (rnd() - 0.5) * GS * 0.16;
            const r = GS * (0.08 + rnd() * 0.09);
            const g = gctx.createRadialGradient(cx2, cy2, r * 0.15, cx2, cy2, r);
            g.addColorStop(0, gc(blotCol, 0.38));
            g.addColorStop(0.7, gc(blotCol, 0.22));
            g.addColorStop(1, gc(blotCol, 0));
            gctx.fillStyle = g;
            gctx.beginPath();
            gctx.ellipse(cx2, cy2, r * (0.8 + rnd() * 0.6), r * (0.55 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
            gctx.fill();
        }
        const giantTex = new THREE.CanvasTexture(gcv);
        giantTex.needsUpdate = true;
        const giant = new THREE.Mesh(
            new THREE.CircleGeometry(1, 40),
            new THREE.MeshBasicMaterial({ map: giantTex, transparent: true, fog: false, depthWrite: false })
        );
        // Hung low, hugging the -z camera axis (a disc 55deg off-axis is a disc
        // nobody ever sees on a portrait phone) so the hem and rooftops cut it.
        const az = -Math.PI / 2 + (rnd() - 0.5) * 0.55;
        const dist = 130;
        giant.position.set(Math.cos(az) * dist, 24 + rnd() * 8, Math.sin(az) * dist);
        giant.scale.setScalar(14 + rnd() * 5);
        giant.lookAt(0, 20, 0);
        scene.add(mark(giant));
        return az;   // so the cumulus layer can keep its puffs off the disc
    }
    return null;
}

// ---------- sky furniture: geometric cumulus ----------

/**
 * Blinx never leaves the upper third empty. Under an open sky, scatter real
 * cumulus: squashed fluff clusters (the same painted-quad kit as the foliage,
 * so they light like the world does), pre-tinted toward the palette's cloud
 * colour, hung low near the horizon and high overhead. They are STATIC — they
 * bake into the backdrop like every other solid; the dome's shader clouds
 * supply the drift.
 */
function buildCumulus(scene: THREE.Scene, pal: ScenePalette, rnd: () => number, avoidAz: number | null = null) {
    // Blinx clouds are near-WHITE bodies with soft self-shade — never grey
    // blobs (the first pass read as floating rocks). Bright tint, an emissive
    // lift so they stay luminous in dim scenes, kept small, high and far so
    // they read as a cloud LAYER, not as debris. Puffs steer clear of the sky
    // giant's azimuth: a hard alpha-tested card clipping a wedge through the
    // moon was its own "weird polygon" complaint.
    const tint = mix(pal.cloudColor, 0xffffff, 0.5);
    const mat = new THREE.MeshStandardMaterial({
        color: tint, map: leafTexture(), alphaTest: 0.5,
        side: THREE.DoubleSide, roughness: 1.0, fog: false,
        emissive: mix(pal.cloudColor, 0xffffff, 0.6), emissiveIntensity: 0.30
    });
    for (let i = 0; i < 11; i++) {
        const low = i % 2 === 0;
        let a = rnd() * Math.PI * 2;
        if (avoidAz !== null) {
            const d = Math.atan2(Math.sin(a - avoidAz), Math.cos(a - avoidAz));
            if (Math.abs(d) < 0.5) a += 1.1;
        }
        const r = 68 + rnd() * 48;
        const y = low ? 15 + rnd() * 7 : 26 + rnd() * 12;
        const g = fluffCluster(9, 2.0 + rnd() * 1.2, new THREE.Vector3(0, 0, 0), 0.40, rnd);
        const puff = new THREE.Mesh(g, mat);
        puff.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        puff.scale.set(1.7 + rnd() * 1.2, 1, 1.1 + rnd() * 0.8);
        puff.rotation.y = rnd() * Math.PI;
        scene.add(mark(puff));
    }
}

// ---------- crystals: trait prop for glowing/crystalline scenes ----------

/**
 * Emissive crystal clusters + a hero formation with a baked light pool.
 * Same lesson as the signpost lantern: the paint pass eats tiny bright points,
 * so the glow must be a POOL of light on the ground, not just bright pixels.
 */
function addCrystals(scene: THREE.Scene, pal: ScenePalette, traits: SceneTraits, rnd: () => number, dense: boolean) {
    scene.userData.crystalsAdded = true;
    const col = traits.glowColor ?? 0x7fe8ff;
    const mat = new THREE.MeshStandardMaterial({
        color: mix(col, 0xffffff, 0.15), emissive: col,
        // Strong enough to BE the light source in enclosed scenes (the paint
        // pass averages away timid emissives) — but past ~1.4 the facets blow
        // to white slabs and the crystal loses its hue AND its shape. Blinx's
        // crystals stay saturated: white-hot core is the HALO sprite's job.
        emissiveIntensity: 1.35, roughness: 0.3
    });
    // The hero path clamps harder: 2x facets at 1.35 tone-map to white slabs
    // (16-glow-cavern). The core stays INSIDE the emissive hue at <=85%
    // brightness — the white-hot read belongs to the halo sprite alone.
    const heroMat = new THREE.MeshStandardMaterial({
        color: mix(col, 0xffffff, 0.05), emissive: mix(col, 0x000000, 0.15),
        emissiveIntensity: 0.85, roughness: 0.3
    });
    const geo = new THREE.OctahedronGeometry(1, 0);
    geo.scale(0.42, 1.5, 0.42);
    scene.add(scatterAt(geo, mat, spots(dense ? 42 : 16, 3, 32, rnd), (m, pt) => {
        m.position.set(pt.x, 0.45 * pt.s, pt.z);
        m.scale.setScalar(0.35 + pt.j * 1.0);
        m.rotation.set((pt.j - 0.5) * 0.7, pt.r, (pt.j - 0.5) * 0.5);
    }));
    // Hero formation just off-centre — the focal point of the frame.
    const hero = new THREE.Group();
    for (let i = 0; i < 5; i++) {
        const c = new THREE.Mesh(geo, heroMat);
        c.position.set((rnd() - 0.5) * 1.6, 0.7 + rnd() * 0.5, (rnd() - 0.5) * 1.6);
        c.scale.setScalar(0.9 + rnd() * 1.3);
        c.rotation.set((rnd() - 0.5) * 0.8, rnd() * Math.PI, (rnd() - 0.5) * 0.6);
        hero.add(c);
    }
    const pool = new THREE.PointLight(col, 9, 30, 1.3);
    pool.position.set(0, 1.8, 0);
    hero.add(pool);
    // A soft additive halo sprite: broad gradients survive the paint pass,
    // bright pixels average away. The sprite IS the visible glow; the light
    // is what it paints onto the ground.
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: softSprite(), color: col, transparent: true, opacity: 0.30,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    }));
    halo.scale.set(10, 6.5, 1);
    halo.position.set(0, 1.7, 0);
    hero.add(halo);
    // Secondary pools so the whole cavern breathes with the glow colour.
    for (let i = 0; i < 5; i++) {
        const p2 = new THREE.PointLight(col, 4, 20, 1.4);
        const aa = rnd() * Math.PI * 2, rr = 8 + rnd() * 16;
        p2.position.set(Math.cos(aa) * rr, 1.2, Math.sin(aa) * rr);
        scene.add(mark(p2));
    }
    hero.position.set(-3.2, 0, -4.5);
    scene.add(mark(hero));
}

/**
 * Glow without crystals — luminous swamp, ember field, fairy lights. Pools of
 * light on the ground + soft halo sprites, never bare bright pixels (the
 * lantern lesson: the Kuwahara pass eats points, keeps gradients).
 */
function addGlowPools(scene: THREE.Scene, pal: ScenePalette, traits: SceneTraits, rnd: () => number, n = 6) {
    const col = traits.glowColor ?? pal.emissive;
    const tex = softSprite();
    const orbMat = new THREE.MeshStandardMaterial({
        color: mix(col, 0xffffff, 0.3), emissive: col, emissiveIntensity: 2.0, roughness: 0.4
    });
    for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.2;   // biased toward the view
        const r = 4 + rnd() * 26;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const p2 = new THREE.PointLight(col, 2.5, 14, 1.5);
        p2.position.set(x, 1.1, z);
        scene.add(mark(p2));
        // Blinx's light stack, all four layers: a PHYSICAL source orb (lights
        // are objects, never abstractions), a small halo, and the painted
        // ground pool that ties it to the floor.
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), orbMat);
        orb.position.set(x, 0.55 + rnd() * 0.5, z);
        scene.add(mark(orb));
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, color: col, transparent: true, opacity: 0.18,
            depthWrite: false, blending: THREE.AdditiveBlending, fog: false
        }));
        sp.position.copy(orb.position);
        sp.scale.set(2.2, 1.6, 1);
        scene.add(mark(sp));
        lightPool(scene, x, z, 3.0 + rnd() * 2.0, col, 0.42);
    }
}

/**
 * Physical glow orbs, each inside its own soft halo. Blinx's lights are
 * OBJECTS, never bare bright pixels: a small tinted emissive orb (never pure
 * white — the hue comes from the scene's chord) plus a soft additive halo
 * point that feathers it. Replaces the old bare-ball glow-dot scatters.
 */
function glowDots(scene: THREE.Scene, at: Spot[], col: number, yOf: (p: Spot) => number, size = 0.11) {
    const orbMat = new THREE.MeshStandardMaterial({
        color: mix(col, 0xffffff, 0.45), emissive: col, emissiveIntensity: 1.6, roughness: 0.4
    });
    scene.add(scatterAt(new THREE.SphereGeometry(size, 8, 6), orbMat, at, (m, p) => {
        m.position.set(p.x, yOf(p), p.z);
    }));
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(at.length * 3);
    at.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = yOf(p); pos[i * 3 + 2] = p.z; });
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const halos = new THREE.Points(geo, new THREE.PointsMaterial({
        map: softSprite(), color: col, size: size * 9, sizeAttenuation: true,
        transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    scene.add(mark(halos));
}

// ---------- roads: painted into the terrain, never separate geometry ----------

/**
 * 0..1 "how much road is here" for world (x, z). Two crossing dirt paths with
 * a gentle noise curve and feathered edges. Roads used to be straight
 * PlaneGeometry strips laid over the ground -- hard mathematical edges that
 * read as tape stripes. Painting the road into the terrain's vertex colours
 * gives soft, worn, irregular edges for free, and props can query the same
 * mask to keep off the roadbed.
 */
type RoadMask = (x: number, z: number) => number;
function makeRoadMask(noise2D: (x: number, y: number) => number): RoadMask {
    const W = 1.9, F = 2.6;                    // half-width, feather
    const wander = (t: number) => noise2D(t * 0.035, 7.3) * 3.2;
    return (x: number, z: number) => {
        const dNS = Math.abs(x - wander(z));   // road running north-south
        const dEW = Math.abs(z - wander(x + 41)); // road running east-west
        const m = (d: number) => 1 - Math.min(1, Math.max(0, (d - W) / F));
        return Math.max(m(dNS), m(dEW));
    };
}

// ---------- ground ----------

/**
 * Ground micro-detail: CC0 photo textures (ambientCG Ground054/048, downscaled
 * to 512) used as BUMP only — never albedo. The palette owns the hue; the
 * texture just breaks the vinyl-flat light response that made every floor a
 * carpet. Lush places get leaf litter, everything else gets packed dirt.
 */
let _groundTex: Record<string, THREE.Texture> = {};
function groundBump(kind: 'litter' | 'dirt'): THREE.Texture {
    if (!_groundTex[kind]) {
        const t = new THREE.TextureLoader().load(`/textures/ground-${kind}.jpg`);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(18, 18);
        _groundTex[kind] = t;
    }
    return _groundTex[kind];
}

function buildGround(pal: ScenePalette, biome: string, noise2D: (x: number, y: number) => number, roadMask?: RoadMask, traits?: SceneTraits, visual?: SceneVisual | null, rnd: () => number = mulberry32(hashStr('ground|' + biome))) {
    if (biome === 'void') return null;              // the void has no floor — that's the point

    const geo = new THREE.PlaneGeometry(170, 170, 120, 120);
    const pos = geo.attributes.position;

    const amp: Record<string, number> = {
        swamp: 0.45, desert: 1.6, mountain: 2.8, arctic: 0.9, sea: 0.25,
        underground: 0.5, ruin: 0.35, plains: 0.5, forest: 0.6, urban: 0.05,
        fire: 1.2, crossroads: 0.06, synthetic: 0.85
    };
    const freq: Record<string, number> = {
        desert: 0.045, mountain: 0.06, sea: 0.22, arctic: 0.05, fire: 0.1
    };
    // The terrain aspect is a MULTIPLIER on the biome's own relief, so
    // "jagged desert" is rough dunes, not mountain. All four declared values
    // are live — they used to be declared in SceneVisual but read by nothing.
    const TERRAIN_X: Record<string, { a: number; f: number }> = {
        flat:     { a: 0.25, f: 0.80 },
        rolling:  { a: 0.75, f: 1.00 },
        jagged:   { a: 1.90, f: 1.60 },
        cratered: { a: 0.90, f: 1.00 }
    };
    const tx = visual?.terrain ? TERRAIN_X[visual.terrain] : undefined;
    const a = (amp[biome] ?? 0.3) * (tx?.a ?? 1);
    const f = (freq[biome] ?? 0.09) * (tx?.f ?? 1);

    // Cratered terrain (moon/asteroid): bowls with raised rims, straight out
    // of the trait text — no biome had to plan for this.
    const craters: { x: number; z: number; r: number; d: number }[] = [];
    if (traits?.craters) {
        for (let i = 0; i < 7; i++) {
            craters.push({ x: (Math.random() - 0.5) * 0, z: 0, r: 0, d: 0 }); // placeholder replaced below
        }
        craters.length = 0;
        const crnd = mulberry32(hashStr('craters'));
        for (let i = 0; i < 7; i++) {
            craters.push({
                x: (crnd() - 0.5) * 64, z: (crnd() - 0.5) * 64,
                r: 3 + crnd() * 7, d: 0.5 + crnd() * 1.3
            });
        }
    }

    // The height field as a closure so the PAINT pass can find the low spots
    // the drift pools in. Takes PLANE coords (world z = -y).
    const heightAt = (x: number, y: number): number => {
        // Two octaves so terrain reads as landscape, not noise.
        let h = noise2D(x * f, y * f) * a + noise2D(x * f * 2.7, y * f * 2.7) * a * 0.35;
        // Roadbed is packed flat.
        if (roadMask) h *= 1 - roadMask(x, -y) * 0.9;
        for (const c of craters) {
            const dd = Math.hypot(x - c.x, -y - c.z);
            if (dd < c.r) h -= c.d * (Math.cos((dd / c.r) * Math.PI) * 0.5 + 0.5);
            else if (dd < c.r + 2.2) h += c.d * 0.3 * (1 - (dd - c.r) / 2.2);   // rim
        }
        // Level clearing under the camera, easing out to full relief. Without it
        // a high-amplitude biome (mountain) puts the camera INSIDE a hill and
        // fills the lower half of the frame with an unreadable black mass.
        // Kept small (4.5): a 7-unit dead-flat disc around the viewer reads as
        // a billiard table from the lowered camera — the float complaint.
        const d = Math.hypot(x, y);
        return h * Math.min(1, Math.max(0, (d - 4.5) / 9));
    };

    for (let i = 0; i < pos.count; i++) {
        pos.setZ(i, heightAt(pos.getX(i), pos.getY(i)));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    // ---------- the painted ground stack (O24 / law A5) ----------
    // FOUR layers, each with one job, composited on ONE canvas mapped over the
    // whole plane: (1) base crackle over broad value patches, (2) pale drift
    // blobs pooling in the LOW spots and edges, (3) swept smears all leaning
    // ONE seeded direction, (4) contact dabs — those stay GEOMETRY
    // (contactBlobs) so they sit exactly under their owners.
    const S = 1024;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d')!;
    const px = (u: number) => (u / 170) * S;                     // world units -> canvas px
    const cx = (x: number) => (x / 170 + 0.5) * S;               // world x -> canvas x
    const cy = (z: number) => (z / 170 + 0.5) * S;               // world z -> canvas y
    // Ground hues belong to the SCENE'S chord (law A7: sky is in everything):
    // the base is the ground hue pulled a step toward the fog hue, so a purple
    // night never sits on an unrelated green carpet. Dark scenes lift the
    // canvas one value step — the floor must never crush to a void (A6).
    const nightLift = pal.starAmount > 0.5;
    // Dark scenes lean harder on the fog chord: the floor must belong to the
    // air above it, or a purple night floats over an unrelated green carpet.
    const baseHex = mix(pal.ground, pal.fog, nightLift || traits?.enclosed ? 0.30 : 0.14);
    const cGround = new THREE.Color(nightLift ? mix(baseHex, mix(pal.fog, 0xffffff, 0.35), 0.22) : baseHex);
    const css = (c: THREE.Color, a: number) =>
        `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
    const cGrowth = new THREE.Color(pal.foliage);
    const cRock = new THREE.Color(pal.structure);
    const cDry = new THREE.Color(mix(pal.ground, 0xffffff, 0.22));
    const cDark = new THREE.Color(mix(pal.ground, 0x000000, 0.25));
    const cDirt = new THREE.Color(mix(mix(pal.ground, pal.structure, 0.2), 0xffffff, 0.16));

    /** One soft round stamp — the hand-dab every layer is made of. */
    const dab = (x: number, z: number, r: number, col: THREE.Color, a: number) => {
        const g = ctx.createRadialGradient(cx(x), cy(z), px(r) * 0.12, cx(x), cy(z), px(r));
        g.addColorStop(0, css(col, a));
        g.addColorStop(0.7, css(col, a * 0.55));
        g.addColorStop(1, css(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx(x), cy(z), px(r), 0, Math.PI * 2); ctx.fill();
    };

    // --- layer 1a: broad value patches (growth / rock / dry / damp) ---
    ctx.fillStyle = css(cGround, 1); ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 190; i++) {
        const x = (rnd() - 0.5) * 165, z = (rnd() - 0.5) * 165;
        const broad = noise2D(x * 0.028, -z * 0.028);
        const broad2 = noise2D(x * 0.05 + 31.7, -z * 0.05 - 17.3);
        let col: THREE.Color | null = null, a = 0;
        if (broad > 0.18) { col = cGrowth; a = Math.min(0.30, (broad - 0.18) * 0.6); }
        else if (broad < -0.22) { col = cRock; a = Math.min(0.28, (-broad - 0.22) * 0.55); }
        if (broad2 > 0.22) { col = cDry; a = Math.min(0.30, (broad2 - 0.22) * 0.6); }
        else if (broad2 < -0.22) { col = cDark; a = Math.min(0.30, (-broad2 - 0.22) * 0.6); }
        if (col) dab(x, z, 5 + rnd() * 13, col, a);
    }

    // --- layer 1b: the crackle — small irregular fractured plates, hand-drawn
    //     walks with a wobble. Water skips it (the sea floor is silt, not glaze).
    if (biome !== 'sea') {
        // Crackle in the world's own shadow hue (fog-darkened, never pure
        // black) so it reads on pale grounds as well as dark ones.
        const crackCol = new THREE.Color(mix(baseHex, mix(pal.fog, 0x000000, 0.5), 0.5));
        const walks = 42;
        ctx.lineWidth = Math.max(1, px(0.16));
        for (let i = 0; i < walks; i++) {
            let x = (rnd() - 0.5) * 160, z = (rnd() - 0.5) * 160;
            let ang = rnd() * Math.PI * 2;
            ctx.strokeStyle = css(crackCol, 0.18 + rnd() * 0.15);
            ctx.beginPath(); ctx.moveTo(cx(x), cy(z));
            const segs = 4 + Math.floor(rnd() * 7);
            for (let s2 = 0; s2 < segs; s2++) {
                ang += (rnd() - 0.5) * 1.5;
                const len = 1.2 + rnd() * 3.2;
                x += Math.cos(ang) * len; z += Math.sin(ang) * len;
                ctx.lineTo(cx(x), cy(z));
            }
            ctx.stroke();
        }
    }

    // --- the worn road, painted soft into the same canvas (was vertex noise) ---
    if (roadMask) {
        const wander = (t: number) => noise2D(t * 0.035, 7.3) * 3.2;
        for (let t = -82; t < 82; t += 1.6) {
            dab(wander(t) + (rnd() - 0.5) * 0.8, t, 3.4 + rnd() * 1.4, cDirt, 0.16);
            dab(t, wander(t + 41) + (rnd() - 0.5) * 0.8, 3.4 + rnd() * 1.4, cDirt, 0.16);
        }
    }

    if (biome !== 'sea') {
        // --- layer 2: pale drift pooling in the LOW spots and at the edges ---
        // Drift carries the scene's own air hue (fog), lightened — not raw white.
        const driftCol = new THREE.Color(mix(mix(pal.ground, pal.fog, 0.35), 0xffffff, 0.42));
        const lows: { x: number; z: number }[] = [];
        let hMin = Infinity, hMax = -Infinity;
        const grid: { x: number; z: number; h: number }[] = [];
        for (let gx = -78; gx <= 78; gx += 6.5) {
            for (let gz = -78; gz <= 78; gz += 6.5) {
                const h = heightAt(gx, -gz);
                grid.push({ x: gx, z: gz, h });
                if (h < hMin) hMin = h;
                if (h > hMax) hMax = h;
            }
        }
        const cut = hMin + (hMax - hMin) * 0.30;
        for (const cell of grid) if (cell.h <= cut) lows.push(cell);
        for (let i = 0; i < 26 && lows.length; i++) {
            const cell = lows[Math.floor(rnd() * lows.length)];
            // 2-3 overlapping stamps: a feathered blob with a wobbled hem,
            // never a compass ring.
            const bx = cell.x + (rnd() - 0.5) * 4, bz = cell.z + (rnd() - 0.5) * 4;
            const r = 3.5 + rnd() * 5.5;
            for (let k = 0; k < 3; k++) {
                dab(bx + (rnd() - 0.5) * r * 0.5, bz + (rnd() - 0.5) * r * 0.5, r * (0.6 + rnd() * 0.5), driftCol, 0.30 + rnd() * 0.22);
            }
        }
        // Edge drift — the world's rim collects it.
        for (let i = 0; i < 14; i++) {
            const a2 = rnd() * Math.PI * 2, rr = 58 + rnd() * 22;
            dab(Math.cos(a2) * rr, Math.sin(a2) * rr, 4 + rnd() * 7, driftCol, 0.16 + rnd() * 0.14);
        }

        // --- layer 3: swept smears — ONE direction per scene (law E5: the
        //     smears agree with the world's gesture). Soft, darker, directional.
        const smearCol = new THREE.Color(mix(baseHex, mix(pal.fog, 0x000000, 0.45), 0.48));
        const smearAng = rnd() * Math.PI * 2;
        const dx = Math.cos(smearAng), dz = Math.sin(smearAng);
        for (let i = 0; i < 22; i++) {
            let x = (rnd() - 0.5) * 150, z = (rnd() - 0.5) * 150;
            const len = 9 + rnd() * 18, r = 1.6 + rnd() * 2.2;
            const steps = Math.floor(len / 1.4);
            for (let s3 = 0; s3 < steps; s3++) {
                dab(x, z, r, smearCol, 0.085);
                x += dx * 1.4 + (rnd() - 0.5) * 0.5;
                z += dz * 1.4 + (rnd() - 0.5) * 0.5;
            }
        }
    }

    const groundTex = new THREE.CanvasTexture(cv);
    groundTex.needsUpdate = true;

    const LUSH = biome === 'forest' || biome === 'swamp' || biome === 'plains' || biome === 'crossroads';
    const mat = new THREE.MeshStandardMaterial({
        // The canvas owns the paint; the material just carries it.
        color: 0xffffff,
        map: groundTex,
        roughness: pal.groundRough,
        metalness: biome === 'sea' ? 0.35 : 0.0,
        flatShading: biome === 'mountain' || biome === 'fire' || visual?.terrain === 'jagged',
        bumpMap: groundBump(LUSH ? 'litter' : 'dirt'),
        bumpScale: 0.015
    });
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;      // shadows are what actually GROUND objects
    floor.userData.isWater = biome === 'sea';
    return mark(floor) as THREE.Mesh;
}

// ---------- painterly geometry: the anti-slop kit ----------
//
// Primitives read as programmer art no matter how they're lit or fogged. The
// painterly-fantasy look is three tricks, all baked at build time (zero
// per-frame cost):
//   1. VERTEX GRADIENTS — every object darker/cooler at its base, warmer and
//      lit at its crown. This is THE signature of stylised fantasy art.
//   2. ORGANIC SILHOUETTES — noise-jittered blob canopies and bent trunks.
//      Nothing ships as a perfect cone or cylinder.
//   3. RIDGELINES — layered horizon silhouettes, pre-tinted for atmospheric
//      perspective, so the world has depth instead of a plane and a sky.

/** Displace vertices randomly. Use GENTLY (<=0.15) — heavy jitter on coarse
 *  flat meshes is a shard generator: exactly the "sharp bad lines" slop this
 *  kit replaces. Silhouettes now come from painted alpha textures instead. */
function jitterGeometry(geo: THREE.BufferGeometry, amt: number, rnd: () => number) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i,
            pos.getX(i) + (rnd() - 0.5) * amt,
            pos.getY(i) + (rnd() - 0.5) * amt,
            pos.getZ(i) + (rnd() - 0.5) * amt);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
}

/** Bake a vertical colour gradient (+ slight per-vertex variation) into geometry. */
function bakeGradient(geo: THREE.BufferGeometry, cBottom: number, cTop: number, rnd: () => number) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const span = Math.max(0.0001, bb.max.y - bb.min.y);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const lo = new THREE.Color(cBottom), hi = new THREE.Color(cTop), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
        const t = Math.pow((pos.getY(i) - bb.min.y) / span, 0.85);
        c.copy(lo).lerp(hi, t);
        const v = 0.94 + rnd() * 0.12;          // painterly per-vertex variation
        colors[i * 3] = c.r * v; colors[i * 3 + 1] = c.g * v; colors[i * 3 + 2] = c.b * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
}

// ---------- the Blinx pass: painted surfaces + elastic geometry ----------
//
// Studying Blinx frame-by-frame: nothing is flat-shaded vinyl and NOTHING is
// straight. Surfaces carry hand-painted value dabs (2-3 values of the same
// hue, mottled), and every built thing bends, bulges or tapers like a Seuss
// drawing. These three helpers are that style, baked.

/** Hand-painted mottle: soft value dabs on white, so material colour tints it.
 *  Used as `map` on solid masses — the "crafted illustration" tell that flat
 *  albedo can never produce. Also fed in as a gentle bump so the dabs catch
 *  light instead of reading as printed decals. */
let _mottleTex: THREE.CanvasTexture | null = null;
function mottleTexture(): THREE.CanvasTexture {
    if (_mottleTex) return _mottleTex;
    const S = 256;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S);
    // Deterministic dab field — one shared texture, so it must not change
    // between worlds (per-world variation comes from the material tint).
    const drnd = mulberry32(hashStr('mottle'));
    const dab = (x: number, y: number, r: number, dark: boolean, a: number) => {
        const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
        const c = dark ? '96,96,96' : '255,255,255';
        g.addColorStop(0, `rgba(${c},${a})`);
        g.addColorStop(0.7, `rgba(${c},${a * 0.55})`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    };
    for (let i = 0; i < 150; i++) {
        dab(drnd() * S, drnd() * S, 5 + drnd() * 34, drnd() < 0.55, 0.05 + drnd() * 0.13);
    }
    // A few broader washes so the dabs sit inside larger value shifts.
    for (let i = 0; i < 14; i++) {
        dab(drnd() * S, drnd() * S, 40 + drnd() * 60, drnd() < 0.5, 0.05 + drnd() * 0.06);
    }
    _mottleTex = new THREE.CanvasTexture(cv);
    _mottleTex.wrapS = _mottleTex.wrapT = THREE.RepeatWrapping;
    _mottleTex.needsUpdate = true;
    return _mottleTex;
}

/**
 * The Seuss deform: bend + mid-bulge + top taper applied along a geometry's
 * height. Axis-aligned boxes and cylinders are the strongest "programmer art"
 * signal there is; a bowed, pot-bellied tower reads as drawn by hand. Keep
 * amplitudes small — this is elasticity, not meltdown.
 */
function seussify(geo: THREE.BufferGeometry, bend: number, bulge: number, taper: number, rnd: () => number): THREE.BufferGeometry {
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const span = Math.max(0.0001, bb.max.y - bb.min.y);
    const dir = rnd() < 0.5 ? 1 : -1;                 // lean left or right
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = (y - bb.min.y) / span;
        const k = 1 - taper * t + bulge * Math.sin(t * Math.PI);
        pos.setX(i, pos.getX(i) * k + Math.sin(t * Math.PI * 0.5) * bend * dir);
        pos.setZ(i, pos.getZ(i) * k);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
}

// ---------- the grounding pass: Blinx's two anti-float laws ----------
//
// Frame-by-frame study of Blinx: NOTHING meets the ground with a naked mesh
// intersection (every base gets a drift ring + a painted contact darkening),
// and every form is value-stepped by orientation — up-faces catch light,
// down-faces sink into a shadow HUE (moss-green in the temple, violet in the
// caves — a shadow is never grey). These helpers bake both laws.

const _WHITE = new THREE.Color(0xffffff);

/**
 * Orientation value-stepping, composing over whatever vertex colours the
 * geometry already has (bakeGradient, prismatic banding). Faces toward the
 * sky lighten, faces toward the ground sink into the darkened atmosphere
 * hue, and the sun side takes a warm kiss of the key light. One pass gives
 * the "rounded, honestly lit form" read that flat albedo + fog can't fake.
 */
function bakeOrientAO(geo: THREE.BufferGeometry, pal: ScenePalette, strength = 1): THREE.BufferGeometry {
    geo.computeVertexNormals();
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    let col = geo.attributes.color as THREE.BufferAttribute | undefined;
    if (!col) {
        col = new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3);
        geo.setAttribute('color', col);
    }
    const sun = new THREE.Vector3(pal.sunDir[0], pal.sunDir[1], pal.sunDir[2]).normalize();
    const shadeCol = new THREE.Color(mix(pal.fog, 0x000000, 0.62));    // the shadow HUE
    const warm = new THREE.Color(pal.key);
    const c = new THREE.Color(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        n.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
        const up = n.y;
        const sunK = Math.max(0, n.dot(sun));
        c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
        if (up > 0) c.lerp(_WHITE, up * 0.16 * strength);
        else c.lerp(shadeCol, -up * 0.38 * strength);
        c.lerp(warm, Math.pow(sunK, 2.2) * 0.20 * strength);
        col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    return geo;
}

/**
 * Facing-honest facet values — the facet law (style system 9, law A3): every
 * plane carries ONE flat value chosen purely by its facing, and the darkest
 * planes stay NAKED (no jitter, no noise — a flat plane tells the truth about
 * light; texture on a dark plane lies). Up-facing planes take the pale cap,
 * sun-facing planes take the warm mid, away-facing planes sink into the
 * world's own shadow hue. Curves are allowed — their few big chords each just
 * get one honest value. Replaces bakeGradient+bakeOrientAO on carved masses.
 *
 * Works per-FACE: indexed geometry is expanded to non-indexed so each
 * triangle owns its three vertices outright. Always use the RETURN value.
 */
function bakeFacetValues(
    geo: THREE.BufferGeometry, pal: ScenePalette,
    opts: { base?: number; cap?: number; dark?: number; jitter?: number; snow?: boolean; rnd?: () => number } = {}
): THREE.BufferGeometry {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    const rnd = opts.rnd ?? mulberry32(hashStr('facet'));
    const jitter = opts.jitter ?? 0.07;
    const base = new THREE.Color(opts.base ?? pal.structure);
    // Snow biomes: the cap is WHITE with the faintest blue breath, and it
    // lands on ANY plane that faces up enough — a per-plane rule with a
    // hand-wobbled hem (the Everwinter rock: the snow inherits the faceting).
    const cap = opts.snow
        ? new THREE.Color(mix(0xffffff, pal.sky, 0.12))
        : new THREE.Color(opts.cap ?? mix(base.getHex(), mix(0xffffff, pal.key, 0.30), 0.55));
    const capThreshold = opts.snow ? 0.28 : 0.45;
    const sunMid = new THREE.Color(mix(base.getHex(), pal.key, 0.20));
    const dark = new THREE.Color(opts.dark ?? mix(base.getHex(), mix(pal.fog, 0x000000, 0.62), 0.55));
    const sun = new THREE.Vector3(pal.sunDir[0], pal.sunDir[1], pal.sunDir[2]).normalize();
    const colors = new Float32Array(pos.count * 3);
    const n = new THREE.Vector3(), c = new THREE.Color();
    for (let f = 0; f < pos.count; f += 3) {
        n.set(nrm.getX(f), nrm.getY(f), nrm.getZ(f));
        const up = n.y;
        const sunK = n.dot(sun);
        let shadeK = 1;
        // The cap hem wobbles per face — it dips and lifts per plane, never
        // ruler-straight, never the same wave twice.
        const hem = opts.snow ? (rnd() - 0.5) * 0.16 : 0;
        if (up > capThreshold + hem) c.copy(cap);          // sky-facing: the pale cap
        else if (sunK > 0.30) c.copy(sunMid);              // sun side: the warm mid
        else if (up > -0.20 && sunK > -0.10) c.copy(base); // the world's body value
        else { c.copy(dark); shadeK = 0; }                 // away: the shadow hue, FLAT
        if (shadeK > 0 && jitter > 0) shadeK = 1 + (rnd() - 0.5) * 2 * jitter;
        for (let k = 0; k < 3; k++) {
            colors[(f + k) * 3] = c.r * shadeK;
            colors[(f + k) * 3 + 1] = c.g * shadeK;
            colors[(f + k) * 3 + 2] = c.b * shadeK;
        }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
}

/** Irregular soft pool texture for contact blobs — overlapping offset
 *  gradients so the edge wobbles like a painted one, not a compass ring. */
let _blobTex: THREE.CanvasTexture | null = null;
function blobTexture(): THREE.CanvasTexture {
    if (_blobTex) return _blobTex;
    const S = 128;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, S, S);
    const brnd = mulberry32(hashStr('blob'));
    for (let i = 0; i < 5; i++) {
        const x = S / 2 + (brnd() - 0.5) * S * 0.16, y = S / 2 + (brnd() - 0.5) * S * 0.16;
        const r = S * (0.30 + brnd() * 0.12);
        const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.75, 'rgba(255,255,255,0.30)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    _blobTex = new THREE.CanvasTexture(cv);
    _blobTex.needsUpdate = true;
    return _blobTex;
}

/** The dark-mouth gradient: darkest core, rim a dark shade of the world's own
 *  atmosphere hue, soft outer falloff. Blinx's "absolute dark" punctuations
 *  are always this — a hole you believe has walls. */
function mouthTexture(pal: ScenePalette): THREE.CanvasTexture {
    const S = 128;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d')!;
    const core = new THREE.Color(mix(pal.fog, 0x000000, 0.88));
    const rim = new THREE.Color(mix(pal.fog, 0x000000, 0.42));
    const hx = (c: THREE.Color, a: number) =>
        `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.06, S / 2, S / 2, S * 0.5);
    g.addColorStop(0, hx(core, 1));
    g.addColorStop(0.55, hx(core, 0.98));
    g.addColorStop(0.85, hx(rim, 0.9));
    g.addColorStop(1, hx(rim, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    return tex;
}

/** Soft warm pool texture — the painted ellipse of light Blinx lays under
 *  every lamp, brazier and glow crystal (the lamppool crop: irregular,
 *  blobby, following the ground, NEVER a perfect radial). */
let _poolTex: THREE.CanvasTexture | null = null;
function poolTexture(): THREE.CanvasTexture {
    if (_poolTex) return _poolTex;
    const S = 128;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, S, S);
    const prnd = mulberry32(hashStr('pool'));
    for (let i = 0; i < 6; i++) {
        const x = S / 2 + (prnd() - 0.5) * S * 0.2, y = S / 2 + (prnd() - 0.5) * S * 0.2;
        const r = S * (0.26 + prnd() * 0.14);
        const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.6, 'rgba(255,255,255,0.28)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    _poolTex = new THREE.CanvasTexture(cv);
    _poolTex.needsUpdate = true;
    return _poolTex;
}

/**
 * A painted pool of light lying flat on the ground. Blinx stacks four cheap
 * tricks per light: emissive bulb + halo sprite + PAINTED GROUND POOL +
 * bloom. The ground pool is the one that survives the paint bake — and the
 * one that makes a light feel like it belongs to the floor it stands on.
 */
function lightPool(scene: THREE.Scene, x: number, z: number, r: number, col: number, opacity = 0.6) {
    const g = new THREE.CircleGeometry(1, 18);
    g.rotateX(-Math.PI / 2);
    // Two stacked discs: a generous feathered rim and a hotter warm core —
    // the pool reads as a small ROOM of light (law C2: the light is always
    // bigger than the fixture), and the warm heart survives the paint bake.
    const rim = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        map: poolTexture(), color: col, transparent: true, opacity,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    }));
    rim.position.set(x, 0.045, z);
    rim.scale.setScalar(r * 1.3);
    rim.renderOrder = 2;
    scene.add(mark(rim));
    const core = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        map: poolTexture(), color: mix(col, 0xfff2d8, 0.5), transparent: true, opacity: opacity * 0.85,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    }));
    core.position.set(x, 0.05, z);
    core.scale.setScalar(r * 0.55);
    core.renderOrder = 2;
    scene.add(mark(core));
}

/**
 * Breadcrumb lights: Blinx marks the route with a receding line of small
 * warm glows (Time Square's lamp-line recession — depth you can FOLLOW, and
 * the strongest single "walk INTO the picture" cue there is). Walks the
 * road's own wander so the trail belongs to the path, offset to the verge.
 */
function breadcrumbTrail(scene: THREE.Scene, pal: ScenePalette, rnd: () => number, noise2D: (x: number, y: number) => number) {
    const wander = (t: number) => noise2D(t * 0.035, 7.3) * 3.2;   // the road's own curve
    const col = pal.emissiveOn ? pal.emissive : mix(0xffc36a, pal.key, 0.30);
    const orbMat = new THREE.MeshStandardMaterial({
        color: mix(col, 0xffffff, 0.35), emissive: col, emissiveIntensity: 2.2, roughness: 0.4
    });
    const tex = softSprite();
    for (let i = 0; i < 7; i++) {
        const z = -4.5 - i * 6.2 - rnd() * 2;
        const x = wander(z) + (rnd() < 0.5 ? -1 : 1) * (1.7 + rnd() * 0.9);
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 8), orbMat);
        orb.position.set(x, 0.5 + rnd() * 0.3, z);
        scene.add(mark(orb));
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, color: col, transparent: true, opacity: 0.30,
            depthWrite: false, blending: THREE.AdditiveBlending, fog: false
        }));
        halo.position.copy(orb.position);
        halo.scale.set(1.8, 1.35, 1);
        scene.add(mark(halo));
        lightPool(scene, x, z, 2.2, col, 0.55);
    }
}

/**
 * Painted ground-contact darkening under a spot list — Blinx paints this
 * under every standing object (the waterline crop, the bomb field). Its
 * absence is exactly the "assets floating on a plane" tell. Tinted with the
 * world's darkened atmosphere hue so the shadow stays inside the palette.
 */
function contactBlobs(scene: THREE.Scene, at: Spot[], pal: ScenePalette, radiusOf: (p: Spot) => number, opacity = 0.38) {
    const g = new THREE.CircleGeometry(1, 18);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({
        map: blobTexture(), color: mix(pal.fog, 0x000000, 0.72),
        transparent: true, opacity, depthWrite: false, fog: false
    });
    const blobs = scatterAt(g, m, at, (mm, p) => {
        mm.position.set(p.x, 0.03, p.z);
        mm.scale.setScalar(radiusOf(p));
    });
    blobs.castShadow = false; blobs.receiveShadow = false;
    scene.add(blobs);
}

/**
 * Drift skirts: a low squashed mound at every mass base — the snow-drift /
 * dust-skirt that hides the mesh/terrain intersection line (Everwinter's
 * rocks all sit IN the snow, never ON it). Tinted between ground and
 * structure so it belongs to both.
 */
function driftSkirts(scene: THREE.Scene, at: Spot[], pal: ScenePalette, rnd: () => number) {
    const g = new THREE.ConeGeometry(1, 1, 9);
    g.translate(0, 0.5, 0);
    jitterGeometry(g, 0.10, rnd);
    // The skirt is GROUND that swallows the mass base, not a pale collar:
    // tint barely leaves the ground hue (bright structure-tinted mounds read
    // as glowing blobs at night) and the orientation bake sinks its flanks
    // into the same shadow hue as everything else.
    bakeGradient(g, mix(pal.ground, 0x000000, 0.40), mix(pal.ground, pal.structure, 0.16), rnd);
    bakeOrientAO(g, pal, 1.15);
    const skirts = scatterAt(g, paintMat(), at, (m, p) => {
        m.position.set(p.x, -0.05, p.z);
        m.scale.set(p.s * 2.2, 0.40 + p.j * 0.28, p.s * 2.2);
        m.rotation.y = p.r;
    });
    skirts.castShadow = false;
    scene.add(skirts);
}

/**
 * Clustered scatter: nature clumps. A uniform random field is the "asset
 * sprinkled by a tool" look; real growth and real ruins bunch into groups
 * with bare ground between. ~45% of spots gather around a few centres
 * (gaussian), the rest fill the gaps.
 */
function clusterSpots(n: number, min: number, max: number, rnd: () => number): Spot[] {
    const out: Spot[] = [];
    const centres = spots(Math.max(2, Math.round(n / 9)), min, max * 0.8, rnd);
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 2.2;    // cheap approx N(0, ~0.7)
    for (let i = 0; i < n; i++) {
        if (rnd() < 0.45) {
            const c = centres[i % centres.length];
            const x = c.x + gauss(), z = c.z + gauss();
            const r = Math.hypot(x, z);
            if (r < min || r > max) { i--; continue; }
            out.push({ x, z, s: 0.7 + rnd() * 0.9, r: rnd() * Math.PI, j: rnd() });
        } else {
            out.push(spots(1, min, max, rnd)[0]);
        }
    }
    return out;
}

// ---------- the fluff kit: how stylised 3D actually gets soft ----------
//
// Research (douges.dev fluffy-trees, craftzdog ghibli-shader): beautiful
// stylised foliage is NOT solid polygons. It is (1) alpha-textured QUADS in
// clusters -- the silhouette comes from a painted texture, not geometry edges --
// and (2) SPHERIZED NORMALS: every vertex normal points outward from the crown
// centre, so the whole canopy shades as one soft ball. Zero facets. Solid mass
// (trunks/rocks) gets a toon ramp: clean painterly bands, not flat facets. Our
// camera is near-static, so all of it BAKES -- no custom shaders needed.

/** 3-step toon ramp, shared. Nearest-filtered so the bands stay crisp. */
let _ramp: THREE.DataTexture | null = null;
function toonRamp(): THREE.DataTexture {
    if (_ramp) return _ramp;
    const data = new Uint8Array([110, 110, 110, 255, 185, 185, 185, 255, 255, 255, 255, 255]);
    _ramp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    _ramp.minFilter = _ramp.magFilter = THREE.NearestFilter;
    _ramp.needsUpdate = true;
    return _ramp;
}

/** Toon material for gradient-baked solid geometry (smooth, banded light). */
function paintMat() {
    return new THREE.MeshToonMaterial({
        color: 0xffffff, vertexColors: true, gradientMap: toonRamp()
    });
}

/** Painted leaf-cluster texture (cached): soft overlapping blobs on a canvas.
 *  Painted white so material.color tints it per palette. */
let _leafTex: THREE.CanvasTexture | null = null;
function leafTexture(): THREE.CanvasTexture {
    if (_leafTex) return _leafTex;
    const S = 128;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, S, S);
    const blob = (x: number, y: number, r: number, a: number) => {
        const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
        g.addColorStop(0.75, 'rgba(255,255,255,' + a * 0.85 + ')');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    };
    blob(S / 2, S / 2, S * 0.34, 1);
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        blob(S / 2 + Math.cos(a) * S * 0.24, S / 2 + Math.sin(a) * S * 0.22, S * (0.14 + (i % 3) * 0.04), 0.95);
    }
    _leafTex = new THREE.CanvasTexture(cv);
    _leafTex.needsUpdate = true;
    return _leafTex;
}

/** Lit-window grid for city towers (cached). Used as an emissiveMap: dark
 *  where nobody's home, warm/cool lit panes scattered ~40%. A night city IS
 *  its windows; a bare box is the "colored polygons" complaint verbatim.
 *  Repeats across the face — one tile would smear a handful of panes over a
 *  whole tower and vanish at distance. */
let _winTex: THREE.CanvasTexture | null = null;
function windowTexture(): THREE.CanvasTexture {
    if (_winTex) return _winTex;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 124; y += 8) {
        for (let x = 4; x < 60; x += 8) {
            if ((x * 7 + y * 13) % 10 < 3) {
                ctx.fillStyle = (x + y) % 3 ? '#ffd9a0' : '#a8ccff';
                ctx.fillRect(x, y, 4, 5);
            }
        }
    }
    _winTex = new THREE.CanvasTexture(cv);
    _winTex.wrapS = _winTex.wrapT = THREE.RepeatWrapping;
    // Dense panes: a hero tower is 3x a normal one, and garage-door windows
    // were the tell. Small lit rectangles read as architecture at any scale.
    _winTex.repeat.set(1.6, 2.6);
    _winTex.needsUpdate = true;
    return _winTex;
}

/** Foliage material: tinted painted quads, silhouette cut by alphaTest. */
function leafMatFor(tint: number) {
    return new THREE.MeshStandardMaterial({
        color: tint, map: leafTexture(), alphaTest: 0.5,
        side: THREE.DoubleSide, roughness: 0.95
    });
}

/** Shadow pass for alphaTest foliage: depth must respect the cutout. */
function leafDepth() {
    return new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        map: leafTexture(), alphaTest: 0.5
    });
}

/**
 * A fluff cluster: n textured quads randomly oriented inside a sphere around
 * `center`, then every vertex normal re-pointed outward from `center` -- the
 * spherized-normal trick that makes the cluster light as ONE soft ball.
 */
function fluffCluster(n: number, radius: number, center: THREE.Vector3, squash: number, rnd: () => number): THREE.BufferGeometry {
    const quads: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
        const size = radius * (1.0 + rnd() * 0.7);
        const q = new THREE.PlaneGeometry(size, size);
        const e = new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
        q.applyQuaternion(new THREE.Quaternion().setFromEuler(e));
        q.translate(
            center.x + (rnd() - 0.5) * radius * 1.1,
            center.y + (rnd() - 0.5) * radius * 0.9 * squash,
            center.z + (rnd() - 0.5) * radius * 1.1
        );
        quads.push(q);
    }
    const geo = mergeGeometries(quads)!;
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i) - center.x, pos.getY(i) - center.y, pos.getZ(i) - center.z).normalize();
        nrm.setXYZ(i, v.x, v.y, v.z);
    }
    nrm.needsUpdate = true;
    return geo;
}


/** Broadleaf crown: one fat fluff ball, slightly squashed. */
function makeCrownGeo(rnd: () => number): THREE.BufferGeometry {
    return fluffCluster(11, 1.5, new THREE.Vector3(0, 0, 0), 0.8, rnd);
}

/** Conifer: three stacked shrinking fluff tiers -- a soft fir, no cone edges. */
function makeConiferGeo(rnd: () => number): THREE.BufferGeometry {
    const tiers: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
        const r = 1.5 * (1 - i * 0.3);
        tiers.push(fluffCluster(7, r, new THREE.Vector3(0, i * 1.25, 0), 0.7, rnd));
    }
    return mergeGeometries(tiers)!;
}

/** Trunk with taper + bend — ONE deliberate gesture per trunk (law S1:
 *  straightness is the only forbidden thing). */
function makeTrunkGeo(h: number, r: number, rnd: () => number): THREE.BufferGeometry {
    const g = new THREE.CylinderGeometry(r * 0.5, r, h, 7, 4);
    const pos = g.attributes.position;
    const bend = (rnd() - 0.5) * 1.1;
    for (let i = 0; i < pos.count; i++) {
        const t = (pos.getY(i) + h / 2) / h;
        pos.setX(i, pos.getX(i) + Math.sin(t * Math.PI * 0.5) * bend);
    }
    g.translate(0, h / 2, 0);
    return g;
}

/** Rock: heavily jittered icosahedron, flattened, sits IN the ground. */
function makeRockGeo(rnd: () => number): THREE.BufferGeometry {
    const g = new THREE.IcosahedronGeometry(1, 2);
    jitterGeometry(g, 0.13, rnd);
    g.scale(1 + rnd() * 0.5, 0.62, 1 + rnd() * 0.5);
    return g;
}

/**
 * Layered horizon ridgelines — atmospheric perspective made of geometry.
 * Unlit silhouettes, colours PRE-mixed toward the fog by ring (fog:false), so
 * they slot consistently into the depth gradient the real fog creates closer in.
 * This is what gives the frame a middle distance and a far distance instead of
 * "ground plane, then sky".
 */
function buildRidges(scene: THREE.Scene, pal: ScenePalette, rnd: () => number, noise2D: (x: number, y: number) => number, mode = 0) {
    // The horizon has a PERSONALITY per world: sawtooth peaks, rolling dunes,
    // or flat-topped mesas. One zigzag ring reused everywhere was its own
    // kind of generic — three profiles keeps horizons as varied as the sets.
    // Kept LOW and pulled toward the SKY colour, not just the fog: a pale
    // zigzag floating over a dark midground reads as a paper crown.
    const rings = [
        { r: 62, hMax: 6,  mixK: 0.58 },
        { r: 96, hMax: 10, mixK: 0.78 }
    ];
    for (const ring of rings) {
        const seg = 96;
        const verts: number[] = [];
        const hAt = (i: number) => {
            const a = (i % seg) / seg * Math.PI * 2;
            if (mode === 1) {
                // dunes: long low swells, soft shoulders
                const n = noise2D(Math.cos(a) * 1.6, Math.sin(a) * 1.6);
                return Math.max(0.5, (0.18 + Math.max(0, n) * 0.9) * ring.hMax * 0.6);
            }
            const n = noise2D(Math.cos(a) * 3.1, Math.sin(a) * 3.1);
            const raw = Math.max(0.5, (0.3 + Math.abs(n)) * ring.hMax);
            if (mode === 2) {
                // mesas: heights snapped to a few strata — flat tops, cliffed sides
                const step = ring.hMax * 0.46;
                return Math.max(step * 0.5, Math.round(raw / step) * step);
            }
            return raw;
        };
        for (let i = 0; i < seg; i++) {
            const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
            const x0 = Math.cos(a0) * ring.r, z0 = Math.sin(a0) * ring.r;
            const x1 = Math.cos(a1) * ring.r, z1 = Math.sin(a1) * ring.r;
            const h0 = hAt(i), h1 = hAt(i + 1);
            verts.push(x0, -2, z0,  x1, -2, z1,  x0, h0, z0);
            verts.push(x1, -2, z1,  x1, h1, z1,  x0, h0, z0);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
        const mat = new THREE.MeshBasicMaterial({
            // Distant land sits BETWEEN fog and sky in value — never brighter
            // than the sky it silhouettes against. Kept UNLIT and pale: far =
            // soft and simple (law C6). Facing-dark values here turned the
            // whole horizon into a black wall when the sun sat behind it.
            color: mix(mix(pal.ground, pal.structure, 0.4), mix(pal.fog, pal.sky, 0.45), ring.mixK),
            fog: false, side: THREE.DoubleSide
        });
        const m = new THREE.Mesh(geo, mat);
        m.userData.isRidge = true;
        scene.add(mark(m));
    }
}

// ---------- trees ----------

/**
 * Layered trees. A single cone on a cylinder is the crudest silhouette in the
 * frame; real conifers step inward in tiers and broadleaves are rounder. Two
 * species split off p.j so a wood reads as a mixed wood, not a clone stamp.
 * All tiers share ONE spot list — see Spot.
 */
function addTrees(
    scene: THREE.Scene, at: Spot[], trunkMat: THREE.Material, leafMat: THREE.Material,
    opts: { trunkH: number; trunkR: number; tiers: number; canopyR: number; canopyH: number; lean?: number },
    pal?: ScenePalette, rnd0?: () => number
) {
    const { trunkH, trunkR, canopyR } = opts;
    const lean = opts.lean ?? 0;
    const rnd = rnd0 ?? Math.random;
    const p = pal!;

    // Gradient palette: canopy shadowed+cooled at the base, lit+warmed at the
    // crown; trunks rooted dark. All from the scene palette so time-of-day and
    // per-world variation flow through automatically.
    // Lit crowns stay FOLIAGE-coloured — pulling hard toward the key light
    // bleached them white at morning. 15% warm kiss, not a frost.
    const barkLo = mix(p.structure, 0x000000, 0.35);
    const barkHi = mix(p.structure, p.key, 0.18);

    const trunkGeo = bakeGradient(makeTrunkGeo(trunkH, trunkR * 1.15, rnd), barkLo, barkHi, rnd);
    const crownGeo = makeCrownGeo(rnd);
    crownGeo.scale(canopyR * 0.8, canopyR * 0.8, canopyR * 0.8);
    const coniferGeo = makeConiferGeo(rnd);
    coniferGeo.scale(canopyR * 0.82, canopyR * 0.82, canopyR * 0.82);
    // Third species — the flat-topped umbrella (acacia/baobab voice). Wide
    // thin disc of fluff on the trunk's crown. Three silhouettes is the
    // difference between "a wood" and "a clone stamp".
    const umbrellaGeo = fluffCluster(9, 2.3, new THREE.Vector3(0, 0, 0), 0.30, rnd);
    umbrellaGeo.scale(canopyR * 0.95, canopyR * 0.95, canopyR * 0.95);

    // Crown colour: the fluff lights itself via spherized normals, so the
    // material tint is mid-foliage warmed slightly; hemi+sun paint the gradient.
    const crownTint = mix(p.foliage, p.key, 0.10);

    scene.add(scatterAt(trunkGeo, paintMat(), at, (m, pt) => {
        m.position.set(pt.x, 0, pt.z); m.scale.setScalar(pt.s);
        m.rotation.set(0, pt.r, (pt.j - 0.5) * lean);
    }));
    const conifers = scatterAt(coniferGeo, leafMatFor(mix(crownTint, 0x000000, 0.12)), at, (m, pt) => {
        if (pt.j > 0.42) { m.scale.setScalar(0); return; }
        m.position.set(pt.x, trunkH * 0.72 * pt.s, pt.z);
        m.scale.setScalar(pt.s); m.rotation.y = pt.r;
    });
    conifers.customDepthMaterial = leafDepth();
    scene.add(conifers);
    const crowns = scatterAt(crownGeo, leafMatFor(mix(crownTint, 0xffffff, 0.12)), at, (m, pt) => {
        if (pt.j <= 0.42 || pt.j > 0.78) { m.scale.setScalar(0); return; }
        m.position.set(pt.x, trunkH * 0.92 * pt.s, pt.z);
        m.scale.setScalar(pt.s); m.rotation.y = pt.r;
    });
    crowns.customDepthMaterial = leafDepth();
    scene.add(crowns);
    const umbrellas = scatterAt(umbrellaGeo, leafMatFor(mix(crownTint, p.key, 0.14)), at, (m, pt) => {
        if (pt.j <= 0.78) { m.scale.setScalar(0); return; }
        m.position.set(pt.x, trunkH * 1.02 * pt.s, pt.z);
        m.scale.setScalar(pt.s); m.rotation.y = pt.r;
    });
    umbrellas.customDepthMaterial = leafDepth();
    scene.add(umbrellas);

    // Undergrowth: a small fluff bush at every trunk base. Trees rising bare
    // out of flat ground is a big part of what reads as "basic" -- growth
    // clusters where things grow.
    const bushes = scatterAt(makeCrownGeo(rnd), leafMatFor(mix(crownTint, p.ground, 0.35)), at, (m, pt) => {
        m.position.set(pt.x + (pt.j - 0.5) * 0.8, 0.28 * pt.s, pt.z + (pt.j - 0.5) * 0.6);
        m.scale.setScalar(0.3 * pt.s);
        m.rotation.y = pt.r * 2.0;
    });
    bushes.customDepthMaterial = leafDepth();
    bushes.castShadow = false;
    scene.add(bushes);

    // Painted contact darkening under every trunk — a tree is rooted, not
    // placed. Subtle: the shadow-map shadows exist too; this is the soft
    // painted core that survives the Kuwahara bake.
    contactBlobs(scene, at, p, (pt) => canopyR * 0.75 * pt.s, 0.26);
}

// ---------- mass families: the silhouette registry ----------
//
// Every scene — invented or a known biome with a Director twist — composes
// from the same layers: a mass family (the silhouette), ceiling, growth,
// rocks, glow. One registry, one recipe. Adding a new silhouette is one entry
// here, not a new branch in a switch. This retracts the old 'synthetic'
// if/else chain.

type FamilyCtx = {
    scene: THREE.Scene; at: Spot[]; pal: ScenePalette; rnd: () => number;
    vis: SceneVisual; traits: SceneTraits;
    structMat: () => THREE.Material; foliMat: () => THREE.Material; glowMat: () => THREE.Material;
};

const MASS_FAMILIES: Record<string, (c: FamilyCtx) => void> = {
    spires: ({ scene, at, structMat, rnd, pal }) => {
        // Bowed, slightly pot-bellied towers — nothing axis-aligned. Height
        // segments so the bend reads as a curve, not a kink.
        const g = seussify(new THREE.BoxGeometry(1.5, 7, 1.5, 1, 6, 1), 0.55, 0.16, 0.10, rnd);
        // A glass metropolis bands its towers like the rainbow bridge bands
        // its arches — sentient glass, not painted concrete. Otherwise each
        // face owns ONE value by facing; the mottle stays off the dark sides.
        const mat = pal.prismatic ? (prismatize(g), prismaticMat()) : (bakeFacetValues(g, pal, { rnd }), structMat());
        scene.add(scatterAt(g, mat, at, (m, p) => {
            m.position.set(p.x, 3.5 * p.s * (0.5 + p.j), p.z);
            m.scale.set(p.s * (0.5 + p.j), p.s * (0.5 + p.j * 1.6), p.s * (0.5 + p.j));
            m.rotation.y = p.r;
        }));
    },
    blobs: ({ scene, at, pal, rnd }) => {
        const g = bakeFacetValues(new THREE.IcosahedronGeometry(1.6, 2), pal, { rnd });
        scene.add(scatterAt(g, paintMat(), at, (m, p) => {
            m.position.set(p.x, 0.7 * p.s, p.z);
            m.scale.set(p.s * (0.8 + p.j), p.s * (0.55 + p.j * 0.7), p.s * (0.8 + p.j));
            m.rotation.y = p.r;
        }));
    },
    blocks: ({ scene, at, structMat, vis, rnd, pal }) => {
        const g = bakeFacetValues(seussify(new THREE.BoxGeometry(2.4, 2.4, 2.4, 1, 4, 1), 0.30, 0.12, 0.08, rnd), pal, { rnd });
        scene.add(scatterAt(g, structMat(), at, (m, p) => {
            m.position.set(p.x, 1.2 * p.s * (0.4 + p.j), p.z);
            m.scale.set(p.s * (0.7 + p.j * 0.8), p.s * (0.4 + p.j * 1.4), p.s * (0.7 + p.j * 0.6));
            m.rotation.y = vis.order === 'artificial' ? p.r : Math.round(p.r * 2.55) * 0.35;
        }));
    },
    arches: ({ scene, at, structMat, pal, rnd }) => {
        const g = bakeFacetValues(new THREE.TorusGeometry(2.6, 0.42, 6, 14, Math.PI), pal, { rnd });
        let mat = structMat();
        if (pal.prismatic) {
            // A solidified rainbow bands along the arc — red at one foot to
            // violet at the other. Vertex hues over a toon ramp: no texture,
            // no shader, and it survives the bake like everything else.
            const pos = g.attributes.position;
            const colors = new Float32Array(pos.count * 3);
            const c = new THREE.Color();
            for (let i = 0; i < pos.count; i++) {
                const u = Math.min(1, Math.max(0, (pos.getX(i) + 2.6) / 5.2));
                c.setHSL((1 - u) * 0.78, 0.75, 0.58);
                colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
            }
            g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            mat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonRamp() });
        }
        scene.add(scatterAt(g, mat, at, (m, p) => {
            m.position.set(p.x, 0.1, p.z);
            m.scale.setScalar(p.s * (0.7 + p.j * 0.9));
            m.rotation.y = p.r;
        }));
        // The Blinx value anchor: a dark MOUTH inside every arch — a place to
        // go. Study of the Forgotten City pits: the dark is never flat black —
        // it's a dark blue-violet GRADIENT (darkest at the core, a shade of
        // the world at the rim), which reads as a hole with walls, not a
        // rendering bug. Pure black is a void; a gradient is a place.
        const mouthMat = new THREE.MeshBasicMaterial({ map: mouthTexture(pal), transparent: true, depthWrite: false, fog: false });
        scene.add(scatterAt(new THREE.CircleGeometry(1.9, 20), mouthMat, at, (m, p) => {
            const sc = p.s * (0.7 + p.j * 0.9);
            m.position.set(p.x - Math.sin(p.r) * 0.4 * sc, 0.1, p.z - Math.cos(p.r) * 0.4 * sc);
            m.scale.setScalar(sc);
            m.rotation.y = p.r;
        }));
    },
    shards: ({ scene, at, structMat, pal, rnd }) => {
        const g = new THREE.BoxGeometry(0.28, 4.6, 2.0, 1, 4, 1);
        const mat = pal.prismatic ? (prismatize(g), prismaticMat()) : (bakeFacetValues(g, pal, { rnd }), structMat());
        scene.add(scatterAt(g, mat, at, (m, p) => {
            m.position.set(p.x, 2.0 * p.s, p.z);
            m.scale.setScalar(p.s * (0.5 + p.j));
            m.rotation.set((p.j - 0.5) * 0.5, p.r, (p.j - 0.5) * 0.35);
        }));
    },
    // Giant mushrooms. Two parts sharing ONE spot list (the floating-canopy
    // lesson). The cap carries the place's colour identity — a mushroom
    // forest must NOT read as a green cone forest.
    fungus: ({ scene, at, pal, rnd }) => {
        const stemGeo = bakeFacetValues(new THREE.CylinderGeometry(0.16, 0.34, 2.6, 8),
            pal, { base: mix(pal.structure, 0xffffff, 0.42), rnd });
        const capGeo = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        capGeo.scale(1.35, 0.55, 1.35);
        bakeFacetValues(capGeo, pal, { base: pal.foliage, rnd });
        scene.add(scatterAt(stemGeo, paintMat(), at, (m, p) => {
            m.position.set(p.x, 1.3 * p.s * (0.7 + p.j * 0.9), p.z);
            m.scale.set(p.s, p.s * (0.7 + p.j * 0.9), p.s);
            m.rotation.set(0, p.r, (p.j - 0.5) * 0.22);
        }));
        scene.add(scatterAt(capGeo, paintMat(), at, (m, p) => {
            const h = 2.6 * p.s * (0.7 + p.j * 0.9);
            const lean = (p.j - 0.5) * 0.22;
            m.position.set(p.x - Math.sin(lean) * h, Math.cos(lean) * h, p.z);
            const cr = p.s * (0.9 + p.j * 1.2);
            m.scale.set(cr, cr, cr);
            m.rotation.y = p.r;
        }));
    },
    // Colonnade: full shafts when something BUILT this, broken stubs when
    // nature (or time) did. Capitals only survive on intact columns.
    columns: ({ scene, at, pal, rnd, vis }) => {
        // A whisper of bend even in built shafts — hand-placed, not machined.
        const shaftGeo = bakeFacetValues(seussify(new THREE.CylinderGeometry(0.42, 0.52, 6.4, 10, 5), 0.20, 0.08, 0.04, rnd), pal, { rnd });
        const capGeo = bakeFacetValues(new THREE.BoxGeometry(1.35, 0.42, 1.35), pal, { rnd });
        const height = (p: Spot, order?: string) => order === 'artificial' ? 1 : 0.35 + p.j * 0.85;
        scene.add(scatterAt(shaftGeo, paintMat(), at, (m, p) => {
            const full = height(p, vis.order);
            m.position.set(p.x, 3.2 * p.s * full, p.z);
            m.scale.set(p.s, p.s * full, p.s);
            m.rotation.set(0, p.r, full < 0.95 ? (p.j - 0.5) * 0.10 : 0);
        }));
        scene.add(scatterAt(capGeo, paintMat(), at, (m, p) => {
            const full = height(p, vis.order);
            if (full < 0.92) { m.scale.setScalar(0); return; }
            m.position.set(p.x, 6.4 * p.s + 0.22, p.z);
            m.scale.setScalar(p.s);
            m.rotation.y = p.r;
        }));
    },
    // Bent, tapered growths — organic interiors, alien thickets, root tangles.
    tendrils: ({ scene, at, pal, rnd, traits }) => {
        const geo = bakeFacetValues(makeTrunkGeo(3.6, 0.36, rnd), pal, {
            base: traits.glowing ? mix(pal.structure, pal.emissive, 0.35) : pal.structure, rnd
        });
        scene.add(scatterAt(geo, paintMat(), at, (m, p) => {
            m.position.set(p.x, 0, p.z);
            m.scale.set(p.s * 0.8, p.s * (0.6 + p.j * 1.2), p.s * 0.8);
            m.rotation.set((p.j - 0.5) * 0.5, p.r, (p.j - 0.5) * 0.65);
        }));
    },
    // Floating spheres — dream/astral mass. Glowing scenes get emissive orbs.
    orbs: ({ scene, at, pal, rnd, traits }) => {
        const glowing = traits.glowing;
        const geo = new THREE.SphereGeometry(0.7, 14, 10);
        const mat = glowing
            ? new THREE.MeshStandardMaterial({ color: mix(pal.emissive, 0xffffff, 0.30), emissive: pal.emissive, emissiveIntensity: 1.6, roughness: 0.4 })
            : (bakeFacetValues(geo, pal, { rnd }), paintMat());
        scene.add(scatterAt(geo, mat, at, (m, p) => {
            m.position.set(p.x, 2 + p.j * 7, p.z);
            m.scale.setScalar(0.35 + p.j * 1.1);
        }));
    },
    // Hoodoos: stacked, tapering rock towers — badlands, eroded canyons,
    // termite-cathedral deserts. Distinct from spires (clean slabs) and
    // columns (built shafts): these read as EROSION, not construction.
    hoodoos: ({ scene, at, pal, rnd }) => {
        const stack: THREE.BufferGeometry[] = [];
        let y = 0;
        for (let i = 0; i < 3; i++) {
            const r = 1.1 - i * 0.26;
            const h = 1.9 - i * 0.3;
            const seg = new THREE.CylinderGeometry(r * 0.75, r, h, 7);
            jitterGeometry(seg, 0.10, rnd);
            seg.translate((rnd() - 0.5) * 0.2, y + h / 2, (rnd() - 0.5) * 0.2);
            stack.push(seg);
            y += h * 0.92;
        }
        const geo = bakeFacetValues(mergeGeometries(stack)!, pal, { rnd });
        scene.add(scatterAt(geo, paintMat(), at, (m, p) => {
            m.position.set(p.x, 0, p.z);
            m.scale.set(p.s, p.s * (1.0 + p.j * 1.1), p.s);
            m.rotation.y = p.r;
        }));
    },
    // Plates: flat sedimentary slabs, tilted and stacked — strata fields,
    // shale badlands, a giant's crockery pile.
    plates: ({ scene, at, pal, rnd }) => {
        const stack: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 4; i++) {
            const slab = new THREE.CylinderGeometry(1.15 - i * 0.14, 1.25 - i * 0.14, 0.22, 8);
            jitterGeometry(slab, 0.06, rnd);
            slab.translate((rnd() - 0.5) * 0.3, 0.16 + i * 0.24, (rnd() - 0.5) * 0.3);
            stack.push(slab);
        }
        const geo = bakeFacetValues(mergeGeometries(stack)!, pal, { rnd });
        scene.add(scatterAt(geo, paintMat(), at, (m, p) => {
            m.position.set(p.x, 0, p.z);
            m.scale.set(p.s * (0.9 + p.j * 0.6), p.s * (0.7 + p.j * 0.8), p.s * (0.9 + p.j * 0.6));
            m.rotation.set((p.j - 0.5) * 0.14, p.r, (p.j - 0.5) * 0.14);
        }));
    },
    // Needles: dense clumps of hair-thin spikes — crystal needle forests,
    // thorn deserts, urchin beds. Reads as one fuzzy mass at distance.
    needles: ({ scene, at, pal, rnd, traits }) => {
        const geo = new THREE.ConeGeometry(0.09, 4.2, 5);
        jitterGeometry(geo, 0.05, rnd);
        const mat = new THREE.MeshStandardMaterial({
            color: pal.structure, roughness: 0.7, flatShading: true,
            emissive: pal.emissive, emissiveIntensity: traits.glowing ? 0.5 : (pal.emissiveOn ? 0.2 : 0)
        });
        // Each mass spot seeds a CLUMP of needles, not one.
        const clump: Spot[] = [];
        for (const p of at) {
            for (let i = 0; i < 6; i++) {
                clump.push({ x: p.x + (rnd() - 0.5) * 1.6, z: p.z + (rnd() - 0.5) * 1.6, s: p.s * (0.5 + rnd() * 0.8), r: rnd() * Math.PI, j: rnd() });
            }
        }
        scene.add(scatterAt(geo, mat, clump, (m, p) => {
            m.position.set(p.x, 2.1 * p.s, p.z);
            m.scale.set(p.s, p.s * (0.7 + p.j), p.s);
            m.rotation.set((p.j - 0.5) * 0.3, p.r, (p.j - 0.5) * 0.3);
        }));
    }
};
const FAM_KEYS = Object.keys(MASS_FAMILIES);

/**
 * Glasslight banding: hue climbs the geometry's height — red foot to violet
 * crown, the solidified-rainbow read. Arches band along their arc; towers
 * and shards band by height. Vertex hues over a toon ramp: no texture, no
 * shader, survives the bake.
 */
function prismatize(geo: THREE.BufferGeometry): THREE.BufferGeometry {
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const span = Math.max(0.0001, bb.max.y - bb.min.y);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
        const u = Math.min(1, Math.max(0, (pos.getY(i) - bb.min.y) / span));
        c.setHSL((1 - u) * 0.78, 0.72, 0.58);
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
}
function prismaticMat() {
    return new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonRamp() });
}

/**
 * The shared composition recipe. Silhouette precedence: the DM's explicit
 * choice > keyword traits > deterministic hash. 'none' means NONE (a place
 * empty of masses) — it used to fall through to the hash pick, which put
 * random blocks on a barren moon.
 */
function composeMasses(
    scene: THREE.Scene, pal: ScenePalette, rnd: () => number,
    traits: SceneTraits, visual: SceneVisual | null | undefined,
    structMat: () => THREE.Material, foliMat: () => THREE.Material, glowMat: () => THREE.Material,
    massMat?: () => THREE.Material
) {
    const vis = visual ?? {};
    const h = Math.floor(rnd() * 1e9);
    const fam = vis.silhouette
        ? (vis.silhouette === 'none' ? null : vis.silhouette)
        : (traits.spires ? 'spires' : FAM_KEYS[h % FAM_KEYS.length]);
    const dens = typeof vis.density === 'number' ? vis.density : 0.5;
    const nMass = Math.round(10 + dens * 26);
    // The mass band moves per world-hash: some places crowd the viewer, some
    // hold their silhouettes at the horizon. Same recipe, different distance —
    // one of the reasons scenes used to feel identical even across families.
    const massSpots = vis.order === 'artificial'
        ? ringSpots(Math.max(6, Math.round(nMass * 0.6)), 14 + (h % 8), rnd)
        : clusterSpots(nMass, 6 + (h % 3) * 5, 30 + (h % 4) * 6, rnd);
    // The Blinx focal rule: every place has ONE oversized theme object the
    // frame is organised around (the face tower, the giant mushroom, the
    // hourglass). One hero instance of the mass family, 2-3x normal scale.
    // Not for floating orbs (they ARE all hero). A BUILT place's hero is its
    // CAPITAL — one tower held centre-back that outranks the ring.
    if (fam && fam !== 'orbs' && fam !== 'none') {
        // Blocks grow modestly: a 3x cube is a monolith, not a hero — it
        // fills half the frame with one black wall (the cereal-ocean slab).
        const b0 = fam === 'blocks' ? 1.5 : 2.1;
        const b1 = fam === 'blocks' ? 1.8 : 2.6;
        if (vis.order === 'artificial') {
            massSpots.push({
                x: (h % 2 ? 1 : -1) * (1.5 + (h >> 4) % 2),
                z: -(15 + (h >> 6) % 6),
                s: b1 + ((h >> 9) % 8) / 10,
                r: rnd() * Math.PI, j: 0.9
            });
        } else {
            massSpots.push({
                x: (h % 2 ? 1 : -1) * (4.5 + (h >> 4) % 4),
                z: -(13 + (h >> 6) % 9),
                s: b0 + ((h >> 9) % 10) / 10,
                r: rnd() * Math.PI, j: 0.85
            });
        }
    }
    // Massing constraint (law D1/B1, the 04-cereal-ocean monoliths): block
    // masses are WALLS, not furniture — a close cube in the centre strip fills
    // half the frame with one flat face. Keep the family out of the near
    // middle third, at a minimum camera distance, and capped in height
    // relative to the play area.
    if (fam === 'blocks') {
        for (const p of massSpots) {
            const d = Math.hypot(p.x, p.z);
            if (d < 12) { const k = 12 / Math.max(d, 0.01); p.x *= k; p.z *= k; }
            if (Math.abs(p.x) < 7 && p.z < 2 && p.z > -30) p.x = (p.x < 0 ? -1 : 1) * (7 + p.j * 5);
            p.s = Math.min(p.s, 1.15);
        }
    }
    if (fam && MASS_FAMILIES[fam]) {
        // massMat overrides the family's structure material when the PLACE
        // demands it (a city's towers carry lit windows whatever silhouette
        // the Director picked). Otherwise masses go TOON + facet-baked: one
        // honest value per plane, no mottle noise on the dark sides (the
        // facet law). Rocks/stalactites below follow the same rule.
        MASS_FAMILIES[fam]({ scene, at: massSpots, pal, rnd, vis, traits, structMat: massMat ?? (() => paintMat()), foliMat, glowMat });
    }
    // The anti-float law: nothing stands ON the ground, everything sits IN
    // it — a drift skirt hides the intersection line and a painted blob
    // darkens the contact (Everwinter's drift rings, the waterline crop).
    // Floating families and weightless places stay clean.
    if (fam && fam !== 'orbs' && fam !== 'none' && !traits.submerged && !traits.space) {
        driftSkirts(scene, massSpots, pal, rnd);
        contactBlobs(scene, massSpots, pal, (p) => p.s * 2.1, 0.34);
    }
    // Enclosed spaces have a ceiling — stalactites from above. Jittered so
    // they read as wet rock, not machined cones. Kept small, high and few,
    // over a haze ROOF: fangs hanging from a pure black void read as icicles
    // floating in space; they need a ceiling to grow from.
    if (traits.enclosed) {
        // A REAL ceiling, not a haze sprite: a huge near-horizontal slab
        // overhead carrying the cave-marble mottle, a shade lighter than the
        // void behind it. It must sit IN FRAME — low enough that the standing
        // camera catches its near edge across the upper third — or the
        // stalactites hang from nothing (fangs in pure black read as floating
        // debris; Blinx's caves always show the ceiling's dark marbled mass).
        const roof = new THREE.Mesh(
            new THREE.PlaneGeometry(170, 110),
            new THREE.MeshBasicMaterial({
                map: mottleTexture(), color: mix(pal.fog, 0x000000, 0.42),
                fog: false, side: THREE.DoubleSide
            })
        );
        roof.position.set(0, 9.5, -15);
        roof.rotation.x = Math.PI / 2 - 0.12;
        scene.add(mark(roof));
        const stalGeo = bakeFacetValues(new THREE.ConeGeometry(0.5, 3.0, 7), pal, { rnd });
        jitterGeometry(stalGeo, 0.12, rnd);
        scene.add(scatterAt(stalGeo, paintMat(), spots(22, 4, 34, rnd), (m, p) => {
            m.position.set(p.x, 9.0, p.z); m.rotation.z = Math.PI; m.scale.setScalar(0.3 + p.j * 0.6);
        }));
    }
    // Growth where things grow — never in barren places, sparse places, or
    // built ones (a library does not sprout), and never on erosion landscapes
    // (hoodoo/plate fields are bare rock; green scrub turned a badlands into
    // a grassland). Soft fluff clusters, not bare cones: a cone at bush size
    // reads as a green traffic cone.
    const rockFam = fam === 'hoodoos' || fam === 'plates';
    if (!traits.barren && !rockFam && dens > 0.2 && vis.order !== 'artificial') {
        const growth = clusterSpots(Math.round(40 + dens * 90), 3, 34, rnd);
        const bushGeo = fluffCluster(7, 0.8, new THREE.Vector3(0, 0.7, 0), 1.0, rnd);
        const bushes = scatterAt(bushGeo, leafMatFor(pal.foliage), growth, (m, p) => {
            m.position.set(p.x, 0, p.z); m.scale.setScalar(p.s * 0.9); m.rotation.y = p.r;
        });
        bushes.customDepthMaterial = leafDepth();
        scene.add(bushes);
    }
    const rubbleSpots = spots(Math.round(8 + dens * 20), 4, 30, rnd);
    const rubbleGeo = bakeFacetValues(new THREE.DodecahedronGeometry(0.7, 0), pal, { rnd });
    scene.add(scatterAt(rubbleGeo, paintMat(), rubbleSpots, (m, p) => {
        m.position.set(p.x, 0.28, p.z); m.rotation.set(p.r, p.j * Math.PI, p.r);
    }));
    contactBlobs(scene, rubbleSpots, pal, (p) => 0.9 * p.s, 0.30);
    if (pal.emissiveOn) {
        glowDots(scene, spots(40, 3, 30, rnd), pal.emissive, (p) => 0.5 + p.j * 4);
    }
}

// ---------- foreground framing ----------

/**
 * The near-camera dark shapes at the bottom frame corners — the oldest trick
 * in background art, and the near anchor that keeps the standing camera from
 * feeling like a hover. Lush places frame with soft foliage bushes, barren
 * places with smooth rock mounds — always dark WITHIN the palette, never
 * black. (History: v43 mixed 55% black at ~5 units wide — the "weird fuzzy
 * stuff" crystal-shard complaint. v44 shrank them so far the anchor vanished
 * — the "floating" complaint.) x ~±2.6 leaves most of the shape off-frame,
 * inner edge in.
 */
function buildFraming(scene: THREE.Scene, pal: ScenePalette, rnd: () => number, traits: SceneTraits, visual: SceneVisual | null | undefined, biome: string, roadMask?: RoadMask, noise2D?: (x: number, y: number) => number) {
    if (biome === 'void' || biome === 'sea') return;        // nowhere to stand
    if (visual?.silhouette === 'none') return;              // an empty place stays empty
    // From the standing camera these are THE near anchor — the thing beside
    // you that tells the eye where it stands. Without them the viewer hovers.
    const framers: Spot[] = [
        { x: -2.6 - rnd() * 0.7, z: 5.2 - rnd() * 0.7, s: 1.1 + rnd() * 0.4, r: rnd() * Math.PI, j: rnd() },
        { x: 2.7 + rnd() * 0.8, z: 4.6 - rnd() * 0.7, s: 1.0 + rnd() * 0.4, r: rnd() * Math.PI, j: rnd() }
    ];
    if (!traits.barren) {
        // Lush places frame with the bush beside you: soft, dark within the
        // palette, organic silhouette — never a black crystal shard.
        const bushGeo = fluffCluster(9, 1.1, new THREE.Vector3(0, 0.7, 0), 0.75, rnd);
        const bushes = scatterAt(bushGeo, leafMatFor(mix(pal.foliage, 0x000000, 0.45)), framers, (m, p) => {
            m.position.set(p.x, 0, p.z);
            m.scale.set(p.s * 1.3, p.s, p.s * 1.3);
            m.rotation.y = p.r;
        });
        bushes.customDepthMaterial = leafDepth();
        scene.add(bushes);
    } else {
        // Barren places frame with rock mounds: smooth, dark WITHIN the palette.
        const mat = new THREE.MeshStandardMaterial({
            color: mix(mix(pal.structure, pal.ground, 0.4), 0x000000, 0.22), roughness: 0.95,
            emissive: pal.emissive, emissiveIntensity: pal.emissiveOn ? 0.13 : 0
        });
        const geo = new THREE.SphereGeometry(1, 8, 6);
        jitterGeometry(geo, 0.16, rnd);
        scene.add(scatterAt(geo, mat, framers, (m, p) => {
            m.position.set(p.x, 0.25 * p.s, p.z);
            m.scale.set(p.s * 1.6, p.s * 0.8, p.s * 1.15);
            m.rotation.set(0, p.r, (p.j - 0.5) * 0.1);
        }));
    }

    // ---------- the boundary ring (law D6): the scene ENDS ----------
    // Every scene is hemmed by the world's own architecture or its own
    // darkness — a ring of dark masses at the playable edge, in the biome's
    // own silhouette, dimmed. It reads "goes on, not for you", never "content
    // ends". No raw world edge, no floating horizon polygons.
    if (!traits.space && !traits.submerged) {
        // The boundary is the world's own material, DIMMED — never near-black.
        // Pale worlds get a deep slate of their own sky hue; dark worlds a
        // darker step of their structure. Kept LOW and pushed OUT to the
        // ridgeline gap so it hems the view without looming over the player.
        const pale = luminance(mix(pal.ground, pal.fog, 0.5)) > 0.45;
        const darkTarget = pale ? mix(mix(pal.fog, pal.sky, 0.35), 0x000000, 0.30) : mix(pal.fog, 0x000000, 0.60);
        const dark = mix(mix(pal.structure, pal.ground, 0.25), darkTarget, pale ? 0.62 : 0.45);
        const built = biome === 'urban' || visual?.order === 'artificial';
        // THREE silhouette variants per world, cycled around the ring — no two
        // adjacent masses share a gable/crenellation rhythm (law B5/B10).
        const variants: THREE.BufferGeometry[] = [];
        for (let v = 0; v < 3; v++) {
            let g: THREE.BufferGeometry;
            if (built) {
                // Dark rooftops/towers — the city continues, unlit, past the edge.
                g = seussify(new THREE.BoxGeometry(2.2 + v * 0.7, 5.2 + v * 1.1, 2.2 + (2 - v) * 0.5, 1, 5, 1), 0.35, 0.10, 0.08 + v * 0.04, rnd);
            } else if (biome === 'arctic') {
                // Ice cliffs: pale family sunk into the slate shadow value.
                g = new THREE.CylinderGeometry(1.4 + v * 0.4, 2.4 + v * 0.5, 5.0 + v * 1.4, 6);
                jitterGeometry(g, 0.20, rnd);
            } else if (biome === 'desert' || biome === 'plains') {
                // Dune-dark swells on the horizon line.
                g = new THREE.SphereGeometry(3.0 + v * 0.6, 9, 6);
                g.scale(1.4 + v * 0.25, 0.42 + v * 0.09, 1);
                jitterGeometry(g, 0.13, rnd);
            } else {
                // Rock walls / crags — the cave closes with its own rock.
                g = new THREE.IcosahedronGeometry(2.6 + v * 0.5, 1);
                g.scale(1 + v * 0.15, 1.1 + v * 0.30, 1);
                jitterGeometry(g, 0.26, rnd);
            }
            variants.push(bakeFacetValues(g, pal, {
                base: dark, cap: mix(dark, pal.key, 0.30),
                // Away faces sink toward the fog hue, not toward a second
                // black — and jitter stays ON so the masses never read as
                // flat unlit cutouts.
                dark: mix(dark, pal.fog, pale ? 0.60 : 0.22),
                jitter: 0.11, rnd
            }));
        }
        const ringAt = ringSpots(15, 55 + rnd() * 8, rnd);
        for (let v = 0; v < 3; v++) {
            const sub = ringAt.filter((_, i) => i % 3 === v);
            scene.add(scatterAt(variants[v], paintMat(), sub, (m, p) => {
                m.position.set(p.x, 0.9 * p.s, p.z);
                m.scale.set(p.s * (1.1 + p.j), p.s * (0.55 + p.j * 0.5), p.s * (1.1 + p.j));
                m.rotation.y = p.r;
            }));
        }
        contactBlobs(scene, ringAt, pal, (p) => p.s * 3.6, 0.30);
        // Bases swallowed by drift so no mass sits on a naked contact line.
        driftSkirts(scene, ringAt, pal, rnd);

        // The ring is INHABITED, not void: built edges carry crooked clusters
        // of glowing window cards (recipe windowCards — mullions painted on,
        // every cluster sharing its mass's facing); wild edges a lone warm dab.
        const warmCol = pal.emissiveOn ? pal.emissive : 0xffc36a;
        if (built) {
            const walls: CardWall[] = [];
            for (const p of ringAt) {
                if (p.j <= 0.2) continue;
                const d = Math.hypot(p.x, p.z) || 1;
                const nx = -p.x / d, nz = -p.z / d;
                walls.push({
                    x: p.x + nx * 2.4, y: 1.4 + p.j * 2.6, z: p.z + nz * 2.4,
                    ry: Math.atan2(nx, nz), lean: (p.j - 0.5) * 0.3,
                    n: 2 + Math.floor(p.j * 3), s: 1.15
                });
            }
            windowCards(scene, walls, pal, rnd);
        } else {
            const winMat = new THREE.MeshBasicMaterial({ color: mix(warmCol, 0xffffff, 0.25), fog: true });
            const winSpots: Spot[] = [];
            for (const p of ringAt) {
                if (p.j > 0.62) {
                    winSpots.push({
                        x: p.x + (rnd() - 0.5) * 1.6, z: p.z + (rnd() - 0.5) * 1.6,
                        s: 1, r: Math.atan2(-p.x, -p.z), j: rnd()
                    });
                }
            }
            if (winSpots.length) {
                const wins = scatterAt(new THREE.PlaneGeometry(0.22, 0.22), winMat, winSpots, (m, p) => {
                    m.position.set(p.x, 0.9 + p.j * 1.2, p.z);
                    m.rotation.y = p.r;
                });
                wins.castShadow = false; wins.receiveShadow = false;
                scene.add(wins);
            }
        }

        // The path's exits close with DRESSED thresholds (law D5/D6, recipe
        // gateArch): real gates — flanking piers, a lintel or arch, biome
        // dressing — framing the dark mouth that previews the next room.
        if (roadMask && noise2D) {
            const wander = (t: number) => noise2D(t * 0.035, 7.3) * 3.2;
            const exits = [
                { x: wander(-44), z: -44, ry: 0 },                 // north, down the view
                { x: -46, z: wander(-46 + 41), ry: Math.PI / 2 },  // west
                { x: 46, z: wander(46 + 41), ry: -Math.PI / 2 }    // east
            ];
            const gv: 'stone' | 'timber' | 'glyph' =
                (biome === 'forest' || biome === 'crossroads' || biome === 'plains' || biome === 'swamp') ? 'timber'
                : (biome === 'synthetic' || biome === 'fire' || biome === 'underground') ? 'glyph' : 'stone';
            for (const e of exits) gateArch(scene, e.x, e.z, e.ry, pal, rnd, gv, biome);
        }
    }
}

// ---------- near-field ground detail ----------

/**
 * The camera's own patch of ground. Masses live at 7-40 units; without
 * pebbles and tufts at 2-9 the near field is an empty carpet and the world
 * has no floor texture under the viewer's nose. Kept off the road, and
 * barren places get stones but no growth.
 */
function buildNearField(scene: THREE.Scene, pal: ScenePalette, rnd: () => number, roadMask: RoadMask | undefined, traits: SceneTraits, biome: string) {
    if (biome === 'void' || biome === 'sea') return;
    const ok = (x: number, z: number) => !roadMask || roadMask(x, z) < 0.3;
    // Pebbles must sit IN the ground, not pop off it: their sun-facing facets
    // catch light the flat ground plane refuses, so they take a darker albedo.
    const pebbleMat = new THREE.MeshStandardMaterial({ color: mix(mix(pal.structure, pal.ground, 0.55), 0x000000, 0.35), roughness: 0.95, flatShading: true });
    scene.add(scatterAt(new THREE.DodecahedronGeometry(0.16, 0), pebbleMat,
        spots(26, 2, 9, rnd).filter(p => ok(p.x, p.z)), (m, p) => {
            m.position.set(p.x, 0.04, p.z);
            m.scale.setScalar(0.4 + p.j * 0.8);
            m.rotation.set(p.r, p.j * Math.PI, p.r * 0.7);
        }));
    if (!traits.barren) {
        // Tufts in THREE silhouettes x three tints — one green puff instanced
        // 34 times was the "identical shrubs" tell (18-strata-plates). Every
        // instance gets rotation, lean and non-uniform scale jitter, all from
        // the spot's own jitter fields.
        const kits: [THREE.BufferGeometry, THREE.Material][] = [
            [fluffCluster(5, 0.28, new THREE.Vector3(0, 0.22, 0), 1.3, rnd), leafMatFor(pal.foliage)],                          // the round puff
            [fluffCluster(3, 0.36, new THREE.Vector3(0, 0.16, 0), 0.5, rnd), leafMatFor(mix(pal.foliage, pal.key, 0.20))],      // the spiky trio
            [fluffCluster(7, 0.22, new THREE.Vector3(0, 0.12, 0), 0.9, rnd), leafMatFor(mix(pal.foliage, 0x000000, 0.22))]      // the low dark mat
        ];
        const at = spots(34, 2, 9, rnd).filter(p => ok(p.x, p.z));
        kits.forEach(([geo, mat], k) => {
            const sub = at.filter((_, i) => i % 3 === k);
            if (!sub.length) return;
            const im = scatterAt(geo, mat, sub, (m, p) => {
                m.position.set(p.x, 0, p.z);
                m.scale.set(
                    p.s * (0.55 + p.j * 0.7),
                    p.s * (0.5 + ((p.r * 7.3) % 1) * 0.75),
                    p.s * (0.55 + ((p.j * 13.7) % 1) * 0.7)
                );
                m.rotation.set(0, p.r * 2.3, (p.j - 0.5) * 0.3);
            });
            im.customDepthMaterial = leafDepth();
            scene.add(im);
        });
    }
}

// ==========================================================================
// Layer 2 — the RECIPE LIBRARY (hero props + architecture, _transfer.md §3)
//
// Parametric recipes in the transfer-plan mould: randomness only through the
// seeded rnd / spot jitter fields, values baked into vertices (bakeFacetValues
// / bakeGradient / vcolor), canvas textures for painted detail, a contact blob
// under every placement and a painted light pool under every light. Each
// recipe ships named variants; variant x jitter means no two instances match.
// ==========================================================================

/** Flat vertex-colour fill — one merged part, ONE hue. */
function vcolor(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color(hex);
    for (let i = 0; i < pos.count; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
}

/** Solid recipe material: baked vertex values x the hand mottle (the crafted-illustration read). */
function craftMat(): THREE.Material {
    return new THREE.MeshStandardMaterial({
        color: 0xffffff, vertexColors: true, roughness: 0.9,
        map: mottleTexture(), bumpMap: mottleTexture(), bumpScale: 0.015
    });
}

/** Grime wash: darken the baked vertex colours toward the shadow hue near the base. */
function grimeBake(geo: THREE.BufferGeometry, h: number, pal: ScenePalette) {
    const col = geo.attributes.color as THREE.BufferAttribute | undefined;
    if (!col) return;
    geo.computeBoundingBox();
    const y0 = geo.boundingBox!.min.y;
    const gc = new THREE.Color(mix(pal.fog, 0x000000, 0.5));
    const c = new THREE.Color();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const t = Math.max(0, Math.min(1, (pos.getY(i) - y0) / h));
        c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(gc, (1 - t) * 0.55);
        col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
}

/** Wonky lit-window card: warm field, mullions PAINTED ON as bent dark strokes
 *  (_objects 9). Three cached variants of hand-done wonkiness. */
const _mullionTex: THREE.CanvasTexture[] = [];
function mullionTexture(v: number): THREE.CanvasTexture {
    if (_mullionTex[v]) return _mullionTex[v];
    const W = 64, H = 84;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#fff2dc'); g.addColorStop(1, '#f0c890');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const r = mulberry32(hashStr('mullion' + v));
    ctx.strokeStyle = 'rgba(52,36,24,0.9)'; ctx.lineCap = 'round';
    ctx.lineWidth = 5 + r() * 3;
    const vx = W * (0.38 + r() * 0.24);
    ctx.beginPath(); ctx.moveTo(vx + (r() - 0.5) * 6, 2);
    ctx.quadraticCurveTo(vx + (r() - 0.5) * 14, H / 2, vx + (r() - 0.5) * 6, H - 2);
    ctx.stroke();
    const hy = H * (0.36 + r() * 0.26);
    ctx.lineWidth = 4 + r() * 3;
    ctx.beginPath(); ctx.moveTo(2, hy + (r() - 0.5) * 6);
    ctx.quadraticCurveTo(W / 2, hy + (r() - 0.5) * 12, W - 2, hy + (r() - 0.5) * 6);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,26,18,0.95)'; ctx.lineWidth = 6;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    const tex = new THREE.CanvasTexture(cv); tex.needsUpdate = true;
    _mullionTex[v] = tex; return tex;
}

/** Chunky hand-painted glyph strokes — abstract marks, never real text. Field
 *  left pale so the material tint owns the card's hue. */
const _glyphTex: THREE.CanvasTexture[] = [];
function glyphTexture(v: number): THREE.CanvasTexture {
    if (_glyphTex[v]) return _glyphTex[v];
    const W = 96, H = 64;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#f2ddba'); g.addColorStop(1, '#d8b88a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const r = mulberry32(hashStr('glyph' + v));
    ctx.strokeStyle = 'rgba(46,28,18,0.92)'; ctx.lineCap = 'round';
    const nStrokes = 2 + Math.floor(r() * 3);
    for (let i = 0; i < nStrokes; i++) {
        ctx.lineWidth = 6 + r() * 6;
        const x0 = 12 + r() * (W - 24), y0 = 14 + r() * (H - 28);
        ctx.beginPath(); ctx.moveTo(x0, y0);
        if (r() < 0.5) {
            ctx.quadraticCurveTo(x0 + (r() - 0.5) * 20, y0 + (r() - 0.5) * 12,
                x0 + (r() < 0.5 ? -1 : 1) * (10 + r() * 16), y0 + (r() - 0.5) * 10);
        } else {
            ctx.quadraticCurveTo(x0 + 8 + r() * 10, y0 - 6 + r() * 8, x0 + 3 + r() * 5, y0 + 6 + r() * 8);
        }
        ctx.stroke();
    }
    if (r() < 0.7) {
        ctx.fillStyle = 'rgba(46,28,18,0.9)';
        ctx.beginPath(); ctx.arc(14 + r() * (W - 28), 12 + r() * (H - 24), 3 + r() * 3, 0, Math.PI * 2); ctx.fill();
    }
    // worn board edge
    ctx.strokeStyle = 'rgba(60,38,22,0.8)'; ctx.lineWidth = 5;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    const tex = new THREE.CanvasTexture(cv); tex.needsUpdate = true;
    _glyphTex[v] = tex; return tex;
}

/** Flat opaque water: a radial-gradient canvas in the scene's own teal. Water
 *  in Blinx is a COLOUR, not a shader — no waves, no transparency. */
function waterTexture(pal: ScenePalette): THREE.CanvasTexture {
    const S = 128;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d')!;
    const wcol = new THREE.Color(mix(mix(pal.sky, 0x1f7a74, 0.45), pal.key, 0.10));
    const hx = (c: THREE.Color, a: number) =>
        `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.5);
    g.addColorStop(0, hx(new THREE.Color(mix(wcol.getHex(), 0xffffff, 0.22)), 1));
    g.addColorStop(0.7, hx(wcol, 1));
    g.addColorStop(1, hx(new THREE.Color(mix(wcol.getHex(), 0x000000, 0.28)), 1));
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    const tex = new THREE.CanvasTexture(cv); tex.needsUpdate = true;
    return tex;
}

/** A flat water disc lying on the ground (pond, canal reach). */
function waterDisc(scene: THREE.Scene, x: number, z: number, y: number, r: number, pal: ScenePalette) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ map: waterTexture(pal), fog: true }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, y, z);
    water.userData.isWater = true;
    scene.add(mark(water));
}

/** RECIPE streetLamp (_objects 5): a thin tapered pole bent in ONE long S —
 *  grown, not kinked — verdigris iron, a teacup lantern at the tip, a halo
 *  4-5x the fixture that swallows the stem top, its own painted pool beneath.
 *  Variants: 0 tall-lean, 1 short-bow, 2 double-arm. Tell: never straight. */
function streetLamp(scene: THREE.Scene, at: Spot[], pal: ScenePalette, rnd: () => number, variant: number) {
    const H = variant === 1 ? 2.5 : variant === 0 ? 3.9 : 3.2;
    const amp = variant === 1 ? 0.50 : 0.34;
    // ONE S-curve shared by pole geometry and head placement: a slow overhang
    // with a wobble mid-shaft — you can count the chords of the curve.
    const sOff = (t: number) => amp * (1.15 * t * t + Math.sin(t * Math.PI * 2) * 0.28);
    const zOff = (t: number) => Math.sin(t * Math.PI) * amp * 0.2;
    const poleGeo = new THREE.CylinderGeometry(0.032, 0.075, H, 6, 9);
    {
        const pos = poleGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const t = (pos.getY(i) + H / 2) / H;
            pos.setX(i, pos.getX(i) + sOff(t));
            pos.setZ(i, pos.getZ(i) + zOff(t));
        }
        poleGeo.translate(0, H / 2, 0);
        poleGeo.computeVertexNormals();
    }
    // Verdigris iron: murky green-grey, paler up top where it catches its own
    // lantern light.
    const verdi = mix(pal.structure, 0x4a7a66, 0.42);
    bakeGradient(poleGeo, mix(verdi, 0x000000, 0.38), mix(verdi, pal.key, 0.30), rnd);
    scene.add(scatterAt(poleGeo, paintMat(), at, (m, p) => {
        m.position.set(p.x, 0, p.z);
        m.scale.setScalar(0.9 + p.j * 0.35);
        m.rotation.y = p.r;
    }));
    const warm = pal.emissiveOn ? pal.emissive : 0xffc36a;
    // Head positions: cage + ember ride the pole's own scale and lean. The
    // double-arm carries a second, smaller lantern on a counter-arm.
    const heads: Spot[] = [];
    for (const p of at) {
        heads.push(p);
        if (variant === 2) heads.push({ ...p, j: (p.j + 0.5) % 1 });
    }
    const armOf = (p: Spot, alt: boolean) => {
        const k = 0.9 + p.j * 0.35;
        const tx = (alt ? -sOff(1) * 0.72 : sOff(1)) * k;
        const ty = (alt ? H * 0.86 : H) * k;
        const c = Math.cos(p.r), s = Math.sin(p.r);
        return { x: p.x + tx * c, y: ty, z: p.z - tx * s };
    };
    const cageGeo = vcolor(new THREE.BoxGeometry(0.16, 0.20, 0.16), mix(verdi, 0x000000, 0.55));
    scene.add(scatterAt(cageGeo, craftMat(), heads, (m, p, i) => {
        const t = armOf(p, variant === 2 && i % 2 === 1);
        m.position.set(t.x, t.y, t.z);
        m.scale.setScalar(0.9 + p.j * 0.35);
    }));
    const emberMat = new THREE.MeshStandardMaterial({ color: mix(warm, 0xffffff, 0.4), emissive: warm, emissiveIntensity: 2.0, roughness: 0.4 });
    const embers = scatterAt(new THREE.SphereGeometry(0.085, 8, 6), emberMat, heads, (m, p, i) => {
        const t = armOf(p, variant === 2 && i % 2 === 1);
        m.position.set(t.x, t.y, t.z);
        m.scale.setScalar(0.9 + p.j * 0.35);
    });
    embers.castShadow = false;
    scene.add(embers);
    // The halo: 4-5x the fixture, feathering to zero, eating the stem top.
    const hpos = new Float32Array(heads.length * 3);
    heads.forEach((p, i) => {
        const t = armOf(p, variant === 2 && i % 2 === 1);
        hpos[i * 3] = t.x; hpos[i * 3 + 1] = t.y; hpos[i * 3 + 2] = t.z;
    });
    const hgeo = new THREE.BufferGeometry();
    hgeo.setAttribute('position', new THREE.BufferAttribute(hpos, 3));
    const halos = new THREE.Points(hgeo, new THREE.PointsMaterial({
        map: softSprite(), color: warm, size: 1.9, sizeAttenuation: true,
        transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    scene.add(mark(halos));
    for (const p of at) lightPool(scene, p.x, p.z, 2.6, warm, 0.5);
    contactBlobs(scene, at, pal, () => 0.55, 0.3);
}

/** RECIPE fountain (_objects 17): octagonal basin on octagonal plinth, palest
 *  coping rim over a darker body, a FLAT opaque water disc, a pedestal bowl
 *  with pickups in it. Variants: 0 single-tier, 1 two-tier, 2 dry/mossy. */
function fountain(scene: THREE.Scene, x: number, z: number, pal: ScenePalette, rnd: () => number, variant: number) {
    const pale = mix(pal.structure, 0xffffff, 0.55);    // the coping rule
    const body = mix(pal.structure, 0x000000, 0.28);
    const parts: THREE.BufferGeometry[] = [];
    const put = (g: THREE.BufferGeometry, col: number, y: number) => {
        bakeFacetValues(g, pal, { base: col, rnd });
        g.translate(0, y, 0);
        parts.push(g);
    };
    put(new THREE.CylinderGeometry(2.35, 2.55, 0.34, 8), pale, 0.17);
    put(new THREE.CylinderGeometry(1.85, 2.05, 0.70, 8), body, 0.66);
    put(new THREE.CylinderGeometry(2.06, 2.06, 0.15, 8), pale, 1.02);
    put(new THREE.CylinderGeometry(0.30, 0.48, 0.85, 8), body, 1.35);
    put(new THREE.CylinderGeometry(0.85, 0.52, 0.38, 8), pale, 1.95);
    if (variant === 1) {
        put(new THREE.CylinderGeometry(0.24, 0.30, 0.55, 8), body, 2.45);
        put(new THREE.CylinderGeometry(1.05, 0.85, 0.30, 8), pale, 2.85);
        put(new THREE.CylinderGeometry(1.12, 1.12, 0.10, 8), pale, 3.02);
    }
    const stone = new THREE.Mesh(mergeGeometries(parts)!, craftMat());
    stone.position.set(x, 0, z);
    stone.rotation.y = rnd() * Math.PI;
    stone.castShadow = true;
    scene.add(mark(stone));
    if (variant !== 2) {
        // Water: flat, opaque, one clean ellipse inside the rim.
        const water = new THREE.Mesh(new THREE.CircleGeometry(1.82, 8), new THREE.MeshBasicMaterial({ map: waterTexture(pal), fog: true }));
        water.rotation.x = -Math.PI / 2;
        water.rotation.z = stone.rotation.y + Math.PI / 8;
        water.position.set(x, 1.035, z);
        scene.add(mark(water));
        if (variant === 1) {
            const upper = new THREE.Mesh(new THREE.CircleGeometry(0.92, 8), new THREE.MeshBasicMaterial({ map: waterTexture(pal), fog: true }));
            upper.rotation.x = -Math.PI / 2;
            upper.rotation.z = water.rotation.z;
            upper.position.set(x, 2.985, z);
            scene.add(mark(upper));
        }
    } else {
        // Dry and mossy: the basin floor carries a dark moss wash.
        const moss = new THREE.Mesh(new THREE.CircleGeometry(1.6, 8),
            new THREE.MeshBasicMaterial({ color: mix(pal.foliage, 0x000000, 0.45), fog: true }));
        moss.rotation.x = -Math.PI / 2;
        moss.position.set(x, 1.03, z);
        scene.add(mark(moss));
    }
    // Pickups in the bowl — dressing with a function.
    const gemCol = pal.emissiveOn ? pal.emissive : 0xffd98a;
    const gemMat = new THREE.MeshStandardMaterial({ color: mix(gemCol, 0xffffff, 0.3), emissive: gemCol, emissiveIntensity: 1.6, roughness: 0.4 });
    const gemSpots: Spot[] = [];
    for (let i = 0; i < 3; i++) {
        const a = rnd() * Math.PI * 2, rr = 0.3 + rnd() * 0.35;
        gemSpots.push({ x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr, s: 1, r: rnd() * Math.PI, j: rnd() });
    }
    const gems = scatterAt(new THREE.OctahedronGeometry(0.09, 0), gemMat, gemSpots, (m, p) => {
        m.position.set(p.x, 2.16, p.z);
        m.rotation.set(p.j, p.r, p.j * 0.5);
    });
    gems.castShadow = false;
    scene.add(gems);
    contactBlobs(scene, [{ x, z, s: 1, r: 0, j: 0.5 }], pal, () => 3.0, 0.32);
    if (pal.starAmount > 0.5 || pal.emissiveOn) lightPool(scene, x, z, 3.4, pal.emissiveOn ? pal.emissive : 0xffc36a, 0.4);
}

/** RECIPE statue (_objects 8): ONE eroded carved mass on fractured base slabs
 *  (the slabs are the anti-float skirt), moss wash on up-facing planes only,
 *  recess shade painted darker than nature. Variants: 0 reclining,
 *  1 standing-robed, 2 fragment. */
function statue(scene: THREE.Scene, x: number, z: number, ry: number, pal: ScenePalette, rnd: () => number, variant: number) {
    const group = new THREE.Group();
    const warmGrey = mix(pal.structure, 0x9a8f80, 0.45);
    const moss = mix(pal.foliage, pal.ground, 0.30);
    const recess = mix(pal.fog, 0x000000, 0.72);
    const nSlab = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < nSlab; i++) {
        const slab = bakeFacetValues(new THREE.BoxGeometry(1.35 - i * 0.2, 0.26, 1.05 - i * 0.15), pal, { base: mix(warmGrey, 0x000000, 0.12), rnd });
        jitterGeometry(slab, 0.05, rnd);
        const m = new THREE.Mesh(slab, craftMat());
        m.position.set((i - (nSlab - 1) / 2) * 0.85 + (rnd() - 0.5) * 0.2, 0.13 - i * 0.015, (rnd() - 0.5) * 0.4);
        m.rotation.y = (rnd() - 0.5) * 0.5;
        group.add(m);
    }
    const figs: THREE.BufferGeometry[] = [];
    if (variant === 0) {
        const torso = new THREE.SphereGeometry(1, 10, 8); torso.scale(1.55, 0.62, 0.72); torso.translate(0, 0.62, 0);
        const head = new THREE.SphereGeometry(0.36, 8, 7); head.translate(1.25, 0.85, 0.08);
        const knee = new THREE.SphereGeometry(0.42, 8, 6); knee.translate(-0.35, 0.9, 0.12);
        figs.push(torso, head, knee);
    } else if (variant === 1) {
        const robe = seussify(new THREE.CylinderGeometry(0.34, 0.85, 2.4, 9, 4), 0.10, 0.10, 0.05, rnd); robe.translate(0, 1.45, 0);
        const head = new THREE.SphereGeometry(0.30, 8, 7); head.translate(0.1, 2.9, 0);
        const shoulder = new THREE.SphereGeometry(0.42, 8, 6); shoulder.scale(1.3, 0.6, 0.9); shoulder.translate(0, 2.35, 0);
        figs.push(robe, head, shoulder);
    } else {
        const torso = new THREE.CylinderGeometry(0.48, 0.7, 1.2, 8, 2); torso.rotateZ(0.16); torso.translate(0, 0.75, 0);
        const stump = new THREE.SphereGeometry(0.4, 7, 6); stump.translate(0.3, 1.35, 0.1);
        figs.push(torso, stump);
    }
    const fig = mergeGeometries(figs)!;
    jitterGeometry(fig, 0.05, rnd);   // erosion: the soft lumpy outline
    bakeFacetValues(fig, pal, { base: warmGrey, cap: mix(moss, warmGrey, 0.25), dark: recess, jitter: 0.06, rnd });
    const fm = new THREE.Mesh(fig, craftMat());
    fm.castShadow = true;
    group.add(fm);
    group.position.set(x, 0, z);
    group.rotation.y = ry;
    scene.add(mark(group));
    contactBlobs(scene, [{ x, z, s: 1, r: 0, j: 0.5 }], pal, () => 2.0, 0.32);
}

/** RECIPE planter (_objects 7): a worn stone trough — pale rim, stained body,
 *  near-black soil — with ~9 cup-flowers in two loose rows, per-flower lean
 *  jitter, flame-tipped hues from the palette accent. Variants: 0 trough,
 *  1 round pot, 2 raised bed. */
function planter(scene: THREE.Scene, at: Spot[], pal: ScenePalette, rnd: () => number, variant: number) {
    const pale = mix(pal.structure, 0xffffff, 0.42);
    const bodyCol = mix(pal.structure, 0x000000, 0.14);
    const soil = 0x161009;
    const parts: THREE.BufferGeometry[] = [];
    if (variant === 1) {
        parts.push(vcolor(new THREE.CylinderGeometry(0.40, 0.32, 0.58, 9).translate(0, 0.29, 0), bodyCol));
        parts.push(vcolor(new THREE.CylinderGeometry(0.46, 0.44, 0.13, 9).translate(0, 0.55, 0), pale));
        parts.push(vcolor(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 9).translate(0, 0.60, 0), soil));
    } else if (variant === 2) {
        parts.push(vcolor(new THREE.BoxGeometry(2.5, 0.42, 1.05).translate(0, 0.21, 0), bodyCol));
        parts.push(vcolor(new THREE.BoxGeometry(2.62, 0.10, 1.15).translate(0, 0.42, 0), pale));
        parts.push(vcolor(new THREE.BoxGeometry(2.3, 0.08, 0.85).translate(0, 0.46, 0), soil));
    } else {
        parts.push(vcolor(new THREE.BoxGeometry(1.7, 0.55, 0.60).translate(0, 0.28, 0), bodyCol));
        parts.push(vcolor(new THREE.BoxGeometry(1.84, 0.14, 0.72).translate(0, 0.56, 0), pale));
        parts.push(vcolor(new THREE.BoxGeometry(1.56, 0.09, 0.48).translate(0, 0.62, 0), soil));
    }
    const geo = mergeGeometries(parts)!;
    scene.add(scatterAt(geo, craftMat(), at, (m, p) => {
        m.position.set(p.x, 0, p.z);
        m.rotation.y = p.r;
        m.scale.setScalar(0.9 + p.j * 0.3);
    }));
    // The unrehearsed choir: two loose rows of cup-flowers, every stem leaning
    // its own way. Cups ride the SAME spot list as their stems (the floating-
    // canopy lesson).
    const len = variant === 2 ? 2.2 : variant === 1 ? 0.5 : 1.45;
    const wid = variant === 2 ? 0.55 : variant === 1 ? 0.4 : 0.3;
    const soilY = variant === 2 ? 0.50 : variant === 1 ? 0.64 : 0.66;
    const stemGeo = vcolor(new THREE.CylinderGeometry(0.014, 0.02, 0.34, 5).translate(0, 0.17, 0), mix(pal.foliage, 0x000000, 0.35));
    // The colorway is chosen PER SCENE from the palette family — no two
    // scenes grow the same garden (the flower-pot complaint: one recipe is
    // fine, one LOOK everywhere is not).
    const ways: [number, number, number][] = [
        [mix(0xff5a1e, pal.key, 0.25), 0xffd94a, 0xff7a2a],
        [mix(pal.key, 0xffffff, 0.30), mix(pal.emissiveOn ? pal.emissive : 0xffc36a, 0xffffff, 0.25), mix(pal.key, 0xffffff, 0.15)],
        [mix(0xff4a7a, pal.key, 0.30), 0xfff0f4, 0xff4a7a]
    ];
    const way = ways[Math.floor(rnd() * 3)];
    const cupGeo = mergeGeometries([
        vcolor(new THREE.ConeGeometry(0.075, 0.15, 6).translate(0, 0.40, 0), way[0]),
        vcolor(new THREE.SphereGeometry(0.045, 6, 5).translate(0, 0.48, 0), way[1])
    ])!;
    const stemMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const cupMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: way[2], emissiveIntensity: 0.35 });
    const stems: Spot[] = [];
    for (const p of at) {
        const k = 0.9 + p.j * 0.3;
        const nF = 8 + Math.floor(p.j * 3);
        for (let i = 0; i < nF; i++) {
            const row = i % 2 === 0 ? -1 : 1;
            const lx = ((i / nF) - 0.5) * len + (rnd() - 0.5) * 0.12;
            const lz = row * wid * 0.5 + (rnd() - 0.5) * 0.1;
            stems.push({
                x: p.x + (lx * Math.cos(p.r) + lz * Math.sin(p.r)) * k,
                z: p.z + (-lx * Math.sin(p.r) + lz * Math.cos(p.r)) * k,
                s: 0.8 + rnd() * 0.5, r: rnd() * Math.PI, j: rnd()
            });
        }
    }
    scene.add(scatterAt(stemGeo, stemMat, stems, (m, p) => {
        m.position.set(p.x, soilY * (0.9 + p.j * 0.2), p.z);
        m.rotation.set((p.j - 0.5) * 0.5, p.r, (p.j - 0.5) * 0.6);
        m.scale.setScalar(p.s);
    }));
    scene.add(scatterAt(cupGeo, cupMat, stems, (m, p) => {
        m.position.set(p.x + (p.j - 0.5) * 0.15, soilY * (0.9 + p.j * 0.2), p.z + (p.j - 0.5) * 0.18);
        m.rotation.set((p.j - 0.5) * 0.5, p.r, (p.j - 0.5) * 0.6);
        m.scale.setScalar(p.s);
    }));
    contactBlobs(scene, at, pal, () => 1.0, 0.28);
}

/** A wall that carries a cluster of window cards. */
type CardWall = { x: number; y: number; z: number; ry: number; lean: number; n: number; s: number };

/** RECIPE windowCards (_objects 9): crooked glowing parallelograms stuck on
 *  walls in sociable clusters of 2-5, mullions painted ON the card, every card
 *  sharing its host's lean, never grid-aligned. Three mullion-wonk variants. */
function windowCards(scene: THREE.Scene, walls: CardWall[], pal: ScenePalette, rnd: () => number) {
    const warm = mix(0xffd98a, pal.emissiveOn ? pal.emissive : 0xffd98a, pal.emissiveOn ? 0.35 : 0);
    const lists: { spots: Spot[]; y: number[]; lean: number[]; ry: number[] }[] = [
        { spots: [], y: [], lean: [], ry: [] },
        { spots: [], y: [], lean: [], ry: [] },
        { spots: [], y: [], lean: [], ry: [] }
    ];
    for (const w of walls) {
        const L = lists[Math.floor(rnd() * 3)];
        const n = Math.max(2, Math.min(5, w.n));
        // cards sit slightly PROUD of their wall, along its normal
        const bx = w.x + Math.sin(w.ry) * 0.07, bz = w.z + Math.cos(w.ry) * 0.07;
        for (let i = 0; i < n; i++) {
            const ox = (rnd() - 0.5) * 1.9 * w.s;
            const oy = (rnd() - 0.5) * 1.3 * w.s;
            L.spots.push({
                x: bx + ox * Math.cos(w.ry), z: bz - ox * Math.sin(w.ry),
                s: (0.75 + rnd() * 0.55) * w.s, r: 0, j: rnd()
            });
            L.y.push(w.y + oy);
            L.lean.push(w.lean + (rnd() - 0.5) * 0.22);
            L.ry.push(w.ry);
        }
    }
    const geo = new THREE.PlaneGeometry(0.5, 0.68);
    lists.forEach((L, v) => {
        if (!L.spots.length) return;
        const mat = new THREE.MeshBasicMaterial({ map: mullionTexture(v), color: warm, fog: true, side: THREE.DoubleSide });
        const im = scatterAt(geo, mat, L.spots, (m, p, i) => {
            m.position.set(p.x, L.y[i], p.z);
            m.rotation.set(0, L.ry[i], L.lean[i]);
            m.scale.set(p.s * (0.85 + p.j * 0.4), p.s, 1);
        });
        im.castShadow = false; im.receiveShadow = false;
        scene.add(im);
    });
}

/** RECIPE archHouse (_objects 10): a small cottage settling like a tired
 *  animal — ONE shared lean for walls, roof and door; a sagging roofline; an
 *  off-center curtain door; crooked window cards; grime at the base.
 *  Variants: 0 tall-narrow, 1 wide-sag, 2 L-lean. */
function archHouse(scene: THREE.Scene, x: number, z: number, ry: number, pal: ScenePalette, rnd: () => number, variant: number) {
    const g = new THREE.Group();
    const lean = (variant === 2 ? 0.20 : variant === 0 ? 0.10 : 0.15) * (rnd() < 0.5 ? -1 : 1);
    const W = variant === 1 ? 3.1 : 2.4, H = variant === 0 ? 3.1 : 2.3, D = variant === 1 ? 2.5 : 2.2;
    const olive = mix(pal.structure, pal.ground, 0.30);
    const bodyGeo = seussify(new THREE.BoxGeometry(W, H, D, 2, 4, 2), 0.14, 0.10, 0.07, rnd);
    bakeFacetValues(bodyGeo, pal, { base: olive, cap: mix(olive, pal.key, 0.22), jitter: 0.13, rnd });
    grimeBake(bodyGeo, 0.65, pal);
    const body = new THREE.Mesh(bodyGeo, craftMat());
    body.position.y = H / 2 - 0.12;   // pressed INTO the dirt over centuries
    body.castShadow = true;
    g.add(body);
    // The sagging roofline: one spine-dip across the middle.
    const sag = variant === 1 ? 0.34 : 0.22;
    const roofGeo = new THREE.BoxGeometry(W * 1.16, 0.55, D * 1.18, 6, 1, 2);
    {
        const pos = roofGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const px = pos.getX(i) / (W * 1.16 / 2);
            pos.setY(i, pos.getY(i) - sag * Math.max(0, 1 - px * px));
        }
        roofGeo.computeVertexNormals();
    }
    bakeFacetValues(roofGeo, pal, { base: mix(olive, 0x000000, 0.30), jitter: 0.10, rnd });
    const roof = new THREE.Mesh(roofGeo, craftMat());
    roof.position.y = H + 0.08;
    roof.rotation.z = (rnd() - 0.5) * 0.06;
    g.add(roof);
    // The door is a CURTAIN, off-center, exhaling slightly.
    const doorGeo = new THREE.PlaneGeometry(0.66, 1.25, 3, 3);
    {
        const pos = doorGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getY(i) / 1.25 + 0.5) * Math.PI) * 0.07);
        doorGeo.computeVertexNormals();
    }
    const door = new THREE.Mesh(doorGeo, new THREE.MeshStandardMaterial({
        color: mix(0x8a2a30, pal.key, 0.15), roughness: 0.9, side: THREE.DoubleSide
    }));
    door.position.set(W * 0.18, 1.1, D / 2 + 0.03);
    g.add(door);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    g.rotation.z = lean;   // ONE lean — walls, roof and door all agree
    scene.add(mark(g));
    // Crooked window cards on the front wall, sharing the house's lean.
    windowCards(scene, [{
        x: x + Math.sin(ry) * (D / 2 + 0.06) - Math.cos(ry) * W * 0.22,
        y: 1.55,
        z: z + Math.cos(ry) * (D / 2 + 0.06) + Math.sin(ry) * W * 0.22,
        ry, lean, n: 2 + Math.floor(rnd() * 3), s: 0.95
    }], pal, rnd);
    contactBlobs(scene, [{ x, z, s: 1, r: 0, j: 0.5 }], pal, () => Math.max(W, D) * 0.85, 0.34);
    if (pal.starAmount > 0.5) {
        lightPool(scene, x + Math.sin(ry) * (D / 2 + 0.7), z + Math.cos(ry) * (D / 2 + 0.7), 1.8, 0xffc36a, 0.4);
    }
}

/** RECIPE gateArch: the dressed threshold (law D5) — two flanking masses + a
 *  lintel or arch, the dark mouth gradient inside, biome dressing (icicles /
 *  banner / glyph). It must FRAME a view through it. Variants: stone-arch,
 *  timber-gate, glyph-door. */
function gateArch(scene: THREE.Scene, x: number, z: number, ry: number, pal: ScenePalette, rnd: () => number, variant: 'stone' | 'timber' | 'glyph', biome: string) {
    const g = new THREE.Group();
    const dark = mix(mix(pal.structure, pal.ground, 0.25), mix(pal.fog, 0x000000, 0.5), 0.4);
    const warm = pal.emissiveOn ? pal.emissive : 0xffc36a;
    if (variant === 'timber') {
        const postGeo = bakeGradient(makeTrunkGeo(4.4, 0.30, rnd), mix(pal.structure, 0x000000, 0.3), mix(pal.structure, pal.key, 0.2), rnd);
        for (const s of [-1, 1]) {
            const post = new THREE.Mesh(postGeo, paintMat());
            post.position.set(s * 2.4, 0, 0);
            post.rotation.z = -s * (0.04 + rnd() * 0.05);
            g.add(post);
        }
        const beamGeo = new THREE.BoxGeometry(5.6, 0.5, 0.62, 6, 1, 1);
        {
            const pos = beamGeo.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const px = pos.getX(i) / 2.8;
                pos.setY(i, pos.getY(i) - 0.22 * Math.max(0, 1 - px * px));
            }
            beamGeo.computeVertexNormals();
        }
        bakeFacetValues(beamGeo, pal, { base: mix(pal.structure, 0x000000, 0.22), rnd });
        const beam = new THREE.Mesh(beamGeo, craftMat());
        beam.position.y = 4.3;
        g.add(beam);
        // Dressing: a small banner under the beam.
        const bannerGeo = new THREE.PlaneGeometry(1.1, 0.75, 3, 2);
        {
            const pos = bannerGeo.attributes.position;
            for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / 1.1 + 0.5) * Math.PI) * 0.08);
            bannerGeo.computeVertexNormals();
        }
        const banner = new THREE.Mesh(bannerGeo, new THREE.MeshStandardMaterial({
            color: mix(pal.key, pal.foliage, 0.3), roughness: 0.9, side: THREE.DoubleSide
        }));
        banner.position.set((rnd() - 0.5) * 1.6, 3.75, 0.05);
        banner.rotation.z = (rnd() - 0.5) * 0.1;
        g.add(banner);
    } else {
        const pierGeo = seussify(new THREE.BoxGeometry(1.15, 4.6, 1.15, 1, 4, 1), 0.16, 0.08, 0.06, rnd);
        bakeFacetValues(pierGeo, pal, { base: dark, cap: mix(dark, pal.key, 0.25), jitter: 0.10, rnd });
        for (const s of [-1, 1]) {
            const pier = new THREE.Mesh(pierGeo, craftMat());
            pier.position.set(s * 2.35, 2.0, 0);
            pier.rotation.y = rnd();
            g.add(pier);
        }
        if (variant === 'stone') {
            const archGeo = new THREE.TorusGeometry(2.35, 0.48, 6, 12, Math.PI);
            bakeFacetValues(archGeo, pal, { base: dark, cap: mix(dark, pal.key, 0.28), jitter: 0.09, rnd });
            const arch = new THREE.Mesh(archGeo, craftMat());
            arch.position.y = 4.1;
            g.add(arch);
        } else {
            const lintelGeo = new THREE.BoxGeometry(5.9, 0.7, 1.3, 4, 1, 1);
            bakeFacetValues(lintelGeo, pal, { base: dark, cap: mix(dark, pal.key, 0.25), jitter: 0.09, rnd });
            const lintel = new THREE.Mesh(lintelGeo, craftMat());
            lintel.position.y = 4.5;
            g.add(lintel);
            // The glyph door: glowing marks painted across the lintel.
            const glyph = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55),
                new THREE.MeshBasicMaterial({ map: glyphTexture(Math.floor(rnd() * 3)), color: mix(warm, 0xffffff, 0.2), fog: true }));
            glyph.position.set(0, 4.5, 0.68);
            g.add(glyph);
        }
        // Icicle dressing where the world is cold or deep-wet.
        if (biome === 'arctic' || biome === 'underground' || biome === 'mountain') {
            const icGeo = bakeFacetValues(new THREE.ConeGeometry(0.09, 0.8, 5), pal, { base: mix(pal.foliage, 0xffffff, 0.3), rnd });
            const icSpots: Spot[] = [];
            for (let i = 0; i < 5; i++) icSpots.push({ x: (rnd() - 0.5) * 4, z: 0, s: 0.6 + rnd() * 0.8, r: 0, j: rnd() });
            const ic = scatterAt(icGeo, paintMat(), icSpots, (m, p) => {
                m.position.set(p.x, 4.15 - 0.4 * p.s, p.z);
                m.rotation.z = Math.PI;
                m.scale.setScalar(p.s);
            });
            g.add(ic);
        }
    }
    // The mouth: a dark gradient INSIDE the frame — a place to go, previewed.
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(2.0, 20),
        new THREE.MeshBasicMaterial({ map: mouthTexture(pal), transparent: true, depthWrite: false, fog: false }));
    mouth.position.y = 1.95;
    g.add(mouth);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    scene.add(mark(g));
    contactBlobs(scene, [
        { x: x + Math.cos(ry) * 2.35, z: z - Math.sin(ry) * 2.35, s: 1, r: 0, j: 0.5 },
        { x: x - Math.cos(ry) * 2.35, z: z + Math.sin(ry) * 2.35, s: 1, r: 0, j: 0.5 }
    ], pal, () => 1.5, 0.32);
}

/** RECIPE bridge: an arched span with chunky parapet caps in the palest value
 *  (the coping rule), end piers buried into the banks. Variants: 0 single-arch,
 *  1 flat-span, 2 humpback. */
function bridge(scene: THREE.Scene, x: number, z: number, ry: number, pal: ScenePalette, rnd: () => number, variant: number) {
    const g = new THREE.Group();
    const span = variant === 2 ? 4.8 : 6.2;
    const rise = variant === 1 ? 0.06 : variant === 2 ? 0.9 : 0.55;
    const arch = (lx: number) => rise * Math.max(0, 1 - (lx / (span / 2)) * (lx / (span / 2)));
    const deckGeo = new THREE.BoxGeometry(span, 0.38, 2.1, 8, 1, 1);
    {
        const pos = deckGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + arch(pos.getX(i)));
        deckGeo.computeVertexNormals();
    }
    bakeFacetValues(deckGeo, pal, { base: mix(pal.structure, 0x000000, 0.18), cap: mix(pal.structure, 0xffffff, 0.3), jitter: 0.09, rnd });
    const deck = new THREE.Mesh(deckGeo, craftMat());
    deck.position.y = 0.72;
    deck.castShadow = true;
    g.add(deck);
    const pierGeo = bakeFacetValues(new THREE.BoxGeometry(1.1, 1.7, 2.3), pal, { base: mix(pal.structure, 0x000000, 0.25), rnd });
    for (const s of [-1, 1]) {
        const pier = new THREE.Mesh(pierGeo, craftMat());
        pier.position.set(s * (span / 2 - 0.3), 0.15, 0);
        g.add(pier);
    }
    // Parapet caps: pale, chunky, no two alike.
    const capGeo = bakeFacetValues(new THREE.BoxGeometry(0.55, 0.26, 0.30), pal, { base: mix(pal.structure, 0xffffff, 0.5), jitter: 0.12, rnd });
    const capSpots: Spot[] = [];
    const nC = Math.floor(span / 0.62);
    for (let i = 0; i < nC; i++) {
        const lx = -span / 2 + 0.4 + i * 0.62;
        for (const s of [-1, 1]) capSpots.push({ x: lx, z: s * 0.92, s: 0.9 + rnd() * 0.25, r: 0, j: rnd() });
    }
    const caps = scatterAt(capGeo, paintMat(), capSpots, (m, p) => {
        m.position.set(p.x, 1.04 + arch(p.x), p.z);
        m.scale.setScalar(p.s);
        m.rotation.y = (p.j - 0.5) * 0.1;
    });
    g.add(caps);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    scene.add(mark(g));
    contactBlobs(scene, [
        { x: x + Math.cos(ry) * (span / 2 - 0.3), z: z - Math.sin(ry) * (span / 2 - 0.3), s: 1, r: 0, j: 0.5 },
        { x: x - Math.cos(ry) * (span / 2 - 0.3), z: z + Math.sin(ry) * (span / 2 - 0.3), s: 1, r: 0, j: 0.5 }
    ], pal, () => 1.6, 0.3);
}

/** RECIPE stairRun: 4-8 chunky steps — pale treads, dark risers (the pillow
 *  rule at stair scale — the orientation bake does it), worn centers.
 *  Variants: 0 straight, 1 L-turn, 2 grand. */
function stairRun(scene: THREE.Scene, x: number, z: number, ry: number, pal: ScenePalette, rnd: () => number, variant: number) {
    const steps: THREE.BufferGeometry[] = [];
    const n = variant === 2 ? 7 : 4 + Math.floor(rnd() * 4);
    const w = variant === 2 ? 3.4 : 1.7 + rnd() * 0.5;
    for (let i = 0; i < n; i++) {
        const st = new THREE.BoxGeometry(w * (0.96 + rnd() * 0.08), 0.24, 0.66);
        st.translate((rnd() - 0.5) * 0.05, 0.12 + i * 0.24, -i * 0.62);
        steps.push(st);
    }
    if (variant === 1) {
        // the L: a short second flight turning off the top step
        for (let i = 0; i < 3; i++) {
            const st = new THREE.BoxGeometry(w * 0.95, 0.24, 0.66);
            st.rotateY(Math.PI / 2);
            st.translate(0.5 + i * 0.62, 0.12 + (n - 1) * 0.24 + i * 0.24, -(n - 1) * 0.62);
            steps.push(st);
        }
    }
    const geo = mergeGeometries(steps)!;
    bakeFacetValues(geo, pal, {
        base: mix(pal.structure, 0x000000, 0.10), cap: mix(pal.structure, 0xffffff, 0.38),
        dark: mix(pal.fog, 0x000000, 0.6), jitter: 0.08, rnd
    });
    const m = new THREE.Mesh(geo, craftMat());
    m.position.set(x, 0, z);
    m.rotation.y = ry;
    m.castShadow = true;
    scene.add(mark(m));
    contactBlobs(scene, [{ x, z, s: 1, r: 0, j: 0.5 }], pal, () => 1.3, 0.3);
}

/** RECIPE canalCoping (_objects 16): pale overhanging cap slabs with the dark
 *  under-seam — the three-step value ladder at every water edge. Per-slab
 *  value jitter. Variants: 0 straight, 1 curved, 2 stepped-down. */
function canalCoping(scene: THREE.Scene, edge: { x: number; z: number; ry: number }[], pal: ScenePalette, rnd: () => number, variant: number) {
    const tints = [mix(pal.structure, 0xffffff, 0.52), mix(pal.structure, 0xffffff, 0.38)];
    const seam = mix(pal.fog, 0x000000, 0.72);
    tints.forEach((col, gi) => {
        const sub = edge.filter((_, i) => i % 2 === gi);
        if (!sub.length) return;
        const g = mergeGeometries([
            vcolor(new THREE.BoxGeometry(0.98, 0.16, 0.62).translate(0, 0.10, 0), col),
            vcolor(new THREE.BoxGeometry(0.92, 0.12, 0.52).translate(0, -0.03, 0), seam)
        ])!;
        jitterGeometry(g, 0.03, rnd);
        const im = scatterAt(g, craftMat(), sub.map(e => ({ x: e.x, z: e.z, s: 0.95 + rnd() * 0.2, r: e.ry, j: rnd() })), (m, p, i) => {
            m.position.set(p.x, variant === 2 ? 0.22 - i * 0.07 : 0.22, p.z);
            m.rotation.y = p.r;
            m.scale.setScalar(p.s);
        });
        scene.add(im);
    });
}

/** RECIPE bench: two slab supports + a seat slab, the worn pale top, contact
 *  dabs beneath. Variants: 0 stone, 1 timber, 2 broken. */
function bench(scene: THREE.Scene, at: Spot[], pal: ScenePalette, rnd: () => number, variant: number) {
    const stone = variant !== 1;
    const seatCol = stone ? mix(pal.structure, 0xffffff, 0.34) : mix(pal.structure, pal.key, 0.25);
    const legCol = stone ? mix(pal.structure, 0x000000, 0.2) : mix(pal.structure, 0x000000, 0.35);
    const geo = mergeGeometries([
        vcolor(new THREE.BoxGeometry(0.3, 0.44, 0.52).translate(-0.6, 0.22, 0), legCol),
        vcolor(new THREE.BoxGeometry(0.3, 0.44, 0.52).translate(0.6, 0.22, 0), legCol),
        vcolor(new THREE.BoxGeometry(1.65, 0.13, 0.58).translate(0, 0.50, 0), seatCol)
    ])!;
    jitterGeometry(geo, 0.02, rnd);
    scene.add(scatterAt(geo, craftMat(), at, (m, p) => {
        m.position.set(p.x, 0, p.z);
        m.rotation.y = p.r;
        if (variant === 2) m.rotation.z = 0.07 + p.j * 0.06;   // settled crooked
        m.scale.setScalar(0.9 + p.j * 0.3);
    }));
    contactBlobs(scene, at, pal, () => 0.85, 0.3);
}

/** RECIPE signCard (_objects 11 dressing): a warped board with chunky painted
 *  glyph strokes, on a bent post or hung from a bracket, or mounted to a wall.
 *  Slight bloom in emissive biomes. Variants: 0 post, 1 hanging, 2 wall. */
function signCard(scene: THREE.Scene, at: Spot[], pal: ScenePalette, rnd: () => number, variant: number) {
    const cardCol = mix(0xd88a3a, pal.key, 0.25);
    const cardGeo = new THREE.PlaneGeometry(0.85, 0.55, 3, 2);
    jitterGeometry(cardGeo, 0.05, rnd);
    for (let v = 0; v < 3; v++) {
        const sub = at.filter((_, i) => i % 3 === v);
        if (!sub.length) continue;
        const mat = new THREE.MeshBasicMaterial({ map: glyphTexture(v), color: mix(cardCol, 0xffffff, 0.4), fog: true, side: THREE.DoubleSide });
        const cards = scatterAt(cardGeo, mat, sub, (m, p) => {
            const y = variant === 2 ? 1.5 + p.j * 0.9 : variant === 1 ? 1.5 : 1.62;
            const off = variant === 1 ? 0.5 : 0;
            m.position.set(p.x + Math.sin(p.r) * off, y, p.z + Math.cos(p.r) * off);
            m.rotation.set(0, p.r, (p.j - 0.5) * 0.16);
            m.scale.setScalar(0.9 + p.j * 0.35);
        });
        cards.castShadow = false;
        scene.add(cards);
    }
    if (variant !== 2) {
        // The bent dark post; the hanging variant adds its bracket arm.
        const postParts: THREE.BufferGeometry[] = [
            vcolor(makeTrunkGeo(2.0, 0.09, rnd), 0x2a2018)
        ];
        if (variant === 1) {
            postParts.push(vcolor(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 5).rotateZ(Math.PI / 2).translate(0, 2.02, 0), 0x2a2018));
        }
        const postGeo = mergeGeometries(postParts)!;
        scene.add(scatterAt(postGeo, craftMat(), at, (m, p) => {
            m.position.set(p.x, 0, p.z);
            m.rotation.y = p.r;
            m.scale.setScalar(0.9 + p.j * 0.2);
        }));
        contactBlobs(scene, at, pal, () => 0.5, 0.3);
    }
    if (pal.emissiveOn) {
        // A whisper of bloom behind the board so it reads at night.
        const hpos = new Float32Array(at.length * 3);
        at.forEach((p, i) => {
            hpos[i * 3] = p.x; hpos[i * 3 + 1] = variant === 2 ? 1.5 + p.j * 0.9 : 1.55; hpos[i * 3 + 2] = p.z;
        });
        const hgeo = new THREE.BufferGeometry();
        hgeo.setAttribute('position', new THREE.BufferAttribute(hpos, 3));
        scene.add(mark(new THREE.Points(hgeo, new THREE.PointsMaterial({
            map: softSprite(), color: pal.emissive, size: 1.1, sizeAttenuation: true,
            transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending
        }))));
    }
}

// ==========================================================================
// stylize — the universal Blinx treatment for ANY object, Blinx-made or not
// (_style laws S1/S2/S6/S9): pose it (one gesture), hand-erode it, bake one
// honest value per facing with the cap rule, then lay the base patina.
// The style is a renderer, not an asset list: anything passed through here
// comes out belonging to the world. The everyday recipes below are normal
// objects — crates, barrels, carts, wells, fences — none of them Blinx
// props, all of them Blinx-styled.
// ==========================================================================

function stylize(
    geo: THREE.BufferGeometry, pal: ScenePalette,
    opts: {
        base: number; cap?: number; dark?: number; snow?: boolean;
        bend?: number; bulge?: number; taper?: number; lean?: number;
        erode?: number; jitter?: number; grimeH?: number; rnd: () => number;
    }
): THREE.BufferGeometry {
    const rnd = opts.rnd;
    let g = geo;
    if (opts.bend || opts.bulge || opts.taper) g = seussify(g, opts.bend ?? 0, opts.bulge ?? 0, opts.taper ?? 0, rnd);
    if (opts.lean) { g.rotateZ(opts.lean); g.rotateX((rnd() - 0.5) * Math.abs(opts.lean) * 0.6); }
    if (opts.erode) jitterGeometry(g, opts.erode, rnd);
    g = bakeFacetValues(g, pal, { base: opts.base, cap: opts.cap, dark: opts.dark, snow: opts.snow, jitter: opts.jitter ?? 0.05, rnd });
    if (opts.grimeH) grimeBake(g, opts.grimeH, pal);
    return g;
}

/** RECIPE crate — the everyday box, Blinx-treated: ONE lean, hand-eroded
 *  edges, grime at the foot. Variants: 0 single, 1 stacked, 2 big-and-small. */
function crate(scene: THREE.Scene, at: Spot[], pal: ScenePalette, rnd: () => number, variant: number) {
    const wood = mix(pal.structure, 0x8a6a42, 0.5);
    const parts: THREE.BufferGeometry[] = [];
    const put = (s: number, x: number, z: number, y?: number) => {
        const g = stylize(new THREE.BoxGeometry(s, s, s), pal, { base: wood, erode: 0.02, lean: (rnd() - 0.5) * 0.10, grimeH: s, rnd });
        g.translate(x, y ?? s / 2, z); parts.push(g);
    };
    if (variant === 1) { put(0.62, 0, 0); put(0.48, 0.06, 0.03, 0.62 + 0.24); }
    else if (variant === 2) { put(0.72, 0, 0); put(0.44, 0.55, 0.30); }
    else put(0.62, 0, 0);
    const geo = mergeGeometries(parts)!;
    scene.add(scatterAt(geo, craftMat(), at, (m, p) => {
        m.position.set(p.x, 0, p.z); m.rotation.y = p.r; m.scale.setScalar(0.85 + p.j * 0.4);
    }));
    contactBlobs(scene, at, pal, () => 0.72, 0.3);
}

/** RECIPE barrel — a bulged lathe with two dark iron bands, gently eroded.
 *  Variants: 0 upright, 1 lying, 2 upright + one down. */
function barrel(scene: THREE.Scene, at: Spot[], pal: ScenePalette, rnd: () => number, variant: number) {
    const wood = mix(pal.structure, 0x7a5636, 0.55);
    const band = mix(wood, 0x000000, 0.55);
    const parts: THREE.BufferGeometry[] = [];
    const mk = (lying: boolean, ox: number, oz: number) => {
        const body = stylize(new THREE.CylinderGeometry(0.30, 0.30, 0.78, 10, 3), pal, { base: wood, bulge: 0.16, erode: 0.015, grimeH: 0.5, rnd });
        const b1 = vcolor(new THREE.CylinderGeometry(0.335, 0.335, 0.05, 10).toNonIndexed(), band);
        const b2 = vcolor(new THREE.CylinderGeometry(0.335, 0.335, 0.05, 10).toNonIndexed(), band);
        b1.translate(0, 0.22, 0); b2.translate(0, -0.22, 0);
        const g = mergeGeometries([body, b1, b2])!;
        if (lying) { g.rotateZ(Math.PI / 2 + (rnd() - 0.5) * 0.1); g.translate(ox, 0.31, oz); }
        else g.translate(ox, 0.39, oz);
        parts.push(g);
    };
    if (variant === 1) mk(true, 0, 0);
    else if (variant === 2) { mk(false, 0, 0); mk(true, 0.55, 0.32); }
    else mk(false, 0, 0);
    const geo = mergeGeometries(parts)!;
    scene.add(scatterAt(geo, craftMat(), at, (m, p) => {
        m.position.set(p.x, 0, p.z); m.rotation.y = p.r; m.scale.setScalar(0.85 + p.j * 0.35);
    }));
    contactBlobs(scene, at, pal, () => 0.6, 0.3);
}

/** RECIPE cart — two big faceted wheels, a tilted plank bed, a pull bar;
 *  the everyday workhorse, posed. Variants: 0 loaded, 1 empty, 2 broken wheel. */
function cart(scene: THREE.Scene, at: Spot[], pal: ScenePalette, rnd: () => number, variant: number) {
    const wood = mix(pal.structure, 0x8a6a42, 0.45);
    const dark = mix(wood, 0x000000, 0.5);
    const parts: THREE.BufferGeometry[] = [];
    const bedTilt = variant === 2 ? 0.20 : 0.05 + rnd() * 0.06;
    const bed = stylize(new THREE.BoxGeometry(1.5, 0.12, 0.9), pal, { base: wood, erode: 0.02, grimeH: 0.2, rnd });
    bed.rotateZ(bedTilt); bed.translate(0, 0.62, 0); parts.push(bed);
    for (const s of [-1, 1]) {
        const broken = variant === 2 && s === 1;
        const r = broken ? 0.28 : 0.42;
        const wheel = stylize(new THREE.CylinderGeometry(r, r, 0.09, 10), pal, { base: dark, erode: 0.02, rnd });
        wheel.rotateX(Math.PI / 2);
        wheel.translate(broken ? 0.18 : 0, r + (broken ? -0.04 : 0), s * 0.52);
        parts.push(wheel);
    }
    const bar = vcolor(new THREE.CylinderGeometry(0.03, 0.035, 1.25, 6).toNonIndexed(), dark);
    bar.rotateZ(1.05); bar.translate(-0.95, 0.52, 0); parts.push(bar);
    if (variant === 0) {
        const sack = stylize(new THREE.SphereGeometry(0.30, 8, 6), pal, { base: mix(wood, 0xd8c8a8, 0.5), erode: 0.05, rnd });
        sack.scale(1, 0.72, 1); sack.translate(-0.25, 0.80, 0.12); parts.push(sack);
        const sack2 = stylize(new THREE.SphereGeometry(0.24, 8, 6), pal, { base: mix(wood, 0xc8b494, 0.45), erode: 0.05, rnd });
        sack2.scale(1, 0.7, 1); sack2.translate(0.32, 0.78, -0.15); parts.push(sack2);
    }
    const geo = mergeGeometries(parts)!;
    scene.add(scatterAt(geo, craftMat(), at, (m, p) => {
        m.position.set(p.x, 0, p.z); m.rotation.y = p.r; m.scale.setScalar(0.9 + p.j * 0.3);
    }));
    contactBlobs(scene, at, pal, () => 1.1, 0.3);
}

/** RECIPE well — octagonal ring wall, pale coping rim, two posts and a little
 *  SAGGING roof (one gesture), a bucket on the rim. Variants: 0 roofed,
 *  1 open, 2 roofed + dark dry mouth. */
function well(scene: THREE.Scene, at: Spot[], pal: ScenePalette, rnd: () => number, variant: number) {
    const stone = mix(pal.structure, 0x8f8678, 0.4);
    const pale = mix(stone, 0xffffff, 0.4);
    const wood = mix(pal.structure, 0x6a4c30, 0.5);
    const parts: THREE.BufferGeometry[] = [];
    const ring = stylize(new THREE.CylinderGeometry(0.85, 0.95, 0.75, 8), pal, { base: stone, erode: 0.03, grimeH: 0.7, rnd });
    ring.translate(0, 0.38, 0); parts.push(ring);
    const rim = stylize(new THREE.CylinderGeometry(0.94, 0.94, 0.10, 8), pal, { base: pale, erode: 0.015, rnd });
    rim.translate(0, 0.79, 0); parts.push(rim);
    const mouth = vcolor(new THREE.CircleGeometry(0.78, 8).toNonIndexed(), variant === 2 ? 0x050403 : mix(pal.fog, 0x000000, 0.8));
    mouth.rotateX(-Math.PI / 2); mouth.translate(0, 0.80, 0); parts.push(mouth);
    if (variant !== 1) {
        for (const s of [-1, 1]) {
            const post = stylize(new THREE.BoxGeometry(0.10, 1.35, 0.10), pal, { base: wood, lean: s * 0.03 + (rnd() - 0.5) * 0.04, erode: 0.015, rnd });
            post.translate(s * 0.82, 1.45, 0); parts.push(post);
        }
        // The sagging roof: two slabs meeting at a ridge that dips mid-span.
        for (const s of [-1, 1]) {
            const slab = stylize(new THREE.BoxGeometry(1.05, 0.07, 1.15), pal, { base: mix(wood, pal.key, 0.12), erode: 0.02, rnd });
            slab.rotateZ(s * (0.42 + rnd() * 0.06));
            slab.translate(s * 0.42, 2.22 - 0.06, 0); parts.push(slab);
        }
    }
    const bucket = stylize(new THREE.CylinderGeometry(0.14, 0.11, 0.20, 8), pal, { base: wood, erode: 0.02, rnd });
    bucket.translate(0.55, 0.92, 0.3); parts.push(bucket);
    const geo = mergeGeometries(parts)!;
    scene.add(scatterAt(geo, craftMat(), at, (m, p) => {
        m.position.set(p.x, 0, p.z); m.rotation.y = p.r; m.scale.setScalar(0.9 + p.j * 0.3);
    }));
    contactBlobs(scene, at, pal, () => 1.2, 0.32);
}

/** RECIPE fenceRun — posts and two rails along a line; every post leans its
 *  own way (gesture per post), the lower rail sometimes missing (broken).
 *  Variants: 0 straight, 1 zigzag, 2 broken. */
function fenceRun(scene: THREE.Scene, at: Spot[], pal: ScenePalette, rnd: () => number, variant: number) {
    const wood = mix(pal.structure, 0x7a5c3a, 0.5);
    const parts: THREE.BufferGeometry[] = [];
    const nP = 4 + Math.floor(rnd() * 3);
    for (const p of at) {
        const dx = Math.cos(p.r), dz = -Math.sin(p.r);
        for (let i = 0; i < nP; i++) {
            const wob = variant === 1 ? ((i % 2) - 0.5) * 0.55 : 0;
            const post = stylize(new THREE.BoxGeometry(0.09, 0.85, 0.09), pal, { base: wood, lean: (rnd() - 0.5) * 0.16, erode: 0.015, grimeH: 0.4, rnd });
            post.translate(p.x + dx * i * 0.62 - dz * wob, 0.42, p.z + dz * i * 0.62 + dx * wob);
            parts.push(post);
        }
        for (const ry of [0.55, 0.30]) {
            if (variant === 2 && ry === 0.30 && rnd() < 0.6) continue;   // the broken rail
            const rail = vcolor(new THREE.BoxGeometry(nP * 0.62, 0.06, 0.05).toNonIndexed(), mix(wood, 0x000000, 0.12));
            rail.rotateY(p.r);
            rail.translate(p.x + dx * (nP - 1) * 0.31, ry, p.z + dz * (nP - 1) * 0.31);
            parts.push(rail);
        }
    }
    const geo = mergeGeometries(parts)!;
    scene.add(mark(new THREE.Mesh(geo, craftMat())));
    contactBlobs(scene, at, pal, () => 1.0, 0.26);
}

/**
 * The habitation pass (laws E3/B5): hero props and street furniture that make
 * a place LIVED-IN — lamps at path corners and pool gaps, planters flanking
 * doors and paths, a fountain on the plaza, one statue hero, benches at pool
 * edges, sign cards near the gates. Each biome takes only what its chord and
 * gesture already imply — never every asset everywhere.
 */
function buildHabitation(
    scene: THREE.Scene, pal: ScenePalette, rnd: () => number,
    biome: string, traits: SceneTraits, visual: SceneVisual | null | undefined,
    roadMask: RoadMask | undefined, noise2D: (x: number, y: number) => number
) {
    if (biome === 'void' || biome === 'sea' || traits.space || traits.submerged || traits.enclosed) return;
    if (visual?.silhouette === 'none') return;
    const wander = (t: number) => noise2D(t * 0.035, 7.3) * 3.2;   // the path's own curve

    // --- streetLamps at path corners, in the gaps between the breadcrumb
    //     pools; alternate verges so the light chain zigs down the walk line.
    if (roadMask) {
        const groups: Spot[][] = [[], [], []];
        for (let i = 0; i < 6; i++) {
            const z = -7.5 - i * 6.2 - rnd() * 1.5;
            const side = i % 2 === 0 ? -1 : 1;
            groups[i % 3].push({
                x: wander(z) + side * (2.9 + rnd() * 0.7), z, s: 1,
                r: side < 0 ? 0.1 + rnd() * 0.2 : Math.PI - 0.1 - rnd() * 0.2, j: rnd()
            });
        }
        groups.forEach((lampSpots, v) => { if (lampSpots.length) streetLamp(scene, lampSpots, pal, rnd, v); });
    }

    if (biome === 'urban') {
        // The plaza: a fountain on an open spot off the roadbed, answered
        // across the road by the statue hero (one-offs, D4/B5).
        const fs = rnd() < 0.5 ? -1 : 1;
        const fz = -12.5 - rnd() * 3;
        fountain(scene, wander(fz) + fs * (6.5 + rnd() * 2), fz, pal, rnd, Math.floor(rnd() * 3));
        if (rnd() < 0.75) {
            const sz = fz - 6 - rnd() * 3;
            statue(scene, wander(sz) - fs * (7 + rnd() * 2), sz, rnd() * Math.PI * 2, pal, rnd, Math.floor(rnd() * 3));
        }
        // Arch-houses leaning over the street, each with its ONE lean.
        const nH = 2 + Math.floor(rnd() * 2);
        for (let i = 0; i < nH; i++) {
            const hz = -9 - i * 7.5 - rnd() * 2;
            const hs = i % 2 === 0 ? -1 : 1;
            archHouse(scene, wander(hz) + hs * (5.4 + rnd() * 1.2), hz,
                hs > 0 ? -Math.PI / 2 + (rnd() - 0.5) * 0.3 : Math.PI / 2 + (rnd() - 0.5) * 0.3,
                pal, rnd, Math.floor(rnd() * 3));
        }
        // Planters flanking the walking line; benches at pool edges; sign
        // cards near the shopfronts.
        const pl: Spot[] = [];
        for (let i = 0; i < 4; i++) {
            const pz = -6.5 - i * 4.6 - rnd();
            const side = i % 2 === 0 ? 1 : -1;
            pl.push({ x: wander(pz) + side * (2.7 + rnd() * 0.5), z: pz, s: 1, r: rnd() * Math.PI, j: rnd() });
        }
        planter(scene, pl, pal, rnd, Math.floor(rnd() * 3));
        bench(scene, [-10.5, -23].map(bz => ({
            x: wander(bz) + (rnd() < 0.5 ? -1 : 1) * 3.1, z: bz, s: 1, r: rnd() * Math.PI * 2, j: rnd()
        })), pal, rnd, Math.floor(rnd() * 3));
        const signs: Spot[] = [];
        for (let i = 0; i < 3; i++) {
            const sz = -8 - i * 9 - rnd() * 2;
            const side = i % 2 === 0 ? 1 : -1;
            signs.push({
                x: wander(sz) + side * (3.4 + rnd() * 0.8), z: sz, s: 1,
                r: (side > 0 ? -1 : 1) * Math.PI / 2 + (rnd() - 0.5) * 0.4, j: rnd()
            });
        }
        signCard(scene, signs, pal, rnd, Math.floor(rnd() * 2));
    }

    if (biome === 'crossroads') {
        archHouse(scene, wander(-11) - 5.6, -11, Math.PI / 2 + (rnd() - 0.5) * 0.3, pal, rnd, 1 + Math.floor(rnd() * 2));
        if (rnd() < 0.6) {
            archHouse(scene, wander(-19) + 5.4, -19, -Math.PI / 2 + (rnd() - 0.5) * 0.3, pal, rnd, Math.floor(rnd() * 2));
        }
        planter(scene, [
            { x: wander(-10) - 4.2, z: -10, s: 1, r: rnd() * Math.PI, j: rnd() },
            { x: wander(-13.5) - 4.0, z: -13.5, s: 1, r: rnd() * Math.PI, j: rnd() },
            { x: wander(-8) + 3.2, z: -8, s: 1, r: rnd() * Math.PI, j: rnd() }
        ], pal, rnd, 0);
        bench(scene, [{ x: wander(-16) + 2.9, z: -16, s: 1, r: -0.4 + rnd() * 0.8, j: rnd() }], pal, rnd, Math.floor(rnd() * 3));
    }

    if (biome === 'forest') {
        // Tended things at the path edge — a garden implies a gardener.
        const pl: Spot[] = [];
        for (let i = 0; i < 3; i++) {
            const pz = -7 - i * 5.2 - rnd();
            pl.push({ x: wander(pz) + (i % 2 === 0 ? 1 : -1) * (2.7 + rnd() * 0.6), z: pz, s: 1, r: rnd() * Math.PI, j: rnd() });
        }
        planter(scene, pl, pal, rnd, 1 + Math.floor(rnd() * 2));   // pots and beds, not civic stone
        streetLamp(scene, [{ x: wander(-14) - 2.8, z: -14, s: 1, r: 0.15 + rnd() * 0.2, j: rnd() }], pal, rnd, 0);
        bench(scene, [{ x: wander(-9) + 3.0, z: -9, s: 1, r: rnd() * Math.PI, j: rnd() }], pal, rnd, 1);
    }

    if (biome === 'ruin') {
        statue(scene, (rnd() - 0.5) * 10, -12 - rnd() * 6, rnd() * Math.PI * 2, pal, rnd, Math.floor(rnd() * 3));
        stairRun(scene, -3 + rnd() * 6, -9 - rnd() * 4, rnd() * Math.PI, pal, rnd, Math.floor(rnd() * 3));
        if (rnd() < 0.6) stairRun(scene, -5 + rnd() * 10, -16 - rnd() * 6, rnd() * Math.PI, pal, rnd, 2);
    }

    if (biome === 'swamp') {
        // The pond: flat opaque water with a coped rim and a span over it.
        const px = -6.5, pz = -13;
        waterDisc(scene, px, pz, 0.06, 5.2, pal);
        const edge: { x: number; z: number; ry: number }[] = [];
        for (let a = -0.4; a < Math.PI * 1.55; a += 0.30) {
            edge.push({ x: px + Math.cos(a) * 5.6, z: pz + Math.sin(a) * 5.6, ry: -a + Math.PI / 2 });
        }
        canalCoping(scene, edge, pal, rnd, 1);
        bridge(scene, px, pz + 4.1, 0.08, pal, rnd, 0);
    }

    // --- the everyday set: normal objects (crates, barrels, carts, wells,
    //     fences) put through stylize(). Seeded rotation picks 2–3 per scene
    //     so no single prop becomes the next flower pot — dressing VARIES
    //     per scene while the laws stay fixed.
    if (roadMask) {
        const ok = (x: number, z: number) => roadMask(x, z) < 0.35;
        const place = (fn: (at: Spot[]) => void, n: number, off: number) => {
            const at: Spot[] = [];
            for (let i = 0; i < n * 4 && at.length < n; i++) {
                const z = -7 - rnd() * 22;
                const x = wander(z) + (rnd() < 0.5 ? -1 : 1) * (off + rnd() * 1.6);
                if (ok(x, z)) at.push({ x, z, s: 1, r: rnd() * Math.PI * 2, j: rnd() });
            }
            if (at.length) fn(at);
        };
        const kits = ['crate', 'barrel', 'cart', 'well', 'fence'] as const;
        const start = Math.floor(rnd() * kits.length);
        const nPick = 2 + Math.floor(rnd() * 2);
        for (let i = 0; i < nPick; i++) {
            const k = kits[(start + i * 2) % kits.length];
            if (k === 'crate') place(at => crate(scene, at, pal, rnd, Math.floor(rnd() * 3)), 3, 3.4);
            else if (k === 'barrel') place(at => barrel(scene, at, pal, rnd, Math.floor(rnd() * 3)), 3, 3.2);
            else if (k === 'cart') place(at => cart(scene, at, pal, rnd, Math.floor(rnd() * 3)), 1, 3.8);
            else if (k === 'well') place(at => well(scene, at, pal, rnd, Math.floor(rnd() * 3)), 1, 5.0);
            else place(at => fenceRun(scene, at, pal, rnd, Math.floor(rnd() * 3)), 2, 3.0);
        }
    }
}

// ---------- per-biome props ----------

function buildProps(scene: THREE.Scene, biome: string, pal: ScenePalette, rnd: () => number, roadMask?: RoadMask, traits?: SceneTraits, visual?: SceneVisual | null) {
    // In a glowing place the masses themselves carry the light — a crystal
    // cavern's rock is lit by its crystals, not just dotted with them. Without
    // this, glowing enclosed scenes render as black walls with bright dots.
    // Solid masses carry the painted mottle (map + whisper of bump) — the
    // Blinx lesson: hand-dabbed value noise is what separates "crafted
    // illustration" from "material ball". White texture, so the palette
    // colour still owns the hue.
    const structMat = () => new THREE.MeshStandardMaterial({
        color: pal.structure, roughness: 0.9, flatShading: true,
        map: mottleTexture(), bumpMap: mottleTexture(), bumpScale: 0.02,
        emissive: pal.emissive, emissiveIntensity: pal.emissiveOn ? 0.22 : 0
    });
    const foliMat = () => new THREE.MeshStandardMaterial({
        color: pal.foliage, roughness: 0.85, flatShading: true,
        map: mottleTexture(), bumpMap: mottleTexture(), bumpScale: 0.015
    });
    const glowMat = () => new THREE.MeshStandardMaterial({
        color: pal.foliage, emissive: pal.emissive,
        emissiveIntensity: pal.emissiveOn ? 1.4 : 0, roughness: 0.6
    });
    // A city keeps its windows no matter what silhouette the Director gives
    // it — "neon spires" are spires WITH lit panes, not bare slabs.
    const cityStruct = () => new THREE.MeshStandardMaterial({
        color: pal.structure, roughness: 0.85, flatShading: true,
        emissive: 0xffffff, emissiveMap: windowTexture(), emissiveIntensity: 0.9
    });

    // A Director-given silhouette REPLACES the biome's mass layer: "a forest
    // of giant mushrooms" keeps the forest palette and ground but grows
    // fungus instead of cone-trees. Visual direction used to be ignored
    // entirely on known biomes. (crossroads keeps its dressed set — the road
    // and signpost ARE the place.)
    const famOverride = visual?.silhouette && visual.silhouette !== 'none' ? visual.silhouette : null;
    if (famOverride && biome !== 'crossroads') {
        const tr = traits ?? extractTraits('');
        if (tr.crystals) addCrystals(scene, pal, tr, rnd, true);
        composeMasses(scene, pal, rnd, tr, visual, structMat, foliMat, glowMat,
            biome === 'urban' ? cityStruct : undefined);
        return;
    }

    switch (biome) {
        case 'forest': {
            // One spot list -> trunk and canopy land on the SAME tree. Fewer,
            // BIGGER crowns on leaning trunks: distinct lollipops that read as
            // individual trees, not one continuous green ceiling (S1/A3).
            const trees = spots(52, 8, 42, rnd);
            addTrees(scene, trees, structMat(), foliMat(),
                { trunkH: 5.6, trunkR: 0.3, tiers: 3, canopyR: 2.5, canopyH: 2.6, lean: 0.3 }, pal, rnd);
            // Saplings: soft fluff puffs, not little pyramids.
            const saplingGeo = fluffCluster(5, 0.45, new THREE.Vector3(0, 0.4, 0), 1.1, rnd);
            const saplings = scatterAt(saplingGeo, leafMatFor(mix(pal.foliage, pal.ground, 0.15)), spots(70, 3, 28, rnd), (m, p) => {
                m.position.set(p.x, 0, p.z); m.scale.setScalar(p.s); m.rotation.y = p.r;
            });
            saplings.customDepthMaterial = leafDepth();
            scene.add(saplings);
            // Forest floor story: fallen logs and stumps. A wood without dead
            // wood is a plantation. Logs reuse the bent-taper trunk geometry,
            // laid down; stumps are short and dark.
            const logSpots = spots(9, 5, 30, rnd);
            const logMat = new THREE.MeshStandardMaterial({ color: mix(pal.structure, 0x000000, 0.35), roughness: 0.95 });
            scene.add(scatterAt(makeTrunkGeo(2.6, 0.22, rnd), logMat, logSpots, (m, p) => {
                m.position.set(p.x, 0.22, p.z);
                m.rotation.set(Math.PI / 2 + (p.j - 0.5) * 0.2, p.r, 0);
                m.scale.setScalar(0.7 + p.j * 0.7);
            }));
            const stumpSpots = spots(12, 4, 28, rnd);
            scene.add(scatterAt(new THREE.CylinderGeometry(0.24, 0.32, 0.5, 7), logMat, stumpSpots, (m, p) => {
                m.position.set(p.x, 0.25, p.z);
                m.rotation.y = p.r;
                m.scale.setScalar(0.7 + p.j * 0.8);
            }));
            contactBlobs(scene, logSpots, pal, (p) => 1.1 * p.s, 0.28);
            contactBlobs(scene, stumpSpots, pal, (p) => 0.6 * p.s, 0.28);
            break;
        }
        case 'desert': {
            const rockSpots = spots(24, 8, 40, rnd);
            const rockGeo = bakeFacetValues(new THREE.DodecahedronGeometry(1.1, 0), pal, { rnd });
            scene.add(scatterAt(rockGeo, paintMat(), rockSpots, (m, p) => {
                m.position.set(p.x, 0.4 + p.j * 0.5, p.z);
                m.scale.set(p.s * 1.3, p.s * 0.6, p.s * 1.3);
                m.rotation.set(p.j, p.r, p.j);
            }));
            contactBlobs(scene, rockSpots, pal, (p) => p.s * 1.6, 0.30);
            const pillarSpots = spots(9, 11, 36, rnd);
            const pillarGeo = bakeFacetValues(new THREE.CylinderGeometry(0.08, 0.2, 3.2, 5), pal, { rnd });
            scene.add(scatterAt(pillarGeo, paintMat(), pillarSpots, (m, p) => {
                m.position.set(p.x, 1.6, p.z); m.rotation.z = (p.j - 0.5) * 0.4;
            }));
            contactBlobs(scene, pillarSpots, pal, () => 0.7, 0.30);
            // Saguaro cacti: trunk + two elbowed arms, merged once and instanced.
            const cactusParts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.16, 0.2, 2.4, 7).translate(0, 1.2, 0)];
            for (const side of [-1, 1]) {
                cactusParts.push(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 6).rotateZ(Math.PI / 2 * side).translate(side * 0.42, 1.15, 0));
                cactusParts.push(new THREE.CylinderGeometry(0.09, 0.11, 0.7, 6).translate(side * 0.66, 1.7, 0));
            }
            const cactusGeo = mergeGeometries(cactusParts)!;
            const cactusMat = new THREE.MeshStandardMaterial({ color: mix(pal.foliage, 0x2a7a3a, 0.5), roughness: 0.85 });
            const cactusSpots = spots(12, 8, 36, rnd);
            scene.add(scatterAt(cactusGeo, cactusMat, cactusSpots, (m, p) => {
                m.position.set(p.x, 0, p.z);
                m.scale.setScalar(p.s * (0.6 + p.j * 0.8));
                m.rotation.y = p.r;
            }));
            contactBlobs(scene, cactusSpots, pal, (p) => p.s * 0.8, 0.30);
            break;
        }
        case 'arctic': {
            // Ice shards: jittered 6-sided cones. 4-sided ones read as pyramids.
            const shardGeo = new THREE.ConeGeometry(0.9, 4.5, 6);
            jitterGeometry(shardGeo, 0.14, rnd);
            const iceGeo = bakeFacetValues(shardGeo, pal, { base: pal.foliage, snow: true, rnd });
            const shardSpots = spots(42, 7, 42, rnd);
            scene.add(scatterAt(iceGeo, paintMat(), shardSpots, (m, p) => {
                m.position.set(p.x, 2.2 * p.s, p.z); m.scale.setScalar(p.s);
                m.rotation.set((p.j - 0.5) * 0.3, p.r, (p.j - 0.5) * 0.3);
            }));
            contactBlobs(scene, shardSpots, pal, (p) => p.s * 1.1, 0.26);
            const iceRockGeo = bakeFacetValues(new THREE.IcosahedronGeometry(0.8, 0), pal, { snow: true, rnd });
            scene.add(scatterAt(iceRockGeo, paintMat(), spots(26, 5, 34, rnd), (m, p) => {
                m.position.set(p.x, 0.3, p.z); m.scale.set(p.s, 0.6, p.s);
            }));
            // Wind-carved snowdrifts: smooth, bright, half-buried lenses.
            const driftGeo = new THREE.SphereGeometry(1, 10, 8);
            const driftMat = new THREE.MeshStandardMaterial({ color: mix(pal.ground, 0xffffff, 0.45), roughness: 0.9 });
            scene.add(scatterAt(driftGeo, driftMat, spots(18, 5, 34, rnd), (m, p) => {
                m.position.set(p.x, -0.12, p.z);
                m.scale.set(p.s * (1.2 + p.j), p.s * 0.32, p.s * (1.0 + p.j * 0.7));
                m.rotation.y = p.r;
            }));
            break;
        }
        case 'sea': {
            const seaRockGeo = bakeFacetValues(new THREE.DodecahedronGeometry(1.4, 0), pal, { rnd });
            scene.add(scatterAt(seaRockGeo, paintMat(), spots(15, 9, 38, rnd), (m, p) => {
                m.position.set(p.x, -0.2 + p.j * 0.8, p.z);
                m.scale.set(p.s, p.s * 0.9, p.s); m.rotation.set(p.j, p.r, p.j);
            }));
            break;
        }
        case 'mountain': {
            // Peaks: jittered icosahedron crags stretched tall — a bare
            // 5-sided cone is a pyramid, this reads as broken rock.
            const cragGeo = new THREE.IcosahedronGeometry(3.2, 1);
            jitterGeometry(cragGeo, 0.35, rnd);
            const cragFacetGeo = bakeFacetValues(cragGeo, pal, { rnd });
            const cragSpots = spots(15, 22, 46, rnd);
            scene.add(scatterAt(cragFacetGeo, paintMat(), cragSpots, (m, p) => {
                m.position.set(p.x, 3.5 * p.s, p.z);
                m.scale.set(p.s, p.s * (1.1 + p.j * 0.9), p.s); m.rotation.y = p.r;
            }));
            contactBlobs(scene, cragSpots, pal, (p) => p.s * 3.4, 0.30);
            const talusGeo = bakeFacetValues(new THREE.DodecahedronGeometry(0.9, 0), pal, { rnd });
            scene.add(scatterAt(talusGeo, paintMat(), spots(32, 5, 30, rnd), (m, p) => {
                m.position.set(p.x, 0.35, p.z); m.rotation.set(p.j, p.r, p.j);
            }));
            break;
        }
        case 'underground': {
            const miteGeo = bakeFacetValues(new THREE.ConeGeometry(0.7, 3.4, 6), pal, { rnd });
            const miteSpots = spots(48, 4, 34, rnd);
            scene.add(scatterAt(miteGeo, paintMat(), miteSpots, (m, p) => {
                m.position.set(p.x, 1.7 * p.s, p.z); m.scale.setScalar(p.s);
            }));
            contactBlobs(scene, miteSpots, pal, (p) => p.s * 0.9, 0.32);
            const titeGeo = bakeFacetValues(new THREE.ConeGeometry(0.5, 2.8, 6), pal, { rnd });
            scene.add(scatterAt(titeGeo, paintMat(), spots(38, 4, 34, rnd), (m, p) => {
                m.position.set(p.x, 9.2, p.z); m.rotation.z = Math.PI; m.scale.setScalar(p.s);
            }));
            glowDots(scene, spots(28, 4, 28, rnd), pal.emissive, (p) => 0.4 + p.j * 3.5, 0.10);
            break;
        }
        case 'urban': {
            const blocks = spots(44, 13, 46, rnd);
            // Towers carry lit windows (emissiveMap) — the city's light comes
            // from inside the buildings, not from dots floating in the air.
            const towerMat = new THREE.MeshStandardMaterial({
                color: pal.structure, roughness: 0.8,
                map: mottleTexture(), bumpMap: mottleTexture(), bumpScale: 0.02,
                emissive: 0xffffff, emissiveMap: windowTexture(), emissiveIntensity: 0.9
            });
            // The Blinx city bulges and leans — towers bow like drawn ones.
            const towerGeo = seussify(new THREE.BoxGeometry(3, 9, 3, 1, 6, 1), 0.5, 0.14, 0.12, rnd);
            scene.add(scatterAt(towerGeo, towerMat, blocks, (m, p) => {
                m.position.set(p.x, 4.5 * (0.4 + p.j * 1.8), p.z);
                m.scale.set(p.s, 0.4 + p.j * 1.8, p.s);
                m.rotation.y = Math.round(p.r) * (Math.PI / 4);
            }));
            glowDots(scene, spots(44, 8, 42, rnd), pal.emissiveOn ? pal.emissive : 0x9fc8ff, (p) => 1.4 + p.j * 6);
            // Streetlamps moved to the habitation pass (recipe streetLamp):
            // S-curved poles with halo + pool, placed at path corners.
            contactBlobs(scene, blocks, pal, (p) => p.s * 2.6, 0.30);
            break;
        }
        case 'swamp': {
            const trees = spots(42, 6, 40, rnd);
            addTrees(scene, trees, structMat(), foliMat(),
                { trunkH: 4.6, trunkR: 0.44, tiers: 2, canopyR: 1.3, canopyH: 1.9, lean: 0.5 }, pal, rnd);
            // Reeds: crossed alpha-cutout blades, not cones — 140 pyramids was
            // the most primitive-looking layer in the biome.
            const reedBlade = new THREE.PlaneGeometry(0.5, 1.6).translate(0, 0.8, 0);
            const reedGeo = mergeGeometries([reedBlade, reedBlade.clone().rotateY(Math.PI / 2)])!;
            const reeds = scatterAt(reedGeo, leafMatFor(pal.foliage), spots(140, 3, 30, rnd), (m, p) => {
                m.position.set(p.x, 0, p.z);
                m.scale.set(0.8 + p.j * 0.6, p.s, 0.8 + p.j * 0.6);
                m.rotation.set((p.j - 0.5) * 0.2, p.r, (p.j - 0.5) * 0.2);
            });
            reeds.customDepthMaterial = leafDepth();
            scene.add(reeds);
            glowDots(scene, spots(32, 4, 26, rnd), pal.emissive, (p) => 0.5 + p.j * 1.8, 0.09);
            break;
        }
        case 'plains': {
            scene.add(scatterAt(new THREE.ConeGeometry(0.14, 0.7, 4), foliMat(), spots(240, 2, 42, rnd), (m, p) => {
                m.position.set(p.x, 0.35, p.z); m.rotation.z = (p.j - 0.5) * 0.35;
            }));
            const plainRockGeo = bakeFacetValues(new THREE.DodecahedronGeometry(0.5, 0), pal, { rnd });
            scene.add(scatterAt(plainRockGeo, paintMat(), spots(18, 6, 36, rnd), (m, p) => {
                m.position.set(p.x, 0.2, p.z); m.rotation.set(p.j, p.r, p.j);
            }));
            break;
        }
        case 'ruin': {
            const colGeo = bakeFacetValues(new THREE.CylinderGeometry(0.5, 0.55, 6, 8), pal, { rnd });
            const colSpots = spots(22, 8, 36, rnd);
            scene.add(scatterAt(colGeo, paintMat(), colSpots, (m, p) => {
                const broken = 0.25 + p.j * 0.85;
                m.position.set(p.x, 3 * broken, p.z); m.scale.set(1, broken, 1);
                m.rotation.z = p.j > 0.75 ? (p.j - 0.5) * 0.35 : 0;
            }));
            contactBlobs(scene, colSpots, pal, () => 1.1, 0.32);
            const slabGeo = bakeFacetValues(new THREE.BoxGeometry(1.4, 0.5, 1.4), pal, { rnd });
            scene.add(scatterAt(slabGeo, paintMat(), spots(28, 5, 30, rnd), (m, p) => {
                m.position.set(p.x, 0.25, p.z);
                m.rotation.set((p.j - 0.5) * 0.3, p.r, (p.j - 0.5) * 0.3);
            }));
            break;
        }
        case 'void': {
            const shards = spots(64, 4, 38, rnd);
            scene.add(scatterAt(new THREE.TetrahedronGeometry(1.2, 0), glowMat(), shards, (m, p) => {
                m.position.set(p.x, -6 + p.j * 16, p.z);
                m.rotation.set(p.r, p.j * Math.PI, p.r);
                m.scale.setScalar(0.3 + p.j * 1.4);
            }));
            break;
        }
        case 'fire': {
            const fireRockGeo = bakeFacetValues(new THREE.DodecahedronGeometry(1.3, 0), pal, { rnd });
            const fireSpots = spots(28, 7, 40, rnd);
            scene.add(scatterAt(fireRockGeo, paintMat(), fireSpots, (m, p) => {
                m.position.set(p.x, 0.3 + p.j * 0.8, p.z);
                m.scale.set(p.s, p.s * (0.7 + p.j * 1.5), p.s);
                m.rotation.set(p.j, p.r, p.j);
            }));
            contactBlobs(scene, fireSpots, pal, (p) => p.s * 1.5, 0.32);
            glowDots(scene, spots(64, 3, 32, rnd), pal.emissive, (p) => 0.3 + p.j * 4.5, 0.10);
            break;
        }
        case 'synthetic': {
            // A place nobody authored: crystals/stalactites from traits, then
            // the shared mass/growth/rock/glow recipe. This is where
            // "completely unplanned" scenes become specific.
            const tr = traits ?? extractTraits('');
            if (tr.crystals) addCrystals(scene, pal, tr, rnd, true);
            composeMasses(scene, pal, rnd, tr, visual, structMat, foliMat, glowMat);
            break;
        }
        case 'crossroads':
        default: {
            // Roads are painted into the terrain (see makeRoadMask) -- there is
            // no road geometry to have edges. The set is DRESSED: a designed
            // signpost with a lit lantern, grass everywhere the road isn't,
            // stones along the verges, flowers, undergrowth. Emptiness is what
            // reads as "basic"; density is what reads as a place.
            const mask = roadMask ?? (() => 0);

            // --- the signpost: a prop, not three lines ---
            const woodLo = mix(pal.structure, 0x000000, 0.35);
            const woodHi = mix(pal.structure, pal.key, 0.30);
            const sign = new THREE.Group();
            const postGeo = bakeGradient(makeTrunkGeo(3.1, 0.16, rnd), woodLo, woodHi, rnd);
            const post = new THREE.Mesh(postGeo, paintMat());
            post.castShadow = true;
            sign.add(post);
            const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshToonMaterial({ color: woodHi, gradientMap: toonRamp() }));
            knob.position.y = 3.16; sign.add(knob);
            for (const [i, yy] of [2.62, 2.18].entries()) {
                const board = new THREE.Mesh(
                    new THREE.BoxGeometry(1.45, 0.34, 0.09),
                    new THREE.MeshToonMaterial({ color: mix(woodHi, 0xffffff, 0.18), gradientMap: toonRamp() })
                );
                board.position.set(i === 0 ? 0.45 : -0.4, yy, 0);
                board.rotation.y = i === 0 ? 0.35 : -2.6;
                board.castShadow = true;
                sign.add(board);
            }
            // hanging lantern -- warm ember in a dark cage, glows in every bake
            const cage = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), new THREE.MeshToonMaterial({ color: 0x2a2018, gradientMap: toonRamp() }));
            cage.position.set(-0.72, 1.86, 0); sign.add(cage);
            const flame = new THREE.Mesh(
                new THREE.SphereGeometry(0.11, 8, 6),
                new THREE.MeshStandardMaterial({ color: 0xffc36a, emissive: 0xff9a2a, emissiveIntensity: 2.2 })
            );
            flame.position.copy(cage.position); sign.add(flame);
            // The Kuwahara pass eats tiny bright points (high-variance sectors
            // average away), so the ember alone vanishes in the painting. A
            // POOL of warm light survives — broad gradients bake beautifully.
            // Costs nothing at runtime: it's frozen into the backdrop.
            const glow = new THREE.PointLight(0xff9a2a, 3.2, 7.5, 1.6);
            glow.position.set(-0.72, 1.9, 0.15); sign.add(glow);
            const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 5), new THREE.MeshToonMaterial({ color: woodLo, gradientMap: toonRamp() }));
            hang.position.set(-0.72, 2.06, 0); sign.add(hang);
            // base stones so the post grows out of something
            for (let i = 0; i < 3; i++) {
                const st = new THREE.Mesh(bakeFacetValues(makeRockGeo(rnd), pal, { rnd }), paintMat());
                const aa = rnd() * Math.PI * 2;
                st.position.set(Math.cos(aa) * 0.3, 0.06, Math.sin(aa) * 0.3);
                st.scale.setScalar(0.16 + rnd() * 0.1);
                sign.add(st);
            }
            sign.position.set(3.4, 0, 2.6);
            sign.rotation.y = -0.3;
            scene.add(mark(sign));

            // --- ground cover: grass tufts everywhere the road isn't ---
            const grassTint = mix(pal.foliage, pal.ground, 0.3);
            const grassGeo = fluffCluster(2, 0.34, new THREE.Vector3(0, 0.14, 0), 0.55, rnd);
            const grassSpots = spots(340, 1.2, 38, rnd).filter(pt => mask(pt.x, pt.z) < 0.22);
            const grass = scatterAt(grassGeo, leafMatFor(grassTint), grassSpots, (m, pt) => {
                m.position.set(pt.x, 0, pt.z);
                m.scale.setScalar(0.55 + pt.j * 0.8);
                m.rotation.y = pt.r;
            });
            grass.customDepthMaterial = leafDepth();
            grass.castShadow = false;                    // 340 tuft shadows = noise
            scene.add(grass);

            // --- verge stones: hug the road edges ---
            const stoneGeo = bakeFacetValues(makeRockGeo(rnd), pal, { rnd });
            const vergeSpots = spots(90, 2, 30, rnd).filter(pt => { const m2 = mask(pt.x, pt.z); return m2 > 0.15 && m2 < 0.6; });
            scene.add(scatterAt(stoneGeo, paintMat(), vergeSpots, (m, pt) => {
                m.position.set(pt.x, 0.03, pt.z);
                m.scale.setScalar(0.1 + pt.j * 0.16);
                m.rotation.y = pt.r;
            }));
            // a few larger boulders off in the grass
            scene.add(scatterAt(stoneGeo, paintMat(), spots(10, 7, 30, rnd).filter(pt => mask(pt.x, pt.z) < 0.1), (m, pt) => {
                m.position.set(pt.x, 0.05, pt.z);
                m.scale.setScalar(0.35 + pt.j * 0.4);
                m.rotation.y = pt.r;
            }));

            // --- flowers: small bright clusters in the verge grass ---
            const flowerMat = new THREE.MeshStandardMaterial({
                color: mix(pal.key, 0xffffff, 0.3),
                emissive: mix(pal.key, 0xffffff, 0.2), emissiveIntensity: 0.35
            });
            const flowerSpots: Spot[] = [];
            for (let c = 0; c < 9; c++) {
                const centre = spots(1, 3, 26, rnd)[0];
                if (mask(centre.x, centre.z) > 0.2) continue;
                for (let i = 0; i < 7; i++) {
                    flowerSpots.push({ x: centre.x + (rnd() - 0.5) * 2.2, z: centre.z + (rnd() - 0.5) * 2.2, s: 1, r: 0, j: rnd() });
                }
            }
            if (flowerSpots.length) {
                scene.add(scatterAt(new THREE.SphereGeometry(0.055, 6, 5), flowerMat, flowerSpots, (m, pt) => {
                    m.position.set(pt.x, 0.24 + pt.j * 0.1, pt.z);
                }));
            }

            const trees = spots(34, 8, 40, rnd).filter(pt => mask(pt.x, pt.z) < 0.3);
            addTrees(scene, trees, structMat(), foliMat(),
                { trunkH: 4.2, trunkR: 0.24, tiers: 2, canopyR: 1.5, canopyH: 2.2 }, pal, rnd);
            break;
        }
    }
}

// ---------- the air pass (law C5): ONE particle, one tint ----------

/**
 * Every world owns exactly ONE particle and one air tint. The particle is
 * chosen per scene from palette/traits (falling weather > marine snow >
 * embers/fireflies > dust motes), dozens not hundreds, spread through near,
 * mid and far depths so the volume between viewer and wall has a body. The
 * tint is the fog banks + low ground mist that melt the hard low-poly edges.
 *
 * This MERGES the old buildWeather/buildMotes/buildAtmosphere trio — three
 * builders layering competing particle systems was how a scene ended up with
 * snow AND dust AND embers at once. The live-layer userData flags
 * (isPrecip/isMote/isFogBank/isGroundMist) are preserved so the diorama's
 * animation loop keeps working unchanged.
 */
function buildAir(scene: THREE.Scene, biome: string, weather: string, pal: ScenePalette, rnd: () => number, traits: SceneTraits) {
    const openSky = !traits.enclosed && !traits.space && !traits.submerged;
    const snowing = openSky && weather === 'snow';
    const raining = openSky && weather === 'rain';
    const marine = !!traits.submerged;
    const fireflies = pal.starAmount > 0.5 && ['forest', 'crossroads', 'swamp', 'plains'].includes(biome);
    const embers = !marine && (pal.emissiveOn || fireflies || biome === 'fire');

    // --- the ONE particle ---
    const n = snowing ? 130 : raining ? 110 : marine ? 90 : embers ? 70 : 55;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        // near / mid / far: sqrt spread, biased toward the view like the props
        const ang = rnd() < 0.8
            ? -Math.PI / 2 + (rnd() - 0.5) * (Math.PI * 0.95)
            : rnd() * Math.PI * 2;
        const rad = 2 + Math.sqrt(rnd()) * 46;
        pos[i * 3] = Math.cos(ang) * rad;
        pos[i * 3 + 1] = 0.4 + rnd() * 14;
        pos[i * 3 + 2] = Math.sin(ang) * rad;
        phase[i] = rnd() * Math.PI * 2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const glowy = !marine && !snowing && !raining && (pal.emissiveOn || fireflies);
    const color = snowing ? 0xffffff
        : raining ? 0xbcd0e0
        : marine ? 0xd8ecf4
        : glowy ? (pal.emissiveOn ? pal.emissive : 0xd8e87a)
        : mix(pal.foliage, 0xffffff, 0.55);
    const mat = new THREE.PointsMaterial({
        // soft round sprite — bare square points were the "white squares in
        // the sky" tell. Colour picks up the biome's own light.
        map: softSprite(),
        color,
        size: snowing ? 0.34 : raining ? 0.16 : marine ? 0.10 : glowy ? 0.20 : 0.14,
        transparent: true,
        opacity: snowing ? 0.9 : raining ? 0.5 : marine ? 0.45 : glowy ? 0.85 : 0.5,
        depthWrite: false,
        blending: glowy ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const p = new THREE.Points(geo, mat);
    if (snowing || raining) {
        p.userData.isPrecip = true;
        p.userData.fallSpeed = snowing ? 0.035 : 0.5;
        p.userData.drift = snowing;
    } else {
        p.userData.isMote = true;
        p.userData.glowy = glowy;
        p.userData.rise = marine ? -0.005 : glowy ? 0.012 : 0.004;   // embers climb, marine snow sinks
        p.userData.phase = phase;
    }
    scene.add(mark(p));

    // --- the air tint: mid-ground fog banks + low ground mist ---
    const tex = softSprite();
    const fogCol = new THREE.Color(pal.fog);
    // Enclosed glowing spaces: the mist itself carries the glow colour — this
    // is "the air is lit", the difference between a cavern and a black room.
    if (traits.enclosed && pal.emissiveOn) fogCol.lerp(new THREE.Color(pal.emissive), 0.30);

    // Mid-ground fog banks — the main edge-hiding layer. Few but large; low
    // opacity to keep overdraw (fillrate) sane on phones.
    for (let i = 0; i < 16; i++) {
        const smat = new THREE.SpriteMaterial({
            map: tex, color: fogCol,
            transparent: true, opacity: 0.07 + rnd() * 0.09,
            depthWrite: false, fog: false
        });
        const sp = new THREE.Sprite(smat);
        const ang = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.2;   // biased toward the view
        const r = 9 + rnd() * 32;
        sp.position.set(Math.cos(ang) * r, 1.5 + rnd() * 6.5, Math.sin(ang) * r);
        const w = 11 + rnd() * 18;
        sp.scale.set(w, w * (0.5 + rnd() * 0.2), 1);
        sp.userData.isFogBank = true;
        sp.userData.drift = (rnd() - 0.5) * 0.012;   // the live loop reads ud.drift
        sp.userData.phase = rnd() * Math.PI * 2;
        sp.userData.baseY = sp.position.y;
        scene.add(mark(sp));
    }

    // Ground mist — low, dense-ish soft points so tree/rock bases melt into it.
    // Enclosed scenes get more: the floor must never collapse to a black void.
    const nm = traits.enclosed ? 110 : 70;
    const mgeo = new THREE.BufferGeometry();
    const mpos = new Float32Array(nm * 3);
    for (let i = 0; i < nm; i++) {
        mpos[i * 3]     = (rnd() - 0.5) * 62;
        mpos[i * 3 + 1] = 0.3 + rnd() * 2.4;
        mpos[i * 3 + 2] = (rnd() - 0.5) * 62;
    }
    mgeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
    const mmat = new THREE.PointsMaterial({
        map: tex, color: fogCol, size: 7, sizeAttenuation: true,
        transparent: true, opacity: traits.enclosed ? 0.19 : 0.14, depthWrite: false, fog: false
    });
    const mist = new THREE.Points(mgeo, mmat);
    mist.userData.isGroundMist = true;
    scene.add(mark(mist));
}

// ---------- creatures: the world is inhabited ----------

/**
 * Live-layer life. Everything here animates per-frame OVER the painting:
 * a bird flock circling the sky, butterflies over the grass by day, falling
 * leaves, and (via glowy motes) fireflies after dark. All silhouette-simple —
 * painterly worlds want gestures of life, not anatomy.
 */
function buildCreatures(scene: THREE.Scene, biome: string, pal: ScenePalette, rnd: () => number, traits: SceneTraits) {
    const noSky = traits.enclosed || traits.space || traits.submerged;
    const openLand = ['forest', 'crossroads', 'plains', 'mountain', 'ruin', 'swamp', 'urban', 'sea', 'arctic', 'desert'].includes(biome);

    // --- birds: a distant flock, two flapping wing-triangles each ---
    if (!noSky && openLand) {
        const flock = new THREE.Group();
        const wing = new THREE.BufferGeometry();
        wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
            0, 0, 0,   0.85, 0.12, 0,   0.2, 0, -0.3
        ]), 3));
        wing.computeVertexNormals();
        const bmat = new THREE.MeshBasicMaterial({ color: mix(pal.structure, 0x000000, 0.45), side: THREE.DoubleSide });
        const n = 5 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
            const bird = new THREE.Group();
            const L = new THREE.Mesh(wing, bmat);
            const R = new THREE.Mesh(wing, bmat);
            R.scale.x = -1;
            bird.add(L, R);
            bird.scale.setScalar(0.5 + rnd() * 0.4);
            bird.userData.ph = rnd() * Math.PI * 2;
            flock.add(bird);
        }
        flock.userData.isFlock = true;
        flock.userData.orbit = { r: 20 + rnd() * 14, h: 13 + rnd() * 6, speed: 0.045 + rnd() * 0.03, off: rnd() * Math.PI * 2 };
        scene.add(mark(flock));
    }

    // --- butterflies: near the grass, daylight only ---
    if (!noSky && !traits.barren && ['crossroads', 'plains', 'forest'].includes(biome) && pal.starAmount < 0.5) {
        const group = new THREE.Group();
        const wmat = new THREE.MeshBasicMaterial({ color: mix(pal.key, 0xffffff, 0.25), side: THREE.DoubleSide });
        const wgeo = new THREE.PlaneGeometry(0.16, 0.12);
        for (let i = 0; i < 4; i++) {
            const b = new THREE.Group();
            const L = new THREE.Mesh(wgeo, wmat); L.position.x = -0.07;
            const R = new THREE.Mesh(wgeo, wmat); R.position.x = 0.07;
            b.add(L, R);
            const home = spots(1, 3, 15, rnd)[0];
            b.userData.home = { x: home.x, z: home.z, ph: rnd() * Math.PI * 2 };
            group.add(b);
        }
        group.userData.isButterflies = true;
        scene.add(mark(group));
    }

    // --- falling leaves: slow flutter through the frame ---
    if (['forest', 'crossroads', 'swamp', 'plains'].includes(biome) && !traits.barren) {
        const n = 22;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            pos[i * 3] = (rnd() - 0.5) * 40;
            pos[i * 3 + 1] = rnd() * 10 + 1;
            pos[i * 3 + 2] = (rnd() - 0.5) * 40;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const lmat = new THREE.PointsMaterial({
            map: leafTexture(), color: mix(pal.foliage, pal.key, 0.3),
            size: 0.28, transparent: true, opacity: 0.9, depthWrite: false, alphaTest: 0.3
        });
        const leaves = new THREE.Points(geo, lmat);
        leaves.userData.isLeaves = true;
        scene.add(mark(leaves));
    }
}

// ---------- ambient motes: MERGED into buildAir (law C5 — one particle per scene) ----------

// ---------- atmosphere: soft fog that hides the low-poly edges ----------

// One shared radial-gradient sprite (white core -> transparent). Soft alpha is
// what turns hard polygon silhouettes into atmosphere.
let _softSprite: THREE.Texture | null = null;
function softSprite(): THREE.Texture {
    if (_softSprite) return _softSprite;
    const s = 64;
    const cv = document.createElement('canvas'); cv.width = cv.height = s;
    const ctx = cv.getContext('2d')!;
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    _softSprite = new THREE.CanvasTexture(cv);
    _softSprite.needsUpdate = true;
    return _softSprite;
}

// ---------- braziers: the Temple of Lost Time lesson ----------

/**
 * Colored fire in a dark bowl, repeated. Blinx spends its entire brightness
 * budget on accents like this: a dark world, and then fire — orange AND teal,
 * side by side, physically impossible and perceptually delightful. The flame
 * takes the scene's emissive hue when the place glows (confident wrongness),
 * classic warm orange otherwise. Each gets a real light pool — the Kuwahara
 * pass eats bare bright pixels but keeps gradients (the lantern lesson).
 */
function addBraziers(scene: THREE.Scene, pal: ScenePalette, rnd: () => number, traits: SceneTraits, biome: string, visual?: SceneVisual | null) {
    const temple = biome === 'ruin' || biome === 'underground'
        || (biome === 'synthetic' && visual?.silhouette === 'columns');
    if (!temple) return;
    const flameCol = pal.emissiveOn ? pal.emissive : 0xff8a2a;
    const bowlMat = new THREE.MeshStandardMaterial({ color: mix(pal.structure, 0x000000, 0.45), roughness: 0.9 });
    const flameMat = new THREE.MeshStandardMaterial({
        color: mix(flameCol, 0xffffff, 0.45), emissive: flameCol, emissiveIntensity: 2.6, roughness: 0.5
    });
    const at = spots(5 + Math.floor(rnd() * 3), 4, 24, rnd);
    // Bowl + post, one list so parts stay married.
    scene.add(scatterAt(new THREE.CylinderGeometry(0.30, 0.16, 0.22, 8), bowlMat, at, (m, p) => {
        m.position.set(p.x, 1.02, p.z);
        m.scale.setScalar(0.8 + p.j * 0.6);
    }));
    scene.add(scatterAt(new THREE.CylinderGeometry(0.05, 0.08, 1.0, 6), bowlMat, at, (m, p) => {
        m.position.set(p.x, 0.5, p.z);
    }));
    // The flame: a teardrop, slightly alive in shape — and its light pool.
    const flameGeo = new THREE.SphereGeometry(0.16, 8, 8);
    flameGeo.scale(1, 1.7, 1);
    scene.add(scatterAt(flameGeo, flameMat, at, (m, p) => {
        m.position.set(p.x, 1.28, p.z);
        m.scale.setScalar(0.8 + p.j * 0.7);
    }));
    for (const p of at) {
        const pool = new THREE.PointLight(flameCol, 3.5, 11, 1.5);
        pool.position.set(p.x, 1.7, p.z);
        scene.add(mark(pool));
        // The painted pool: Blinx's fourth layer of every light — and the one
        // that still reads after the paint bake averages the bloom away.
        lightPool(scene, p.x, p.z, 2.3, flameCol, 0.5);
    }
    contactBlobs(scene, at, pal, (p) => 1.2, 0.30);
}

// ---------- the overhead layer: the upper third is never empty ----------

/**
 * Blinx frames occupy their upper third — wires, banners, hanging lamps, a
 * canopy roof. An empty top half reads as a stage set. Built places string
 * lantern lights across the street; woods close a canopy overhead. These sit
 * high and near, so they bake as soft overhead silhouettes.
 */
function buildOverhead(scene: THREE.Scene, pal: ScenePalette, rnd: () => number, biome: string, traits: SceneTraits) {
    if (traits.enclosed || traits.space || traits.submerged) return;

    if (biome === 'urban' || biome === 'crossroads') {
        // Lantern strings: catenary wires with warm bulbs, crossing the view.
        const wireMat = new THREE.MeshBasicMaterial({ color: mix(pal.structure, 0x000000, 0.55), fog: false });
        const bulbMat = new THREE.MeshStandardMaterial({
            color: 0xffe9c0, emissive: pal.emissiveOn ? pal.emissive : 0xffc36a,
            emissiveIntensity: 1.9, roughness: 0.4, fog: false
        });
        const bulbSpots: Spot[] = [];
        for (let s = 0; s < 3; s++) {
            const z = -5 - s * 5.5 - rnd() * 2;
            const y0 = 6.2 + rnd() * 1.6, sag = 1.0 + rnd() * 0.6;
            const span = 26 + rnd() * 10;
            const pts: THREE.Vector3[] = [];
            for (let i = 0; i <= 16; i++) {
                const u = i / 16;
                pts.push(new THREE.Vector3((u - 0.5) * span, y0 - Math.sin(u * Math.PI) * sag, z));
            }
            const wire = new THREE.Mesh(
                new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.016, 4),
                wireMat
            );
            scene.add(mark(wire));
            // Bulbs hang slightly BELOW the wire, every other span point.
            bulbSpots.length = 0;
            for (let i = 1; i < 16; i += 2) bulbSpots.push({ x: pts[i].x, z, s: 1, r: 0, j: rnd() });
            const bulbs = scatterAt(new THREE.SphereGeometry(0.085, 6, 5), bulbMat, bulbSpots, (m, p, i2) => {
                m.position.set(p.x, pts[1 + i2 * 2].y - 0.14, p.z);
            });
            bulbs.castShadow = false;
            scene.add(bulbs);
        }
        return;
    }

    if ((biome === 'forest' || biome === 'swamp') && !traits.barren) {
        // The wood's roof: dark-in-palette fluff masses overhead, so the upper
        // frame is canopy, not sky. Kept HIGH and leaf-toned — too low and too
        // black it reads as a hovering mothership, not a ceiling of leaf.
        const mat = leafMatFor(mix(pal.foliage, 0x000000, 0.20));
        for (let i = 0; i < 4; i++) {
            const a = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.6;
            const r = 9 + rnd() * 14;
            const g = fluffCluster(10, 2.0 + rnd() * 1.2, new THREE.Vector3(0, 0, 0), 0.5, rnd);
            const puff = new THREE.Mesh(g, mat);
            puff.position.set(Math.cos(a) * r, 10.5 + rnd() * 4, Math.sin(a) * r);
            puff.scale.set(1.6 + rnd() * 0.9, 1, 1.2 + rnd() * 0.7);
            puff.rotation.y = rnd() * Math.PI;
            puff.customDepthMaterial = leafDepth();
            scene.add(mark(puff));
        }
    }
}

/**
 * Rebuild the stage for `tags` using `pal`. Caller owns lights + clear colour.
 * Deterministic per (biome, location) so a place stays the same place.
 */
export function generateScene(scene: THREE.Scene, tags: SceneTags | any, pal: ScenePalette) {
    disposeProcedural(scene);
    scene.userData.crystalsAdded = false;   // guards the double-add (16-glow-cavern)

    const t = tags ?? {};
    const known = !!(t.biome && KNOWN_BIOMES.has(t.biome as string));
    const biome = known ? (t.biome as string) : 'synthetic';
    // Seed on world + what the AI actually said + the place. Every world's
    // forest is its OWN forest; the same place stays the same place.
    const seed = hashStr(`${t.worldSeed ?? ''}|${t.biomeRaw ?? t.biome ?? ''}|${t.location ?? ''}`);
    const rnd = mulberry32(seed);
    const noise2D = createNoise2D(rnd);

    const traits = applyVisual(extractTraits(`${t.biomeRaw ?? t.biome ?? ''} ${t.location ?? ''}`), t.visual);

    scene.add(buildSky(pal));
    // One giant + one jagged hem (D7): the far flat layer that keeps the world
    // from floating in space. The giant's azimuth comes back so the cumulus
    // layer never clips a hard wedge through the disc.
    const giantAz = buildSkyHem(scene, pal, rnd, traits, biome);

    const roadMask = biome === 'crossroads' || biome === 'urban' ? makeRoadMask(noise2D) : undefined;
    const ground = buildGround(pal, biome, noise2D, roadMask, traits, t.visual, rnd);
    if (ground) scene.add(ground);

    buildProps(scene, biome, pal, rnd, roadMask, traits, t.visual);
    buildFraming(scene, pal, rnd, traits, t.visual, biome, roadMask, noise2D);
    // The habitation pass (E3/B5): lamps, planters, the fountain, a statue
    // hero, benches, signs — the lived-in layer from the recipe library.
    buildHabitation(scene, pal, rnd, biome, traits, t.visual, roadMask, noise2D);
    addBraziers(scene, pal, rnd, traits, biome, t.visual);
    buildOverhead(scene, pal, rnd, biome, traits);
    buildNearField(scene, pal, rnd, roadMask, traits, biome);
    // Traits layer specifics onto KNOWN biomes too — underground + "crystal"
    // in the text = a crystal cavern without any new biome existing. Skip if
    // a silhouette-override path already grew them (the double-add doubled
    // the light and blew the cores white).
    if (traits.crystals && biome !== 'synthetic' && !scene.userData.crystalsAdded) addCrystals(scene, pal, traits, rnd, false);
    // Glow without crystals still pools — luminous places must LIGHT their
    // ground, not just sparkle (the lantern lesson).
    if (traits.glowing && !traits.crystals) addGlowPools(scene, pal, traits, rnd);
    // The lit heart (law A6): EVERY scene gets a chain of pools receding down
    // the path — the value script's spark line, whether or not the place has
    // roads or its own emissive. Pathless places follow the same noise curve.
    if (biome !== 'void' && biome !== 'sea' && !traits.space && !traits.submerged) {
        breadcrumbTrail(scene, pal, rnd, noise2D);
    }
    // Underwater: shafts of surface light. Broad additive planes — gradients
    // survive the paint bake, so the water column reads in the painting.
    if (traits.submerged) {
        for (let i = 0; i < 5; i++) {
            const shaft = new THREE.Mesh(
                new THREE.PlaneGeometry(2.2 + rnd() * 2.5, 30),
                new THREE.MeshBasicMaterial({
                    color: mix(pal.key, 0xffffff, 0.4), transparent: true,
                    opacity: 0.05 + rnd() * 0.04, depthWrite: false,
                    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false
                })
            );
            shaft.position.set((rnd() - 0.5) * 36, 12, -6 - rnd() * 22);
            shaft.rotation.z = 0.12 + rnd() * 0.1;
            shaft.rotation.y = (rnd() - 0.5) * 0.4;
            scene.add(mark(shaft));
        }
    }
    buildCreatures(scene, biome, pal, rnd, traits);
    // The air pass (C5): ONE particle type per scene + the scene's air tint.
    // Handles its own gating — it does not rain in a cavern or snow in the void.
    buildAir(scene, biome, (t.weather as string) ?? 'clear', pal, rnd, traits);
    // Horizon ridgelines everywhere a horizon makes sense — peaks, dunes or
    // mesas per world. And the sky gets its furniture: real cumulus bodies,
    // because a Blinx sky is never an empty gradient.
    if (biome !== 'underground' && biome !== 'void' && !traits.enclosed && !traits.space && !traits.submerged) {
        buildRidges(scene, pal, rnd, noise2D, seed % 3);
        if (pal.cloud > 0.15) buildCumulus(scene, pal, rnd, giantAz);
    }

    // Depth fog, tuned so the MASS BAND (10-30 units out) keeps its identity:
    // at the old ×1.3 even a clear forest was 70% fogged at 15 units — the
    // universal murk wash. ×0.85 melts the ridgelines (60-95 units) into the
    // sky while leaving the set readable. Capped at 0.10: past that FogExp2 is
    // a void generator no matter the scene.
    scene.fog = new THREE.FogExp2(pal.fog, Math.min(Math.max(pal.fogDensity * 0.85, 0.02), 0.10));
}
