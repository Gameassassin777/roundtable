# BLINX DYNAMICS — how the world MOVES (the life layer)

Frame-pair evidence (dyn/w7-fall-a/b, dyn/w1-banner-a/b, dyn/w2-torch-a/b,
dyn/w8-torn-a/b — same viewpoint, 0.4–0.6 s apart) plus the 96 stills.
This file is the correction to a static-material reading of Blinx: the
painterly craft is only half the game. The other half is motion.

## THE MASTER LAW: STILL SET + MOVING THINGS

Between frame pairs, the painted set (walls, ground, sky, mottle, pools) does
not move AT ALL. No vertex sway, no texture wobble on the architecture. All
perceived life comes from a separate layer of MOVERS composited over the
still painting:

1. pickups spin and bob
2. creatures patrol, hop, idle with personality
3. weather particles fall through a camera-wrapped volume
4. flames flicker (stacked sprite quads stretching)
5. select textures scroll (water streaks, waterfall, lava crust)
6. time-powers re-grade the ENTIRE frame as feedback

Consequence for our baked-painting architecture: **a still bake is
authentic** — Blinx's own sets are still. What makes a scene feel dead is
not a static backdrop, it's a static EVERYTHING. The life layer must be as
authored as the paint layer. (Our CinematicDiorama already has the right
idea — sky time uniform, precip, fog banks, flocks, motes, water waves,
backdrop drift — it needs the Blinx *density and variety* of movers.)

## The mover catalogue (mechanism → observed character)

### 1. Pickups: spin + bob + pulse (evidence: dyn/w1-banner-a/b)
- A star pickup goes from full-face to edge-on in 0.6 s → continuous YAW
  spin at roughly 3–5 rad/s. Time crystals likewise rotate.
- Bob is a small vertical sine (a few cm, ~1 Hz) — visible in the w2 pair
  (the blue time-sphere rises between frames).
- Emissive pulse: gems breathe in brightness (the halo sprite scales/opacity
  oscillates) — each pickup offset in PHASE so a field of gems shimmers
  instead of blinking in unison.
- Collect = sparkle burst (additive star quads, ~0.3 s) — event punctuation.
- RULE: interactive objects NEVER hold still. Motion is how the game says
  "touchable" without a UI outline.

### 2. Creatures: patrol hops with anticipation (evidence: dyn/w7-fall-a/b)
- The yellow time-monster relocates a full body-length in 0.5 s — enemies
  HOP, not glide; squash-and-stretch on landing.
- Idle behaviours exist: monsters sleep, taunt, wander tiny loops. Even in a
  still, a creature's pose reads as "doing something", never T-posed filler.
- RULE: every living thing has a loop; every loop has personality.

### 3. Weather: camera-wrapped particle volume (evidence: all w7 stills)
- Constant snowfall, per-flake size variance, near-camera flakes larger and
  softer. Density is room-independent — the volume travels with the camera.
- In still air worlds (Temple, Canals per agent w2/w5) there is NO ambient
  particle field — weather is a per-world CHOICE, not a global default.
  Stillness itself is a mood tool (sacred = still).

### 4. Flames: stacked stretching sprites (evidence: dyn/w8-torn-a/b, crops/w6m-fire)
- A fire is 3–5 overlapping additive quads (white core / yellow mid / orange
  tongues) plus a separate red base-glow sprite; between frames the column
  reshapes completely — each quad stretches/contracts on its own phase.
- Paired with the baked warm wall stain: the PAINT holds the average light,
  the SPRITES hold the flicker.
- RULE: a flame is a flickering COLUMN, never one billboard.

### 5. Scrolling textures (evidence: crops/w7e-icefall, w3-c-waterfall-t22/t24)
- Waterfalls = two stacked planes (streak texture scrolling down over a flat
  blue backing, ~0.7 alpha); canal water streaks drift; lava crust crawls.
- Scroll is the ONLY texture motion in the game and is reserved for LIQUID.
  Nothing else scrolls — that's why water reads as water instantly.

### 6. Time-powers: full-frame re-grades (evidence: dyn/w8-torn pair, crops/w6m-pausefilter)
- PAUSE: whole frame desaturates to violet monochrome, glows go white.
- SLOW: frame grades green; fire keeps flickering inside the green.
- REW: horizontal scanline shear — "video rewind" as a screen effect.
- Tornado/vortex: two-tone white/pink additive ribbon twisting.
- These are POST effects over the whole composition — the boldest proof that
  Blinx treats the frame as a PAINTING it can re-varnish at will. (This is
  directly stealable: our bake can be re-graded with a fullscreen filter on
  scene transitions/time events.)

### 7. Bobbing props & swaying hangings (evidence: w4c-air balloon, w1 pennants)
- The hot-air balloon bobs gently at its moorings; pennant strings and
  banners carry a low-amplitude sway (HYPOTHESIS: vertex sway — 640×360
  can't resolve it, but the stills show different drape poses frame to frame).
- RULE: anything hanging or floating gets a slow pendulum. A motionless
  hanging object reads as nailed to the sky.

### 8. Debris & vacuum physics (evidence: w2-torch-a/b floor chunks)
- Suckable trash tumbles with real physics and lies where it lands (the dark
  chunks on the canal floor). Vacuum streams it toward the player.
- The floor's scattered debris is ALSO set dressing: a lived-in floor has
  litter baked in (see _details.md — age/habitation layers).

## Motion as information hierarchy

Blinx spends motion like it spends saturation — by RULES:
- **Set**: still. (Architecture is a painting.)
- **Ambient**: slow, looping, low-amplitude (weather, sway, bob, scroll) —
  felt, not watched.
- **Interactive**: fast, high-contrast motion (spin, hop, flicker) — the eye
  is TAUGHT that moving = touchable.
- **Event**: full-frame change (time-powers, bursts) — reserved for player
  action, so feedback is unmistakable.

This is WHY the game feels alive in a single screenshot: the still image
contains spin-streaked pickups, mid-hop creatures, frozen spray — motion is
implied everywhere even when frozen.

## Translation map → our engine (CinematicDiorama live layer)

Already have: sky time uniform, precip, fog banks, ground mist, flocks,
butterflies, leaves, motes, water waves, backdrop drift. To reach Blinx
density/variety:

1. **Animate the glow orbs** (breadcrumb trail, glow pools): bob ±0.06 at
   ~1 Hz + halo opacity pulse, per-instance phase offset. They're our
   "pickups" — they must never sit still. (Currently fully static.)
2. **Flame flicker on braziers**: swap the single emissive flame mesh for
   3 stacked additive quads with independent scale/opacity phases; keep the
   painted pool (it holds the average).
3. **Water streak scroll**: sea/water surfaces get a slow-scrolling streak
   texture layer (uv offset per frame) — the one texture motion allowed.
4. **Banner/canopy sway**: overhead cloth + banner geometry gets a small
   vertex-sway sine in the live layer (only the hanging layer sways).
5. **Crystal pulse**: emissiveIntensity sine, phase-offset per crystal.
6. **A screen-grade hook**: fullscreen tint/scanline moment on round
   transitions (time-power language) — cheap CSS/canvas filter over the bake.
7. **Creature loops**: existing creatures (flocks/butterflies) already
   patrol; add ONE ground critter with a hop loop per scene where the biome
   allows — a still creature is filler, a hopping one is a resident.
