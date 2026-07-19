# w5 — TEMPLE OF LOST TIME (golden carved bas-relief temple) — evidence file

Analyzed: 12 stills (frames/w5-temple-01..12.jpg), 21 full frames pulled from
/tmp/rt_blinx2/w5-temple-full.mp4 (503 s), 22 zoomed crops (crops/w5t-*.jpg).
Frames 11–12 of the stills and video t≈435–503 are the SHOP (a bolted-together
sci-fi metal kiosk: gray-blue riveted panels, orange brackets — deliberately
outside the temple's material language) and are treated as out-of-world UI.

The world is an INTERIOR temple with three zone types: (a) gold-ochre
high-relief chambers (the "hoard" rooms), (b) cool gray-green secondary
corridors/shafts with big plain block courses, (c) one exterior ledge with a
mint-green sky vista. Fog hue everywhere is yellow-green.

---

## Ground (evidence: crops/w5t-tiles.jpg, crops/w5t-spikeedge.jpg, crops/w5t-floor.jpg, crops/w5t-parapet.jpg, frames/w5-temple-02.jpg)

- WHAT: gold zone floors = rounded "pillow" slabs in rough rows; green zones
  = broken flat pavers; exterior = big square flagstones.
- HOW (gold slabs): each slab is painted as its own value cell — palest at
  the top-center, darkened on ALL four edges, grout gaps painted near-black
  olive (crops/w5t-tiles.jpg). On top of that grid, a macro moss layer of
  darker olive-brown blotches recolors whole slabs and ignores the grid
  (visible as random dark/mossy tiles among pale ones). This is the
  three-layer paint job (base + macro blotch + edge darkening), with the
  per-slab "pillow" gradient as the base-pattern signature of THIS world.
- HOW (green zone): slabs get REAL geometry jitter — some pavers sit proud or
  tilted, their exposed side faces a step darker and browner than the tops
  (crops/w5t-spikeedge.jpg left edge, crops/w5t-floor.jpg). Gaps between
  slabs are deep dark green-black painted lines. Bright dappled pale
  yellow-green patches lie across the slabs = baked light dapple
  (crops/w5t-floor.jpg), the world's substitute for dappled sun indoors.
- HOW (exterior flagstones): each stone carries a painted dark perimeter
  seam, slightly stronger along the bottom-right — a consistent
  upper-left light logic shared with the wall blocks (crops/w5t-parapet.jpg).
- FUNDAMENTAL: floor richness = per-cell pillow shading + macro moss
  recolor + baked dapple patches. Geometry jitter is reserved for the
  "damaged" zones; the pristine gold rooms stay flat underfoot.

## Edges & lips (evidence: crops/w5t-relief.jpg, crops/w5t-stairface.jpg, crops/w5t-pit.jpg, crops/w5t-parapet.jpg)

- WHAT: register boundaries on relief walls, stair nosings, pit rims all
  read as thin pale lines with a dark under-line.
- HOW: every horizontal band break on a relief wall is a THIN REAL LEDGE of
  geometry — it breaks the silhouette and carries a painted dark under-cut
  line (crops/w5t-relief.jpg). Stair treads are individual pale slabs with
  darker green-gray risers — orientation value stepping does the form, no
  nosing geometry needed (crops/w5t-stairface.jpg). Pit rims: the walkway
  lip stays pale gold while the void below goes to black-green, so the edge
  reads by CONTRAST ACROSS the lip, not by a painted rim band
  (crops/w5t-pit.jpg).
- FUNDAMENTAL: texture bands carry richness; ledges carry silhouette; the
  lip's job is value separation between two zones, achieved by letting one
  side go dark.

## Transitions (evidence: crops/w5t-potbase.jpg, crops/w5t-pot.jpg, crops/w5t-tiles.jpg)

- WHAT: pots and pedestals sit IN the floor without a visible intersection
  line.
- HOW: the woven pots have (a) a painted darker base band on the pot itself,
  (b) a soft dark contact patch in the floor texture beneath them, and
  (c) they are clustered against wall bases so the wall's own recess
  staining backs them (crops/w5t-potbase.jpg — left pot shows the dark
  ground ring clearly). The pot's silhouette bulges (wider at mid-belly,
  narrower at foot) — the Seuss non-axis-aligned rule applied to props.
