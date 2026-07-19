# The Blinx Style Organism — the full artstyle, system by system

Not a list of traits — one organism. Ten systems that interlock. Each entry:
WHAT it is → HOW it is made → WHY it works (artistically, thematically,
immersively) → LAW. Evidence: crops/ + frames/ + world files.

---

## 1. The Posed World — what the "jaggedness" actually is

WHAT: nothing is plumb, nothing is level, nothing is straight. Houses lean,
lamp posts bend, doorways sag, walls bow. But it is NOT random roughness.

HOW: every object receives exactly ONE intentional lean or bow — a single arc,
2–7 degrees off true, in one direction, like a line of action in character
animation. The arch house (w1ts-arch) leans left as one mass; its lamp bends
like a growing stem in a single S-curve; the door curtain bulges once. Joints
between parts stay flush — the object is not broken, it is POSED. Jitter
(many small random offsets) would read as damage or noise; one big arc reads
as character.

WHY: a posed object has the same psychological charge as a posed person — you
read intention and mood into it. A town of leaning houses is a crowd of tired,
proud, huddled personalities. That is why the worlds feel inhabited before a
single NPC appears. Thematically it is TIME again: these structures have been
standing so long they have slumped, like old men. Immersively, off-plumb
verticals kill the "CG default" read — the eye cannot pattern-match the scene
to a grid, so it must actually look.

LAW: **Pose every object with one deliberate gesture; never add noise where a
gesture was needed. Straightness is the only forbidden thing.**

---

## 2. The Maquette — hand-built material logic

WHAT: everything looks physically MADE by a person — stacked stones, piped
icing, hammered plates, sewn curtains, painted signs. The world is a walk-in
diorama.

HOW: the scale of every detail matches a hand tool. Bricks (w2-brick) are
individually placed with jittered size, slight rotation, per-brick value
variation inside one narrow hue family — like a mason laid them, not a texture
tile. Icing ornament (w7e-candywall) is thick rounded TUBES with one soft
bevel — piped, not carved. Rivets (w8f-beams) are three painted marks each.
Textures behave like scenic paint: dabs, washes, blotches — never filter
noise, never photographic grain.

WHY: hand-scale detail gives the player a body. You unconsciously know the
size of a bricklayer's trowel, a piping bag, a paintbrush — so the world
reports its own scale through its toolmarks, and you feel present in it
because your hands can imagine making it. Machine-precise detail reports
nothing and could be any size.

LAW: **Every mark must be traceable to a hand tool — trowel, brush, piping
bag, hammer. If a machine could have made it, remake it.**

---

## 3. Flat Graphics in Solid Space — the poster layer

WHAT: bold flat 2D shapes live inside the 3D world: giant yellow pennant
shapes, neon green glyph-tags, crescent time-crystals, sign cards. Matisse
cutouts pasted into a sculpted world.

HOW: a flat shape, one saturated hue, hard edge, no shading, placed ON or
NEAR geometry but not conforming to it. The pennant shapes (w1ts-pennant) are
pure yellow-orange flat cards against the dark tower. The time crystal
(w1ts-crystal) is a flat glowing cyan crescent — an icon, not a mineral. The
graffiti glyphs (w1ts-shop) float on brick like stickers. The HUD rings use
the same language — UI and world share one graphic voice.

WHY: the double-read — dimensional world + flat poster language — is what
makes the style feel DESIGNED rather than rendered. It also solves
readability: gameplay-relevant things (crystals, signs, tags) speak in flat
icon-shapes, so they pop from the sculpted world without a single outline
shader. Thematically, the flat shapes are the Time Factory's corporate
language intruding on the old handmade worlds — new ink on old stone.

LAW: **Sculpt the world, sign it in flat color. Gameplay information rides
the flat layer; the world stays paint and clay.**

---

## 4. Light as Terrain — pools, not illumination

WHAT: in the night worlds you navigate from pool of light to pool of light.
Darkness is a material, not an absence.

