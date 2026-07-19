# EXEMPLAR — the expected depth (Everwinter snow/icicle analysis)

This file is the METHOD TEMPLATE. Every world file must reach this depth, for
EVERY aspect — not just one hero aspect. The rule: never write WHAT something
looks like without following it with HOW it is built, then HOW that
construction produces the read, down to a fundamental trick.

The five fundamental tricks everything bottoms out at (2002 Xbox: almost no
dynamic lights, no per-pixel shaders, tiny poly budgets):
1. **Painted texture** — the painter carries the light, dirt, and depth.
2. **Geometry placement** — rounded lips, ledge trim, framing masses, transition props.
3. **Alpha cards** — flat quads with a silhouette texture (icicles, fringes, foliage).
4. **Additive/emissive sprites** — halos, glows, particles.
5. **Bakes** — lightmap / vertex colour / fog doing "atmosphere".

The meta-law: **no trick is ever left exposed alone** — every illusion is two
or three tricks stacked so the eye can't find the seam.

---

## Snow surface (evidence: frames/w7-everwinter-01.jpg, crops/w7s-20.jpg, crops/w7s-155.jpg)

- WHAT: lavender-white snowfield with soft darker blotches and fine speckle.
- HOW: flat-ish mound geometry + a hand-painted diffuse texture carrying
  (a) a fine speckle detail tile, (b) big soft darker-mauve blotches at macro
  scale that ignore the speckle grid, (c) pale drift-rings painted around
  every rock base.
- FUNDAMENTAL: **snow is paint, not geometry.** Softness is a texture
  decision (rounded values), not a modelling one.

## Edges / cliffs (evidence: crops/w7s-65.jpg)

- WHAT: plateau edges read soft and rounded; tops pale, sides blue-violet.
- HOW: the cliff lip is a rounded roll of extra polygons with smoothed
  normals so light "rolls" off; a painted darker rim band sits just inside
  the top edge; up-facing surfaces are the palest value in the scene,
  side-faces a step darker and bluer.
- FUNDAMENTAL: **form = value stepping by face orientation** (up = lightest,
  side = darker) + a rounded lip. One rule builds the whole world's solidity.
  No silhouette detail needed.

## Snow-on-rock transitions (evidence: crops/w7s-20.jpg)

- WHAT: rocks sit IN the snow, never ON it; no visible intersection line.
- HOW: three stacked tricks — the rock's own texture fades to pale near its
  base (per-asset painted snow-line), the ground texture paints a drift ring
  around each base, and a small drift mound mesh hides the actual
  intersection.
- FUNDAMENTAL: **no naked mesh intersections, ever.** Every
  vertical-meets-horizontal gets a transition element (drift, tuft, rubble).

## Icicles (evidence: crops/w7s-110.jpg)

- WHAT: white-blue icicle fringe along the top of an overhang.
- HOW: NOT 3D cones — an alpha-card strip: one texture with a sawtooth
  icicle silhouette + transparency, repeated along the lip. Staged pale
  against a dark recessed backing (the overhang underside is painted dark
  blue-violet) so the silhouette reads at any distance.
- FUNDAMENTAL: silhouette alpha cards at *functionally correct* locations
  (icicles where water would drip), always light-against-dark.

## Snowfall (evidence: all w7 stills)

- WHAT: constant soft snowfall with visible depth — some flakes big and soft.
- HOW: a camera-wrapped particle box of camera-facing white quads; per-particle
  size variance and sway; near-camera flakes render larger/softer. Density is
  constant everywhere — it is a WEATHER LAYER, not per-room.
- FUNDAMENTAL: **air is a volume that travels with the player.**

## Interaction snow (evidence: crops/w7s-155.jpg, crops/w7s-200.jpg)

- WHAT: landing kicks white spray; destroyed things burst dark chunks.
- HOW: two paired particle systems — white spray quads AND dark debris tetra
  chunks — contrasted so both read on the same lavender ground.
- FUNDAMENTAL: pair your particle values (light spray + dark debris) so every
  event reads regardless of the ground value beneath it.

## Distance & sky (evidence: frames/w7-everwinter-01.jpg, crops/w7s-65.jpg)

- WHAT: pink-orange horizon band, deep purple cloud shapes, mesa silhouettes
  stacking into the distance.
- HOW: the drama is painted INTO the sky texture (horizon band + dark cloud
  shapes); geometry mesas just silhouette against it; each successive ridge
  layer is a discrete step lighter and pinker (fog tint does the stepping).
- FUNDAMENTAL: the sky texture carries the drama; geometry only silhouettes;
  **distance = discrete value steps**, not a smooth gradient.

## Cold-world warmth (evidence: frames/w7-everwinter-06.jpg, crops/w7s-250.jpg)

- WHAT: the gate/goal and interiors are warm gold in a violet-white world.
- HOW: hue TEMPERATURE marks the emotional target — the warmest object in
  frame is always the goal/shop/gate; fire on the gate spills warm onto snow.
- FUNDAMENTAL: warm = goal/safety; cold = journey. Temperature, not
  brightness, is the waypoint system.