- FUNDAMENTAL: prop grounding = per-asset painted base band + painted
  contact patch + deliberate placement against dark backing. Two paint
  tricks + one placement trick, no dynamic shadow.

## Walls & masses (evidence: crops/w5t-relief.jpg, crops/w5t-reliefzoom.jpg, crops/w5t-stairface.jpg, crops/w5t-wallface.jpg, crops/w5t-blockwall.jpg, frames/w5-temple-09.jpg)

- WHAT: gold rooms are skinned in dense figural bas-relief registers;
  secondary rooms are big plain block courses.
- HOW (relief): the figures are essentially FLAT — silhouettes do not break
  the wall plane except at register ledges. Depth is painted: each figure
  gets a pale gold body, darker painted shade under chins/arms/bellies
  (light from above), and the recess background between figures is stained
  dark olive (crops/w5t-reliefzoom.jpg). The register stack repeats:
  ledge → figure band → recess band → ledge. Painted AO in the creases,
  not normal maps.
- HOW (giant faces): hero walls scale the SAME trick up — a giant profile
  face (brow/nose ridge pale, eye socket stained dark) painted onto the
  wall plane behind the staircase (crops/w5t-stairface.jpg). One light
  direction everywhere; highlight always on the upper ridge, stain in the
  hollow.
- HOW (secondary walls): in gray-green zones the blocks get BIG and plain —
  long horizontal courses, each block pale top-left / dark bottom-right,
  dark crack seams, macro moss blotches over everything
  (crops/w5t-wallface.jpg, crops/w5t-blockwall.jpg). Texture SCALE is the
  zone signal: fine dense figures = sacred/rich, huge plain blocks =
  backstage/utilitarian.
- HOW (frieze band): near the ceiling of the gold rooms runs a deep-RED
  band with small gold glyph squares (crops/w5t-ceiling.jpg) — the only
  structural red in the world, placed at the top of the wall like a crown.
- FUNDAMENTAL: carved depth = one-direction painted highlight/shade +
  recess stain + silhouette only at ledges. The wall texture is doing
  95% of the "carved temple" work; geometry supplies 5% at the band edges.

## Special surfaces (no water/lava/snow — this temple is DRY; evidence: all frames)

- No water, lava, glass, or snow appears anywhere in the 503 s — the world's
  "special surfaces" are instead:
- TELEPORT BEAM (crops/w5t-t3.jpg): stage start spawns Blinx inside a
  vertical column of pale green-white light — an additive gradient cylinder
  or camera-facing card stack, brightest at the floor and fading upward,
  with tiny sparkle motes drifting in it. Same family as the lantern halo:
  additive quad(s), green-white, no mesh.
- FIRE / EXPLOSIONS (crops/w5t-fire.jpg, crops/w5t-t370.jpg): vertical
  stack of additive sprites — blown-white core at the base, yellow mid,
  orange-red outer, with BROWN-GRAY opaque smoke blobs riding above the
  additive part. The only true white values in the world live in fire.
  Nearby geometry is NOT dynamically lit; warmth nearby is baked
  (HYPOTHESIS: the red-brown scaffold at crops/w5t-t370.jpg carries painted
  warm spill on its flame-facing side).
- GREEN FOG POOL (crops/w5t-vines.jpg): the lower level under the walkway
  is drowned in a flat yellow-green haze — value rises and contrast dies
  with depth. Fog is doing "bottomless undercroft" without geometry.
- TIME-REWIND (crops/w5t-t100.jpg): the REW mechanic is a full-screen
  post effect — horizontal scanline shear bands slide across the whole
  frame. A screen-space trick, not a scene trick.

## Darkness (evidence: crops/w5t-pit.jpg, crops/w5t-parapet.jpg, crops/w5t-archinside.jpg, crops/w5t-corridor.jpg, frames/w5-temple-05.jpg)

- WHAT: pit voids, doorway interiors, corridor depths.
- HOW (pits): below-ledge voids go to near-black with a GREEN cast — the
  pit is darkest at its core and the lip above it stays pale, so the hole
  reads as depth, not as a black decal (crops/w5t-pit.jpg).
- HOW (door interiors): passageway interiors are NOT black — they hold at
  ~15–20% value in WARM umber/olive with a visible gradient stepping darker
  away from the opening, and the octagonal frame around them catches a pale
  highlight line on its inner lip (crops/w5t-archinside.jpg,
  crops/w5t-stairtop.jpg). A dark door you will walk through is kept
  readable; a pit you can fall into is allowed to go near-black.
