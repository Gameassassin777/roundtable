# W1 — TIME SQUARE (dusk carnival city, warm lamps, violet sky)

Evidence: frames/w1-time-square-01..12.jpg (01–06 are intro-cutscene frames, 06 is a
white flash; gameplay = 07–12), crops/w1ts-t*.jpg (video frames 25–460s;
gameplay starts ≈230s), crops/w1ts-{lamp,windows,ground,ivy,statue,arch,flowers,
moon,grate,dark,crystal,halo,pennant,shop,vista}.jpg.

World-specific headline: this is the ONE world where the sky is almost never
seen in play — the city is a closed canyon, so the "sky drama" budget is spent
on **glowing window cards and overhead pennant strings** instead. Distance here
is darkness, not atmospheric value steps (contradiction/extension of the
fundamentals' distance law).

## Ground (evidence: crops/w1ts-ground.jpg, crops/w1ts-grate.jpg, crops/w1ts-halo.jpg, frames/w1-time-square-12.jpg)

- Cobblestone paving: rounded-stone diffuse tile where **each stone carries a
  pale top-left dab and a dark outline** — one consistent light direction baked
  into the paint, so the floor reads bumpy with zero bump/geometry
  (crops/w1ts-ground.jpg).
- A **macro olive-brown blotch layer ignores the stone grid** — large soft dark
  patches drift across the cobbles (visible top-right of crops/w1ts-ground.jpg),
  the classic three-layer paint job.
- **Warm light pools are painted into the ground texture**: an irregular
  amber bright patch sits under every lamp, with a soft non-circular edge;
  a few metres away the same cobble tile drops to cool blue-grey
  (crops/w1ts-halo.jpg shows pool vs. cool zone in one frame). The pool does
  not move with the player or the lamp glow pulse — it is texture/bake.
- Drainage grates run along path edges as a **flat texture band** (rust-brown
  cross-hatch on a dark strip) bordered by a real curb of rounded stone blocks
  (crops/w1ts-grate.jpg). Texture does the detail; one thin geometry strip does
  the silhouette.
- FUNDAMENTAL: ground richness = 3-layer paint + painted local value pools.
  The "wet dusk street" read is just the contrast between warm painted pools
  and cool painted shadow on the same tile.

## Edges & lips (evidence: crops/w1ts-grate.jpg, crops/w1ts-arch.jpg, crops/w1ts-flowers.jpg)

- Curbs and planter rims use **orientation value stepping**: curb top-face pale
  khaki, front-face a clear step darker and olive-er (crops/w1ts-grate.jpg).
  Same on the planter box: pale top rim band, darker face (crops/w1ts-flowers.jpg).
- Stone edgings are chunky rounded blocks with smooth normals — light rolls
  over the curb crown instead of breaking on a hard chamfer.
- FUNDAMENTAL: the Everwinter law holds in the city — up = palest, side =
  darker — executed in paint plus a rounded block, no bevel shaders.

## Transitions (evidence: crops/w1ts-halo.jpg, crops/w1ts-ground.jpg, crops/w1ts-arch.jpg)

- **Painted contact blobs**: the dark red bins sit on irregular near-black
  blobs that are clearly in the ground texture, not projected shadows — soft
  wet edges, larger than the prop footprint, offset to no consistent light
  direction (crops/w1ts-ground.jpg, dark smudges right of the lamp stem in
  crops/w1ts-halo.jpg).
- The statue's fractured base slabs overlap the cobbles so no straight
  intersection line is ever visible (crops/w1ts-statue.jpg).
- Lamp stems meet ground inside the painted warm pool, so the contact point
  hides inside the brightest, busiest value area (crops/w1ts-halo.jpg).
- FUNDAMENTAL: anti-float law confirmed — every standing object gets a painted
  dark blob or a geometry skirt; contact points are hidden inside painted
  value events (pools).

## Walls & masses (evidence: crops/w1ts-arch.jpg, crops/w1ts-shop.jpg, crops/w1ts-vista.jpg, crops/w1ts-dark.jpg)

- **Two texture scales, two jobs**: hero architecture (archway) uses HUGE
  stone blocks — each block ~1/4 of wall height, pale top-edge dab + dark
  under-edge, painted relief with one light direction (crops/w1ts-arch.jpg).
  Ordinary street walls use a medium running-bond brick with the same
  per-brick highlight + dark mortar (crops/w1ts-shop.jpg). Big blocks =
  monument, fine brick = street.
- **Lamp light on walls is painted**: the wall behind a lamppost carries a
  radial warm-khaki glow centred at lamp height with a soft stationary
  falloff edge; the same wall a few metres on falls to near-black brown
  (crops/w1ts-vista.jpg). No dynamic light could be this stable — it is in
  the texture/lightmap.
- **Buildings lean and window quads are crooked** — nothing axis-aligned;
  walls taper and window openings are parallelograms (crops/w1ts-windows.jpg).
  Seuss elasticity, small amplitude.
- Dark window openings on unlit walls are painted rectangles **a half-step
  darker than the wall, not black** (crops/w1ts-vista.jpg right side) — the
  hole reads because the wall around it holds ~10% value.
- FUNDAMENTAL: walls = flat paint doing relief, texture scale as the
  monument/street dial, and "lit vs unlit" is two zones of painted value.

## Special surfaces — glowing windows (evidence: crops/w1ts-windows.jpg, crops/w1ts-pennant.jpg, crops/w1ts-arch.jpg)

- The signature surface of this world: **flat emissive yellow cards** placed
  in the dark facades. Each is a crooked quad (parallelogram, keystone,
  snapped-off shard shapes) with **dark mullion bars painted onto the same
  card** — no frame geometry (crops/w1ts-windows.jpg).
- The yellow is flat and uniform — unlit/emissive material, no gradient, hard
  edges. Against a ~10%-value wall the contrast is so extreme the cards read
  as "lit interiors" from any distance (crops/w1ts-pennant.jpg background).
- Cards come in clusters of 2–5 per facade at mixed sizes/rotations — a
  scatter system, not one-per-window (frames/w1-time-square-11.jpg,
  crops/w1ts-t410.jpg).
- FUNDAMENTAL: an entire city's "interior life" = unlit cards + painted
  mullions + dark walls. Zero lights, zero interiors. It stacks three tricks:
  emissive material (bake/sprite family) + silhouette shape language (alpha
  card family) + painted dark surround (paint family).

## Darkness (evidence: crops/w1ts-dark.jpg, crops/w1ts-vista.jpg, crops/w1ts-t375.jpg)

- Unlit street canyons bottom out at **~10–15% value, green-brown tinted, and
  the stone texture stays readable** — never #000 (crops/w1ts-dark.jpg: block
  joints still visible in the darkest wall in the game).
