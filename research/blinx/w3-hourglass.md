# w3 — HOURGLASS CAVES (emerald + violet crystal caverns)

Evidence: 12 stills `frames/w3-hourglass-01..12.jpg` (actual res 480x360, not
640x360), full video `/tmp/rt_blinx2/w3-hourglass-full.mp4` (669 s, present),
16 pulled video frames `crops/w3-t*.jpg`, 22 pixel crops `crops/w3-c-*.jpg`.

Zone map established from the video: emerald crystal cavern (t20–t120) →
tan/olive cave with monoliths (t180–t360) → violet crystal cavern
(t420–t480, stills 09/11) → dark gold-vein tunnel (still 10) → grey-rock
gold chamber (t560) → pale sand treasure room (still 12, t600) → boss arena
(t650). The whole world is ONE texture family re-tinted per zone (see Walls).

---

## Ground (evidence: crops/w3-c-ground-mottle.jpg, crops/w3-c-spire-base.jpg, crops/w3-c-sandroom.jpg, crops/w3-c-pathread.jpg)

- The cave floor is a THREE-LAYER paint job on gently mounded geometry:
  (a) pale tan-sand base, (b) huge soft dark-olive blobs — irregular
  amoebas, soft 4–8 px feathered edges, each blob ~1/5 of screen height,
  ignoring any grid, (c) a fine speckle of short dark dashes (2–4 px
  strokes) scattered over everything including across blob boundaries.
  FUNDAMENTAL: the macro blob layer + the micro dash layer are scale-
  separated by ~10x; that separation is what reads as "organic ground"
  instead of "tiled texture".
- Occasional painted WHITE highlight patches sit on rises in the mottle
  (crops/w3-c-spire-base.jpg left half) — painter-added specular/wet hits,
  no geometry behind them.
- Value zoning of the path: pale mint-tan clearings where gameplay happens,
  ground steps a shade darker and more olive at the periphery and inside
  side pockets (crops/w3-c-pathread.jpg — foreground pale, mid-ground
  darker olive ribbon where the path turns). The route is painted as a
  value track before any prop marks it.
- Sand treasure room variant (crops/w3-c-sandroom.jpg): same construction
  but layer (c) is swapped for painted WIND-RIPPLE lines — bundles of 3–6
  parallel diagonal streaks, grouped in patches with gaps between bundles.
  One detail-layer swap re-brands the floor as "sand" at zero geometry cost.

## Edges & lips (evidence: crops/w3-c-whiteblocks.jpg, crops/w3-c-ledgeedge.jpg, frames/w3-hourglass-07.jpg)

- White crystal blocks show the orientation value-stepping rule at its
  cleanest: top faces palest aqua-white, side faces a step darker and
  greener, and the SAME soft blob texture runs over all faces
  (crops/w3-c-whiteblocks.jpg). Form comes from per-face value, not from
  silhouette detail.
- Natural ledges/path edges roll: the pale top surface curves over into a
  darker side band with a painted darker seam line at the break
  (crops/w3-c-ledgeedge.jpg; frames/w3-hourglass-07.jpg path edge, left).
  No hard 90° arris anywhere — every break is a roll + a painted dark seam.
- FUNDAMENTAL: up = lightest, side = darker+cooler is universal here, and
  the lip is finished by PAINT (dark seam), so the geometry can stay low.

## Transitions (evidence: crops/w3-c-spire-base.jpg, crops/w3-c-sandprops.jpg, crops/w3-c-whiteblocks.jpg)

- Tower legs / spire bases (crops/w3-c-spire-base.jpg): three stacked
  tricks — a soft pale-mauve dust ring painted around the footprint, a
  scatter of small dark pebble props/decals clustered AT the base line, and
  the leg textures lightening toward the bottom. The actual intersection is
  never visible.
- Pot on sand (crops/w3-c-sandprops.jpg): soft dark contact blob painted
  under the pot, irregular edge, roughly pot-width x 1.5.
- White blocks (crops/w3-c-whiteblocks.jpg): bases sink into a dark stained
  band on the ground — contact darkening again, cooler (blue-green) than
  the pot's warm-grey blob. Contact shadow hue follows the zone, not #000.
- FUNDAMENTAL: no naked intersections; caves use paint-ring + pebble-scatter
  + per-asset base fade, all three, even on minor props.

## Walls & masses (evidence: crops/w3-c-wallblob.jpg, crops/w3-c-violetwall.jpg, crops/w3-c-bossarena.jpg, crops/w3-c-cornerlight.jpg, crops/w3-t35.jpg)

