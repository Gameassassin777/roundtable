import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { mix, extractTraits, applyVisual, type ScenePalette, type SceneTags, type SceneTraits, type SceneVisual } from './scenePalette';
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
    const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
            top:        { value: new THREE.Color(pal.sky) },
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
            uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor;
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
                vec3 col = mix(bottom, top, h);

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
                    col = mix(col, sunColor * 1.9, disc);
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

// ---------- crystals: trait prop for glowing/crystalline scenes ----------

/**
 * Emissive crystal clusters + a hero formation with a baked light pool.
 * Same lesson as the signpost lantern: the paint pass eats tiny bright points,
 * so the glow must be a POOL of light on the ground, not just bright pixels.
 */
function addCrystals(scene: THREE.Scene, pal: ScenePalette, traits: SceneTraits, rnd: () => number, dense: boolean) {
    const col = traits.glowColor ?? 0x7fe8ff;
    const mat = new THREE.MeshStandardMaterial({
        color: mix(col, 0xffffff, 0.35), emissive: col,
        // Strong on purpose: the paint pass averages away timid emissives
        // (the lantern lesson) and enclosed scenes dim the sun, so the
        // crystals ARE the light source.
        emissiveIntensity: 2.4, roughness: 0.3
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
        const c = new THREE.Mesh(geo, mat);
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
    for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.2;   // biased toward the view
        const r = 4 + rnd() * 26;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const p2 = new THREE.PointLight(col, 3.5, 16, 1.5);
        p2.position.set(x, 1.1, z);
        scene.add(mark(p2));
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, color: col, transparent: true, opacity: 0.22,
            depthWrite: false, blending: THREE.AdditiveBlending, fog: false
        }));
        sp.position.set(x, 0.9, z);
        sp.scale.set(6 + rnd() * 5, 3.5 + rnd() * 3, 1);
        scene.add(mark(sp));
    }
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

