# ROCK BOTTOM — measured values, and the painter's decision behind each

Sampled from the evidence crops with `tools/sample.py` (region means, HSV).
Numbers are not the story — the DECISION each number betrays is. V% = value,
S% = saturation, hue in degrees.

## Light: the painted pool falloff (Time Square lamp)

| sample | V% | S% | hue | the painter's decision |
|---|---|---|---|---|
| pool core | 41.5 | 53.2 | 48° | pool centre is ~2.7× brighter than the ground and MORE saturated — light adds colour, not whiteness |
| pool edge | 28.2 | 31.8 | 48° | hue held constant across the falloff (48° amber both core and edge) — a light has ONE colour, fading in strength |
| off-pool ground | 15.3 | 26.0 | 37° | the unlit ground keeps a cooler, weaker version of the same hue |

## Darkness: the pit ladder (Déjà Vu) and the threshold step (Time Square arch)

| sample | V% | decision |
|---|---|---|
| pit core | 20.8 | "absolute dark" ≈ 20% value — never 0% |
| pit rim lip (top face) | 34.3 | the lip is a half-step lighter so the hole has WALLS |
| floor tile | 58.7 | pit core ≈ 1/3 of the floor value — the punctuation ratio |
| arch inner (dark frame) | 7.6 | the near dark-frame can go darker than any focal dark (7–8%)… |
| corridor beyond (bright core) | 20.4 | …because the destination beyond is ~2.7× brighter: thresholds are a ~3× value STEP plus a temperature step |

## Water: the see-through recipe (Déjà Vu)

| sample | hue | decision |
|---|---|---|
| wall above waterline | 53° (warm sand) | the dry wall is warm… |
| wall below waterline | 174° (teal) | …the SAME wall seen through water swings 120° toward teal and gains saturation (S 55.7→41.2 but darker reading) — the depth tint does the "underwater" work, not refraction |
| open water | 177° | surface and submerged-wall share one hue: the water reads as a single body |

## Fire: the lava cell palette (Forge)

| sample | V% | S% | hue | decision |
|---|---|---|---|---|
| cell core | 84.5 | 94.3 | 32° | cores are near-max saturation AND value — heat = both at once |
| cell mid | 43.0 | 89.5 | 20° | mid cells hold saturation while value halves — cooling = darker, never greyer |
| cell border | 42.4 | 76.6 | 346° | borders swing to crimson (hue ROTATES at cell edges, 20°→346°) |
| edge rim at ledge | 81.4 | 95.0 | 13° | the meniscus where lava meets land is the hottest pixel in frame |
| floor near lava | 25.2 | 31.1 | 22° | the shore stays dark and desaturated so the lava owns the glow |

## Form: orientation value stepping (Everwinter cliff, Temple ledge)

| sample | V% | decision |
|---|---|---|
| snow top face | 77.7 | up-faces palest |
| cliff side face | 75.9 | side faces nearly as light BUT hue swings 258°→272° (bluer) — Everwinter steps form in HUE more than value (snow world inverts the usual ladder!) |
| ledge top edge | 22.4 | temple ledge tops only ~3.5 points above their undersides… |
| ledge under | 18.9 | …because the ledge's job is silhouette RHYTHM (the alternating line pair), not shading accuracy |

## Surface: mottle deltas (Time Square brick, Hourglass cave)

| sample | V% | decision |
|---|---|---|
| brick lit dab | 12.1 | dabs span ~±35% relative value around the mid… |
| brick mid | 18.6 | …with the DARK dabs painted into corners/recesses (stdev 6.7 = smooth soft dab) |
| cave blob dark | 24.5 | cave blobs hold ONE hue (≈300°) across a 3.5× value range… |
| cave blob mid | 86.8 | …all transitions soft (wet-in-wet): hue constant, value does everything |
| glyph highlight vs shade | 54.4 / 53.7 | temple relief separates light/shade by HUE (96° green-gold vs 22° warm umber) more than value — the painted "light direction" is a hue swing! |

## The shadow hue (never grey)

| world | shadow sample | hue | decision |
|---|---|---|---|
| Everwinter (backing) | 41.6% | 313° | shadows are violet |
| Time Square (off-pool) | 15.3% | 37° | shadows are warm umber |
| Temple (recess stain) | 22.8% | 61° | shadows are olive-green |
| Forge (near-lava floor) | 25.2% | 22° | shadows are ember brown |

Every world darkens toward its OWN atmosphere hue. Zero sampled shadow is
neutral grey.

## Crystal glow ladder (Mine stalk)

orb core 44.5% → halo mid 29.6% → rock far 18.1%: the glow's falloff is
~2.5× from core to halo edge, and the hue (18° pink-amber) is identical core
to halo — same law as the lamp: one colour, fading in strength.