- Dark window/door openings on those walls are only slightly darker than the
  wall (crops/w1ts-vista.jpg) — darkness is a value LADDER (lit pool → dim
  texture → dark texture → darker opening), not a binary.
- Distance down a street is swallowed by a brown-black gradient
  (crops/w1ts-t375.jpg): fog-to-dark, not fog-to-horizon-hue, because there is
  no horizon.
- FUNDAMENTAL: the fundamentals' "dark = 15% + gradient" law confirmed at its
  extreme — this world lives most of its frame in that dark band, so the
  texture-under-darkness discipline matters more here than anywhere.

## Lights (evidence: crops/w1ts-halo.jpg, crops/w1ts-lamp.jpg, crops/w1ts-shop.jpg, crops/w1ts-vista.jpg, frames/w1-time-square-12.jpg)

- The full four-layer fixture stack, verified up close:
  1. **Physical thing**: a bent/twisted green stem (geometry with painted
     darker-green shading on one side and a pale highlight stripe —
     crops/w1ts-lamp.jpg), curled at the top like a sprout. The lamp is a
     PLANT, echoing the Mine law.
  2. **Small emissive orb**: a compact white-yellow core mesh/card.
  3. **Huge additive halo sprite**: radial gradient, blown white-yellow core
     ~40% of sprite diameter, fading through green-yellow to transparent;
     the sprite is many times the orb's size and is what actually sells
     "bright" (crops/w1ts-halo.jpg).
  4. **Painted pools**: warm blotch on the cobbles below AND a radial warm
     glow on the wall behind (crops/w1ts-vista.jpg) — both baked, both
     stationary.
- Variant: the shop doorway uses **pink-white bulbs** — same stack (orb +
  halo) in pink, clustered on a twisted gold frame (crops/w1ts-shop.jpg).
  Pink = commerce/special, amber = street.
- **Breadcrumb trail**: lamps recede down the path at irregular intervals,
  each announcing itself by halo + pool before its geometry is visible
  (frames/w1-time-square-12.jpg, crops/w1ts-t375.jpg). The trail of warm
  pools IS the path.
- FUNDAMENTAL: four tricks stacked on every fixture; the dynamic-light budget
  is exactly zero, and the halo sprite carries the exposure.

