# _transfer.md — From Analysis to Engine: the Master Plan

How the whole research stack (_method, _style, _objects, _aspects,
_scenedesign) becomes working game visuals. The analysis transfers as THREE
artifacts: **slots** (what the AI picks), **recipes** (how every asset is
built), **passes** (how scenes compose). The 45 laws become validation and
code paths — not vibes.

## 0. Keep vs. change

KEEP: the `generateScene` pipeline, `scenePalette` spine (mix/extractTraits/
applyVisual), seeded RNG (mulberry32), roadMask, the bake helpers
(bakeOrientAO, bakeGradient, jitterGeometry, seussify, prismatize), the
canvas-texture ops (mottle, blob, pool, mouth), the shots harness
(final19.json + shoot.cjs) and the scene-lab route.

CHANGE: objects stop being one-off builder functions and become parametric
RECIPES; scene assembly becomes 15 ordered PASSES each implementing named
laws; the director stops emitting loose tags and emits a validated SCENE
SPEC; asset count goes from ~15 builders to ~60 recipes.

## 1. The four layers

```
Calvin's prompt  →  DIRECTOR (LLM)  →  SCENE SPEC (slots, validated)
Scene Spec       →  GENERATOR       →  15 composition passes
Passes           →  RECIPE LIBRARY  →  ~60 parametric assets
Output           →  CRITIQUE LOOP   →  shots vs. law checklist → fix batch
```

## 2. Layer 1 — the SCENE SPEC (what the AI picks)

Fixed slots, one choice each, all forced to agree. This IS "the AI deciding
from a list what fits a scene" — the list is now the full aspect taxonomy.

| Slot | Example values | Law enforced |
|------|----------------|--------------|
| chord | `crimson+teal+white / pink air` | A7: 3–4 hues, accents from complement only |
| gestureFamily | `slump / attention / drip / huddle / sprawl / reach` | E5: one per world, all objects perform it |
| anchor | `venice / market-town / meso / candy / forge / cavern / custom` | F2: anchor in silhouette, bend in dressing |
| materialKit | `brick / stone-stack / pillow-tile / candy / ice / forge-plate / crackle` | B4: one construction logic per world |
| groundRecipe | base + drift + smear-direction + contact dabs | O24: four layers, one smear direction |
| sky | gradient stops + `giant: moon/planet/ring/none` + skyline style | D7: gradient + one giant + jagged hem |
| lightLogic | pool hue, practical types, emissive channel | C1–C3: one sun, pools 4–5×, bloom eats fixture |
| wear | `moss / soot / rust / dust / ivy` + zone rules | E1: blotch disobeys grid; zoned by use |
| habitation | pick 3: `planters / signs / banners / laundry / market / carts` | E3: lit + tended + for-sale |
| motionSet | pick 2–4: `spin / bob / sway / drift / flicker / scroll / pulse` | E4: few slow loops, motion = meaning |
| tonePair | comfort + wrongness (e.g. `tulips / giant moon`) | F7: comfort in light, wrongness in dark |
| densityProfile | bias within the three bands | F10: busy hand-level / moderate masses / empty fields |
| heroProps | 1–3 named one-offs (statue, fountain, crest…) | B5/D4: one ornament per field, one-offs per scene |

The director's system prompt = the 45 laws compressed + this slot schema +
worked examples. Output validated against the enum; invalid = regenerate.

## 3. Layer 2 — the RECIPE LIBRARY (the asset expansion)

Every asset is a parametric recipe with the 8 construction lenses as named
parameter groups:

```
recipe = {
  silhouette:  { form, gesture(lean/bow/sag seed), proportions }
  segmentation:{ facetCount/size | chordCount for curves }
  layers:      [ ordered canvas-paint ops: blotch, streak, dab,
                 crackle, pillow, stripe, drift, wash ]
  valueMap:    facing→value rules (lit/mid/dark + orientAO + skyBlush)
  edges:       seam policy, hem wobble, bloom
  variants:    { param: jitterRange }  ← the ONLY place randomness lives
  placement:   buried | plinth | mounted | hung + contact dab + pool
  motion:      loop type + rate | static
}
```

### The ~60 recipes, by group (✓ = exists today, ~ = exists but rework, + = new)

**STRUCTURE (12):** archHouse +, tower ~, shopfront +, gateArch +, bridge +,
wallRun ~, canalCoping +, stairRun +, balcony +, awning +, reliefWall +,
windowCards ~ (cluster grammar).

**PROP (14):** streetLamp ~ (S-curve + halo-eats-stem), planter +, statue +,
fountain + (octagon + plinth + pickups in bowl), bench +, signCard ~,
banner/pennant +, brazier ✓, cart +, crate/barrel +, grate +, well +,
neonGlyph +, bunting +.

**NATURE (12):** rockSet ~ (facet-owned values + per-face caps), icePillar +,
icicleStrip +, treeLollipop ~, treeSpiral ~, treeHoodoo ✓, ivyMass +,
fungusShelf ✓, driftBank ~, tendril ✓, crystalStalk ~, mossBlotch +.

**SURFACE (8):** brickWall +, pillowTiles +, crackleGround ✓, candyWall +,
forgePlate +, marbleSlab +, mottleField ✓, wearOverlay + (zoned blotch).

**SKY / FX (10):** moonDisc + (soft + occluded + one blot), cloudCards ✓,
starField ✓, snowDrift(particles) ✓, emberDrift ✓, dustMotes ✓,
flameCluster ~ (blob-bunch, not sprite), glowPool ✓ (add rim ring),
waterfall +, skyBlush + (sky hue painted into object flanks).

