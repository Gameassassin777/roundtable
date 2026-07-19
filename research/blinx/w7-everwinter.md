# w7 EVERWINTER — lavender snow, pink tree walls, green crystals (547s playthrough)

Evidence: 12 stills (`frames/w7-everwinter-*.jpg`), 14 full video frames
(`crops/w7e-t*.jpg`, t=15…520 of 547s), 16 pixel crops (`crops/w7e-*.jpg`).
Video `/tmp/rt_blinx2/w7-everwinter-full.mp4` present and used.

Everwinter's signature trick, seen on every asset class: **snow is a per-face
decision, not a per-object one.** Up-facing surfaces of EVERYTHING — pipes,
rocks, gate beams, wall ornaments, debris — carry white; side faces keep the
base hue. One global "snow lands on top" rule does the world's cohesion.

---

## Ground (frames/w7-everwinter-04, -11; crops/w7e-snowground, w7e-palezone, w7e-t200)

- Base is a flat lavender-mauve fill carrying a **huge soft blotch layer**:
  rounded patches ~30–60px across (at 640px frame width) of slightly darker or
  lighter mauve, edges fully feathered, contrast so low (~10–15% value delta)
  they read as wind-drift shading, not dirt (crops/w7e-snowground).
- Over that, a **sparse dark speckle**: isolated 1–2px near-black dots,
  irregular spacing, no grid — reads as exposed grit/debris poking through
  snow. Same crop.
- **The blotch layer's hue and value shift per zone**: open fields are
  mid-saturation mauve (frames -04, -11); the ice-cave approach zone is
  pale blue-white with barely any blotch contrast (crops/w7e-palezone);
  the monster arena is a darker, greyer mauve (frames/w7-everwinter-11,
  crops/w7e-spikebomb). One texture recipe, re-tinted per room — value
  scripting via ground paint.
- FUNDAMENTAL: snow ground = flat fill + macro feathered blotches + sparse
  dark speckle, zone-tinted. No normal detail, no tile repetition visible
  at any distance.

## Edges & lips (crops/w7e-t15, w7e-t45, w7e-icepool; frames/w7-everwinter-02)

- Plateau and ledge edges are **rounded rolls**: the silhouette curve from
  top face to side face is a soft quarter-round, and the value rolls with it —
  pale top, one step darker and bluer on the side face (crops/w7e-t45, the
  central plateau).
- Where snow meets an ice pool, the snow edge is a **pale raised lip line**,
  one thin light band tracing the pool outline before the dark blue begins
  (crops/w7e-icepool, w7e-blueice). The lip is the rim-light band painted as
  geometry's last ring of snow.
- Dark floating/floor platforms (frames/w7-everwinter-02) are near-flat
  umber slabs, but their top edges catch a faint pink rim — a painted
  sky-bounce line on the up-most edge pixels.
- FUNDAMENTAL: rounded lip geometry + orientation value step (up=palest,
  side=darker+bluer) + occasional painted rim line. Same law as the
  exemplar; here the rim light is tinted PINK by the horizon band.

## Transitions (crops/w7e-contact, w7e-palezone, w7e-t200; frames/w7-everwinter-09)

- Every grounded object gets a **painted contact blob**: soft, irregular,
  ~30–40% darker than the surrounding snow, hue-shifted toward violet, never
  grey. Visible under pebble clusters (crops/w7e-contact), under the dark
  boulder (crops/w7e-palezone), under the floating platform as a big round
  baked blob (crops/w7e-contact top).
- Blinx's own shadow is a **blue-grey soft ellipse** (crops/w7e-palezone) —
  the world's shadow hue is blue-violet, and even the one "dynamic" shadow
  obeys it.
- Small debris chunks each carry a **tiny snow cap on their top face**
  (crops/w7e-contact), so even 10px props obey the up-face snow rule and
  never look pasted on.
- FUNDAMENTAL: three-layer grounding (contact blob + up-face snow cap +
  terrain relaxing under the object) — confirms the anti-float laws; the
  world-specific note is that the blobs are violet, never neutral.

## Walls & masses (crops/w7e-sky, w7e-rocksnowcap, w7e-candywall, w7e-treewall; frames/w7-everwinter-01, -05)

- Two wall families. (a) **Wild masses**: huge dark umber/purple rock chunks
  with near-flat texture, almost no internal detail — all their interest is
  silhouette (jagged low-poly outlines, crops/w7e-sky) plus a snow pack on
  top faces (crops/w7e-rocksnowcap). Texture SCALE is huge and soft; the
  painter spent nothing on them because the magenta flora and sky do the work.
  (b) **Built walls**: saturated crimson flat wall flanked by candy-cane
  striped pillars (red/white horizontal bands) with a giant teal double-spiral
  ornament applied on the face (crops/w7e-candywall).
