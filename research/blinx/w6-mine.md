# w6-mine — THE MINE (dark caverns, fire, glowing crystal stalks, gold)

Evidence: frames/w6-mine-01..12.jpg (640x360 stills), crops/w6m-t*.jpg (11 frames
pulled from the full 512s playthrough video), crops/w6m-*.jpg (18 targeted
3x close-ups). Method and the five fundamental tricks per _example-snow.md;
cross-world laws per _fundamentals.md. Everything below is HOW, cited per claim.

The Mine is an INTERIOR world — there is no sky. Its entire look is built from
one inversion of the outdoor worlds: **the "sky/distance" slot is filled by
darkness, and the "sun/celestial" slot is filled by hand-placed glows.**
Light here is not illumination, it is CURRENCY — gold, crystals, fire, exits
all glow, and the rock between them is allowed to fall to near-black.

---

## Ground: surface construction

(evidence: crops/w6m-tealfloor.jpg, crops/w6m-cyanpool.jpg, crops/w6m-gold.jpg,
frames/w6-mine-03.jpg, frames/w6-mine-09.jpg)

- The floor is ONE grey-green rock texture doing three jobs: (a) a fine dark
  speckle/pit tile (small dark dabs, ~2-4 px at screen), (b) macro darker
  olive-brown blotches that ignore the speckle grid (crop-verified in
  w6m-tealfloor — blotches are 10-20x the speckle scale), (c) large TEAL-CYAN
  zones washed over whole rooms.
- The teal zones are a MULTIPLY, not an overlay: the rock speckle and blotch
  pattern show through the teal unchanged in frequency, only shifted in hue
  (w6m-tealfloor, w6m-cyanpool). FUNDAMENTAL: **zone tinting = a second value
  layer (vertex colour or lightmap bake) multiplied over one shared rock
  diffuse** — the painter never repaints the rock, they re-LIGHT it.
  HYPOTHESIS: per-vertex colour bake rather than a second UV set — the teal
  pool edges are soft and blob-shaped with no texture seams, and 2002 Xbox
  vertex density is enough for room-scale blobs.
- On top of the baked teal sit CRISP flat cyan ellipse decals (w6m-cyanpool,
  left edge and lower right): hard-edged glowing ovals with a slightly lighter
  rim and a soft centre, lying flat on the floor. These are the world's
  "light pool" decals — note the rim is CRISP here, unlike the soft pools of
  other worlds. Mine-specific: pools have a drawn edge, like bioluminescent
  lichen colonies, not like spilled light.
- Painted flat ORANGE ARROW decals on the floor point the route
  (crops/w6m-glyphgate.jpg — a flat orange arrow at the door; also small
  orange arrows on platform tops in crops/w6m-depth.jpg). Navigation is
  painted ON the ground, not signed in the air.
- The value structure: palest teal at room centres and path lines, dark
  olive-brown at room edges and under props — the floor darkens toward walls,
  pushing the eye to the lit middle (frames/w6-mine-03, w6-mine-09).

## Edges & lips

(evidence: crops/w6m-breadcrumb.jpg, crops/w6m-depth.jpg, crops/w6m-pit.jpg,
crops/w6m-rails.jpg)

- Platform tops are pale teal-green; side faces drop to dark red-brown
  (w6m-depth, w6m-breadcrumb) — the fundamentals' orientation value stepping
  (up = lightest, side = darker + warmer here, not bluer; the Mine steps
  toward BROWN, its atmosphere hue).
- Platform rims show a rounded lip with the pale top colour curling slightly
  over the edge before the dark side face begins (w6m-breadcrumb, the curved
  platform at centre) — a roll of geometry, not a hard 90° corner.
- Even the minecart rails obey orientation stepping: dark brown sides, a thin
  pale-green sheen along the top face where they catch the teal ambient
  (w6m-rails). FUNDAMENTAL: in a baked world, EVERY horizontal surface gets
  the pale kiss, even 4-px-wide ones — that is what makes thin geometry read
  as lit instead of flat-shaded.

## Transitions (object-to-ground)

(evidence: crops/w6m-cyanpool.jpg, crops/w6m-tealfloor.jpg, crops/w6m-pit.jpg)

- The standing stove/kiln prop grounds itself with TWO stacked tricks: a
  flared metal SKIRT ring at its base (geometry, lighter pale metal than the
  body — visible band around the foot in w6m-cyanpool) plus a soft dark
  contact blob painted under the skirt (visible as the dark halo around the
  base in both crops). Confirms the fundamentals' no-naked-intersections law;
  Mine-specific instance: the skirt is METAL-BRIGHT so it reads as a
  designed plinth, not hidden.
