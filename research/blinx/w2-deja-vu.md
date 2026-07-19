# w2 — DÉJÀ VU CANALS (sandstone water ruins, turquoise canals)

Evidence: frames/w2-deja-vu-01…12.jpg, video /tmp/rt_blinx2/w2-deja-vu-full.mp4
(338 s), frame pulls crops/w2-t*.jpg + w2-x*.jpg, close-ups crops/w2-*.jpg.

World identity: a Venetian canal-town of sandstone quays and brick masses,
mostly enclosed (courtyards and canal canyons), with bright turquoise water
as the recurring luminous element. The emotional work is done by *water and
thresholds*, not by sky — this world's notable contradiction of the
cross-world sky law.

---

## Ground (evidence: crops/w2-floor.jpg, crops/w2-coping.jpg, crops/w2-waterstreak.jpg, crops/w2-x275.jpg)

- Base layer: a stone-tile grid, tiles ~30–45 px on screen at play distance,
  with **pale grout lines** (lighter than the tile body, not darker — the
  inverse of brick). Each tile carries a faint interior value wobble.
- Macro layer: big soft **green-grey blotches at 4–8× tile size that ignore
  the grid completely** (w2-floor.jpg, w2-waterstreak.jpg) — the "damp
  courtyard" read comes from this layer, not from the tile pattern.
- Per-tile value jitter: individual tiles randomly a step darker/lighter
  (visible across w2-floor.jpg) — breaks the grid like the fundamentals'
  brick rule.
- **Arena floors are a texture SWAP, not new geometry**: the circular combat
  pad in w2-x275.jpg is an irregular warm-ochre cobble/mosaic texture with
  pale grout, inset in the grey-green grid. Hue shift (warm tan vs green-
  grey) marks "this space is special" before any prop does. The doorway
  interior (w2-door.jpg) uses a third floor: dark cobble with blue-green
  glints.
- Painted litter: small dark flecks scattered on tiles near the monster door
  (w2-x240.jpg, bottom-left) — painted debris dabs, not particles.

## Edges & lips (evidence: crops/w2-coping.jpg, crops/w2-pit.jpg, crops/w2-awning.jpg, crops/w2-topsky.jpg)

- Every quay/canal edge is capped with **pale coping stones** — large,
  lightest-value blocks, slightly wider than the wall below, so the water
  edge reads as a bright outline from any camera angle (w2-coping.jpg,
  w2-canalstep.jpg). This is the world's signature trim: the canal is drawn
  with light.
- Quay side faces go **dramatically dark** — the vertical face under the
  coping is a deep warm brown, several steps darker than the top
  (w2-awning.jpg). Orientation value stepping is pushed harder here than on
  dry walls because the dark side-face also sells the water's brightness by
  contrast.
- Pit rims: the octagonal floor pit (w2-pit.jpg) has a pale rounded rim lip
  (real low-poly geometry, ~8 sides, lightest value), then the interior
  wall steps down a shade, then the dark fill. Three value steps: rim >
  wall > dark.
- Wall tops get a **pale yellow-green cornice band** (w2-topsky.jpg) — a
  painted trim strip plus a slight geometric lip at the roofline, so every
  wall silhouette terminates in a light edge against whatever is behind it.

## Transitions (evidence: crops/w2-canalstep.jpg, crops/w2-x60.jpg, crops/w2-x100.jpg, crops/w2-wallmoss.jpg)

- Wall-base waterline: where a quay wall meets canal water there is a
  **painted yellow-green stain band** just above the waterline and the wall
  continues a short distance below it, dimmer and greener (w2-canalstep.jpg,
  right side). The stain band is the world's drift-ring: algae instead of
  snow.
- Wall bases on dry land get a **moss fringe alpha strip** — a horizontal
  band of dangling yellow-green foliage silhouette hanging from a ledge,
  clearly a repeating cutout texture on a flat strip (w2-wallmoss.jpg). It
  hides the wall/floor seam AND the balcony underside at once.
- Sand drift mounds: a low pale mound mesh sits against the dark wall base
  in w2-x60.jpg (mid-left) — the skirt-geometry transition, same law as
  Everwinter's drifts, executed as a sand pile.
- Floating props (barrels) carry a soft **contact darkening directly under
  them on the water surface** (w2-water.jpg, w2-canalstep.jpg) — painted or
  decal blob, same law as land contact shadows, applied to the water plane.

## Walls & masses (evidence: crops/w2-brick.jpg, crops/w2-darkwall.jpg, crops/w2-redpatch.jpg, crops/w2-distance.jpg)