- The teal ornament carries **painted relief logic**: lighter teal on top
  edges, darker teal underneath, and a thin WHITE line on its uppermost
  edges — snow sitting on the ornament's up-faces (crops/w7e-candywall).
  Flat wall + one consistent light direction + snow line = carved read.
- The "pink tree walls" are **flora clusters used as masonry**: dense packs
  of hot-magenta rounded blobs (soft radial shading, lighter crown / darker
  base) stacked along the tops and faces of dark rock masses until the mass
  is walled off (crops/w7e-treewall, w7e-pinktrees). Orange-red blob variants
  fill the lower tier. White sparkle dots sit on some blobs — settled snow
  glints.
- FUNDAMENTAL: silhouette + snow cap for wild masses; flat saturate paint +
  painted-relief ornament + snow line for built walls. Enclosure comes from
  flora stacked on rock, not from geometry.

## Special surfaces — ice pools, blue ice, waterfall/icefall (crops/w7e-icepool, w7e-blueice, w7e-waterfall, w7e-icefall; frames/w7-everwinter-07, -12)

- **Frozen pools are OPAQUE** — a contradiction of the cross-world water law
  (alpha ~0.6, wall continues below). Everwinter's pools are flat deep
  blue-violet fills, darker than all surrounding snow, carrying **white
  square sparkle dabs** (painted glints, scattered, a few brighter cores)
  and ringed by the pale snow lip (crops/w7e-icepool). The blue ice patches
  are the same recipe in lighter periwinkle (crops/w7e-blueice).
  Cold world logic: the water is frozen, so transparency is deleted and
  specular is PAINTED as square dabs.
- **Waterfall / icefall is the translucent one**: a tall column of
  vertical white-blue streaks, alpha ~0.7 — the blue cliff face behind shows
  through dimmed — with a brighter, near-additive white core streak and softer
  edge falloff (crops/w7e-waterfall, w7e-icefall). It reads as a scrolling
  streak texture on a quad/column stacked over a flat blue backing.
- FUNDAMENTAL: two frozen-water recipes — opaque sparkle-dab plane for
  horizontal ice, translucent scrolling-streak column for vertical falls.
  Orientation picks the recipe.

## Darkness (crops/w7e-goldgate, w7e-t200; frames/w7-everwinter-05)

- The gate interior is **never black**: a deep blue-violet fill, darkest at
  centre and lifting slightly toward the frame edges — a gradient, not a
  flat cut (crops/w7e-goldgate). The gold door frame around it acts as the
  rim that proves the hole has thickness.
- Under-ledge pits (the gap beneath the floating platform, crops/w7e-t200)
  are the same recipe: dark violet core, soft edge.
- Dark masses cluster at path decision points (cave mouths by the pool,
  frames/w7-everwinter-05) — placed, not random.
- FUNDAMENTAL: confirms "absolute dark = ~15% value, atmosphere-hue gradient,
  rim lip" — here the atmosphere hue is blue-violet.

## Lights (crops/w7e-lamp, w7e-goldgate, w7e-greengems; frames/w7-everwinter-06, -07)

- The fixture stack, Everwinter edition: **physical lantern** (dark umber
  lamppost, near-silhouette against snow) with a **small warm white-yellow
  glint** in the lantern head (crops/w7e-lamp). No visible dynamic light;
  the glow is a bright painted/sprite core. Posts are placed along the path
  edge as breadcrumbs (frames/w7-everwinter-07).
- The **golden gate is the world's light organ**: gold-ochre beams with
  painted vertical wood streaks and blown white hot-spots near the top
  (painted speculars + halo bloom), and the ground around it is painted
  WARM TAN — a baked warm pool replacing the lavender snow blotch recipe
  for a full room (frames/w7-everwinter-06, crops/w7e-goldgate). The warm
  spill is ground paint, not a light.
- Green crystal collectibles are **emissive diamond meshes + soft green
  halo sprites**, floating over pits as lures (crops/w7e-greengems).
- FUNDAMENTAL: four-layer stack confirmed, with the world twist that the
  biggest "light" is a whole warm-tinted room of baked paint.

## Sky & distance (crops/w7e-sky; frames/w7-everwinter-01, -05)

- Sky texture: pale white-pink zenith falling into a **hot magenta horizon
  band** — the single most saturated large shape in the world, and it is
  painted in the sky (crops/w7e-sky).
