# BLINX FUNDAMENTALS — cross-world laws (the engine builder's reference)

Distilled from frame-level study of all 8 worlds (96 playthrough stills +
pixel crops; per-world evidence in the sibling files `w*.md`). Each law is
phrased as something we can implement in Three.js. Read this BEFORE touching
`src/lib/engine/sceneGenerator.ts`.

## The root law: five cheap tricks, always stacked

Everything Blinx does is one of: (1) painted texture, (2) geometry placement,
(3) alpha cards, (4) additive/emissive sprites, (5) bakes (light/vertex/fog).
And **no trick ever appears alone** — every read is 2–3 tricks laminated so
the seam can't be found. When one of our scenes reads as "programmer art",
the diagnosis is almost always "a single trick exposed" (bare material, bare
primitive, bare sprite).

## Surface construction

- **Three-layer paint job** (crop-verified on brick, tile, snow): base
  pattern + macro dirt/value blotches + edge/corner darkening. The macro
  layer IGNORES the base pattern's grid — that's what reads as "weathered"
  instead of "tiled".
- **Texture scale is a mood dial**: fine dense detail = civilized/ordered
  (Temple relief), huge soft wet blobs = primal/organic (Hourglass caves).
- **Painted relief = consistent light logic**: flat wall + per-shape painted
  highlight/shade with ONE light direction + recess staining reads as carved
  depth. Bump maps unnecessary at our camera distance.
- **Vertical complexity = texture bands + thin real ledges**: stack texture
  bands on a wall, put a thin protruding ledge of real geometry at each band
  boundary. Texture provides richness; the ledges provide SILHOUETTE, which
  is what reads as architecture from distance.

## Form

- **Orientation value stepping**: up-faces palest, side-faces darker+bluer,
  down-faces darkest. Bake per-vertex by face normal. Plus a warm kiss of key
  light on sun-facing normals. This one pass is "honest rounded form".
- **Shadow is a HUE, never grey/black**: moss-green in the golden temple,
  violet in the caves, blue in snow. Darken toward the world's atmosphere
  hue, not toward #000.
- **Rounded lips**: platform/cliff edges roll (extra poly ring, smooth
  normals) + a painted rim-darkening band just inside the top edge.
- **Nothing is axis-aligned**: built things bend/bulge/taper slightly
  (Seuss). Amplitudes small — elasticity, not meltdown.

## Grounding (the anti-float laws)

- **No naked intersections**: every object base gets a transition — painted
  drift ring in the ground texture, a per-asset snow/dust line, or a skirt
  mound mesh. Blinx uses all three together on hero objects.
- **Painted contact darkening**: a soft irregular dark blob under every
  standing object (crop-verified under bombs, platforms, lamps). Real-time
  shadows can't make the soft wet edge; its absence = "assets on a plane".
- **Uneven ground still reads flat under objects**: bases sit in local
  clearings; the terrain relaxes under things.

## Light

- **The four-layer fixture stack**: physical emissive object + halo sprite +
  painted ground pool + bloom. The fixture never dynamically lights anything;
  the pool is painted/baked. Our engine: lightPool() + halo + orb +
  PointLight (we have real lights — keep them gentle, the paint does the work).
- **Lights are physical THINGS**: lamps on bent stems, glowing crystals,
  orb-flowers, gold nuggets. Never abstract sources. In the Mine the lamp is
  a plant; in the city it's a carnival bulb.
- **Breadcrumb trails**: small warm glows receding along the path = depth you
  can FOLLOW. The strongest "walk INTO the picture" cue.