- HOW (corridor): the dim corridor of frames/w5-temple-05.jpg ends in a
  BRIGHT pale-green glowing opening (crops/w5t-corridor.jpg) — darkness is
  staged so the lit destination is always the punctuation at the end of it.
- FUNDAMENTAL: two darkness registers — "readable threshold dark" (warm,
  ~15%, gradient, pale rim) for paths, "void dark" (near-black green) for
  hazards. Never #000.

## Lights (evidence: crops/w5t-lantern.jpg, crops/w5t-ceiling.jpg, crops/w5t-vines.jpg, crops/w5t-kiosk.jpg, crops/w5t-greenstairs.jpg, crops/w5t-gold.jpg)

- WHAT: hanging lanterns, glowing pickups, a glowing kiosk glyph, distant
  lit windows.
- HOW (lantern stack): a small dark physical fixture hangs from the ceiling
  on a chain (silhouetted INSIDE its own glow — crops/w5t-ceiling.jpg top
  right), wrapped in a big soft additive halo 4–5× the fixture's size
  (white core → pale yellow → transparent; crops/w5t-lantern.jpg), plus a
  painted warm pool on the nearby wall/floor (the wall behind the lamps in
  crops/w5t-vines.jpg is brightened in a rough disc). Fixture + halo +
  painted pool: three layers, zero dynamic light.
- HOW (pickup glows): crystals and gold nuggets carry small additive halos
  and white painted sparkle dabs; gold nuggets are the most saturated
  yellow in the game and float/rotate over a dark niche so the dark
  backing makes them pop (crops/w5t-gold.jpg).
- HOW (breadcrumbs): in the dim green stair room, two glowing pale-yellow
  pickups sit alone on a dark ledge — the only bright things in the room,
  marking the route (crops/w5t-greenstairs.jpg).
- HOW (window glow): the distant silhouette spires carry tiny paired
  yellow-green glowing windows — emissive dabs painted onto the far
  silhouette cards (crops/w5t-sky.jpg). The temple is "inhabited" via two
  bright pixels per tower.
- HOW (kiosk glyph): the shop door's teal "M" is a flat saturated emissive
  panel on the bronze door — max saturation reserved for interactive
  things (crops/w5t-kiosk.jpg).
- FUNDAMENTAL: every glow is a physical object + additive halo + painted
  spill, and glows are placed as route punctuation (ledges, doorways,
  destinations), not decoration.

## Sky & distance (evidence: crops/w5t-sky.jpg, crops/w5t-parapet.jpg, crops/w5t-t400.jpg)

- WHAT: from the one exterior ledge, a mint-green sky with jagged temple
  spires and a dead tree.
- HOW: the sky is a near-flat pale mint-green texture with only a gentle
  vertical gradient — the drama is in the SILHOUETTE LAYERS against it:
  (1) near dark-brown rocky outcrop with texture detail, (2) mid dark
  green-gray jagged spire cluster, (3) far spires a discrete step lighter
  and greener, dissolving into the sky hue. Three layers, value-stepped,
  not a smooth fog gradient (crops/w5t-sky.jpg). The far spires carry the
  glowing window dabs (see Lights). The dead tree is a thin dark real-mesh
  silhouette prop at the parapet — a foreground "framing mass" against the
  sky. The parapet floor itself: pale flagstones (crops/w5t-parapet.jpg),
  so the exterior reads: pale floor → dark near rock → mid spires → light
  sky. A full value ladder in one glance.
- FUNDAMENTAL: distance = 3 discrete silhouette value steps toward the sky
  hue; the sky plane stays quiet so the silhouettes and their tiny lit
  windows carry the depth.

## Overhead (evidence: crops/w5t-ceiling.jpg, crops/w5t-stairtop.jpg, crops/w5t-t15.jpg, frames/w5-temple-03.jpg)

- WHAT: the top third of interiors is a dark ceiling mass, a red frieze
  band, hanging lanterns, and giant curved tusk/rib columns.
- HOW: ceilings are kept DARK (unlit olive mass, texture nearly swallowed)
  so the red glyph frieze band and the warm lantern halos read as the only
  events up high (crops/w5t-ceiling.jpg). The giant curved tusks
  (crops/w5t-t15.jpg) arc through the upper frame — big smooth real-geometry
  curves, pale gold, smooth-shaded, acting as framing masses that keep the
  eye inside the room. Dark ceiling + one saturated band + warm halo
  punctuation = the standard upper-third stack, temple edition.