function buildGround(pal: ScenePalette, biome: string, noise2D: (x: number, y: number) => number, roadMask?: RoadMask, traits?: SceneTraits, visual?: SceneVisual | null) {
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

    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
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
        const d = Math.hypot(x, y);
        h *= Math.min(1, Math.max(0, (d - 7) / 11));
        pos.setZ(i, h);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    // Vertex colour variation. One flat fill across the largest surface in frame
    // is a dead giveaway; real ground has patches — growth where it's lush,
    // exposed rock where it isn't. Two octaves: broad patches + fine grain.
    const colors = new Float32Array(pos.count * 3);
    const cGround = new THREE.Color(pal.ground);
    const cGrowth = new THREE.Color(pal.foliage);
    const cRock = new THREE.Color(pal.structure);
    const cDirt = new THREE.Color(mix(mix(pal.ground, pal.structure, 0.2), 0xffffff, 0.16));
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        const broad = noise2D(x * 0.028, y * 0.028);
        const fine = noise2D(x * 0.17, y * 0.17);
        tmp.copy(cGround);
        if (broad > 0.18) tmp.lerp(cGrowth, Math.min(0.42, (broad - 0.18) * 0.85));
        else if (broad < -0.22) tmp.lerp(cRock, Math.min(0.38, (-broad - 0.22) * 0.75));
        if (roadMask) {
            // Worn dirt: lighter packed earth, slightly warmed, with the fine
            // noise wobbling the edge so no two metres of verge match.
            const rm = roadMask(x, -y) * (0.82 + fine * 0.18);
            if (rm > 0.02) tmp.lerp(cDirt, Math.min(1, rm) * 0.85);
        }
        const shadeK = 0.90 + fine * 0.10;      // fine grain so it never reads as vinyl
        colors[i * 3] = tmp.r * shadeK;
        colors[i * 3 + 1] = tmp.g * shadeK;
        colors[i * 3 + 2] = tmp.b * shadeK;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
        // white base: vertexColors MULTIPLY the material colour, so the ground
        // tint is baked into the attribute instead of double-applied here.
        color: 0xffffff,
        vertexColors: true,
        roughness: pal.groundRough,
        metalness: biome === 'sea' ? 0.35 : 0.0,
        flatShading: biome === 'mountain' || biome === 'fire' || visual?.terrain === 'jagged'
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

/** Trunk with taper + bend. */
function makeTrunkGeo(h: number, r: number, rnd: () => number): THREE.BufferGeometry {
    const g = new THREE.CylinderGeometry(r * 0.5, r, h, 7, 4);
    const pos = g.attributes.position;
    const bend = (rnd() - 0.5) * 0.5;
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
function buildRidges(scene: THREE.Scene, pal: ScenePalette, rnd: () => number, noise2D: (x: number, y: number) => number) {
    const rings = [
        { r: 62, hMax: 8,  mixK: 0.58 },
        { r: 96, hMax: 14, mixK: 0.78 }
    ];
    for (const ring of rings) {
        const seg = 96;
        const verts: number[] = [];
        const hAt = (i: number) => {
            const a = (i % seg) / seg * Math.PI * 2;
            const n = noise2D(Math.cos(a) * 3.1, Math.sin(a) * 3.1);
            return Math.max(0.5, (0.3 + Math.abs(n)) * ring.hMax);
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
            color: mix(mix(pal.ground, pal.structure, 0.4), pal.fog, ring.mixK),
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

    // Crown colour: the fluff lights itself via spherized normals, so the
    // material tint is mid-foliage warmed slightly; hemi+sun paint the gradient.
    const crownTint = mix(p.foliage, p.key, 0.10);

    scene.add(scatterAt(trunkGeo, paintMat(), at, (m, pt) => {
        m.position.set(pt.x, 0, pt.z); m.scale.setScalar(pt.s);
        m.rotation.set(0, pt.r, (pt.j - 0.5) * lean);
    }));
    const conifers = scatterAt(coniferGeo, leafMatFor(crownTint), at, (m, pt) => {
        if (pt.j > 0.62) { m.scale.setScalar(0); return; }
        m.position.set(pt.x, trunkH * 0.72 * pt.s, pt.z);
        m.scale.setScalar(pt.s); m.rotation.y = pt.r;
    });
    conifers.customDepthMaterial = leafDepth();
    scene.add(conifers);
    const crowns = scatterAt(crownGeo, leafMatFor(mix(crownTint, 0xffffff, 0.06)), at, (m, pt) => {
        if (pt.j <= 0.62) { m.scale.setScalar(0); return; }
        m.position.set(pt.x, trunkH * 0.92 * pt.s, pt.z);
        m.scale.setScalar(pt.s); m.rotation.y = pt.r;
    });
    crowns.customDepthMaterial = leafDepth();
    scene.add(crowns);

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
    spires: ({ scene, at, structMat }) => {
        scene.add(scatterAt(new THREE.BoxGeometry(1.5, 7, 1.5), structMat(), at, (m, p) => {
            m.position.set(p.x, 3.5 * p.s * (0.5 + p.j), p.z);
            m.scale.set(p.s * (0.5 + p.j), p.s * (0.5 + p.j * 1.6), p.s * (0.5 + p.j));
            m.rotation.y = p.r;
        }));
    },
    blobs: ({ scene, at, pal, rnd }) => {
        const g = bakeGradient(new THREE.IcosahedronGeometry(1.6, 2), mix(pal.structure, 0x000000, 0.35), mix(pal.structure, pal.key, 0.25), rnd);
        scene.add(scatterAt(g, paintMat(), at, (m, p) => {
            m.position.set(p.x, 0.7 * p.s, p.z);
            m.scale.set(p.s * (0.8 + p.j), p.s * (0.55 + p.j * 0.7), p.s * (0.8 + p.j));
            m.rotation.y = p.r;
        }));
    },
    blocks: ({ scene, at, structMat, vis }) => {
        scene.add(scatterAt(new THREE.BoxGeometry(2.4, 2.4, 2.4), structMat(), at, (m, p) => {
            m.position.set(p.x, 1.2 * p.s * (0.4 + p.j), p.z);
            m.scale.set(p.s * (0.7 + p.j * 0.8), p.s * (0.4 + p.j * 1.4), p.s * (0.7 + p.j * 0.6));
            m.rotation.y = vis.order === 'artificial' ? p.r : Math.round(p.r * 2.55) * 0.35;
        }));
    },
    arches: ({ scene, at, structMat }) => {
        const g = new THREE.TorusGeometry(2.6, 0.42, 6, 14, Math.PI);
        scene.add(scatterAt(g, structMat(), at, (m, p) => {
            m.position.set(p.x, 0.1, p.z);
            m.scale.setScalar(p.s * (0.7 + p.j * 0.9));
            m.rotation.y = p.r;
        }));
    },
    shards: ({ scene, at, structMat }) => {
        scene.add(scatterAt(new THREE.BoxGeometry(0.28, 4.6, 2.0), structMat(), at, (m, p) => {
            m.position.set(p.x, 2.0 * p.s, p.z);
            m.scale.setScalar(p.s * (0.5 + p.j));
            m.rotation.set((p.j - 0.5) * 0.5, p.r, (p.j - 0.5) * 0.35);
        }));
    },
    // Giant mushrooms. Two parts sharing ONE spot list (the floating-canopy
    // lesson). The cap carries the place's colour identity — a mushroom
    // forest must NOT read as a green cone forest.
    fungus: ({ scene, at, pal, rnd }) => {
        const stemGeo = bakeGradient(new THREE.CylinderGeometry(0.16, 0.34, 2.6, 8),
            mix(pal.structure, 0xffffff, 0.30), mix(pal.structure, 0xffffff, 0.55), rnd);
        const capGeo = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        capGeo.scale(1.35, 0.55, 1.35);
        bakeGradient(capGeo, mix(pal.foliage, 0x000000, 0.30), mix(pal.foliage, pal.key, 0.28), rnd);
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
        const shaftGeo = bakeGradient(new THREE.CylinderGeometry(0.42, 0.52, 6.4, 10),
            mix(pal.structure, 0x000000, 0.25), mix(pal.structure, pal.key, 0.30), rnd);
        const capGeo = new THREE.BoxGeometry(1.35, 0.42, 1.35);
        bakeGradient(capGeo, mix(pal.structure, 0x000000, 0.20), mix(pal.structure, pal.key, 0.25), rnd);
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
        const geo = bakeGradient(makeTrunkGeo(3.6, 0.36, rnd),
            mix(pal.structure, 0x000000, 0.30),
            traits.glowing ? mix(pal.structure, pal.emissive, 0.55) : mix(pal.structure, pal.key, 0.20), rnd);
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
            : (bakeGradient(geo, mix(pal.structure, 0x000000, 0.30), mix(pal.structure, pal.key, 0.30), rnd), paintMat());
        scene.add(scatterAt(geo, mat, at, (m, p) => {
            m.position.set(p.x, 2 + p.j * 7, p.z);
            m.scale.setScalar(0.35 + p.j * 1.1);
        }));
    }
};
const FAM_KEYS = Object.keys(MASS_FAMILIES);

/**
 * The shared composition recipe. Silhouette precedence: the DM's explicit
 * choice > keyword traits > deterministic hash. 'none' means NONE (a place
 * empty of masses) — it used to fall through to the hash pick, which put
 * random blocks on a barren moon.
 */
function composeMasses(
    scene: THREE.Scene, pal: ScenePalette, rnd: () => number,
    traits: SceneTraits, visual: SceneVisual | null | undefined,
    structMat: () => THREE.Material, foliMat: () => THREE.Material, glowMat: () => THREE.Material
) {
    const vis = visual ?? {};
    const h = Math.floor(rnd() * 1e9);
    const fam = vis.silhouette
        ? (vis.silhouette === 'none' ? null : vis.silhouette)
        : (traits.spires ? 'spires' : FAM_KEYS[h % FAM_KEYS.length]);
    const dens = typeof vis.density === 'number' ? vis.density : 0.5;
    const nMass = Math.round(10 + dens * 26);
    const massSpots = vis.order === 'artificial'
        ? ringSpots(Math.max(6, Math.round(nMass * 0.6)), 14 + (h % 8), rnd)
        : spots(nMass, 7, 40, rnd);
    if (fam && MASS_FAMILIES[fam]) {
        MASS_FAMILIES[fam]({ scene, at: massSpots, pal, rnd, vis, traits, structMat, foliMat, glowMat });
    }
    // Enclosed spaces have a ceiling — stalactites from above.
    if (traits.enclosed) {
        scene.add(scatterAt(new THREE.ConeGeometry(0.5, 3.0, 6), structMat(), spots(34, 4, 34, rnd), (m, p) => {
            m.position.set(p.x, 9.4, p.z); m.rotation.z = Math.PI; m.scale.setScalar(0.5 + p.j);
        }));
    }
    // Growth where things grow — never in barren places, sparse places, or
    // built ones (a library does not sprout).
    if (!traits.barren && dens > 0.2 && vis.order !== 'artificial') {
        const growth = spots(Math.round(40 + dens * 90), 3, 34, rnd);
        scene.add(scatterAt(new THREE.ConeGeometry(0.4, 1.6, 5), foliMat(), growth, (m, p) => {
            m.position.set(p.x, 0.8 * p.s, p.z); m.scale.setScalar(p.s); m.rotation.y = p.r;
        }));
    }
    scene.add(scatterAt(new THREE.DodecahedronGeometry(0.7, 0), structMat(), spots(Math.round(8 + dens * 20), 4, 30, rnd), (m, p) => {
        m.position.set(p.x, 0.28, p.z); m.rotation.set(p.r, p.j * Math.PI, p.r);
    }));
    if (pal.emissiveOn) {
        scene.add(scatterAt(new THREE.SphereGeometry(0.15, 6, 6), glowMat(), spots(40, 3, 30, rnd), (m, p) => {
            m.position.set(p.x, 0.5 + p.j * 4, p.z);
        }));
    }
}

// ---------- foreground framing ----------

/**
 * The near-camera dark shapes at the bottom frame corners — the oldest trick
 * in background art. Without them the bottom corners are empty ground and the
 * eye has no "way in" to the scene. Framers are squat mounds (boulder, bush —
 * reads in any biome), DARK because they stand between the viewer and the
 * light, and they carry the place's glow the way every other mass does.
 * Placement is tuned for the phone: portrait half-width at their depth is
 * ~1.4 units, so x ~±2.4 leaves most of the mound off-frame, inner edge in.
 */
function buildFraming(scene: THREE.Scene, pal: ScenePalette, rnd: () => number, traits: SceneTraits, visual: SceneVisual | null | undefined, biome: string) {
    if (biome === 'void' || biome === 'sea') return;        // nowhere to stand
    if (visual?.silhouette === 'none') return;              // an empty place stays empty
    const mat = new THREE.MeshStandardMaterial({
        color: mix(pal.structure, 0x000000, 0.55), roughness: 0.95, flatShading: true,
        emissive: pal.emissive, emissiveIntensity: pal.emissiveOn ? 0.13 : 0
    });
    const geo = new THREE.IcosahedronGeometry(1.2, 1);
    jitterGeometry(geo, 0.25, rnd);
    const framers: Spot[] = [
        { x: -2.4 - rnd() * 0.7, z: 4.6 - rnd() * 0.8, s: 1.25 + rnd() * 0.45, r: rnd() * Math.PI, j: rnd() },
        { x: 2.5 + rnd() * 0.8, z: 4.0 - rnd() * 0.8, s: 1.1 + rnd() * 0.45, r: rnd() * Math.PI, j: rnd() }
    ];
    scene.add(scatterAt(geo, mat, framers, (m, p) => {
        m.position.set(p.x, 0.3 * p.s, p.z);
        m.scale.set(p.s * 1.4, p.s * 0.9, p.s * 1.1);
        m.rotation.set(0, p.r, (p.j - 0.5) * 0.1);
    }));
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
        const tuftMat = new THREE.MeshStandardMaterial({ color: pal.foliage, roughness: 0.9, flatShading: true });
        scene.add(scatterAt(new THREE.ConeGeometry(0.09, 0.55, 4), tuftMat,
            spots(34, 2, 9, rnd).filter(p => ok(p.x, p.z)), (m, p) => {
                m.position.set(p.x, 0.24 * p.s, p.z);
                m.scale.set(p.s * 0.6, p.s, p.s * 0.6);
                m.rotation.set((p.j - 0.5) * 0.35, p.r, (p.j - 0.5) * 0.35);
            }));
    }
}

// ---------- per-biome props ----------

function buildProps(scene: THREE.Scene, biome: string, pal: ScenePalette, rnd: () => number, roadMask?: RoadMask, traits?: SceneTraits, visual?: SceneVisual | null) {
    // In a glowing place the masses themselves carry the light — a crystal
    // cavern's rock is lit by its crystals, not just dotted with them. Without
    // this, glowing enclosed scenes render as black walls with bright dots.
    const structMat = () => new THREE.MeshStandardMaterial({
        color: pal.structure, roughness: 0.9, flatShading: true,
        emissive: pal.emissive, emissiveIntensity: pal.emissiveOn ? 0.22 : 0
    });
    const foliMat = () => new THREE.MeshStandardMaterial({ color: pal.foliage, roughness: 0.85, flatShading: true });
    const glowMat = () => new THREE.MeshStandardMaterial({
        color: pal.foliage, emissive: pal.emissive,
        emissiveIntensity: pal.emissiveOn ? 1.4 : 0, roughness: 0.6
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
        composeMasses(scene, pal, rnd, tr, visual, structMat, foliMat, glowMat);
        return;
    }

    switch (biome) {
        case 'forest': {
            // One spot list -> trunk and canopy land on the SAME tree.
            const trees = spots(80, 7, 42, rnd);
            addTrees(scene, trees, structMat(), foliMat(),
                { trunkH: 5.2, trunkR: 0.3, tiers: 3, canopyR: 1.9, canopyH: 2.6 }, pal, rnd);
            scene.add(scatterAt(new THREE.ConeGeometry(0.5, 0.9, 5), foliMat(), spots(70, 3, 28, rnd), (m, p) => {
                m.position.set(p.x, 0.45, p.z); m.rotation.y = p.r;
            }));
            break;
        }
        case 'desert': {
            scene.add(scatterAt(new THREE.DodecahedronGeometry(1.1, 0), structMat(), spots(24, 8, 40, rnd), (m, p) => {
                m.position.set(p.x, 0.4 + p.j * 0.5, p.z);
                m.scale.set(p.s * 1.3, p.s * 0.6, p.s * 1.3);
                m.rotation.set(p.j, p.r, p.j);
            }));
            scene.add(scatterAt(new THREE.CylinderGeometry(0.08, 0.2, 3.2, 5), structMat(), spots(9, 11, 36, rnd), (m, p) => {
                m.position.set(p.x, 1.6, p.z); m.rotation.z = (p.j - 0.5) * 0.4;
            }));
            break;
        }
        case 'arctic': {
            scene.add(scatterAt(new THREE.ConeGeometry(0.9, 4.5, 4), foliMat(), spots(42, 7, 42, rnd), (m, p) => {
                m.position.set(p.x, 2.2 * p.s, p.z); m.scale.setScalar(p.s);
                m.rotation.set((p.j - 0.5) * 0.3, p.r, (p.j - 0.5) * 0.3);
            }));
            scene.add(scatterAt(new THREE.IcosahedronGeometry(0.8, 0), structMat(), spots(26, 5, 34, rnd), (m, p) => {
                m.position.set(p.x, 0.3, p.z); m.scale.set(p.s, 0.6, p.s);
            }));
            break;
        }
        case 'sea': {
            scene.add(scatterAt(new THREE.DodecahedronGeometry(1.4, 0), structMat(), spots(15, 9, 38, rnd), (m, p) => {
                m.position.set(p.x, -0.2 + p.j * 0.8, p.z);
                m.scale.set(p.s, p.s * 0.9, p.s); m.rotation.set(p.j, p.r, p.j);
            }));
            break;
        }
        case 'mountain': {
            scene.add(scatterAt(new THREE.ConeGeometry(5, 13, 5), structMat(), spots(15, 22, 46, rnd), (m, p) => {
                m.position.set(p.x, 5.5 * p.s, p.z);
                m.scale.set(p.s, p.s * (0.7 + p.j), p.s); m.rotation.y = p.r;
            }));
            scene.add(scatterAt(new THREE.DodecahedronGeometry(0.9, 0), structMat(), spots(32, 5, 30, rnd), (m, p) => {
                m.position.set(p.x, 0.35, p.z); m.rotation.set(p.j, p.r, p.j);
            }));
            break;
        }
        case 'underground': {
            scene.add(scatterAt(new THREE.ConeGeometry(0.7, 3.4, 6), structMat(), spots(48, 4, 34, rnd), (m, p) => {
                m.position.set(p.x, 1.7 * p.s, p.z); m.scale.setScalar(p.s);
            }));
            scene.add(scatterAt(new THREE.ConeGeometry(0.5, 2.8, 6), structMat(), spots(38, 4, 34, rnd), (m, p) => {
                m.position.set(p.x, 9.2, p.z); m.rotation.z = Math.PI; m.scale.setScalar(p.s);
            }));
            scene.add(scatterAt(new THREE.SphereGeometry(0.14, 6, 6), glowMat(), spots(28, 4, 28, rnd), (m, p) => {
                m.position.set(p.x, 0.4 + p.j * 3.5, p.z);
            }));
            break;
        }
        case 'urban': {
            const blocks = spots(44, 13, 46, rnd);
            scene.add(scatterAt(new THREE.BoxGeometry(3, 9, 3), structMat(), blocks, (m, p) => {
                m.position.set(p.x, 4.5 * (0.4 + p.j * 1.8), p.z);
                m.scale.set(p.s, 0.4 + p.j * 1.8, p.s);
                m.rotation.y = Math.round(p.r) * (Math.PI / 4);
            }));
            scene.add(scatterAt(new THREE.SphereGeometry(0.16, 6, 6), glowMat(), spots(44, 8, 42, rnd), (m, p) => {
                m.position.set(p.x, 1.4 + p.j * 6, p.z);
            }));
            break;
        }
        case 'swamp': {
            const trees = spots(42, 6, 40, rnd);
            addTrees(scene, trees, structMat(), foliMat(),
                { trunkH: 4.6, trunkR: 0.44, tiers: 2, canopyR: 1.3, canopyH: 1.9, lean: 0.5 }, pal, rnd);
            scene.add(scatterAt(new THREE.ConeGeometry(0.1, 1.5, 4), foliMat(), spots(140, 3, 30, rnd), (m, p) => {
                m.position.set(p.x, 0.75, p.z); m.rotation.z = (p.j - 0.5) * 0.3;
            }));
            scene.add(scatterAt(new THREE.SphereGeometry(0.09, 5, 5), glowMat(), spots(32, 4, 26, rnd), (m, p) => {
                m.position.set(p.x, 0.5 + p.j * 1.8, p.z);
            }));
            break;
        }
        case 'plains': {
            scene.add(scatterAt(new THREE.ConeGeometry(0.14, 0.7, 4), foliMat(), spots(240, 2, 42, rnd), (m, p) => {
                m.position.set(p.x, 0.35, p.z); m.rotation.z = (p.j - 0.5) * 0.35;
            }));
            scene.add(scatterAt(new THREE.DodecahedronGeometry(0.5, 0), structMat(), spots(18, 6, 36, rnd), (m, p) => {
                m.position.set(p.x, 0.2, p.z); m.rotation.set(p.j, p.r, p.j);
            }));
            break;
        }
        case 'ruin': {
            scene.add(scatterAt(new THREE.CylinderGeometry(0.5, 0.55, 6, 8), structMat(), spots(22, 8, 36, rnd), (m, p) => {
                const broken = 0.25 + p.j * 0.85;
                m.position.set(p.x, 3 * broken, p.z); m.scale.set(1, broken, 1);
                m.rotation.z = p.j > 0.75 ? (p.j - 0.5) * 0.35 : 0;
            }));
            scene.add(scatterAt(new THREE.BoxGeometry(1.4, 0.5, 1.4), structMat(), spots(28, 5, 30, rnd), (m, p) => {
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
            scene.add(scatterAt(new THREE.DodecahedronGeometry(1.3, 0), structMat(), spots(28, 7, 40, rnd), (m, p) => {
                m.position.set(p.x, 0.3 + p.j * 0.8, p.z);
                m.scale.set(p.s, p.s * (0.7 + p.j * 1.5), p.s);
                m.rotation.set(p.j, p.r, p.j);
            }));
            scene.add(scatterAt(new THREE.SphereGeometry(0.13, 5, 5), glowMat(), spots(64, 3, 32, rnd), (m, p) => {
                m.position.set(p.x, 0.3 + p.j * 4.5, p.z);
            }));
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
                const st = new THREE.Mesh(bakeGradient(makeRockGeo(rnd), mix(pal.structure, 0x000000, 0.4), mix(pal.structure, pal.key, 0.25), rnd), paintMat());
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
            const stoneGeo = bakeGradient(makeRockGeo(rnd), mix(pal.structure, 0x000000, 0.4), mix(pal.structure, pal.key, 0.25), rnd);
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

// ---------- weather ----------

function buildWeather(scene: THREE.Scene, weather: string, pal: ScenePalette) {
    if (weather !== 'rain' && weather !== 'snow') return;
    const snow = weather === 'snow';
    const n = snow ? 1400 : 2200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i += 3) {
        pos[i] = (Math.random() - 0.5) * 70;
        pos[i + 1] = Math.random() * 22;
        pos[i + 2] = (Math.random() - 0.5) * 70;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: snow ? 0xffffff : 0xbcd0e0,
        size: snow ? 0.16 : 0.075,
        transparent: true,
        opacity: snow ? 0.95 : 0.55,
        depthWrite: false
    });
    const p = new THREE.Points(geo, mat);
    p.userData.isPrecip = true;
    p.userData.fallSpeed = snow ? 0.035 : 0.5;
    p.userData.drift = snow;
    scene.add(mark(p));
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

// ---------- ambient motes ----------

/**
 * Drifting motes — the single cheapest thing that makes a static stylised scene
 * feel ALIVE. Dust in daylight, embers where the biome glows, snow-lit flecks
 * in the cold. One Points system, animated in the render loop like precip.
 * Without this the world is frozen: only the camera and precipitation moved,
 * so a calm/clear scene read as a screenshot, not a place.
 */
function buildMotes(scene: THREE.Scene, biome: string, pal: ScenePalette, rnd: () => number, traits?: SceneTraits) {
    // Fireflies: after dark in living biomes, the dust motes become embers of
    // green-gold light (and pulse — see the isMote handler in the diorama).
    const fireflies = pal.starAmount > 0.5 && ['forest', 'crossroads', 'swamp', 'plains'].includes(biome);
    // Marine snow: underwater, the motes are pale flecks that SINK slowly.
    const marine = !!traits?.submerged;
    const glowy = !marine && (pal.emissiveOn || fireflies);
    const n = marine ? 110 : glowy ? 90 : 60;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        pos[i * 3]     = (rnd() - 0.5) * 46;
        pos[i * 3 + 1] = rnd() * 12 + 0.5;
        pos[i * 3 + 2] = (rnd() - 0.5) * 46;
        phase[i] = rnd() * Math.PI * 2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    // Embers rise; dust/pollen drift; marine snow sinks. Colour picks up the
    // biome's own light.
    const color = marine ? 0xd8ecf4 : glowy ? (pal.emissiveOn ? pal.emissive : 0xd8e87a) : mix(pal.foliage, 0xffffff, 0.55);
    const mat = new THREE.PointsMaterial({
        color,
        size: marine ? 0.07 : glowy ? 0.14 : 0.085,
        transparent: true,
        opacity: marine ? 0.45 : glowy ? 0.9 : 0.5,
        depthWrite: false,
        blending: glowy ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const p = new THREE.Points(geo, mat);
    p.userData.isMote = true;
    p.userData.glowy = glowy;
    p.userData.rise = marine ? -0.005 : glowy ? 0.012 : 0.004;   // embers climb, snow sinks
    p.userData.phase = phase;
    scene.add(mark(p));
}

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

/**
 * The single biggest fix for "looks like shit polygon": big soft fog banks
 * drifting through the mid-ground + low ground mist that dissolves the base of
 * every tree and rock. Overlapping soft-alpha billboards read as volume and
 * break up the hard low-poly edges, so the geometry reads as atmosphere rather
 * than as cheap flat shapes. Tinted to the scene's own fog colour.
 */
function buildAtmosphere(scene: THREE.Scene, pal: ScenePalette, rnd: () => number, traits?: SceneTraits) {
    const tex = softSprite();
    const fogCol = new THREE.Color(pal.fog);
    // Enclosed glowing spaces: the mist itself carries the glow colour — this
    // is "the air is lit", the difference between a cavern and a black room.
    if (traits?.enclosed && pal.emissiveOn) fogCol.lerp(new THREE.Color(pal.emissive), 0.30);

    // Mid-ground fog banks — the main edge-hiding layer. Few but large; low
    // opacity to keep overdraw (fillrate) sane on phones.
    for (let i = 0; i < 16; i++) {
        const mat = new THREE.SpriteMaterial({
            map: tex, color: fogCol,
            transparent: true, opacity: 0.07 + rnd() * 0.09,
            depthWrite: false, fog: false
        });
        const sp = new THREE.Sprite(mat);
        const ang = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.2;   // biased toward the view
        const r = 9 + rnd() * 32;
        sp.position.set(Math.cos(ang) * r, 1.5 + rnd() * 6.5, Math.sin(ang) * r);
        const w = 11 + rnd() * 18;
        sp.scale.set(w, w * (0.5 + rnd() * 0.2), 1);
        sp.userData.isFogBank = true;
        sp.userData.driftX = (rnd() - 0.5) * 0.012;
        sp.userData.phase = rnd() * Math.PI * 2;
        sp.userData.baseY = sp.position.y;
        scene.add(mark(sp));
    }

    // Ground mist — low, dense-ish soft points so tree/rock bases melt into it.
    // Enclosed scenes get more: the floor must never collapse to a black void.
    const n = traits?.enclosed ? 110 : 70;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        pos[i * 3]     = (rnd() - 0.5) * 62;
        pos[i * 3 + 1] = 0.3 + rnd() * 2.4;
        pos[i * 3 + 2] = (rnd() - 0.5) * 62;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mmat = new THREE.PointsMaterial({
        map: tex, color: fogCol, size: 7, sizeAttenuation: true,
        transparent: true, opacity: traits?.enclosed ? 0.19 : 0.14, depthWrite: false, fog: false
    });
    const mist = new THREE.Points(geo, mmat);
    mist.userData.isGroundMist = true;
    scene.add(mark(mist));
}

/**
 * Rebuild the stage for `tags` using `pal`. Caller owns lights + clear colour.
 * Deterministic per (biome, location) so a place stays the same place.
 */
export function generateScene(scene: THREE.Scene, tags: SceneTags | any, pal: ScenePalette) {
    disposeProcedural(scene);

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

    const roadMask = biome === 'crossroads' || biome === 'urban' ? makeRoadMask(noise2D) : undefined;
    const ground = buildGround(pal, biome, noise2D, roadMask, traits, t.visual);
    if (ground) scene.add(ground);

    buildProps(scene, biome, pal, rnd, roadMask, traits, t.visual);
    buildFraming(scene, pal, rnd, traits, t.visual, biome);
    buildNearField(scene, pal, rnd, roadMask, traits, biome);
    // Traits layer specifics onto KNOWN biomes too — underground + "crystal"
    // in the text = a crystal cavern without any new biome existing.
    if (traits.crystals && biome !== 'synthetic') addCrystals(scene, pal, traits, rnd, false);
    // Glow without crystals still pools — luminous places must LIGHT their
    // ground, not just sparkle (the lantern lesson).
    if (traits.glowing && !traits.crystals) addGlowPools(scene, pal, traits, rnd);
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
    // Precip is open-sky only — it does not rain in a cavern or snow in the void.
    if (!traits.enclosed && !traits.space && !traits.submerged) buildWeather(scene, (t.weather as string) ?? 'clear', pal);
    buildMotes(scene, biome, pal, rnd, traits);
    buildAtmosphere(scene, pal, rnd, traits);
    // Horizon ridgelines everywhere a horizon makes sense.
    if (biome !== 'underground' && biome !== 'void' && !traits.enclosed && !traits.space && !traits.submerged) buildRidges(scene, pal, rnd, noise2D);

    // Depth fog, tuned so the MASS BAND (10-30 units out) keeps its identity:
    // at the old ×1.3 even a clear forest was 70% fogged at 15 units — the
    // universal murk wash. ×0.85 melts the ridgelines (60-95 units) into the
    // sky while leaving the set readable. Capped at 0.10: past that FogExp2 is
    // a void generator no matter the scene.
    scene.fog = new THREE.FogExp2(pal.fog, Math.min(Math.max(pal.fogDensity * 0.85, 0.02), 0.10));
}