- **Bloom converts points to atmosphere**: every emissive gets a halo;
  overexposed cores are the halo sprite's job, not the mesh's (keep mesh
  emissive saturated, don't blow to white).

## Darkness

- **"Absolute dark" = ~15% value with a gradient, never #000**: pits and
  mouths are darkest at the core, a shade of the world's atmosphere hue at
  the rim, with a rim lip that proves the hole has walls. Pure black reads as
  a rendering bug.
- **Dark punctuations are placed, not random**: cave mouths cluster 2–3,
  irregular organic shapes, at decision points in the path.

## Water / hot liquids

- **Water = transparency (~0.6 alpha) + animated bright streaks + contact
  darkening under floaters.** Walls visibly continue below the waterline,
  dimmer and bluer. No foam, no refraction, no reflection pass.
- **Lava = crackle-cell texture (white-yellow core → orange → deep red
  borders), emissive, BRIGHTEST at the edge where it meets the ledge** (hot
  meniscus), plus warm spill baked into neighbouring surfaces.

## Sky & distance

- **The sky texture carries the drama**: horizon band, dark cloud shapes,
  giant celestial bodies. Geometry only silhouettes against it.
- **Distance = discrete value steps**: each ridge/mesa layer a step lighter
  and closer to the horizon hue. Not a smooth gradient.
- **Sky is never empty**: gradient + cumulus bodies + a celestial. An empty
  gradient reads as a web page.

## Colour scripting

- **Saturation ration**: in near-monochrome worlds (Forgotten City), ONLY
  interactive things are saturated (pickups, enemies, glows) — mood and
  readability at once. In rich worlds, saturation clusters at focal points.
- **Hue temperature marks the emotional target**: warm = goal/shop/safety
  (Everwinter's golden gate in a violet world), cool = journey.
- **Room-to-room / zone-to-zone hue contrast as lure**: Forge's green room
  opening into an orange room through a doorway; Hourglass's emerald glow
  beside violet crystal. A threshold is a value step AND a temperature step.
- **5 hue families max per world**, distributed roughly 30/25/20/15/10.

## Staging & composition

- **Dark frame → bright core**: near mass (1–2 frame edges, dark, in-palette)
  → mid-value ground curling into distance → brightest warm pool as
  destination → dramatic sky. Composed in EVERY frame, not found.
- **The upper third is never empty**: wires+bulbs (built places), canopy
  (woods), ceiling mass (caves), banners. Empty top = stage set.
- **Repetition is rhythm**: 3 banners, 3 bollards, a line of lamps. One
  accent is a fluke; three is a place.
- **Verticality sells scale**: stacked floor planes (canal below grade,
  shaft tiers above) + lights at each level like breadcrumbs.
- **Thresholds frame the NEXT room's hue**: doorways are composed so the
  destination's colour shows through — the lure.

## Particles & air

- **Air is a camera-wrapped volume**: weather/motes constant everywhere,
  travelling with the player; near-camera particles bigger/softer.
- **Pair particle values** (white spray + dark debris) so events read on any
  ground value.

## The Blinx feel (one line)

Confident wrong hues with honest values; everything hand-made, curved,
weathered; light you could pick up and carry; every frame staged like a
background painting you can walk into.

---

## BOUNDARY CONDITIONS (where the laws bend — from the 8 world files)

Laws are defaults; each world is allowed to break exactly the ones its
fiction demands. These are the observed, cited exceptions:

- **Water alpha is fiction-driven, not fixed.** Clean/romantic water ≈0.6
  (see-through); canal water ≈0.85 milky (hides an unmodelled bed — w2);
  toxic slime, frozen pools, and lava are fully OPAQUE (w4, w7, w8). Rule:
  pick the recipe per liquid's story, never by habit.
- **Darkness has two registers by gameplay function.** Walkable thresholds
  hold 15–20% value with a gradient and a pale lip (a place to go); death
  pits and voids drop to near-black (danger). Pure #000 appears ONLY when a
  pale chipped rim proves the wall's thickness (w4). The dark's value IS the
  signage.
- **Distance steps LIGHT outdoors, DARK indoors.** Open worlds: ridges step
  toward the pale horizon hue. Caves/enclosed: far walls sink into deep
  shadow hue, and fog-immune additive glows (breadcrumb crystals) become the
  depth ladder instead of ridgelines (w3, w6).
- **Sky is a budget, not a given.** Canyon-street and cave worlds show almost
  no sky (w1, w2, w3); its compositional budget is re-spent on the overhead
  layer (pennants, wires, ceilings) and on window cards. If a world's sky is
  missing that's a CHOICE, and something must inherit its job.
- **Air is per-world.** Snow/ember worlds wrap the camera in particles;
  temple and canal worlds are deliberately still. Stillness = sacred/humid;
  weather = wild. Choose, don't default.
- **Contact shadows follow the zone hue** (warm-grey in sand rooms,
  blue-green at crystal blocks, violet in snow) — never neutral. And lamp
  stems hide their ground contact INSIDE the brightest painted pool, so the
  seam vanishes into the busiest value area (w1).
- **Painted light/shade can separate by HUE, not value.** Temple relief's
  "light direction" is a hue swing (green-gold lit vs umber shade at equal
  value); Everwinter cliffs step hue (lavender→bluer) more than value.
- **The still-set law is absolute** (see `_dynamics.md`): architecture never
  vertex-animates; life is a separate mover layer. A still bake is
  authentic — a static everything is not.