**INTERACTIVE (6):** timeCrystal ✓ (crescent, spin), orb ✓, pickupBowl +,
switchPulse +, breadcrumbTrail ✓, keyItemVariants +.

Each recipe ships with 3–8 named variants (e.g. rockSet: shoulder-left,
shoulder-right, twin-peak, slab, boulder; streetLamp: tall-lean, short-bow,
double-arm). Variants × jitter ranges = no two instances ever match.

## 4. Layer 3 — the 15 COMPOSITION PASSES

`generateScene` becomes an ordered pipeline; each pass names the laws it
implements. Existing functions slot in.

1. **Rooms** (A4) — nested volumes, no infinite plain. [rework composeMasses]
2. **Ground stack** (O24/A5) — base + drift + smear(one direction) + contact. [rework buildGround]
3. **Path** (F8/A1) — spline, bends at entry; four channels agree. [roadMask → spline]
4. **Massing** (D1/B1) — dark frame / lit heart / pale far; off-center mass + answering accent.
5. **Boundaries** (D6) — hem scene with own architecture/darkness; mouths, gates, rings. [rework buildFraming]
6. **Thresholds** (D5) — dressed openings previewing the next area's chord.
7. **Structures** (B9/B10) — kit placement by grammar; windows cluster, lamps at corners.
8. **Hero props** (D4/B5) — 1–3 one-offs, one ornament per big field.
9. **Habitation** (E3) — something lit, something tended, something for sale.
10. **Wear zones** (E1/E2) — blotch ignoring grids; paths polished, edges mossed, tops weathered.
11. **Light** (C1–C4) — one-sun consistency, pools chained, bloom eats fixtures, 3 shadow types. [addGlowPools, lightPool, contactBlobs]
12. **Sky & horizon** (D7/C6) — gradient + occluded giant + jagged hem; far = soft/pale. [buildSky + moonDisc pass]
13. **Air** (C5) — one particle type, dozens, all depths; air tint. [buildMotes/buildWeather unified]
14. **Motion** (E4) — 2–4 loops assigned by meaning. [new live layer]
15. **Tone garnish** (F7) — comfort placed in light, wrongness in dark. [director tags → placement rules]

## 5. Layer 4 — the DIRECTOR contract (AI uses it all properly)

- **System prompt**: the 45 laws compressed to one line each + slot schema +
  3 worked mappings.
- **Output**: SceneSpec JSON, validated against the enum (zod-style).
  Invalid spec → regenerate with the validation error fed back.
- **Anti-generic guards**: spec rejected if heroProps empty or tonePair
  missing; consecutive scenes may not share gestureFamily + materialKit;
  seed pinned per scene id so results are reproducible.
- **Crazy-scene mapping** (how the wildest prompts still fit):
  - "Ocean of cereal worshipping a floating spoon" → groundRecipe: churn
    blobs + milk pools; sky.giant: spoon (heraldry symmetry, F5); motionSet:
    bob + slow rotation on the giant; tonePair: breakfast-cozy / crushing
    tides; heroProps: spoon-cult dais (plinth + coping ring).
  - "Glass metropolis migrating across salt desert" → materialKit: ice
    (facets + skyBlush, transparent-tinted); groundRecipe: salt crackle;
    gestureFamily: reach; motionSet: drift + slow whole-city sway;
    wrongness: it HUNTS signals (antenna pennants, neonGlyphs).
  - "Forest of chattering molars on a vibrating shelf" → materialKit:
    marble (pale, veined); treeHoodoo→molar variant (crown = cusps);
    motionSet: chatter (fast small jitter — the ONE allowed fast loop);
    groundRecipe: gum-pink mottle; wrongness: the vibration (camera-scale
    pulse), comfort: warm lamplit clearing.

The point: no matter how crazy the prompt, the answer is still one chord,
one gesture family, one giant, four ground layers, pools, wear, a tone pair.
The laws hold; the content is free. THAT is what makes the crazy scenes
work instead of collapsing into noise.

## 6. Variety engine — "rigid laws, loose instances" in code

- Randomness lives ONLY in `variants` jitter ranges + seed. Recipes are
  deterministic given seed; seeds are per scene + per instance id.
- No asset repeats within a scene without a variant change; a rotation
  ledger tracks last-used variant per recipe per scene.
- 1–3 hero props per scene are drawn from a no-repeat pool across the whole
  play session.
- Wear blotches, smear direction, and pool placement re-roll per scene but
  always obey their zone rules.
- Density profile biased per scene within the three bands (F10) — one scene
  leans busy, another leans empty, both keep all three bands.

## 7. Phasing + verification

Each phase ends: shots (shoot.cjs) → hypercritique against the law
checklist → fix batch → `npm run check` → version bump → commit + push.

- **Phase 1 — Foundation** (the "stop floating / stop weird polygons"
  phase): recipe param core; facing-honest valueMap everywhere; ground
  stack rework; boundary pass; sky giant + skyline hem; particle unification.
  Absorbs the pending batch-2 verification.
- **Phase 2 — Asset build-out**: the ~45 new recipes, kit by kit, Time
  Square + Everwinter + Caves first (evidence is strongest there).
- **Phase 3 — Composition passes**: thresholds, habitation, wear zones,
  hero placement, tone garnish.
- **Phase 4 — Director**: slot schema + validation + system prompt + the
  10-scene crazy battery as the acceptance test.
- **Phase 5 — Live layer**: motion loops, water scroll, flame clusters,
  spin/bob, chatter.

## 8. The acceptance test

The engine passes when: (a) the 10 crazy scenes each produce a coherent,
distinct, law-abiding vista; (b) any screenshot, reduced to 3 values, still
shows path + goal + mood; (c) 20 generated scenes share zero identical
instances; (d) Calvin stops saying "weird polygons and floating."