- FUNDAMENTAL: the ceiling's job is to be a dark lid that makes the frieze
  and lanterns glow by contrast; vertical interest comes from 2–3 huge
  curved masses, not from ceiling detail.

## Props & motifs (evidence: crops/w5t-pot.jpg, crops/w5t-potbase.jpg, crops/w5t-kiosk.jpg, crops/w5t-gold.jpg, frames/w5-temple-04.jpg, crops/w5t-t160.jpg)

- WHAT: woven lattice pots, gold nuggets, colored crystals, hearts, the red
  balloon, spiked-ball hazards, balloon-carried pig monsters.
- HOW: pots repeat at wall bases in clusters of 1–3 (never mid-floor) —
  painted lattice crosshatch + horizontal banding + darker base band, bulge
  profile (crops/w5t-potbase.jpg). Breakables read as "softer" material
  (woven, warm brown) against the hard gold stone. Pickups keep the
  saturation ration: crystals cyan/pink/green, gold deep yellow, balloon
  pure red — every interactive thing is out-of-palette saturated, every
  structural thing stays in the gold/olive/green palette. The spiked ball
  (crops/w5t-pit.jpg) inverts the floor's value scheme — near-black body,
  pale cream spikes — so the hazard reads instantly on pale slabs.
- FUNDAMENTAL: prop readability = material contrast (woven vs stone) +
  saturation ration (interactive = saturated) + value inversion for
  hazards. Clustering against walls keeps floors clean for gameplay reads.

## Particles & air (evidence: crops/w5t-fire.jpg, crops/w5t-t3.jpg, crops/w5t-vines.jpg, crops/w5t-t370.jpg)

- WHAT: explosion fire stacks, spawn-beam sparkles, under-level haze.
- HOW: explosions = additive sprite stack (white/yellow/orange) + opaque
  brown smoke blobs on top — light and dark particle values paired so the
  event reads on any ground (crops/w5t-fire.jpg). The spawn beam carries a
  handful of tiny bright motes inside its additive column
  (crops/w5t-t3.jpg). Persistent "air" is the green fog wash over deep/lower
  regions rather than a particle weather layer (crops/w5t-vines.jpg).
  HYPOTHESIS: there is no constant camera-wrapped dust/mote field in the
  interiors — 640×360 cannot resolve motes smaller than ~2 px, but none of
  the 21 video frames show an obvious drifting mote layer; this world seems
  to trade Everwinter's snowfall for still, hazy air (appropriate for a
  sealed temple).
- FUNDAMENTAL: air = fog wash for stillness + sprite stacks for violence;
  particles are event punctuation, not atmosphere, in this world.

## Color script (evidence: all crops; ratios estimated from frames/w5-temple-01.jpg, crops/w5t-t250.jpg, crops/w5t-t400.jpg)

- Hue families, rough frame coverage: gold-ochre/olive stone ~40%,
  moss/vegetation green ~25% (stains, fog, far zone), gray-green block
  stone ~20%, sky mint ~5%, structural RED (frieze band, door trims,
  balloon) ~3–5%, pickup saturation (cyan/pink/yellow) ~5%.
- What is ALLOWED saturated: only interactive/rare things — crystals, gold,
  the balloon, the kiosk glyph, the frieze red (the single structural
  exception, used sparingly and high up). Everything load-bearing stays
  inside gold/olive/green.
- Shadow hue: shadows go to MOSS-GREEN and warm umber, never gray —
  clearest in the dark doorway interiors (warm umber, crops/w5t-archinside.jpg)
  and pit voids (black-green, crops/w5t-pit.jpg). Painted figure shade on
  the reliefs is dark olive (crops/w5t-reliefzoom.jpg).