- Against it, **dark violet mesa silhouettes**: jagged angular low-poly
  slabs, near-flat fill, no internal detail. Nearer masses are darker and
  more purple; far ones step lighter and pinker toward the band
  (frames/w7-everwinter-01). Discrete steps, not a gradient.
- One zone replaces the mesa violet with **deep crimson rock walls**
  (crops/w7e-greengems background, frames/w7-everwinter-05 top) — a
  temperature shift used as a zone boundary.
- FUNDAMENTAL: sky texture carries the drama; geometry only silhouettes;
  distance = discrete value steps. World-specific: the horizon band is
  magenta, and that magenta is echoed by the flora so ground and sky agree.

## Overhead (crops/w7e-t15, w7e-icicles, w7e-sky; frames/w7-everwinter-01)

- The top third is occupied by: **dark mesa arches swinging overhead**
  (crops/w7e-t15), pink flora crowns, pipe columns, and — on built
  structures — **white lumpy snow/icicle fringes hanging from beam edges**
  (crops/w7e-icicles): irregular white drips with grey-blue underside
  shading, staged light-against-dark over the shadowed beam undersides.
  At 640×360 the fringe reads as an alpha-card strip with a sawtooth-lump
  silhouette rather than modelled cones (HYPOTHESIS at this resolution:
  the largest drips may be low-poly mesh; the strip behaviour — even
  spacing, flat lighting, silhouette-only detail — matches a card).
- Constant snowfall keeps even empty sky regions occupied (all frames).
- FUNDAMENTAL: upper third never empty — here by masses + fringe cards +
  weather, no wires needed.

## Props & motifs (crops/w7e-pipes, w7e-contact, w7e-greengems; frames/w7-everwinter-01, -08)

- **Pipe columns** are the repeated vertical motif: salmon-pink upper
  segments, teal-green lower segments, darker metal band rings, and always a
  **lumpy white snow cap** on top (crops/w7e-pipes). Two out-of-palette
  hues (salmon, teal) are allowed BECAUSE the snow cap ties them back to
  the world.
- Repeated collectibles: green crystal diamonds with halos (crops/w7e-greengems),
  gold nuggets, scattered dark debris chunks with snow caps and contact blobs
  (crops/w7e-contact).
- Props cluster at path edges and ledge corners — pipe pairs, debris piles
  by doorways (frames/w7-everwinter-01) — framing the walk line.
- Saturation ration: in the lavender field, the saturated things are flora
  (magenta), pickups/gems (green, gold), and UI-bright enemies. Rocks stay
  desaturated umber.
- FUNDAMENTAL: prop cohesion = one shared rule (snow cap) applied across
  unrelated asset classes; saturation reserved for interactive/focal items.

## Particles & air (crops/w7e-snowground, w7e-spikebomb, w7e-lamp; all frames; frames/w7-everwinter-05)

- Snowfall is a **camera-wrapped volume**: white circles with strong size
  variance — near-camera flakes are big soft discs (bokeh-like, lower
  contrast), far flakes are 1–2px squares (crops/w7e-snowground). Density
  is constant in every room; it is a weather layer travelling with the
  player.
- The snow reads on the dark mauve arena AND the pale ice-cave zone because
  flakes are near-white against dark ground and the ground's own dark
  speckle layer keeps pale zones from washing out (crops/w7e-spikebomb
  vs w7e-palezone).
- Events pair values: explosion/burst effects are warm yellow-white additive
  sprites (crops/w7e-lamp bottom), while destroyed things kick DARK debris
  chunks across the pale snow (frames/w7-everwinter-05).
- FUNDAMENTAL: air = camera-following particle box + paired light/dark
  event particles. Confirmed verbatim.

## Color script (all evidence)

- Rough ratios: lavender/mauve snow ~35%, deep violet/umber rock & shadow
  ~25%, white-blue ice & snow caps ~15%, hot magenta (flora + horizon band)
  ~15%, warm gold + emerald + salmon/teal accents ~10%.
- ALLOWED to be saturated: magenta flora, the sky's horizon band, green
  gems/bombs, gold gate, crimson built wall. Everything structural stays
  desaturated purple-brown.
- **Shadow hue is blue-violet**, always: contact blobs are violet-dark,
  Blinx's shadow is blue-grey, doorways are blue-violet (crops/w7e-palezone,
  w7e-contact, w7e-goldgate). Nothing darkens toward black or neutral grey.