- Crystal stalks and lamp stalks meet the ground with nothing but a small
  dark contact dab — acceptable because they are thin; the eye forgives thin
  things (w6m-crystalstalk, w6m-whitecrystal).
- Rock blocks and dark masses sit in local clearings: the floor's macro
  blotch pattern relaxes to plain dark under them (w6m-darkmass).

## Walls & masses

(evidence: crops/w6m-strata.jpg, crops/w6m-t295.jpg, crops/w6m-depth.jpg,
frames/w6-mine-07.jpg)

- TWO texture-scale families, one per space type — the fundamentals'
  "texture scale is a mood dial" confirmed with a world-internal contrast:
  (a) open canyon walls = HUGE soft brown stains, 30-80 px blobs, almost no
  fine detail (w6m-strata — the wall is 3-4 giant stains plus crevice
  darkening); (b) enclosed rooms = the fine speckled grey-green floor
  texture carried up the walls. Vast primal space = giant blobs; intimate
  treasure rooms = fine detail. Scale tells you where you are before light
  does.
- Canyon wall relief is painted: dark brown recess staining in crevices,
  mid-brown body, slightly paler crowns on bulges — one consistent light
  logic (from above), no bump needed (w6m-strata).
- Vertical wall complexity = texture value bands + occasional REAL thin
  ledges. In w6m-depth the far wall is stacked horizontal bands (value steps
  in the texture) and only the playable heights get protruding ledge
  geometry with rails on them. Silhouette is spent only where the player
  walks.
- Dark framing masses: huge near-black rectangular rock blocks stand inside
  rooms (frames/w6-mine-03, crops/w6m-darkmass). They carry almost no
  texture read — just a faint teal rim on the top edge from the room's
  ambient. Their JOB is compositional: they are the dark frame in front of a
  lit chamber (behind the block in w6m-darkmass, gold glows in a green-lit
  room). FUNDAMENTAL: **the Mine puts its darkest value INSIDE the room, as a
  prop, not just at the walls** — dark frame → bright core at prop scale.

## Special surfaces: the teal glow-ground (this world's "water")

(evidence: crops/w6m-tealfloor.jpg, crops/w6m-cyanpool.jpg, frames/w6-mine-03,
frames/w6-mine-09)

- The Mine has no water/lava; its special surface is BIOLUMINESCENT GROUND.
  Construction (three layers): (1) shared rock diffuse with speckle +
  blotches; (2) room-scale teal multiply bake (soft blob edges); (3) crisp
  cyan ellipse decals with light rims for the brightest pools.
- No scrolling, no transparency, no reflection anywhere on it — the glow is
  entirely emissive-LOOKING paint plus decals. The rock texture continues
  undimmed under the teal (multiply, not coverage).
- The cyan crescent shards standing next to pools are small emissive MESHES
  with halo sprites (w6m-cyanpool — the crescents beside the ovals), so flat
  decal (ground) + standing mesh (pickup) rhyme in the same hue.
- FUNDAMENTAL: **one hue, three tricks** — baked tint (trick 5), flat decal
  (trick 1/3), emissive mesh + halo (trick 4) — the eye reads "this floor is
  alive with glowing lichen" without any shader.

## Darkness

(evidence: crops/w6m-pit.jpg, crops/w6m-darkmass.jpg, crops/w6m-breadcrumb.jpg,
frames/w6-mine-08.jpg)

- Gameplay darkness (pit mouths beside the path): darkest core ~10-15%
  value, but the hue is BROWN, never grey — the pit interior faces in
  w6m-pit are very dark brown with a visible value gradient inward, and the
  lip keeps the pale ground colour so the hole proves it has walls.
  Confirms the fundamentals' 15%-with-gradient law.