- THE world signature: ONE huge soft-blob texture family does every mass in
  every zone, re-tinted — dark grey-blue blobs on olive-black in the gold
  tunnel (crops/w3-c-wallblob.jpg, blobs ~1/4 screen height), purple-on-
  lavender in the violet cavern (crops/w3-c-violetwall.jpg), grey-blue on
  near-black in the boss arena (crops/w3-c-bossarena.jpg), grey-green on
  aqua-white on the crystal blocks (crops/w3-c-whiteblocks.jpg). Same
  amoeba shapes, same feathered edges, same ~10x scale gap to the floor
  speckle. Texture scale = mood dial at maximum: blobs so large the eye
  reads them as damp stone, not pattern.
- Painted relief logic: blobs are shaded as if lit from above — blob cores
  darker, thin lighter rims on blob tops in the pale zones — a single
  consistent light direction carried entirely by paint (clearest in
  crops/w3-c-wallblob.jpg lower-left where gold staining warms the blob
  rims near the light).
- Baked light staining ON walls: around every glow fixture the wall texture
  is pre-tinted the fixture's hue — cyan wash around the corner lamp
  (crops/w3-c-cornerlight.jpg), green wash around crystal lamps
  (crops/w3-c-lampstack.jpg background), gold wash low-left in
  crops/w3-c-wallblob.jpg. In a cave the "painted light pool" lives on the
  WALLS and ceiling, not the floor — world-specific inversion of the
  four-layer stack.
- Distance walls go darker, not lighter: upper walls and far wall of the
  emerald cavern sink into dark blue-green (crops/w3-t35.jpg top) — fog/
  bake pulls deep cave DOWN to the shadow hue instead of up to a sky hue.

## Special surfaces

- Waterfall (evidence: crops/w3-c-waterfall.jpg, w3-c-waterfall-t22/24.jpg):
  a translucent cyan column set in a rock niche; construction = vertical
  streak texture (long smeared strokes) on a see-through quad/cylinder,
  brighter and more opaque at its left rim, darker rock visible through the
  body. Streak pattern is static across t20/t22/t24 but the camera also
  moved — scrolling texture remains HYPOTHESIS. It is ALWAYS backed by dark
  rock so the pale cyan reads.
- Pools/basins (evidence: crops/w3-c-greenglow.jpg): dark olive-green FLAT
  surface with painted lighter wavy streaks; a saturated cyan crystal sits
  in it at full brightness (no dimming below a waterline visible at this
  res). No foam, no reflection. Alpha value unresolvable — HYPOTHESIS:
  mostly-opaque dark plane + painted streaks, i.e. water faked by value,
  not transparency, in the dark zones.
- Jump-pad discs (evidence: crops/w3-c-poolpad.jpg): the saturated emerald
  discs are gameplay pads — construction is emissive green disc (bright
  core, one-step darker rim ring) + soft additive halo + a faint green
  spill pre-painted on the surrounding ground. Reads as "glowing pool" but
  is opaque.
- Crystal clusters (evidence: crops/w3-c-crystal-red.jpg, crops/w3-c-greencrystal.jpg):
  two constructions. (1) Hero crystals: low-poly faceted meshes, per-face
  value stepping — pale pink top facets, deep magenta base
  (crops/w3-c-crystal-red.jpg) — plus an additive halo when they're lamps.
  (2) Crystal TERRAIN (emerald outcrops): not meshes at all — mound
  geometry whose texture paints ridge tops saturated yellow-green and
  valleys dark teal (crops/w3-c-greencrystal.jpg). The "glow" is contrast
  inside the paint. FUNDAMENTAL: emissive-looking terrain = painted value
  contrast; reserve actual emissive+halo for small hero crystals only.
- White crystal blocks: opaque, no alpha — see Edges.

## Darkness (evidence: crops/w3-c-darkdoor.jpg, crops/w3-c-violetwall.jpg, crops/w3-c-bossarena.jpg)

- The repeated dark monolith slabs are near-FLAT very dark warm brown
  (~10–15% value), NOT #000, with a half-step lighter maroon band at their
  top edges (crops/w3-c-darkdoor.jpg). Set against pale cyan-grey rock for
  maximum value contrast, and placed in PAIRS.
- Wall doorway in the violet cavern is the same treatment: flat dark
  maroon rectangle, no visible interior gradient at this res, pale rock rim
  all around (crops/w3-c-violetwall.jpg center).
- Cave "deep dark" lives at the top of frames and frame corners: the boss
  arena's upper half is the blob texture at its darkest tint
  (crops/w3-c-bossarena.jpg). Darkness is placed as framing mass and as
  punctuation (slabs/doors), never as an unlit accident.

## Lights (evidence: crops/w3-c-cornerlight.jpg, crops/w3-c-lampstack.jpg, crops/w3-c-distantglows.jpg, crops/w3-c-greenglow.jpg)