- Two brick value-variants of ONE construction: tan sandstone brick for lit
  walls (w2-brick.jpg) and a charcoal-brown variant for dark masses
  (w2-darkwall.jpg). Same recipe: small elongated courses, each brick with
  **painted lighter top edge + darker bottom edge** (painted relief), plus
  large soft macro blotches ignoring the course grid. The dark variant is
  how the game manufactures "dark frame" masses cheaply — same texture
  logic, shifted value range.
- Corner value stepping: at the convex corner in w2-brick.jpg the right
  face is a full step darker and greyer than the left face — orientation
  stepping on a 90° turn, no gradient.
- Plaster walls carry **faded salmon-pink patches** — soft irregular
  blobs over the tan base (w2-redpatch.jpg, w2-wallmoss.jpg), reading as
  peeling paint/faded fresco. This is the macro-blotch layer given a HUE
  shift (not just a value shift) — the cheapest possible "history" layer.
- Base courses: walls sit on a tier of larger, paler stone blocks
  (w2-brick.jpg bottom) — band/tier law confirmed; the big-block base also
  matches the coping, framing the brick field top and bottom.
- Distant masses (w2-distance.jpg): the far arcade is a uniformly dark,
  desaturated grey-purple slab with **arch interiors painted near-black**
  and a pale balustrade strip along its base. Detail is deleted with
  distance; only silhouette + dark arch punctures + one trim line survive.

## Special surfaces — WATER (evidence: crops/w2-water.jpg, crops/w2-canalstep.jpg, crops/w2-darkwater.jpg, crops/w2-fountain.jpg, crops/w2-slats.jpg)

- The canals are the world's luminous core. Construction: a flat plane with
  a **milky, mostly-opaque turquoise** (alpha high enough that the canal
  floor/walls barely show — unlike the fundamentals' ~0.6 clear water; here
  opacity is pushed toward 0.8–0.9, HYPOTHESIS: because the canal bed is
  not modelled, the water must hide its absence). Wall continuation below
  the waterline is only hinted at for a few pixels, dimmer/greener
  (w2-canalstep.jpg).
- The surface carries **soft mottled value patches** (w2-water.jpg) — a
  painted cloudy texture; motion (scrolling) cannot be confirmed from
  stills, HYPOTHESIS: slow UV scroll of the mottle texture, standard for
  this engine generation.
- **Water has a shadow-state**: the same canal in a covered/channelled
  stretch is rendered near-black teal with only a faint painted diagonal
  highlight (w2-darkwater.jpg, w2-slats.jpg — olive-dark water under the
  canopy). Two palettes — bright cyan in open air, dark teal in shade —
  fake a lighting model the engine doesn't have. The switch is per-region
  (vertex color or texture variant), not computed.
- Fountain water (w2-fountain.jpg) is the brightest cyan in the game and
  sits in a dark stone basin — the value gap between pale water and dark
  basin side is the whole effect. Under the basin's overhang the water is
  painted darker (contact darkening ON the water).
- Spouts: frame w2-deja-vu-07.jpg top shows a wall spout with a pale
  translucent stream and painted wet-streaks running down the wall under it
  — trick 1 (painted streaks) laminated with a translucent geometry strip.

## Darkness (evidence: crops/w2-pit.jpg, crops/w2-door.jpg, crops/w2-distance.jpg, frames/w2-deja-vu-10.jpg, crops/w2-x240.jpg)

- Pits: octagonal, pale rim lip, dark interior fill that is **deep navy,
  not black** (~10–15% value), with a subtle gradient darker at center
  (w2-pit.jpg). Matches the 15%-with-gradient law exactly.
- Arch openings in distant facades are flat dark fills (w2-distance.jpg) —
  darkness as punctuation, repeated in a rhythm (arcade = 4+ arches).
- The secret-room doorway (w2-door.jpg) is NOT dark — it is a **painted
  green watery-cavern texture**: vertical pale streaks (falls/wet stone)
  on deep green, a hue shift from warm sandstone to cold green at the
  threshold. Darkness here is traded for hue shift; the room reads "deep"
  because it is cold and desaturated, not because it is black.
- The monster-mouth door (w2-deja-vu-10.jpg, w2-x240.jpg): the building's
  doorway is a giant fanged skull; the mouth interior is flat deep red-
  black. Darkness is costumed as a creature — the pit law with a theme
  skin. Placement: at a goal/decision point, per law.

## Lights (evidence: crops/w2-torch2.jpg, crops/w2-x60.jpg, crops/w2-gemhalo.jpg, crops/w2-fountain.jpg, crops/w2-x275.jpg)