- Zone-to-zone contrast: gold warm rooms ↔ cool gray-green corridors and
  stair shafts, and the octagonal thresholds literally FRAME the next
  room's hue — through the gold octagon you see a greener, paler room
  (crops/w5t-octadoor.jpg); the dim corridor ends in a bright green glow
  (crops/w5t-corridor.jpg). The threshold is a value step AND a
  temperature step, exactly as the fundamentals predict — here the lure is
  GREEN seen from GOLD (inverse of Everwinter's warm-from-cold).
- FUNDAMENTAL: a two-temperature world (gold = rich/safe, green =
  passage/unknown) with saturation rationed to gameplay objects.

## Staging (evidence: crops/w5t-t220.jpg, crops/w5t-octadoor.jpg, crops/w5t-corridor.jpg, crops/w5t-t400.jpg, crops/w5t-stairface.jpg)

- WHAT: repeated dark-frame→bright-core compositions through doorways;
  focal accents always warm or saturated.
- HOW: the camera is constantly parked behind a dark gold door frame
  looking INTO a brighter room (crops/w5t-t220.jpg — warm dark octagon
  edges, bright green-gold room beyond). Octagonal gates are placed at
  every zone boundary and are composed to show the destination's hue
  through them. Interior frames keep the upper third dark (ceiling +
  frieze) and put the brightest value either at the floor dapple pool, a
  lantern halo, or the far doorway. The staircase shot
  (crops/w5t-stairface.jpg) stages the giant face relief as the backdrop
  to the climb — hero art placed BEHIND the traversal path, not beside it.
  Verticality: the fire-arena walkway shows a lower fog-drowned level
  below with its own lamps (crops/w5t-vines.jpg) — stacked floor planes +
  lights at each level.
- FUNDAMENTAL: thresholds are picture frames; the path always reads as
  dark-edge → lit-core, and the biggest art (giant faces) sits on the
  axis of travel.

## Feel

- One phrase: **reverent hoard-hush** — a sealed golden reliquary; warm,
  carved, candle-lit stillness that erupts into fire only when the vault is
  disturbed.

## Engine translation (Three.js rules for THIS world)

1. **Pillow-slab floor shader**: one canvas-generated tile texture where
   every slab cell gets a radial light-center/dark-edge gradient + dark
   grout; overlay a second UV channel (or vertex-color multiply) with
   low-frequency moss blotches that ignore the grid; add a third baked
   dapple-pool layer under lantern positions. Per-zone, swap "pristine
   flat" (gold) for "jittered paver heights + darker gaps" (green).
2. **Fake bas-relief material**: flat wall + canvas texture baking
   per-figure highlight-top / shade-bottom from ONE light direction, dark
   olive recess background, and crease AO; then place thin real ledge
   strips (BoxGeometry) at every register boundary for silhouette. Scale
   the same texture up 8× for hero "giant face" walls behind staircases.
3. **Orientation value stepping + green shadows**: bake per-vertex
   up=pale-gold / side=olive / down=near-black-green, and push all shadow
   colors toward moss-green/umber, never gray (matches Blinx's global
   rule; here the shadow pair is specifically green + umber).
4. **Lantern stack prefab**: dark fixture mesh on a chain + camera-facing
   additive halo sprite (4–5× fixture size, white core → yellow fade) +
   painted/baked warm pool decal on the nearest floor/wall + gentle real
   PointLight optional. Suspend from dark ceiling masses; add a red-glyph
   frieze band at wall tops as the single structural red accent.
5. **Two-register darkness**: walkable thresholds = 15–20% warm-umber
   gradient material with a pale emissive lip line on the frame; hazard
   pits = near-black green fog/void. Door frames: thick octagonal
   extrusions with pale inner-lip highlight, always composed to show the
   next room's fog color through them (set per-room fog: gold rooms
   #8a7a3a-ish warm, green zones cool gray-green; the doorway IS the
   transition preview).
6. **Exterior vista kit**: flat mint-green sky dome + 3 silhouette card
   layers (dark-brown detailed near rock, dark-green mid spires, lighter
   green far spires) with 2-px emissive window dabs painted on the far
   layer; discrete value steps, no smooth fog on the cards; one thin
   dead-tree silhouette mesh as foreground frame.
7. **Event particles**: explosion = additive sprite stack (white→yellow→
   orange) + a few opaque brown smoke quads above; spawn/teleport =
   vertical additive gradient column + 10–20 sparkle points. Keep the
   world's air otherwise STILL — no ambient mote field; use yellow-green
   fog haze in lower/secondary volumes instead.
8. **Saturation gate**: materials pipeline rule — structural geometry may
   only use the gold/olive/green LUT (plus the one frieze red); full
   saturation is reserved for pickups, hazards (inverted values: black
   body + pale spikes), and interactive glyphs. If a prop reads "quiet",
   it belongs to the LUT; if it must be read at 10 m, it leaves the LUT.