## Sky & distance (evidence: frames/w1-time-square-03.jpg, crops/w1ts-moon.jpg, crops/w1ts-t410.jpg)

- In gameplay the sky is effectively absent — streets are canyons capped by
  dark building tops, awnings and pennant strings (crops/w1ts-t410.jpg). The
  upper-third drama is reassigned to window cards + pennants.
- The cutscene establishes the world overhead: **deep violet-navy sky** with a
  **giant moon built as a flat pale-lavender disc with soft darker-mauve
  crater blotches painted on** (no geometry, no halo ring), and a dark
  foreground silhouette (statue figure) laid across it for depth
  (crops/w1ts-moon.jpg). The gold zeppelin passes as a warm emissive mass.
- FUNDAMENTAL: moon = sky-texture painting + one silhouette layer; and a
  world-level rule discovered here — **when the camera can't see the sky,
  spend the sky budget on hanging things** (pennants, window cards).

## Overhead (evidence: crops/w1ts-pennant.jpg, crops/w1ts-t360.jpg, crops/w1ts-t375.jpg)

- **Red pennant strings** cross the street tops: flat saturated red-orange
  triangle cards on near-invisible wires, slight painted fold shading per
  triangle (crops/w1ts-pennant.jpg). Cheap alpha cards doing "festival".
- Dark red awnings/canopies jut from facades at head height — simple planes,
  near-silhouette maroon (crops/w1ts-t360.jpg, t375 dark red masses).
- Building tops read as dark jagged silhouettes against marginally lighter
  dark sky-gaps; the very top of frame is usually the darkest band.
- FUNDAMENTAL: upper third = hanging flat cards (pennants) + jutting planes
  (awnings) + dark mass (rooflines). All silhouette tricks, zero geometry
  complexity.

## Props & motifs (evidence: crops/w1ts-statue.jpg, crops/w1ts-flowers.jpg, crops/w1ts-arch.jpg, crops/w1ts-crystal.jpg, crops/w1ts-ground.jpg)

- **Tilted statue bust**: chunky low-poly stone figure leaning against a wall;
  its age is painted — dark speckle/moss blotches scattered over a pale khaki
  stone base, darker painted eye sockets; a soft green tint cast over the
  chest reads as a baked/vertex-colour moss wash (crops/w1ts-statue.jpg).
  Broken base slabs hide the ground contact.
- **Tulip planters**: rows of red flowers, each a tiny two-tone low-poly cup
  (dark red base → orange-yellow tip, value gradient ON the mesh paint), set
  in a stone box with painted leaf-blobs at the soil line (crops/w1ts-flowers.jpg).
  Clustered in staggered double rows — repetition as rhythm.
- **Dark red bins/barrels**: near-silhouette maroon cylinders used as path
  blockers; they read by painted contact blob + slight top rim, not by
  shading (crops/w1ts-ground.jpg, crops/w1ts-arch.jpg foreground).
- **Time crystals**: crescent-shaped emissive cyan meshes with a dim halo —
  the coolest, most saturated small objects in the world, so they ping
  against the amber streets (crops/w1ts-crystal.jpg).
- Saturation ration holds: only glows (windows, lamps), flowers, pennants and
  crystals are allowed saturation; everything structural sits in olive/brown/
  violet-grey.
- FUNDAMENTAL: prop aging = speckle paint + vertex tint; prop presence =
  silhouette + contact blob; collectible readability = reserved hue (cyan)
  + emissive + halo.

## Particles & air (evidence: crops/w1ts-statue.jpg, crops/w1ts-t250.jpg, crops/w1ts-t295.jpg)