- Torch stack (w2-torch2.jpg): a small wall/pole bracket (physical object)
  + a **layered additive flame** — teardrop of orange core / yellow mid /
  soft red edge, camera-facing quads — + a faint warm glow. No visible
  painted pool on the ground at this distance, but the fixture leans
  against a dark navy wall so the flame carries maximum contrast: flames
  are placed on dark masses, never on lit brick.
- Blue canal flames: small blue-white glow sprites float at quay level
  along the water (w2-x60.jpg right) — breadcrumb glows marking the water
  path, cool-hued instead of warm (water logic: canal lights are blue).
- Bent green stems (w2-x275.jpg top, w2-vine.jpg) are **lamp/sign posts** —
  saturated green bent poles carrying an arrow board or small fixture. The
  stem is the world's lamp-post motif: infrastructure grown like a plant.
- Collectible gems (w2-gemhalo.jpg): a heart-shaped crystal mesh + a soft
  additive halo that bleeds pink onto adjacent pixels — halo sprite
  confirmed; the core stays saturated red, the halo does the overexposure.
- No dynamic lighting anywhere; every "lit" effect is sprite + paint.

## Sky & distance (evidence: crops/w2-topsky.jpg, crops/w2-distance.jpg, crops/w2-skyart.jpg, crops/w2-x100.jpg)

- **CONTRADICTION of the sky-drama law**: in play, sky is almost never
  visible — the world is walled; only thin pale blue-grey slivers appear
  above rooflines (w2-topsky.jpg). Distance is handled by **dark fogged
  building slabs** (w2-distance.jpg, w2-x100.jpg): each further mass is
  darker, greyer, lower-contrast, with detail deleted (arches become flat
  dark punctures). Distance = value MURDER, not value lightening toward a
  horizon hue — the inverse of Everwinter's stepped-pale mesas.
- The stage-select painting (w2-skyart.jpg) shows the intended read: a
  **teal-green sky** (darker teal up top, lighter toward horizon) with
  sandstone silhouettes — i.e. the world's atmosphere hue is green-teal,
  and the in-game fog/darkness borrows it. The canals' turquoise is the
  sky brought down into the level: in a world with no visible sky, the
  WATER does the sky's job.

## Overhead (evidence: crops/w2-slats.jpg, crops/w2-banner.jpg, crops/w2-awning2.jpg, frames/w2-deja-vu-05.jpg)

- The top third is occupied by: (a) **slatted canal canopies** — a sagging
  sheet of thin geometry with a painted plank texture (sage-green slats,
  dark gaps), the silhouette undulating so it reads as fabric/timber under
  its own weight (w2-slats.jpg); (b) **red fabric** — flat dark-red curtain
  banners hanging over railings and balconies (w2-banner.jpg,
  w2-awning2.jpg), the warm accent stored high; (c) balcony/railing strips;
  (d) wall cornices. The canopy slats double as a light-switch: water under
  them is rendered in the dark palette (w2-slats.jpg).
- Nothing overhead is bare: each element is stacked on a structure
  (canopy-on-posts, cloth-on-railing, cornice-on-wall).

## Props & motifs (evidence: crops/w2-canalstep.jpg, crops/w2-x60.jpg, crops/w2-x240.jpg, frames/w2-deja-vu-04.jpg)

- Barrels: the repeating prop — floating in canals (with contact darkening)
  and stacked on quays; warm tan with painted banding, one of the few warm
  saturated objects.
- Striped mooring poles (w2-x60.jpg): barber-pole banded posts (blue/
  white/black painted bands) clustered at canal edges — repetition as
  rhythm, 3+ per dock.
- Wooden dock platforms on thin posts (w2-water.jpg): plank-textured decks
  bridging quay→canal; posts plunge straight into water (no intersection
  dressing needed — water hides its own seams).
- The green bent stem + arrow sign (w2-vine.jpg, frames/w2-deja-vu-04/06):
  wayfinding as a recurring plant-fixture; arrow boards are red with white
  border — red reserved for signage, banners, and the monster mouth.
- Saturation ration confirmed: the courtyard is tan/green-grey; saturated
  color belongs to pickups (gems, stars), enemies, the green stems, red
  signs — interactive or directional things only.

## Particles & air (evidence: crops/w2-x185/w2-t185.jpg debris, crops/w2-torch2.jpg, crops/w2-x240.jpg)

- **CONTRADICTION (partial) of the everywhere-air law**: no constant
  weather/mote layer is visible in any of the 14 sampled frames — the air
  is still. Atmosphere is carried entirely by fog-tinted dark masses and
  water color. HYPOTHESIS: a canal world reads "humid/still" precisely by
  NOT moving the air; motes would fight the painted damp.
