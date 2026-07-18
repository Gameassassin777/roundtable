// One palette resolver. See CLAUDE.md "The contrast law".
//
// Scene state (biome / time / mood / weather) resolves to exactly ONE palette
// through exactly ONE function. The previous system had four independent CSS
// layers racing on specificity, which silently produced 1.01-contrast scenes.
// Never reintroduce that. Everything the stage needs comes out of resolveScene().

/**
 * The visual parameter basis — how INFINITE scene combinations stay renderable.
 *
 * The space of scenes the DM can invent is unbounded, but scenes don't need
 * unbounded parameters to LOOK distinct — like RGB spanning all colour with
 * three axes, a small set of continuous/enumerated axes spans the perceptual
 * space: openness x silhouette family x density x terrain x glow x order,
 * times the continuous palette. Every point in this box renders coherently.
 *
 * The infinite text->point mapping is done by the DM ITSELF: the Director
 * emits `visual` inside scene_tags_change, describing its invention in the
 * stage's own parameter language ("a bazaar of hungry mirrors" -> shards,
 * artificial, silver glow). LLMs are unboundedly good at exactly that mapping.
 * Fallback chain when `visual` is absent: keyword traits -> deterministic hash.
 * Nothing ever renders as a default.
 */
export type SceneVisual = {
    openness?: 'enclosed' | 'open' | 'space' | 'submerged';
    silhouette?: 'spires' | 'blobs' | 'blocks' | 'arches' | 'shards'
               | 'fungus' | 'columns' | 'tendrils' | 'orbs' | 'none';
    density?: number;                       // 0 barren .. 1 overgrown
    terrain?: 'flat' | 'rolling' | 'jagged' | 'cratered';
    glow?: string | null;                   // '#rrggbb'
    order?: 'natural' | 'artificial';
    palette_hint?: string | null;           // the place's signature hue — '#rrggbb' or a hue word
};

export type SceneTags = {
    biome?: string;          // normalised family, or '' if the AI invented something new
    biomeRaw?: string;       // what the AI actually said — carries the uniqueness
    time_of_day?: string;
    mood?: string;
    weather?: string;
    location?: string;
    worldSeed?: string;      // room code — makes every world's forest its own forest
    visual?: SceneVisual | null;   // the DM's own visual direction (see above)
};

/**
 * Traits: how the stage understands scenes NOBODY planned for.
 *
 * A fixed biome list can never cover what the AI DM invents ("glowing crystal
 * cavern", "moon surface", "a bazaar of hungry mirrors"). Instead of asking
 * "which of my 13 biomes is this?", extractTraits asks "what PROPERTIES does
 * this text imply?" — enclosed, crystalline, cratered, barren, glowing, and a
 * glow colour. Traits then LAYER over whatever base gets picked: a known biome
 * gets trait props added on top (underground + crystals = crystal cavern), an
 * unknown one synthesizes its whole recipe from traits + hash. Both stay
 * deterministic per world.
 */
export type SceneTraits = {
    enclosed: boolean;   // cavern/hall: no sky, no horizon, stalactites
    crystals: boolean;
    craters: boolean;    // moon/asteroid terrain
    space: boolean;      // black starry sky regardless of time
    submerged: boolean;  // underwater: teal fog walls, light shafts, marine snow
    barren: boolean;     // no growth, no grass, no butterflies
    spires: boolean;
    glowing: boolean;
    glowColor?: number;
};

/** Overlay the DM's explicit visual direction onto keyword-derived traits. */
export function applyVisual(traits: SceneTraits, v?: SceneVisual | null): SceneTraits {
    if (!v) return traits;
    const out = { ...traits };
    if (v.openness === 'enclosed') { out.enclosed = true; out.space = false; out.submerged = false; }
    if (v.openness === 'space') { out.space = true; out.enclosed = false; out.submerged = false; }
    if (v.openness === 'open') { out.enclosed = false; out.space = false; out.submerged = false; }
    if (v.openness === 'submerged') { out.submerged = true; out.enclosed = false; out.space = false; }
    if (typeof v.density === 'number' && v.density <= 0.15) out.barren = true;
    if (typeof v.density === 'number' && v.density > 0.15) out.barren = false;
    if (v.terrain === 'cratered') out.craters = true;
    if (v.silhouette === 'spires') out.spires = true;
    if (v.glow) {
        const hx = parseInt(String(v.glow).replace('#', ''), 16);
        if (!Number.isNaN(hx)) { out.glowing = true; out.glowColor = hx; }
    }
    return out;
}