- CONTRADICTION / REFINEMENT of the law: NON-gameplay void darkness — the
  canyon chasm — IS allowed to hit near-black (~#050505). In w6m-breadcrumb
  and frame 08 the void right of the platforms is essentially black with no
  gradient. Rule refinement: **darkness you can fall into gets a brown
  gradient and a rim; darkness that is merely backdrop goes to black** — the
  game spends its "honest dark" budget only where the player can interact.
- Green/teal light spills ONTO pit walls near glowing floors (w6m-pit, green
  wash at left edge) — baked, not dynamic; the spill is painted on the pit's
  upper wall faces.
- Dark punctuations are placed at decision points: twin black blocks flank
  the teal room (frame 03), the pit gapes exactly where the path forks
  (t430/w6m-pit).

## Lights: the fixture stack

(evidence: crops/w6m-crystalstalk.jpg, crops/w6m-whitecrystal.jpg,
crops/w6m-lampspill.jpg, crops/w6m-breadcrumb.jpg, crops/w6m-halo.jpg,
crops/w6m-fire.jpg)

- The world's lamp is a PLANT-STALK: thin dark stem (geometry) + one glowing
  head. Two head variants: (a) magenta-pink orb/crystal (w6m-crystalstalk —
  faceted emissive mesh, polygon edges visible at the core), (b) pale
  yellow-white crystal flower (w6m-whitecrystal).
- Full stack per fixture, four layers, all confirmed in crops: physical
  emissive mesh (saturated magenta core, NOT blown white) + additive halo
  sprite (white core ~20-30% of blob diameter, then saturated colour fringe,
  then soft falloff — w6m-lampspill, w6m-halo) + painted ground/wall pool
  (soft colour tint on the floor under and wall behind — pink wash around
  stalk bases in w6m-crystalstalk, warm stain on the wall behind the fire in
  w6m-fire) + no dynamic light anywhere.
- Halo draw order proof: the big white-pink halo in w6m-halo bleeds over the
  bridge geometry in front of AND behind its source — it is a screen-facing
  additive sprite composited over everything, which is also why halos punch
  through fog (below).
- BREADCRUMB TRAILS: pink stalk-glows are planted at regular intervals along
  path edges and platform corners, receding into the dark (w6m-breadcrumb —
  four orbs marching up the path; w6m-depth — orbs on each descending
  platform). Because they are additive sprites they do NOT dim with distance
  the way fogged geometry does — far orbs stay bright, so the trail reads as
  a dotted line THROUGH the darkness. This is the Mine's primary depth cue:
  depth = a dotted line of glows, not a fog gradient.
- FIRE (the wall-sconce flame, t25/w6m-fire): not one quad — a cluster of
  overlapping round additive billboards (white core, yellow mid, orange
  tongue tips) giving a lumpy flame silhouette ~3 blobs wide; plus a
  separate small RED glow sprite at the base (visible pink-red blob
  bottom-left of the flame); plus a baked warm stain on the wall behind.
  Three tricks stacked; zero dynamic light.
- GOLD NUGGETS (crops/w6m-gold.jpg, w6m-lampspill): small angular emissive
  meshes, yellow core blown toward white by a halo, PLUS a 4-point star
  flare sprite on each (vertical-dominant cross flare visible in w6m-gold),
  plus a faint warm ground tint. Collectibles get the same stack as lamps —
  in this world LIGHT and MONEY are literally the same asset language.

## Sky & distance

(evidence: frames/w6-mine-08.jpg, crops/w6m-depth.jpg, crops/w6m-breadcrumb.jpg,
crops/w6m-pausefilter.jpg, crops/w6m-lampspill.jpg)

- No sky — interior world. The distance slot is filled by FOG TO DARK BROWN:
  geometry detail dies within ~one canyon width (frame 08: far wall already
  silhouette; w6m-depth: one platform away = texture gone).
- Because fog kills diffuse first, the additive glows become the ONLY
  far-field information — the depth system is inverted from outdoor worlds:
  not "ridges stepping lighter" but "glows staying bright while rock dies".
- The one bright far-field element: WHITE-LIT PASSAGE MOUTHS — a cave
  opening painted near-white with a soft gradient (w6m-lampspill, the white
  shape below the gold glow; also the white opening in t160). The dark-mouth
  grammar inverted: a white gradient mouth = illuminated space beyond = the
  lure. FUNDAMENTAL: in a dark world, thresholds are value INVERSIONS —
  black mouths say "hazard/unknown", white mouths say "go here".
- The PAUSE/time-stop state (frames/w6-mine-06, crops/w6m-pausefilter) is
  forensic gold: the game desaturates the whole world to violet-blue
  monochrome and renders glows white. Stripped of hue, the scene's lighting
  reads as exactly the baked pools + value steps described above (the lamp
  pool bottom-left, the glowing ring platform, the blotch pattern in
  monochrome) — direct proof the "lighting" is baked paint, not lights.

## Overhead (the top third)

(evidence: crops/w6m-t25.jpg, crops/w6m-t470.jpg, crops/w6m-t430.jpg,
frames/w6-mine-10.jpg)

- The ceiling is a dark brown-black MASS — same huge-blob texture as canyon
  walls, value ~10-20%, occasionally catching a green/teal rim from room
  glow (t25 top edge). It is never detailed; it is the world's dark lid.
- Where the top third must work harder, WOODEN SCAFFOLDING appears: posts +
  beams + plank runs in warm-lit brown (t470 — the results-screen backdrop
  shows posts and overhead beams; t430 — wooden structures on the upper
  canyon rim). Mine-appropriate "occupant" of the top third: timbering, not
  wires or banners.
- Occasional hero overhead shapes: a huge pale root/bone-like arch spans the
  top of frame 10 — a single curved pale mass against the dark lid, i.e. an
  upside-down framing mass, pale to pull the eye up once per zone.
- Plus the breadcrumb glows themselves often sit HIGH (on upper path rims),
  so the dotted-line depth system doubles as top-third occupation
  (w6m-breadcrumb).

## Props & motifs

(evidence: crops/w6m-cyanpool.jpg, crops/w6m-glyphgate.jpg, crops/w6m-gate.jpg,
crops/w6m-darkmass.jpg, frames/w6-mine-05, w6-mine-09)

- THE repeated collectible: GOLD — nuggets on the ground (w6m-gold), gold
  bars/cubes on platforms (frame 11), floating "15G" values on pickup.
  Always the warmest, most saturated small object in frame; always with the
  flare sprite. Saturation ration enforced: rock stays earthy, ONLY
  gold/crystals/pickups/exits are saturated.
- Time-crystal pickups (green diamonds, pink hearts, moons, stars) are
  emissive meshes + halos, clustered in threes-to-fives near hazards or
  doors (w6m-glyphgate, frame 09) — pickup clusters mark decision points,
  same grammar as the dark punctuations.
- Accent props: the black stove/kiln with bright metal skirt (w6m-cyanpool),
  wooden signboards (the "2" sign in frame 01), the cat-glyph metal door
  (w6m-glyphgate — green emissive glyph decal on a dark metal slab), the
  circus-striped gate with red curtain doorway (w6m-gate — red/white painted
  stripes on plain cylinders + dark cat-face door + warm lamp halo at top).
  Prop density is LOW (1-2 per room) but every prop gets a grounding trick +
  a glow or a painted accent: nothing is bare.
- Striped poles + curtain at the gate: the stripes are PAINTED texture on
  simple geometry (w6m-gate — stripe edges are texture-crisp while pole
  silhouette stays a plain cylinder), and the doorway behind is dark red
  curtain texture, i.e. a threshold built from paint, not architecture.

## Particles & air

(evidence: frames/w6-mine-03, crops/w6m-glyphgate.jpg, crops/w6m-t205.jpg,
crops/w6m-fire.jpg)

- Event particles: yellow 4-point STAR sprites burst from actions (frame 03,
  w6m-glyphgate — stars are flat additive sprites, 2 sizes, slight rotation);
  explosions = a big white additive burst + dark debris (t205 — white blob +
  dark ball and chunks), the fundamentals' paired light/dark particle values.
- Fire embers: small bright flecks at flame tips (w6m-fire, top edge) —
  sparse, additive.
- Ambient air: NO weather layer (unlike Everwinter's snowfall box) — the
  Mine's air is still; atmosphere is carried by fog + darkness instead of
  motes. HYPOTHESIS (640x360 can't resolve): there may be a very sparse dust
  mote near lamps, but no frame resolves one cleanly; treat as "no ambient
  particle volume" for engine purposes.
- FUNDAMENTAL: the Mine proves the "air volume" law by omission — a world
  can skip the particle layer if the FOG + DARK + GLOW system already fills
  the air with readable depth.

## Color script

(evidence: all frames; ratios estimated across the 11 video pulls)

- Hue families: (1) dark ochre/brown rock ~30%, (2) near-black darkness
  ~20%, (3) teal/cyan glow-ground ~20%, (4) warm yellow-orange
  (gold/fire/exits/lamps) ~15%, (5) magenta-pink crystal glows ~8%,
  (6) green accents (zone tints, diamonds, glyph) ~7%.
- Shadow hue: shadows go to BROWN and VIOLET-BROWN, never grey (w6m-pit,
  w6m-strata; the pause filter in w6m-pausefilter shows the neutral value
  structure with hue stripped — ambient shadow = dark warm brown).
- ALLOWED to be saturated: gold (yellow), crystal orbs (magenta), time
  gems (green/pink), the exit slab (orange), the green glyph. Everything
  mineral stays earthen. The saturation map IS the interaction map — in the
  darkest world the ration is strictest.
- Zone-to-zone contrast: brown canyon ⇄ teal lichen rooms ⇄ green-tinted
  side chambers (frame 02 right side, w6m-darkmass background) ⇄ warm
  orange-red goal rooms (w6m-exit, frame 12). Thresholds (striped gate,
  white mouths) sit exactly on the hue seams.

## Staging

(evidence: frames/w6-mine-08, crops/w6m-darkmass.jpg, crops/w6m-depth.jpg,
crops/w6m-breadcrumb.jpg, crops/w6m-exit.jpg)

- Dark frame → bright core is enforced with PROPS, not just walls: near-
  camera black rock blocks occupy 1-2 frame edges (w6m-darkmass), the lit
  teal floor curls into the middle, and the brightest warm thing (gold
  cluster, white mouth, orange exit) sits at the vanishing third.
- The path reads as: pale teal floor ribbon + rails converging + dotted
  pink-glow breadcrumbs + orange floor arrows — FOUR redundant path cues
  stacked, all cheap (paint, geometry, sprites, decal).
- Thresholds frame the next hue: the striped gate shows warm red curtain
  (w6m-gate), white mouths show lit space (w6m-lampspill), the exit is a
  saturated ORANGE VERTICAL SLAB (a glowing cabinet/door, flat emissive with
  slight edge darkening + halo + warm floor spill — w6m-exit) — the single
  warmest large shape in the entire world, placed at the level's end.
- Verticality: canyons stack 3+ floor planes (frame 08 — track level,
  ladder level below, upper rims) with a glow planted at each level, so
  scale reads through the glow-dots at different heights.

## Feel

One phrase: **greedy coziness in a cold dark** — a treasure-hoarder's
lantern-lit burrow; the dark is big and the warm pockets are small, so every
glow feels earned and pocketable.

## Engine translation (Three.js rules for THIS world)

1. **One rock canvas-texture, re-lit by vertex colours.** Generate a single
   tileable rock diffuse (fine speckle + macro blotches at 10-20x scale,
   blotches off-grid). Per zone, bake multiply tints into geometry
   vertexColors: teal for lichen rooms, ochre for canyons, green for side
   chambers. Never author a second rock texture.
2. **Orientation value pass, Mine-specific:** up-normals × pale teal, side
   normals × dark warm brown, down × near-black brown. Apply to ALL geometry
   including thin rails (2-px top faces still get the pale kiss).
3. **Crisp-rim pool decals:** flat ellipse decals on the glow floors —
   canvas radial texture with a HARD bright rim ring + soft centre, additive
   ~0.6-0.8, polygonOffset to avoid z-fight. Contrast with the soft baked
   tint beneath: crisp decal over soft bake is the Mine's signature.
4. **Glow-stalk fixture stack:** thin dark cylinder + emissive low-poly orb
   (saturated, NOT white) + additive halo sprite (radial canvas: white core
   20%, saturated fringe) + painted tint pool in the floor vertex colours.
   Set `fog:false` on the halo material so breadcrumbs survive distance.
5. **Breadcrumb placement rule:** stalks every ~4-6 m along path edges and
   at every platform corner/level change; the dotted bright line IS the
   depth system in a fog-to-black world. Stagger heights to sell verticality.
6. **Fog to brown-black, two darkness tiers:** `scene.fog` dark brown
   (#160d08-ish), short far. Gameplay pits: separate dark-brown gradient
   geometry with pale rim lip (never #000). Backdrop voids: allowed to go
   ~#050505 flat — spend "honest dark" only where the player interacts.
7. **Fire as billboard cluster:** 5-8 additive round sprites jittered in a
   cone (white core, yellow mid, orange tips) + one red base-glow sprite +
   warm stain baked into the wall vertex colours behind. No PointLight, or
   one very gentle flickering PointLight as garnish only.
8. **The exit is the warmest object in the level:** one saturated orange
   emissive slab + halo + warm vertex-colour spill on the floor before it.
   Audit the palette: nothing else may reach its saturation × area product.