- Zone-to-zone script: lavender open field → darker grey-mauve arena →
  pale blue-white ice cave → warm gold interior → crimson rock zone. Each
  threshold is a value step AND a temperature step (frames -04 → -11 →
  -09/-10 → -06 → -05).
- FUNDAMENTAL: confident wrong hues, honest values — a violet world where
  warmth and saturation are spent only at goals and lures.

## Staging (frames/w7-everwinter-01, -06, -07, -10; crops/w7e-t15)

- Recurring composition: **dark mass framing one or both edges** (mesa
  overhead, rock slab at frame edge) → mid-value lavender ground curling
  into the frame → a saturated focal point (pink flora cluster, gold gate,
  green gems) → magenta-banded sky. Dark frame → bright core, in-palette.
- The gate sequence is the cleanest threshold stage: violet room → gold
  arch → warm tan floor beyond, the destination's temperature visible
  through the doorway before you enter (frames/w7-everwinter-06,
  crops/w7e-goldgate).
- The path reads via breadcrumb props: lampposts, pipe pairs and gem
  clusters receding along the walk line (frames/w7-everwinter-07,
  crops/w7e-greengems).
- FUNDAMENTAL: every frame is composed, not found — near dark mass, pale
  curling ground, warm/saturated destination, banded sky.

## Feel

- A candy-violet winter dusk: cold, soft and quiet, with warmth always
  visible one doorway away — coziness as a navigation system.

## Engine translation (Three.js rules that recreate THIS world)

1. **Snow-ground canvas texture**: fill `#b9a3c8`-family lavender; stamp
   4–8 huge radial-gradient blotches (radius 20–30% of texture, ±10–15%
   lightness, low-saturation mauve); sprinkle ~200 1px dark specks. Re-tint
   the same canvas per zone (pale blue-white for ice cave, grey-mauve for
   arena, warm tan near the gate) instead of authoring new textures.
2. **Global up-face snow rule**: in the prop shader (or vertex colours),
   mix base albedo toward snow-white by `smoothstep(0.6, 0.9, normal.y)`;
   side faces keep base hue. This one mask recreates the snow caps on
   pipes, rocks, ornaments and debris — Everwinter's cohesion trick.
3. **Vertex-colour orientation bake**: up-faces palest, side-faces a step
   darker and bluer, plus a violet contact blob decal (soft radial texture,
   multiply blend, ~35% darken, hue `#6b5a8a`) under every grounded prop
   and a blue-grey blob under the player.
4. **Two ice recipes**: horizontal ice = opaque plane, flat deep blue-violet,
   canvas of scattered white square glints (twinkle by scrambling UV/alpha
   per frame), ringed by a pale snow-lip rim mesh; vertical falls = tall
   quad with scrolling vertical-streak texture, `transparent` alpha ~0.7,
   additive white core stripe, flat blue backing plane behind.
5. **Sky + distance**: scene-background canvas gradient white-pink → hot
   magenta band at horizon; 2–3 flat jagged mesa layers as unlit dark-violet
   geometry, each successive layer lerped ~25% toward the band colour; fog
   in pale pink (`#e8c8dd`) so far masses land on the band.
6. **Flora walls as billboards**: clusters of camera-facing (or cross-quad)
   blobs with painted radial shading (light crown, dark base), saturated
   magenta over dark umber rock masses; reserve full saturation for flora,
   pickups and the gate — everything structural stays below 40% saturation.
7. **Warm-goal bake**: at the gate/goal room, overlay the ground texture
   with a warm tan gradient, use gold emissive material + additive halo
   sprites, and keep a soft white blown hotspot only in the halo (mesh
   stays saturated gold). The threshold must show the next room's
   temperature through the doorway.
8. **Weather volume**: a 20×10×20 m particle box parented to the camera,
   white circle sprites with 3–5× size variance, near particles larger and
   ~60% opacity; pair every impact event with one white spray burst and one
   dark debris burst so events read on any snow value.

## Contradictions / refinements vs `_fundamentals.md`

- **Water law amended**: the cross-world "water = alpha ~0.6, wall continues
  below" does NOT apply to Everwinter's frozen pools — they are opaque flat
  fills with painted square glints. The translucent recipe survives only for
  the vertical waterfall. Rule refinement: phase of water picks the recipe
  (liquid = transparency; frozen = painted specular).
- **Rim light is sky-tinted**: edge highlights on dark platforms are pink
  (from the magenta horizon band), not white — rim/halo hues should sample
  the world's sky band, not a fixed colour.
- **Snow cap as universal shader rule**: fundamentals notes per-asset snow
  lines; Everwinter shows it is systematic enough to be a single
  normal.y-driven material feature across all props.
