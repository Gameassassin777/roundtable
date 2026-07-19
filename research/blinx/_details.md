# BLINX DETAIL TAXONOMY — what the details ARE, and the authored-uniqueness grammar

Cross-world catalogue of the specific set-dressing details, organized by the
JOB each detail does. Every entry: what it is → how it's built → where it's
placed → evidence. Then the uniqueness grammar (why no two Blinx worlds feel
like the same kit). World files (`w1..w8*.md`) carry the per-world evidence.

## A. AGE & WEATHERING details (time passed here)

- **Drip streaks** — vertical dark streaks painted down walls from ledges and
  window sills; water ran here for years. Painted texture layer, always
  descending from a FEATURE (a ledge, a mouth), never mid-wall. (w4c-relief,
  w5t-blockwall)
- **Moss wash** — green vertex/paint wash on the shaded side of statues and
  wall bases; thickest in recesses. (w1ts-statue, w5t relief recesses)
- **Algae band** — a yellow-green stain strip at every waterline: this
  world's drift-ring. Painted; hides the mesh/water seam AND tells you the
  water is old. (w2-canalstep, w2-wallmoss)
- **Chipped plaster rims** — pale broken edging painted around dark window
  holes; the wall is damaged exactly where it was pierced. (w4c-windowrim)
- **Crackle/craquelure** — fine dark crack webbing painted over pale ground
  (ash world) and over tiles. (w4c-ground, w5t-tiles)
- **Swept-ash smears** — long DIRECTIONAL dark ribbons on the floor, all one
  way: a wind direction authored into the ground. (w4c-stripes)
- **Drift lines** — pale sand/snow tongues lapping against the downwind side
  of obstacles; pairs with the smears to complete the wind story. (w4, w7)
- **Rust/heat stain** — warm discoloration bleeding from vents, grates and
  lava shores onto neighbours; baked spill at two radii. (w8f-lava1, w8f-rustwall)

## B. LIFE & HABITATION details (someone lives here)

- **Window cards** — freestanding unlit yellow cards, crooked jittered
  parallelograms, mullion bars PAINTED on the same card, clustered 2–5 per
  facade, never grid-aligned. An entire interior life with zero interiors.
  (w1ts-windows)
- **Pennant/lantern strings** — cloth triangles or bulbs on catenary wires
  strung across streets overhead; someone hung them for a festival. (w1ts-pennant)
- **Garden rows** — tulips in staggered DOUBLE rows along a wall base;
  gardening implies a gardener. Each flower a tiny cup mesh with a two-tone
  gradient. (w1ts-flowers)
- **Street furniture** — a bench, a giant TV in a wooden cabinet on the
  sidewalk, drain grates (flat cross-hatch bands with a real curb edge),
  bollards in threes. (w1ts-shop, w1ts-grate, w2-deja-vu-08)
- **Shop as a VEHICLE** — the shop is a white VAN with yellow crates beside
  it, or a kiosk wedged into a wall; commerce is a prop cluster, not a menu.
  (w4c-bigmouth, w5t-kiosk)
- **Laundry/banners** — red cloth strips hanging INSIDE archways so you pass
  under them; soft, waist-high, human. (w1-time-square-08)
- **Litter** — dark debris chunks scattered on floors (also suckable physics
  objects): a lived-in floor is never clean. (w2-torch-a)

## C. SCALE-CUE details (the ruler that makes giants giant)

- Doors with handles, steps, railings, pots, barrels, chests — a strict
  Blinx-height ruler repeated in every world. The ONE time the ruler breaks
  (giant face wall, giant spoon), the break is the world's hero.
- **Texture scale as function signal** (Forge): fine diamond plate = walkable
  floor, medium panels = walls, metre-wide blobs = untouchable machine mass.
  Players read "can I stand on it" from texel density alone. (w8f-*)
- Far cities are TWO-PIXEL window dabs on silhouette cards — habitation at
  horizon scale costs two pixels per tower. (w5t-sky)

## D. PATH & GUIDANCE details (the level talks)

- **Coping stones** — palest-value caps overhanging every canal edge, so the
  water reads as a bright shape DRAWN in light; quay sides drop ~3 value
  steps darker purely to make the water glow. (w2-coping)
- **Pale grout on wet floors** — inverse of walls (walls get dark recesses,
  wet floors get LIGHT joints): the pale grid + damp blotches = "courtyard
  after rain". (w2-floor)