- Event particles exist: dark debris flecks burst from smashed objects
  (w2-t185.jpg), gold-coin sparkle bursts (w2-x240.jpg), flame quads +
  sparkle dots at torches (w2-torch2.jpg). All are additive sprite puffs
  tied to events, not ambience.

## Color script (evidence: all above; ratios estimated across the 24 viewed frames)

- Hue families: tan-sandstone ~35%, green-grey damp stone/moss ~25%,
  turquoise water ~20%, charcoal dark masses ~12%, accents (red banners/
  signs, green stems, pink plaster patches, gem colors) ~8%.
- **Shadow hue is warm brown on stone, dark teal on water** — darken
  toward umber on land, toward deep green-teal in canals; never grey.
- Allowed saturation: turquoise water (the one big saturated AREA — the
  world's inversion: the environment's saturation budget is spent on
  water, not sky), then small hot accents (red signs/banners, green stems,
  gem pink/yellow).
- Zone contrast: warm tan quay → cold green secret room (w2-door.jpg);
  bright open canal → dark teal covered channel (w2-darkwater.jpg);
  grey-green grid → warm ochre arena circle (w2-x275.jpg). Thresholds are
  temperature steps, per the law — but executed as TEXTURE SWAPS on
  identical geometry.

## Staging (evidence: crops/w2-x60.jpg, crops/w2-darkwater.jpg, crops/w2-fountain.jpg, crops/w2-x275.jpg)

- Canonical frame: dark wall mass on 1–2 edges (charcoal brick variant) →
  pale coping line drawing the canal's shape → bright turquoise water as
  the luminous core → a warm or glowing focal point (torch, fountain,
  gems). The water IS the bright core here; coping is the line that leads
  the eye to it.
- Vertical staging: quays sit above canals with docks, poles, and
  canopies at a second level — the "stacked floor planes" law executed as
  towpath-above-water.
- Thresholds: doorways frame a hue-shifted interior (green cavern) or a
  costumed darkness (skull mouth) — the lure is always visible from the
  path.
- Focal hierarchy: water brightness > gem halos > red signs > everything
  else; enemies (green lizard, ghost) sit in the same saturated band as
  pickups, so threats read at focal priority.

## Feel

Sun-bleached, humid stillness — a drowned Venetian toy-box where the water
glows and the stones remember.

## Engine translation (Three.js rules)

1. **Two-palette water**: one flat canal plane, MeshBasicMaterial-ish,
   milky turquoise (opacity ~0.85, no transmission); per-region variant
   (vertex color or second material) flipping covered stretches to dark
   teal with a single painted diagonal highlight streak in the texture.
   Mottle the surface with a slow-scrolling canvas-generated cloud
   texture. Add a soft dark blob decal under every floating prop.
2. **Coping line**: cap every water-adjacent wall with pale, slightly
   overhanging blocks (lightest scene value); darken the quay side-face 3
   value steps toward warm brown and paint a yellow-green algae band at
   the waterline. The canal must read as a bright shape outlined in light.
3. **Three-layer stone canvas texture**: tile grid with PALE grout +
   per-tile value jitter + large soft green-grey damp blotches on an
   independent (non-aligned) noise layer; same generator with a shifted
   palette produces the charcoal "dark frame" walls. Bake per-face
   orientation stepping (up lightest / side darker-greyer) into vertex
   colors.
4. **Alpha strips for age**: one dangling-moss cutout strip at wall bases
   and balcony edges; one scrollwork railing strip along quays. Always
   backed by a darker surface so the silhouette reads.
5. **Threshold = texture swap + hue step**: identical doorway geometry,
   interior material swapped to a desaturated cold-green "watery cavern"
   canvas (vertical pale streaks on deep green); arena pads are circular
   texture insets (warm ochre cobble) in the base floor grid — no new
   geometry for either.
6. **Fixture stack, cool variant**: torch = small bracket mesh + 2–3
   additive camera-facing flame quads (orange core/yellow/red edge) +
   faint glow sprite; canal breadcrumbs = blue-white glow sprites at
   water level; gems = saturated mesh + additive halo sprite (halo does
   the overexposure). Place flames only against dark masses.
7. **Darkness at 12–15% value, navy-tinted**: pit fill plane with a
   radial gradient (darkest center), pale rounded rim ring mesh (octagon
   is fine — low-poly is the style), interior wall one step lighter than
   the fill.
8. **Distance by value deletion**: background building slabs as flat dark
   grey-purple boxes; arches as flat near-black inset quads; one pale
   trim strip per slab. Fog color = desaturated green-teal (the sky the
   player never sees); keep skybox minimal or none — spend the sky budget
   on the water's saturation.