- Fixture stack, cave variant: (1) small physical core (dark fitting /
  crystal mesh), (2) additive halo sprite with blown white-cyan core
  (crops/w3-c-cornerlight.jpg — the core is pure white, halo cyan),
  (3) painted light pool ON THE WALL behind/around the fixture (cyan wash
  there), (4) bloom. The floor pool of the city worlds is replaced by wall
  staining because cave floors are usually out of the fixture's line of
  sight.
- Crystal lamp (crops/w3-c-lampstack.jpg): faceted red-crystal mesh
  (emissive red core) FLANKED BY TWO green additive orbs — complementary
  red/green pairing so the fixture reads against both warm and cool
  backgrounds — dark wall behind, pale ledge trim below. Four tricks in one
  prop.
- Breadcrumb trail (crops/w3-c-distantglows.jpg): purple → yellow → green
  crystal glows receding in a line across the mid-ground, each a saturated
  core + halo, spaced ~equal, framed by dark monoliths at both edges. The
  strongest walk-into-the-picture cue in the world.
- Glow accents in the boss arena: teal crystal clusters with halos are the
  ONLY bright things in a near-black room (crops/w3-c-bossarena.jpg).

## Sky & distance (evidence: crops/w3-t35.jpg, crops/w3-c-distantglows.jpg, crops/w3-c-bossarena.jpg)