export function extractTraits(raw: string): SceneTraits {
    const t = (raw || '').toLowerCase();
    const has = (re: RegExp) => re.test(t);
    let glowColor: number | undefined;
    if (has(/azure|sapphire|cobalt|blue/)) glowColor = 0x55aaff;
    else if (has(/emerald|verdant|jade|green/)) glowColor = 0x5fe89a;
    else if (has(/crimson|blood|ember|scarlet|red/)) glowColor = 0xff5a3a;
    else if (has(/gold|amber|honey/)) glowColor = 0xffc050;
    else if (has(/violet|amethyst|purple|arcane/)) glowColor = 0xbb77ff;
    const traits: SceneTraits = {
        enclosed: has(/cavern|cave|underdark|tunnel|crypt|tomb|catacomb|chamber|dungeon|mine|vault|hall of/),
        crystals: has(/crystal|gem|shard|geode|quartz|prism/),
        craters: has(/moon|lunar|crater|asteroid|meteor|regolith/),
        space: has(/moon|lunar|asteroid|cosmic|astral|celestial|orbit|starfield|between the stars/),
        submerged: has(/underwater|submerged|drowned|seafloor|sea floor|ocean floor|abyss|sunken|coral|beneath the waves/),
        barren: has(/moon|lunar|barren|wasteland|ashen|desolate|blasted|lifeless|bone[- ]?field/),
        spires: has(/spire|obelisk|pillar|monolith|cathedral|tower/),
        glowing: has(/glow|lumin|radiant|phosphor|shimmer|neon|bioluminescent/),
        glowColor
    };
    if ((traits.glowing || traits.crystals) && traits.glowColor === undefined) traits.glowColor = 0x7fe8ff;
    return traits;
}

export type ScenePalette = {
    sky: number;          // zenith colour of the sky dome
    fog: number;
    fogDensity: number;

    // --- celestial: light needs a SOURCE, or everything reads as flat fill ---
    sunDir: [number, number, number];   // normalised direction TO the sun/moon
    sunColor: number;
    sunSize: number;                    // angular radius of the disc
    sunGlow: number;                    // bloom-ish halo strength around it
    horizonGlow: number;                // scattering band near the horizon
    starAmount: number;                 // 0 day .. 1 night
    cloud: number;                      // 0 clear .. 1 solid overcast
    cloudColor: number;
    exposure: number;                   // ACES tone-mapping exposure
    ground: number;
    groundRough: number;
    structure: number;    // trunks, stone, buildings — the solid mass
    foliage: number;      // canopy, reeds, growth, the biome's living accent
    key: number;          // key light colour
    keyIntensity: number;
    hemiSky: number;
    hemiGround: number;
    hemiIntensity: number;
    ambient: number;
    ambientIntensity: number;
    emissive: number;     // embers, glow, magic — biome's light source
    emissiveOn: boolean;

    // --- film stack + rim: presentation knobs for the bake pipeline ---
    rimColor: number;     // back/rim light — carries the sky so silhouettes separate
    rimIntensity: number;
    gradeSat: number;     // bake grade: saturation (~0.95..1.22)
    gradeCon: number;     // bake grade: S-curve contrast (~0.10..0.26)
    gradeLift: number;    // bake grade: shadow tint colour (hex), black = no lift
    bloom: number;        // bake bloom strength (~0.25..1.0)
};

// ---------- colour helpers (operate on 0xRRGGBB ints) ----------

const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const hex = (r: number, g: number, b: number) =>
    (Math.max(0, Math.min(255, Math.round(r))) << 16) |
    (Math.max(0, Math.min(255, Math.round(g))) << 8) |
    Math.max(0, Math.min(255, Math.round(b)));