- **Breadcrumb glows** — lamp/crystal lines at path edges, colour-coded per
  world logic (warm in the city, BLUE along canals, pink stalks in the mine).
  (w1/w2/w6 breadcrumb crops)
- **Threshold hue previews** — doorways compose the NEXT room's colour
  through them (gold→green at the octagonal temple door; green→orange at the
  forge). The doorway is a movie poster for the next room. (w5t-octadoor, w8f-doorway)
- **Lit exits / dark dangers** — exits are the warmest large shape in the
  world (mine's orange slab); fall-hazards are the darkest (near-black pits).
  Warm = go, black = fall. (w6m-exit, w6m-pit)
- **Signs on bent poles** — arrows and chevrons on Seuss-bent stems; wayfinding
  with the same elasticity as the architecture. (w1, w2, w7e-sign)

## E. CRAFT & MATERIAL details (things were MADE)

- **Rivets with painted crescents** — orange beams are flat plates; every
  rivet is a painted red disc + dark lower crescent + hot top-left dab under
  one consistent light. (w8f-beams)
- **Pillow-shaded slabs** — each floor tile its own value cell: pale centre,
  dark on all four edges, near-black grout; then moss blotches recolor WHOLE
  tiles off-grid. (w5t-tiles)
- **Register bands + real ledges** — temple walls are stacked figural bands
  (flat paint) separated by thin protruding ledges (real geometry) — paint
  for richness, geometry for silhouette. (w5t-reliefzoom, tiers crop)
- **Candy-stripe columns** — one graphic pattern (red-white spiral) in an
  organic cave: the "man-made" accent. (w6-mine-04)
- **Diamond-lattice grates** — furnace glow faked by a crosshatch painted
  over a white→gold radial: "something burns behind this". (w8f-grate)

## F. MOTION-IMPLIED details (frozen movement — why stills feel alive)

- Streak textures on all liquid surfaces; splash rings baked at waterfall
  feet; birds FROZEN INSIDE the solid rainbow (literal frozen motion as a
  sculpture); spray arcs baked as geometry over fountains. (w2-fountain, w9
  rainbow stills, w7e-icefall)

## G. NATURE-RECLAIMS details

- Ivy climbing wall bottoms, roots cracking pavement, dangling moss strips at
  dry bases (the inverted icicle trick — dark jagged fringe against
  mid-value), trees bursting through roofs. (w1ts-ivy, w4c-treeroots, w2-vine)

---

## THE AUTHORED-UNIQUENESS GRAMMAR (why no two worlds feel like the same kit)

Every Blinx world contains, beyond its shared recipe:

1. **ONE impossible hero** — a single hand-authored object 3–8× prop scale
   that no system would generate: the giant profile FACE behind the temple
   staircase, the fanged SKULL-MOUTH doorway, the hot-air BALLOON with a
   painted face, the solidified rainbow with birds inside. Rules: unique
   geometry (never reused), placed center-back or over the goal, lit as the
   frame's focal core, and it always breaks one of the world's own rules
   (scale, material, or physics).
2. **ONE lived-in vignette** — a 2–3 prop human story at path edge: bench +
   TV cabinet; garden rows + wall; van + crates. These are the details that
   make players say "crafted".
3. **ONE foreign-material accent** — glass bottle pillars in the snow world,
   candy-stripe in the cave, a pink blossom tree over sandstone. Exactly one
   material that violates the palette gate, as proof the world was authored,
   not generated.
4. **ONE rule about itself stated visually** — ash city: "only interactive
   things may be saturated"; temple: "shadow is green"; mine: "light is
   alive (stalks)". The world's law is taught by repetition until it's felt.

And the placement grammar: **details cluster at decision points** (doorways,
junctions, water edges, goal gates) and thin out in transit space. Detail
density is punctuation, not wallpaper — the eye is rewarded exactly where
the game asks a question.

## What this means for our generator

- The shared recipe (families, mottle, gradients) only reaches "competent
  kit". Blinx-feel lives in slots 1–3 above: every generated place needs a
  HERO slot (one oversized unique theme-object from the scene's own fiction),
  a VIGNETTE slot (one 2–3 prop lived-in cluster), and an ACCENT slot (one
  deliberate palette-gate violation). We already started the hero slot
  (capital towers); vignettes and foreign accents are the missing pair.
- Details must be PLACED by the decision-point rule: doorway/threshold/goal
  zones get the cluster, open floor stays sparse.