- No weather layer — the first world has clear night air (contrast with
  Everwinter's snowfall). Air is conveyed by the halos themselves: every
  light source's glow sprite fogs the nearby pixels.
- Pickup/event sparkles: small white star-flare sprites near interactables
  (the flare by the statue's hand in crops/w1ts-statue.jpg; crystal pickup
  burst in crops/w1ts-t250.jpg).
- Enemy-related puffs (green blob hit effects, crops/w1ts-t295.jpg) use paired
  light/dark small quads per the fundamentals' pairing law. HYPOTHESIS at this
  resolution: no camera-wrapped mote volume; ambience is carried entirely by
  baked glow.

## Color script (evidence: all gameplay crops; ratios estimated from crops/w1ts-t360/t410.jpg, frames/w1-time-square-10/12.jpg)

- Hue families, rough frame ratios: **near-black violet-brown** (unlit walls,
  street shadow) ~35%; **olive-amber** (lit cobbles, stone, wall pools) ~30%;
  **flat glow yellow** (windows, halos) ~15%; **stem/ivy green** ~10%;
  **accent red** (flowers, pennants, bins, awnings) ~8%; **cyan/pink
  pinpoints** (crystals, shop bulbs, HUD) ~2%.
- **Shadow hue = violet-brown shifting to blue-grey**: unlit ground goes
  cool blue-grey (crops/w1ts-halo.jpg right side), unlit walls go green-brown
  (crops/w1ts-dark.jpg) — shadow is a hue, never grey, confirmed.
- Allowed-to-be-saturated list is strict: glow yellow, tulip red, pennant red,
  stem green, crystal cyan. Saturation = interactive/festive only.
- Zone contrast: amber pool islands in a violet-dark sea; the shop's pink +
  gold doorway (crops/w1ts-shop.jpg) is the warmest, most saturated zone —
  warm/bright = special/goal, per the temperature law.
- FUNDAMENTAL: the world is a two-temperature checkerboard — amber islands of
  paint in a violet-dark city, with saturation spent only on glow and party.

## Staging (evidence: crops/w1ts-t360.jpg, crops/w1ts-t375.jpg, crops/w1ts-arch.jpg, frames/w1-time-square-12.jpg)

- Every gameplay frame composes **dark frame → warm core**: near-black wall or
  bin mass on 1–2 frame edges (left dark wall in t375, foreground bin in
  w1ts-arch.jpg), a warm lamp pool mid-frame, yellow window cards as the far
  accent layer.
- The path reads as a **chain of warm pools**, not a visible floor line: you
  navigate from glow to glow (frames/w1-time-square-12.jpg).
- Thresholds: the stone arch with its dark red door is framed by the two
  biggest window cards and a flower planter (crops/w1ts-arch.jpg) — the
  destination is announced by the densest cluster of glow + accent colour.
- Focal hierarchy: halo sprite (brightest) > window cards (flattest bright) >
  warm pool (mid) > props (dark) > walls (darkest) — five discrete value
  bands, all paint/sprite.
- FUNDAMENTAL: in a world with no sky, **vertical staging replaces landscape
  staging** — dark base, glow mid-band, pennant/window band on top.

## Feel

A closed carnival after hours — warm lamps keeping watch over a sleeping,
slightly crooked city.

## Engine translation (Three.js rules for THIS world)

1. **Cobble floor via canvas texture**: rounded stones, each with a pale
   top-left dab + dark outline; overlay a second canvas layer of big soft
   olive blotches at 4–8x stone scale with multiply blend, deliberately
   misaligned from the stone grid.
2. **Painted light pools**: per lamp, stamp a soft irregular amber radial
   (globalCompositeOperation 'lighter' or a vertex-colour lift) into the
   ground texture AND onto any wall within radius, centred at lamp height.
   Static, baked at scene-build time. This is 80% of the world's look.
3. **Window glow cards**: unlit (MeshBasicMaterial) yellow quads with
   painted dark mullions, generated as crooked parallelograms (random
   corner jitter), clustered 2–5 per facade on near-black walls. No light
   objects.
4. **Lamp fixture**: bent stem (TubeGeometry along a curved spline,
   vertex-colour shaded) + small emissive orb + additive radial-gradient
   sprite 4–6x orb size + the painted pools from rule 2. Zero dynamic
   lights; if a PointLight is used, keep it under the paint's brightness.
5. **Fog to darkness**: FogExp2 toward deep violet-brown (#1a1220-ish),
   NOT toward a horizon colour; combine with a dark ambient floor so unlit
   textures hold ~10–15% value (multiply the texture, don't crush to #000).
6. **Sky-as-ceiling**: when the camera is street-level, cap the canyon with
   dark roofline silhouettes + strings of triangle pennant cards (single
   alpha texture, repeated along a catenary line); reserve the violet sky +
   painted moon disc (flat circle, soft blotch craters) for vistas/cutscenes.
7. **Orientation stepping bake**: per-vertex colour pass — up-faces pale
   khaki, side-faces darker+olive, undersides near-black; plus rounded curb
   blocks at every path edge.
8. **Saturation gate**: restrict saturation>0.6 to {glow yellow, tulip red,
   pennant red, stem green, crystal cyan}; force everything structural into
   0.1–0.35 saturation olive/brown/violet. Enforce in the palette, not by
   eye.