/** Linear blend a→b by t (0..1). */
export function mix(a: number, b: number, t: number): number {
    const [ar, ag, ab] = rgb(a), [br, bg, bb] = rgb(b);
    return hex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** Scale brightness. k<1 darkens. */
function shade(c: number, k: number): number {
    const [r, g, b] = rgb(c);
    return hex(r * k, g * k, b * k);
}

/** Push saturation away from the colour's own grey. k>1 saturates. */
function saturate(c: number, k: number): number {
    const [r, g, b] = rgb(c);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return hex(l + (r - l) * k, l + (g - l) * k, l + (b - l) * k);
}

// ---------- hue machinery: the basis for uniqueness ----------

export function hashStr(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

function toHsl(c: number): [number, number, number] {
    const [r, g, b] = rgb(c).map(v => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
        if (mx === r) h = ((g - b) / d) % 6;
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
    }
    h = (h * 60 + 360) % 360;
    const l = (mx + mn) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return [h, s, l];
}

function fromHsl(h: number, s: number, l: number): number {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] =
        h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
        h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Rotate hue, nudge saturation and lightness — same identity, different flavour. */
function shift(c: number, deg: number, satK: number, lightK = 1): number {
    const [h, s, l] = toHsl(c);
    return fromHsl(h + deg, s * satK, l * lightK);
}

/**
 * Saturation floor. Per-world variation can roll a desaturating shift, and on
 * an already-dusty biome that compounds into mud — the exact drab brown the
 * whole rebuild exists to kill. Variation may change a world's flavour; it may
 * not drain the colour out of it.
 */
const SAT_FLOOR = 0.16;
function floorSat(c: number, floor = SAT_FLOOR): number {
    const [h, s, l] = toHsl(c);
    if (s >= floor) return c;
    // At l≈1 no saturation can exist — white eats chroma (the arctic whiteout
    // pin: variation's lightK pushed snow to l=1 and the floor had no grip).
    // Trade a whisper of lightness so the floor actually exists.
    return fromHsl(h, floor, Math.min(l, 1 - floor * 0.5));
}

/**
 * Perceptual-ish colour distance (weighted RGB). Unlike a contrast ratio this
 * one sees HUE — two colours can have identical luminance and be utterly
 * different colours, which a contrast ratio reports as "identical".
 */
export function colorDistance(a: number, b: number): number {
    const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
    const rm = (r1 + r2) / 2;
    const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/**
 * Guarantee the stage never collapses into one flat field. Ground is pushed
 * away from sky until they're perceptually separable.
 *
 * This is a structural guard, not taste. Two independent times this project
 * shipped an invisible scene — beige-on-beige, then black-on-black — because
 * separation was left to hand-tuned values. Enforce it instead of trusting the
 * table. Biomes whose ground is BRIGHTER than their sky (snow) are exactly the
 * case that broke hand-tuning: darkening ground converged it onto the sky.
 */
const MIN_SEPARATION = 55;
function enforceSeparation(sky: number, ground: number): number {
    let g = ground;
    let i = 0;
    while (colorDistance(sky, g) < MIN_SEPARATION && i++ < 32) {
        g = luminance(sky) >= luminance(g) ? shade(g, 0.90) : mix(g, 0xffffff, 0.10);
    }
    return g;
}

/** Relative luminance 0..1 — used by the contrast guard. */
export function luminance(c: number): number {
    const [r, g, b] = rgb(c).map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ---------- biome bases (authored at "day") ----------
// Real colour. Saturated, distinct, and NEVER matched to the page background.

type BiomeBase = {
    sky: number; fog: number; fogDensity: number;
    ground: number; groundRough: number;
    structure: number; foliage: number;
    key: number; hemiSky: number; hemiGround: number;
    ambient: number; emissive: number; emissiveOn: boolean;
};

const BIOMES: Record<string, BiomeBase> = {
    forest: {
        sky: 0x7fb069, fog: 0x3d6b35, fogDensity: 0.055,
        ground: 0x2f4a26, groundRough: 0.95, structure: 0x3b2a1c, foliage: 0x4a8c3f,
        key: 0xdcf0a8, hemiSky: 0x9fd47f, hemiGround: 0x2f4a26,
        ambient: 0x3d6b35, emissive: 0x000000, emissiveOn: false
    },
    desert: {
        sky: 0xf2c46b, fog: 0xe0a95c, fogDensity: 0.028,
        ground: 0xd49a52, groundRough: 1.0, structure: 0x8a5f34, foliage: 0x7a8a44,
        key: 0xfff0c0, hemiSky: 0xf7d38a, hemiGround: 0xc08a44,
        ambient: 0xe0a95c, emissive: 0x000000, emissiveOn: false
    },
    arctic: {
        sky: 0x9fc6e8, fog: 0xd6ecf7, fogDensity: 0.06,
        ground: 0xeaf4fb, groundRough: 0.55, structure: 0x8fb4cf, foliage: 0xbfe0f0,
        key: 0xe8f6ff, hemiSky: 0xbfdff5, hemiGround: 0xcfe4ef,
        ambient: 0xa8cbe4, emissive: 0x000000, emissiveOn: false
    },
    sea: {
        sky: 0x5fb3c9, fog: 0x2d7188, fogDensity: 0.045,
        ground: 0x18576b, groundRough: 0.25, structure: 0x4a5a5f, foliage: 0x7fd4dd,
        key: 0xd8f6ff, hemiSky: 0x8fd6e8, hemiGround: 0x175a6e,
        ambient: 0x2d7188, emissive: 0x000000, emissiveOn: false
    },
    mountain: {
        sky: 0x8fa8c4, fog: 0x93a4b8, fogDensity: 0.05,
        ground: 0x5a606c, groundRough: 0.9, structure: 0x40464f, foliage: 0x6a7a5f,
        key: 0xf0f4ff, hemiSky: 0xb0c4dd, hemiGround: 0x50565f,
        ambient: 0x93a4b8, emissive: 0x000000, emissiveOn: false
    },
    underground: {
        sky: 0x0a0806, fog: 0x150f0a, fogDensity: 0.11,
        ground: 0x2c2118, groundRough: 0.95, structure: 0x413425, foliage: 0x5a4a2f,
        key: 0xffa851, hemiSky: 0x4a3a24, hemiGround: 0x140f0a,
        ambient: 0x241a10, emissive: 0xff8a2a, emissiveOn: true
    },
    urban: {
        sky: 0x9aa4b0, fog: 0x707a86, fogDensity: 0.05,
        ground: 0x4c5158, groundRough: 0.8, structure: 0x6a6f78, foliage: 0xb08a4a,
        key: 0xf4efdf, hemiSky: 0xaab4c0, hemiGround: 0x44494f,
        ambient: 0x707a86, emissive: 0xffb14a, emissiveOn: true
    },
    swamp: {
        sky: 0x6d7f42, fog: 0x3f4a28, fogDensity: 0.095,
        ground: 0x33401f, groundRough: 0.9, structure: 0x2f2a1c, foliage: 0x6f8a3a,
        key: 0xc8d68a, hemiSky: 0x7f9450, hemiGround: 0x2a331a,
        ambient: 0x3f4a28, emissive: 0x8aff6a, emissiveOn: true
    },
    plains: {
        sky: 0x9fd0f0, fog: 0xc4d99a, fogDensity: 0.022,
        ground: 0x86a84c, groundRough: 0.95, structure: 0x7a6a4a, foliage: 0xc4b45f,
        key: 0xfff6d8, hemiSky: 0xa8d8f5, hemiGround: 0x7a9a44,
        ambient: 0xc4d99a, emissive: 0x000000, emissiveOn: false
    },
    ruin: {
        sky: 0xa89f8a, fog: 0x8f8672, fogDensity: 0.06,
        ground: 0x6e6353, groundRough: 0.95, structure: 0x8f8474, foliage: 0x5f6b44,
        key: 0xf0e6cf, hemiSky: 0xb8ae98, hemiGround: 0x5f5648,
        ambient: 0x8f8672, emissive: 0x000000, emissiveOn: false
    },
    void: {
        sky: 0x0c0a1a, fog: 0x1c1638, fogDensity: 0.075,
        ground: 0x151030, groundRough: 0.4, structure: 0x2f2456, foliage: 0x7d5fc4,
        key: 0xb89fff, hemiSky: 0x3a2f6e, hemiGround: 0x0c0a1a,
        ambient: 0x1c1638, emissive: 0x9a6fff, emissiveOn: true
    },
    fire: {
        sky: 0x8f2f0e, fog: 0xc4471a, fogDensity: 0.08,
        ground: 0x3a1a0c, groundRough: 0.85, structure: 0x2a1208, foliage: 0xff7a2a,
        key: 0xffb066, hemiSky: 0xd45a1c, hemiGround: 0x2a1208,
        ambient: 0xc4471a, emissive: 0xff5f0a, emissiveOn: true
    },
    crossroads: {
        // The default seed. A real dusty crossroads at the edge of an unfinished
        // map — not a neutral placeholder. It must look like somewhere.
        sky: 0xbcd2e0, fog: 0xb8b49a, fogDensity: 0.035,
        ground: 0x9a8a63, groundRough: 0.95, structure: 0x6b5a42, foliage: 0x8a9a5a,
        key: 0xfff2d8, hemiSky: 0xc8dcea, hemiGround: 0x8a7a56,
        ambient: 0xb8b49a, emissive: 0x000000, emissiveOn: false
    }
};

// ---------- time-of-day transform ----------
// Applied to the biome base rather than enumerated per-combination. This is why
// 13 biomes x 4 times is 17 authored values, not 52 hand-tuned ones.

type TimeXform = {
    tint: number; skyTint: number; t: number;      // colour to pull toward, and how far
    bright: number; skyBright: number;             // ground/mass vs sky brightness — kept SEPARATE
    keyK: number; hemiK: number; ambK: number;
    sat: number; emissiveBoost: boolean;
    // Celestial. Elevation drives shadow length: a low sun rakes across the
    // ground and is most of why morning/dusk look good.
    sunDir: [number, number, number];
    sunColor: number; sunSize: number; sunGlow: number;
    horizonGlow: number; starAmount: number; exposure: number;
    cloudColor: number;
};

// `bright` darkens ground/structures; `skyBright` darkens the sky. They are
// separate on purpose: a scene reads because mass silhouettes AGAINST the sky.
// Collapsing them is how night became flat black (sky #0d1110 on ground #0b0f15),
// which is the same invisibility as the old beige-on-beige, just inverted.
const norm = (v: [number, number, number]): [number, number, number] => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
};

const TIMES: Record<string, TimeXform> = {
    morning: {
        tint: 0xffd9a0, skyTint: 0xffc98a, t: 0.18, bright: 1.02, skyBright: 1.08,
        keyK: 1.15, hemiK: 0.95, ambK: 0.85, sat: 1.05, emissiveBoost: false,
        sunDir: norm([0.75, 0.26, -0.60]), sunColor: 0xffd39a, sunSize: 0.030, sunGlow: 0.55,
        horizonGlow: 0.70, starAmount: 0, exposure: 1.06, cloudColor: 0xfff0dc
    },
    day: {
        tint: 0xffffff, skyTint: 0xffffff, t: 0.00, bright: 1.00, skyBright: 1.00,
        keyK: 1.00, hemiK: 1.00, ambK: 0.80, sat: 1.00, emissiveBoost: false,
        sunDir: norm([0.40, 0.92, 0.22]), sunColor: 0xfff6e2, sunSize: 0.020, sunGlow: 0.30,
        horizonGlow: 0.30, starAmount: 0, exposure: 1.00, cloudColor: 0xffffff
    },
    dusk: {
        tint: 0xff8a3a, skyTint: 0xff7a2a, t: 0.34, bright: 0.68, skyBright: 0.95,
        keyK: 0.85, hemiK: 0.70, ambK: 0.70, sat: 1.20, emissiveBoost: true,
        // Sun on the deck: long raking shadows, huge disc, hot horizon band.
        sunDir: norm([-0.82, 0.10, -0.56]), sunColor: 0xff7a30, sunSize: 0.050, sunGlow: 0.95,
        horizonGlow: 1.00, starAmount: 0.22, exposure: 1.12, cloudColor: 0xffc9a0
    },
    night: {
        // Rebalanced AFTER ACES landed. These values were authored against a raw
        // linear buffer; the tone curve crushes the low end, so the old numbers
        // turned the foreground pure black — invisible-night again, the same
        // failure as invisible-beige. Lift ambient/hemi and open the exposure:
        // moonlight should reveal the ground, not erase it.
        tint: 0x16264f, skyTint: 0x16294f, t: 0.72, bright: 0.34, skyBright: 0.82,
        keyK: 0.55, hemiK: 0.62, ambK: 0.85, sat: 0.90, emissiveBoost: true,
        sunDir: norm([-0.45, 0.70, -0.55]), sunColor: 0xbcd0ff, sunSize: 0.026, sunGlow: 0.60,
        horizonGlow: 0.22, starAmount: 1, exposure: 1.55, cloudColor: 0x4a5878
    }
};

// ---------- mood transform ----------
// Mood touches light + accent only. It must never fight the biome for ground/sky
// identity, or you get the old four-layer mud.

const MOODS: Record<string, { key: number; t: number; fogK: number; sat: number }> = {
    calm:      { key: 0xc8e0a8, t: 0.12, fogK: 0.90, sat: 0.95 },
    tense:     { key: 0xff9a6a, t: 0.18, fogK: 1.15, sat: 1.10 },
    dark:      { key: 0x6a5a7a, t: 0.28, fogK: 1.30, sat: 0.80 },
    corrupt:   { key: 0x9a6fff, t: 0.30, fogK: 1.25, sat: 1.15 },
    warm:      { key: 0xffb060, t: 0.22, fogK: 0.85, sat: 1.10 },
    sorrowful: { key: 0x7a90c4, t: 0.24, fogK: 1.20, sat: 0.75 },
    hopeful:   { key: 0xffe08a, t: 0.20, fogK: 0.75, sat: 1.10 },
    mystical:  { key: 0x8a7ee0, t: 0.26, fogK: 1.10, sat: 1.15 },
    violent:   { key: 0xff4a3a, t: 0.26, fogK: 1.20, sat: 1.20 }
};

// ---------- weather transform ----------

const WEATHER: Record<string, { fogK: number; fogTint: number; t: number; keyK: number; cloud: number }> = {
    rain:     { fogK: 1.7, fogTint: 0x5a6a78, t: 0.30, keyK: 0.60, cloud: 0.95 },
    snow:     { fogK: 1.5, fogTint: 0xd8e0e8, t: 0.35, keyK: 0.75, cloud: 0.85 },
    fog:      { fogK: 3.0, fogTint: 0xb8b8a8, t: 0.45, keyK: 0.55, cloud: 0.55 },
    overcast: { fogK: 1.3, fogTint: 0x8a8a78, t: 0.25, keyK: 0.65, cloud: 1.0 },
    clear:    { fogK: 1.0, fogTint: 0x000000, t: 0.00, keyK: 1.00, cloud: 0.30 },
    none:     { fogK: 1.0, fogTint: 0x000000, t: 0.00, keyK: 1.00, cloud: 0.30 }
};

/**
 * Build a coherent palette for a biome NOBODY authored — the AI invents places
 * ("an obsidian cathedral", "a floating bazaar") and a fixed 13-entry table
 * would collapse all of them onto the default crossroads. The world is
 * generative; the stage has to be too. Derived from the string, so the same
 * invented place always looks like itself.
 */
function synthesizeBiome(raw: string): BiomeBase {
    const h = hashStr(raw);
    const hue = h % 360;
    const alt = (hue + 150 + (h >> 9) % 60) % 360;   // complement-ish for foliage
    const sat = 0.34 + ((h >> 3) % 28) / 100;         // 0.34..0.61 — invented places stay colourful

    // Synthesized at DAYLIGHT lightness. Darkness is a TIME/OPENNESS property
    // (night transform, enclosed trait) — never a hash roll. The old `dark`
    // dice made ~1 in 5 invented places render as midnight at noon, which is
    // why stress-test scenes kept coming out murky voids. The same goes for
    // the hash-rolled emissive: a place glows because the DM said it glows
    // (traits set emissive downstream), not because a dice said so.
    return {
        sky: fromHsl(hue, sat * 0.75, 0.60),
        fog: fromHsl(hue, sat * 0.6, 0.48),
        fogDensity: 0.03 + ((h >> 5) % 60) / 1000,
        ground: fromHsl(hue, sat * 0.85, 0.33),
        groundRough: 0.8 + ((h >> 7) % 20) / 100,
        structure: fromHsl(hue, sat * 0.6, 0.27),
        foliage: fromHsl(alt, Math.min(sat * 1.15, 0.7), 0.42),
        key: fromHsl(hue, 0.18, 0.92),
        hemiSky: fromHsl(hue, sat * 0.5, 0.66),
        hemiGround: fromHsl(hue, sat * 0.6, 0.28),
        ambient: fromHsl(hue, sat * 0.5, 0.44),
        emissive: 0x000000,
        emissiveOn: false
    };
}

/**
 * Give a known biome this world's own flavour. Without it every forest in every
 * world is the same forest — but the whole premise is that each world is new.
 * Deterministic per (world, place), so a forest stays ITS forest.
 */
function vary(base: BiomeBase, seedKey: string): BiomeBase {
    if (!seedKey) return base;
    const h = hashStr(seedKey);
    // Wide on purpose. A +/-12deg nudge measured 3.0 perceptual distance between
    // worlds — invisible. A forest must be able to run yellow-green to blue-green
    // across worlds and still read as forest.
    const deg = ((h % 71) - 35);                  // +/-35 deg
    const satK = 0.70 + ((h >> 6) % 66) / 100;    // 0.70..1.35
    const lightK = 0.86 + ((h >> 13) % 29) / 100; // 0.86..1.14
    const fogK = 0.70 + ((h >> 19) % 75) / 100;   // 0.70..1.44
    return {
        ...base,
        sky: shift(base.sky, deg, satK, lightK),
        fog: shift(base.fog, deg, satK, lightK),
        fogDensity: base.fogDensity * fogK,
        ground: shift(base.ground, deg, satK, lightK),
        structure: shift(base.structure, deg * 0.6, satK, lightK),
        foliage: shift(base.foliage, deg * 1.4, satK * 1.05, lightK),
        hemiSky: shift(base.hemiSky, deg, satK, lightK),
        hemiGround: shift(base.hemiGround, deg, satK, lightK),
        ambient: shift(base.ambient, deg, satK, lightK)
    };
}

/**
 * The DM's signature hue ("a flesh-red planet", "a prismatic bridge"). Without
 * it, an invented place's colours derive from its name's hash — so the muscle
 * planet came out swamp-green no matter what the text said. One hint nudges
 * the place's solid colours toward the words the DM actually used. Specific
 * words first: "flesh red" must match flesh before red.
 */
const HUE_WORDS: Record<string, number> = {
    flesh: 0xb06050, blood: 0x8a1620, crimson: 0xa01830, scarlet: 0xb02828,
    emerald: 0x2aa05a, jade: 0x3aa878, golden: 0xd0a03a, amber: 0xd08030,
    violet: 0x8a5ac0, purple: 0x7a4ab0, azure: 0x4a9ae0, cobalt: 0x2a4ab0,
    teal: 0x2a8a8a, cyan: 0x3ac0c0, magenta: 0xc04aa0, pink: 0xe08ab0,
    orange: 0xd06a2a, red: 0xc03a2a, blue: 0x3a6ac0, green: 0x4a8a3a,
    yellow: 0xd8c040, bone: 0xd8d0b8, white: 0xe8e8e8, silver: 0xb8c0c8,
    black: 0x181818, grey: 0x808080, gray: 0x808080
};
function parseHint(h?: string | null): number | null {
    if (!h) return null;
    const s = String(h).trim().toLowerCase();
    const m = s.match(/#?([0-9a-f]{6})\b/);
    if (m) {
        const v = parseInt(m[1], 16);
        if (!Number.isNaN(v)) return v;
    }
    for (const w of Object.keys(HUE_WORDS)) if (s.includes(w)) return HUE_WORDS[w];
    return null;
}

/**
 * The single source of truth for how a scene looks.
 * biome base -> world variation -> time transform -> mood accent -> weather fog.
 * Deterministic: same inputs, same world, forever.
 */
export function resolveScene(tags: SceneTags | undefined | null): ScenePalette {
    const t = tags ?? {};
    const known = t.biome ? BIOMES[t.biome] : undefined;
    // Uniqueness comes from what the AI actually said + which world + which place.
    const seedKey = `${t.worldSeed ?? ''}|${t.biomeRaw ?? t.biome ?? ''}|${t.location ?? ''}`;
    const traits = applyVisual(extractTraits(`${t.biomeRaw ?? t.biome ?? ''} ${t.location ?? ''}`), t.visual);
    let base = known
        ? vary(known, seedKey)
        : synthesizeBiome(t.biomeRaw || t.biome || t.location || 'crossroads');
    // Traits reshape the base regardless of where it came from — this is how
    // "moon surface" gets a black sky even if the DM tagged the biome "plains".
    if (traits.space) {
        base = { ...base, sky: 0x060810, fog: 0x0b0e18, fogDensity: 0.012,
                 ground: shift(base.ground, 0, 0.14, 1.05),
                 structure: shift(base.structure, 0, 0.15, 1.0),
                 foliage: shift(base.foliage, 0, 0.2, 0.9) };
    } else if (traits.submerged) {
        // Underwater: light comes from everywhere and nowhere. Teal walls of
        // fog, no sun disc, no stars — the sky dome becomes the water column.
        base = { ...base, sky: 0x0d3a4a, fog: 0x12404f,
                 fogDensity: Math.max(base.fogDensity * 2.2, 0.055),
                 ground: mix(base.ground, 0x2a4a44, 0.35),
                 key: mix(base.key, 0x9fd4e8, 0.5),
                 hemiSky: 0x3d7a8c };
    } else if (traits.enclosed) {
        // A cave is dark because its walls are unlit and there is no sky — NOT
        // because the air is soup. The old ×1.6 murk multiplier put 99% fog on
        // everything past ~6 units (the "crystal-cavern void"): the darkness
        // has to come from the black dome and unlit masses, with the air clear
        // enough that glow pools and crystals can actually carry the room.
        base = { ...base, sky: 0x0a0908, fog: shade(base.fog, 0.55), fogDensity: base.fogDensity * 0.55 };
    }
    if (traits.glowing || traits.crystals) {
        const em = traits.glowColor ?? base.emissive;
        base = { ...base, emissiveOn: true, emissive: em };
        if (traits.enclosed) {
            // Bounced glow: the crystals light the cavern AIR, not just the
            // floor. Without this an enclosed glowing scene is a black room
            // with bright dots — the fog and fill must carry the colour.
            base = { ...base,
                     ambient: mix(base.ambient, em, 0.35),
                     fog: mix(base.fog, em, 0.18),
                     hemiSky: mix(base.hemiSky, em, 0.30) };
        }
    }
    if (traits.barren) {
        // Lifeless means lifeless: no hash-rolled fairy glow on a dead moon —
        // unless the text itself asked for glow ("glowing crater fields").
        base = { ...base, foliage: shift(base.foliage, 0, 0.22, 0.95),
                 emissiveOn: traits.glowing || traits.crystals ? base.emissiveOn : false };
    }
    // The DM's signature hue recolours the place's solids and the air between
    // them — a flesh-red planet is red to the horizon. The sky takes only a
    // whisper, so the place still belongs to its world.
    const hint = parseHint(t.visual?.palette_hint);
    if (hint !== null) {
        base = { ...base,
                 sky: mix(base.sky, hint, 0.15),
                 ground: mix(base.ground, hint, 0.42),
                 structure: mix(base.structure, hint, 0.68),
                 foliage: mix(base.foliage, hint, 0.55),
                 fog: mix(base.fog, hint, 0.18),
                 key: mix(base.key, hint, 0.25) };
    }
    const time = TIMES[t.time_of_day ?? 'day'] ?? TIMES.day;
    const mood = MOODS[t.mood ?? ''] ?? null;
    // Weather is an OPEN-SKY phenomenon — a cavern, the void, and the deep sea
    // don't take rain or snow. (Space-dark sky mixed with snow-grey tint was
    // also the last combo that could collapse sky toward ground in the sweep.)
    const noSky = traits.space || traits.enclosed || traits.submerged;
    const wx = noSky ? WEATHER.none : (WEATHER[t.weather ?? 'clear'] ?? WEATHER.clear);

    const tone = (c: number) => saturate(shade(mix(c, time.tint, time.t), time.bright), time.sat * (mood?.sat ?? 1));

    let sky = saturate(shade(mix(base.sky, time.skyTint, time.t), time.skyBright), time.sat);
    // Fog is scattered skylight — it belongs between ground and sky brightness,
    // not down at ground level, or distant mass fades to black instead of into
    // the horizon (which is what atmospheric perspective actually looks like).
    const fogBright = (time.bright + time.skyBright) / 2;
    let fog = saturate(shade(mix(base.fog, time.tint, time.t), fogBright), time.sat * (mood?.sat ?? 1));
    let key = mix(base.key, time.tint, time.t * 0.6);
    if (mood) key = mix(key, mood.key, mood.t);

    // Weather sits on top of fog + sky, never on ground identity.
    if (wx.t > 0) {
        fog = mix(fog, shade(wx.fogTint, time.bright), wx.t);
        sky = mix(sky, shade(wx.fogTint, time.bright), wx.t * 0.7);
    }

    // Distant haze approaches sky colour — that IS atmospheric perspective, and
    // it's what hides the ground plane's edge. Without this the terrain fades to
    // a fog colour that differs from the sky, leaving a hard seam at the horizon.
    fog = mix(fog, sky, 0.55);

    const fogDensity = base.fogDensity * wx.fogK * (mood?.fogK ?? 1);
    // floorSat runs LAST: enforceSeparation pushes ground toward white/black to
    // escape the sky, which can drag saturation back below the floor (724 of
    // 25k combos in the guard sweep) — re-floor after the escape.
    const ground = floorSat(enforceSeparation(sky, floorSat(tone(base.ground))));

    // Weather flattens the sun: overcast has no disc, rain/fog barely one.
    const sunVis = 1 - Math.min(0.92, wx.t * 1.9);

    // Film-stack knobs. Presentation-only — the separation guards above own
    // readability; these decide how the painted frame is graded and rim-lit.
    const gradeSat = Math.min(1.22, Math.max(0.95, 1.06 + ((mood?.sat ?? 1) - 1) * 0.5));
    const gradeCon = Math.min(0.26, Math.max(0.10, 0.12 + (mood?.t ?? 0.12) * 0.35));
    // Foggy weather lifts the shadows toward the fog itself (airy, readable
    // darks); night gets a whisper of indigo so blacks aren't dead.
    const gradeLift = wx.t > 0.1 ? shade(fog, 0.45)
        : t.time_of_day === 'night' ? 0x141c30 : 0x000000;
    // Bloom is earned by light sources: emissives and a visible sun disc.
    // An overcast matte day barely blooms — and shouldn't.
    const bloom = Math.min(1.0, Math.max(0.25,
        0.35 + (base.emissiveOn ? 0.45 : 0) + time.sunGlow * sunVis * 0.35));

    return {
        sky: floorSat(sky, SAT_FLOOR * 0.7),
        fog,
        fogDensity,
        ground,
        groundRough: base.groundRough,

        sunDir: time.sunDir,
        sunColor: mood ? mix(time.sunColor, mood.key, mood.t * 0.5) : time.sunColor,
        sunSize: time.sunSize,
        sunGlow: (traits.enclosed || traits.submerged) ? 0 : time.sunGlow * sunVis,
        horizonGlow: (traits.enclosed || traits.submerged) ? 0 : time.horizonGlow * sunVis,
        starAmount: traits.space ? 1 : ((traits.enclosed || traits.submerged) ? 0 : time.starAmount * sunVis),
        exposure: time.exposure * (traits.enclosed ? 1.42 : 1) * (traits.submerged ? 1.1 : 1),
        // Even 'clear' keeps some cloud — an empty gradient is ~45% of a phone
        // screen doing nothing.
        cloud: traits.space || traits.enclosed || traits.submerged ? 0 : wx.cloud,
        cloudColor: time.cloudColor,
        structure: floorSat(tone(base.structure)),
        foliage: floorSat(tone(base.foliage), SAT_FLOOR * 1.4),
        key,
        keyIntensity: (traits.enclosed ? 0.35 : traits.submerged ? 0.75 : 1) * 1.5 * time.keyK * wx.keyK,
        hemiSky: tone(base.hemiSky),
        hemiGround: tone(base.hemiGround),
        hemiIntensity: (traits.enclosed ? 0.55 : traits.submerged ? 1.1 : 1) * 0.9 * time.hemiK * wx.keyK,
        ambient: tone(base.ambient),
        ambientIntensity: (traits.enclosed ? 1.0 : traits.submerged ? 1.1 : 1) * 0.55 * time.ambK,
        // Emissives stay at full strength — they're the light source, not lit.
        emissive: base.emissive,
        emissiveOn: base.emissiveOn && (time.emissiveBoost || base.emissiveOn),

        // Rim carries the sky from behind — cheap silhouette separation.
        rimColor: mix(sky, 0xffffff, 0.18),
        rimIntensity: (traits.enclosed ? 0.35 : traits.submerged ? 0.5 : 0.65) * time.keyK,
        gradeSat,
        gradeCon,
        gradeLift,
        bloom
    };
}

/** Contrast ratio between two scene colours. Used by tests + the guard. */
export function contrast(a: number, b: number): number {
    const l1 = luminance(a), l2 = luminance(b);
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
}

export const BIOME_NAMES = Object.keys(BIOMES);
export const TIME_NAMES = Object.keys(TIMES);
export const MOOD_NAMES = Object.keys(MOODS);
export const WEATHER_NAMES = Object.keys(WEATHER);