HOW: every source casts a physical pool: a painted gradient ellipse on the
ground (lamppool, w6m-cyanpool), warm, crisp-edged, sized 4–5× the fixture.
The halo bloom swallows the fixture's stem (w1ts-lamp). Between pools, the
dark is a deep blue-brown MOTTLE (w1ts-dark) — painted, varied, breathable —
never black. The pool edge is where the world's value contrast lives; paths
are literally drawn as chains of pools.

WHY: the player reads light pools as safe ground — light becomes terrain, a
floor-plan drawn in value. This is staging with a purpose: the designer can
lead you anywhere by placing pools, the way a theater lights scenes.
Immersively, a world made of pools has intimacy at night — every pool is a
small room.

LAW: **Light is placed like furniture and lands like paint. Darkness is a
colored material. The path is a chain of pools.**

---

## 5. The Hue Chord — few hues, full saturation

WHAT: each world runs on a 3–4 hue chord at high saturation: Everwinter =
crimson + teal + white over pink air; Time Square = olive + slate + amber with
yellow windows; the Forge = orange + soot + one cyan.

HOW: hues are few but each is pushed wide across VALUES — the chord's colors
appear pale, mid, and near-black. Accents come from the chord's complement
(teal icing on crimson wall, cyan crystal in brown murk) and nothing else.
Sky hue is painted INTO objects (the ice pillar's pink flank, w7e-icepillar)
so the air literally tints the props.

WHY: few hues = the world has a key signature, like music. The eye relaxes
into the chord and then every accent DETONATES — the teal emblem on the
crimson wall hits like a chord change. Saturation discipline is what
separates "rich" from "rainbow mud."

LAW: **Three or four hues per world, each spanning its full value range.
Accents only from the complement. The sky is a paint that touches
everything.**

---

## 6. The Patina of Time — wear as the theme itself

WHAT: every surface is aged: stained planters, moss-washed statues, blotched
ivy masses, speckled stone, patched walls.

HOW: age is painted as ORGANIC BLOTCH — irregular lichen-like masses that eat
across geometry ignoring brick courses and tile grids (w1ts-ivy, w2-brick's
shadow patches, w5t moss recoloring WHOLE tiles off-grid). Plus recess-shade:
dark paint dabbed into folds, joints, under chins (w1ts-statue). The blotch
is always organic-shaped; the grid it eats is always man-made. Two grammars,
one surface.

WHY: this is the game's thesis rendered in paint. Blinx is about TIME — so
time is made visible on every wall: growth, decay, repair. The player never
reads a word of lore and already knows the world is old and was loved. Wear
is also anti-generic: a stained, blotched surface is unrepeatable — it is the
cheapest uniqueness there is.

LAW: **Age everything with organic blotches that disobey the man-made grid
beneath them. A game about time must show time on every surface.**

---

## 7. The Living Air — atmosphere as a body

WHAT: the air itself is dressed: snow sparkle drifts through Everwinter, dust
and embers in the Forge, bloom everywhere. Distance goes soft and pale.

HOW: small bright particles at many depths (w7e-candywall's diamond sparkles),
each tiny, slow, looping — dozens, not hundreds. Depth cueing by SOFTNESS:
the moon (w1ts-moon) is deliberately lower-detail and blurrier than the
rooftop in front of it — sharpness is spent only on the near layer. Bloom
halos on every emissive.

WHY: particles give the air a volume your body believes — you feel the space
between you and the wall because something is drifting through it. Soft
distance is a humility cue: the world extends beyond what it will show you,
so it feels large.

LAW: **Fill the air with a few slow drifters. Spend sharpness only up close;
let far things go soft and pale. Air is a material.**

---

## 8. The Layered Horizon — depth by occlusion cards

WHAT: every vista is a stack: dark sharp foreground silhouette → mid
structures → soft giant shape (moon, mountain) → sky gradient. Three to four
layers minimum.

HOW: the moon sits LOW so rooflines and crenellations cut into it
(w1ts-moon) — occlusion is what makes it feel huge and far. Foreground blobs
(w1ts-arch's black mass at frame bottom) brush the camera. Each layer gets
its own treatment: foreground = near-black and sharp, mid = full paint, far =
soft and low-detail, sky = flat gradient.

WHY: occlusion is the strongest depth cue there is — stronger than
perspective, stronger than fog. A giant soft shape BEHIND a small sharp one
tells the body exactly where it stands. The camera brushing past foreground
masses makes you a creature IN the space, not an observer AT it.

LAW: **Compose every view as near-sharp / mid-painted / far-soft / flat-sky.
Put something dark at the frame's edge. Let big far things be cut by small
near things.**

---

## 9. The Facet as Ornament — carving, not modeling

WHAT: machine-smooth curves are refused — curves themselves are not. The
lamp bends in a real S-curve, the ice pillar is a lathe, the moon is a disc,
the icing tubes are plump arcs. But every curve is built from a FEW BIG
CHORDS you can count: the round fountain becomes an octagon, rocks are 6–9
big planes, the pillar's lathe has a countable number of sides. What is
refused is not curvature but CONTINUITY — the unbroken, machined surface.
A Blinx curve is a bend whose segments you can number, and whose segments
are left visible and flat-valued. The low-poly read IS the decoration.

HOW: one flat value per facet, chosen by facing (w7e-rocksnowcap: warm mid on
lit planes, dark chocolate on shade planes, NOTHING on the darkest planes —
no texture noise). Snow applies as a PER-FACET RULE: any up-facing plane gets
a white cap with a hand-wobbled edge, so the snow inherits the faceting and
reads structural. Silhouettes stay asymmetric: one long sloping shoulder, one
broken side.

WHY: big flat facets behave like cut wood or carved stone — the object reads
as MADE, at a glance, from any distance. Texture noise on a dark plane would
lie about light; a flat plane tells the truth, and truthful planes build
trust in the world's solidity. This is why Blinx screenshots hold up: every
plane is a decision.

LAW: **Bend anything — but break every bend into few, big, countable chords.
Give each chord one honest flat value. Apply weather per-plane by facing.
Keep every silhouette asymmetric.**

---

## 10. Cozy × Eerie — the tonal engine

WHAT: tulips under a giant blurred moon. Neon graffiti in a medieval alley.
Candy stripes watched by a dark tower. Every world holds cute and uncanny at
once — a storybook at midnight.

HOW: pair every comfort object (flowers, lamps, curtains, sweets) with one
wrongness (oversized moon, dark mottle, leaning mass, silence of empty
streets). Value staging does the work: the comfort object sits in a light
pool; the wrongness looms in the dark mottle behind it.

WHY: pure cozy is flat; pure eerie is exhausting. The TENSION is the
immersion — safe enough to explore, strange enough to wonder. It is also the
fiction: these are worlds where time broke; something is wrong here, and the
cuteness is coping.

LAW: **Never place a comfort without a wrongness nearby. Stage the comfort in
light, the wrongness in dark. The mood is the gap between them.**

---

## How the systems interlock

Gesture (1) poses the world → the maquette logic (2) builds it by hand →
facets (9) carve it → patina (6) ages it → the hue chord (5) scores it →
light pools (4) stage it → the living air (7) fills it → the layered horizon
(8) frames it → flat graphics (3) sign it → and cozy×eerie (10) gives it a
pulse. Remove any one and the read collapses toward generic: no gesture =
CG-default; no patina = sterile; no chord = mud; no pools = unreadable at
night; no air = diorama glass; no horizon layers = floating; no flat layer =
no voice; no tonal tension = theme park.

The style is not "jagged low-poly." The style is: **a hand-built, time-worn,
pool-lit storybook that has been posed like a character and signed like a
poster.**