- No sky exists — the world is fully enclosed. The sky's JOB (depth
  stepping) is taken over by: (a) walls/ceiling darkening into the zone's
  shadow hue with distance — emerald zone's far wall goes dark teal-blue
  (crops/w3-t35.jpg); (b) glow accents placed at each depth layer like
  ridge-line lights (the breadcrumb line doubles as the distance ladder);
  (c) occasional pale waterfall columns and glowing niches as far-plane
  value anchors. Distance = discrete DARK steps here (inverse of the snow
  world's light steps), because the "horizon" is deep cave.

## Overhead (evidence: crops/w3-c-ceiling.jpg, crops/w3-t455.jpg, crops/w3-t35.jpg)

- The top third is occupied by HANGING geometry: bundles of slightly bent
  orange-brown pipes/roots descending from off-screen
  (crops/w3-c-ceiling.jpg), and dark ceiling masses studded with pink/red
  crystals in the violet zone (crops/w3-t455.jpg top).
- Where no hangings exist, the ceiling simply darkens to the shadow hue and
  fog eats it (crops/w3-t35.jpg). Rule confirmed: never an empty,
  mid-value top — either hanging props + glow accents, or darkness.

## Props & motifs (evidence: crops/w3-c-balloon.jpg, crops/w3-c-sandprops.jpg, crops/w3-c-chest.jpg, crops/w3-c-goldstruct.jpg, crops/w3-c-pathread.jpg, crops/w3-t600.jpg)

- Checkered balloon spheres (crops/w3-c-balloon.jpg): large bobbing
  beach-ball props; checkerboard texture + ONE big soft painted specular
  blot upper-left — gloss is a paint decision, no env map. Whimsy props
  break the cave's organic monotony.
- Red teardrop collectibles on thin dark stems with gold caps
  (crops/w3-c-pathread.jpg): placed in lines of three along the path edge —
  the repetition-is-rhythm rule; the most saturated red in the olive zone
  is reserved for pickups.
- Banded pots (crops/w3-c-sandprops.jpg): yellow-green with dark horizontal
  band stripes painted on; every prop gets the contact blob.
- Treasure chest (crops/w3-c-chest.jpg): pale chest, cyan gems with painted
  white facet highlights, warm yellow glow painted behind the lid — the
  glow source is implied, not modelled.
- Gold fish idol (crops/w3-c-goldstruct.jpg): hero collectible = blown
  gold emissive + white flare core + pink gem accents, backed by a gold
  panel wall painted with vertical darker-gold stripes and a bright top
  band (light-from-above baked into the wall texture).
- Prop clustering: pots/chests/slabs cluster in the sand room
  (crops/w3-t600.jpg) while gameplay caverns stay sparse — density of
  man-made props itself signals "treasure room".

## Particles & air (evidence: crops/w3-t35.jpg, crops/w3-t20.jpg, crops/w3-c-cornerlight.jpg)

- Small bright motes drift near glow fixtures — cyan/white specks visible
  around the corner lamp and in the emerald cavern air (crops/w3-t35.jpg,
  crops/w3-t20.jpg). Density is LOW compared to Everwinter's snowfall: a
  dozen-ish specks per screen, tinted to the zone's glow hue, concentrated
  near lights rather than uniform. Camera-wrapping and per-particle
  behaviour: HYPOTHESIS (640x360 can't resolve individual sprite motion);
  the safe read is "spore motes localized at fixtures", i.e. air is used to
  sell the LIGHTS, not the weather.

## Color script (evidence: all above + crops/w3-c-threshold.jpg)

- Hue families, roughly: olive/tan rock 30%, emerald green 25%, violet/
  mauve 20%, dark blue-green shadow 15%, accent gold/red/cyan 10%.
- SHADOW HUE: blue-green to violet — darks go to deep teal in the emerald
  zone (crops/w3-t35.jpg) and to dark maroon-violet in the violet zone
  (crops/w3-c-darkdoor.jpg), never grey.
- Saturation ration: in the olive/tan zones ONLY pickups, crystals, glows
  and the balloon props are saturated (red drops, purple/yellow/green
  breadcrumb crystals — crops/w3-c-pathread.jpg, w3-c-distantglows.jpg).
- Zone-to-zone temperature lures: the threshold shot (crops/w3-c-threshold.jpg)
  shows the trick in cross-section — desaturated warm tan foreground room,
  a mauve rock jamb as the doorframe, and saturated EMERALD + cyan pool
  glow beyond it. Emerald zones also sit beside violet zones (stills 09/11
  vs t35): the world's governing contrast is green-vs-purple, with gold
  reserved for treasure/goal (gold fish, sand room).

## Staging (evidence: crops/w3-c-distantglows.jpg, crops/w3-c-threshold.jpg, crops/w3-t35.jpg, crops/w3-c-bossarena.jpg, frames/w3-hourglass-07.jpg)

- Dark frame → bright core: monolith slabs and dark rock masses pinned to
  frame left/right edges (crops/w3-c-distantglows.jpg both edges;
  crops/w3-t560.jpg right edge), mid-value mottled floor curling away,
  brightest glow cluster as destination.
- Thresholds frame the next hue: the mauve jamb around an emerald room
  (crops/w3-c-threshold.jpg); the sand room's pale floor visible past dark
  cave walls (frames/w3-hourglass-12.jpg).
- Focal hierarchy: blown-white additive core > saturated crystal > pale
  floor clearing > mottled mid-ground > dark framing mass. Five value
  levels, always in that order.
- Path read: pale painted clearings + lines of red stem-drops + breadcrumb
  glows — three redundant systems (paint, props, light) all saying "this
  way", so the route survives any camera angle (frames/w3-hourglass-07.jpg).

## Feel

- Buried treasure in a living geode — damp, glittering, hushed; the cave is
  dark and wet but every pocket hides a jewel.

## Engine translation (Three.js rules)

1. ONE canvas blob texture, re-tinted: generate a 512² texture of 12–20
   soft-edged amoeba blobs (radial-gradient sprites stamped on canvas) over
   a base fill, plus a second pass of 2–4 px dash speckles at 10x smaller
   scale. Use it for floor, walls, ceiling, and blocks; per-zone, only
   shift base color, blob color, and overall value. Never tile it fine —
   repeat count ≤ 2 across a room wall.
2. Bake orientation stepping into vertex colors: up-normals palest tint,
   side-normals one step darker toward the zone shadow hue (teal or
   violet), plus a painted dark seam strip texture along every ledge break.
3. Painted light pools on WALLS: for each fixture, stamp a radial gradient
   of the fixture's hue into the wall/ceiling bake (not just the floor);
   add halo sprite (additive, white core → hue rim) + small emissive core
   mesh. Keep mesh emissive saturated; let the sprite blow out.
4. Crystal terrain vs hero crystals: paint "glow" into terrain textures as
   ridge-top highlight / valley-dark contrast (emissiveMap optional);
   reserve true emissive + halo + bloom for pickup-scale crystals only.
5. Waterfall card: translucent cylinder/quad, vertical-streak canvas
   texture, additive-leaning blend, alpha higher at one rim, ALWAYS staged
   against dark rock; scroll UVs slowly downward.
6. Dark punctuation kit: near-flat slabs/door rects at 10–15% value in the
   zone's warm-dark hue with a half-step lighter top band; place in pairs
   at frame edges and decision points; rim them with pale rock.
7. Sand payoff room: swap the floor's speckle layer for bundled parallel
   ripple streaks; cluster man-made props (pots, chest) each on a painted
   contact blob; raise the room's base value ~15% above the caverns so the
   threshold is a value step as well as a hue step.
8. Breadcrumb line: 3+ glow crystals (purple→yellow→green) spaced evenly
   along the route, each halo-sprited; fog tuned to pull mid-ground DOWN to
   the shadow hue (dark-distance fog, not bright sky fog) so the glows
   become the only far-plane anchors.
