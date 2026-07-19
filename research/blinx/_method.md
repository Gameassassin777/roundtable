# The Method — Forensic Art-Direction Teardown

A repeatable analysis that turns any observed aspect of a game's art into three
things: how it is MADE, what it DOES to the player, and a LAW we can reuse in
our own engine. Run it per aspect (rock, snow, window, lamp, sky, flame, sign,
ground, doorway, particle…). If an aspect can't be reduced to a law, the
analysis is not finished.

## Pass 1 — CONSTRUCTION (how it is made)

Ask in this order. Never skip 1 — silhouette is where the style lives.

1. **Silhouette** — if it were solid black, what shape is it? What is the
   *gesture* of that shape (lean, sag, bulge, twist, stack, sprawl)? One big
   intentional arc per object — never jitter.
2. **Segmentation** — how many big parts? Where do they join? How large are
   the facets/pieces relative to the whole? (Small facets = noise; big facets
   = carving.)
3. **Layer stack** — what is painted or overlaid on what, in what order?
   (base → wear → light → shadow → dressing). Name every layer.
4. **Value map** — which planes own which values? How many values total?
   Where is the single darkest mark, the single brightest?
5. **Edge policy** — per edge: hard, soft, broken, outlined, haloed, occluded?
6. **Variant logic** — what changes between instances (lean, size, hue, wear)
   and what NEVER changes (the recipe)?
7. **Placement grammar** — where does it sit relative to ground, wall, path,
   light? What touches what? What is buried, what is perched, what overlaps?
8. **Motion** — what moves, at what rate, on what loop? What never moves?

## Pass 2 — READING (what it does to the player)

1. **Gesture read** — the one-word energy of the pose: tired, proud, melting,
   bursting, huddled?
2. **Material promise** — what would it feel and sound like to touch? Is the
   promise kept at every distance?
3. **Value script** — where does the eye land first, second, third? Who staged
   that order, and with what (light pool, silhouette, hue accent)?
4. **Color role** — which hue is structure, which is accent, which is air?
5. **Time & life** — what happened here before the player arrived? Who
   maintains it? What is growing, what is dying, what is repaired?
6. **Theme** — what idea of the fiction does this thing embody? (In Blinx the
   answer is almost always TIME: wear, frozen moments, clocks, patina.)
7. **Immersion mechanic** — what specifically puts the player *inside* rather
   than *in front of*: foreground occlusion, particles in the air, scale
   contrast, beds of light, sound-implying materials, layered horizon?
8. **The tell** — the single observable detail that betrays the maker's hand.

## Output format (per aspect)

- **LAW** — one sentence, reusable anywhere.
- **RECIPE** — the construction steps, in order, qualitative.
- **TELL** — the diagnostic detail you can check in a screenshot.
- **TRANSFER** — what our engine does with it.

## Discipline of the method

- Every claim answers HOW at least twice: how it looks → how that is made →
  how that making creates the feeling. Keep asking until the answer is a
  decision someone made, not a property of the pixels.
- No numbers where a judgment works better. No judgment without an observable.
- Jaggedness, crookedness, wobble — these are *symptoms*. Trace them back to
  the *principle* (gesture, hand-making, age) before recording them.
