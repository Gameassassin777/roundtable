# Round Table — Thesis

**Read this before changing anything. Every change must be checkable against it.**

Round Table is an **immersive story-decision game**. Not a chat app. Not a dashboard. You watch a world, you decide, the world answers.

This file exists because agents (Claude, GLM, Antigravity) work on this repo in separate conversations and cannot see each other. The repo is the only shared memory. Without a written thesis, every agent silently re-litigates the vision and adds a locally-reasonable layer. Nineteen versions of that produced a beige void. **That is the failure mode this file prevents.**

---

## The law: every change states what it retracts

Every commit touching UI or theming must answer, in the message:

```
Retracts: <what this replaces / removes>   (or "Retracts: nothing — purely additive" + why that's OK)
```

Additive-by-default is the disease. v8→v27 was 2,138 insertions against 543 deletions and produced four contradictory design theses living at once. **If you add a way to do something, delete the old way in the same commit.** If you can't, say so out loud.

---

## What Round Table is NOT

A negative spec, because an additive spec can always be satisfied by adding — and adding is the disease.

1. **NOT a chat app.** No message list as the primary view. No chat bubbles. History lives behind a drawer, never in the main view.
2. **NOT a dashboard.** Nothing persistent on screen while idle except a connection dot and one `⋮` glyph. No topbar, no scene-strip, no stat rail, no version tag, no update banner in the idle view.
3. **NOT a web page.** No SaaS idiom: no card-modal onboarding, no search inputs with borders, no `✕` close buttons, no capsule chips, no toast stack as primary feedback.
4. **NOT tutorialized.** The game does not explain its own interface in a modal. If the UI needs a tutorial overlay, the UI is wrong. Teaching happens diegetically — the DM teaches inside the fiction, or the affordance is obvious.
5. **NOT beige-on-beige.** See the contrast law below. This is the single most-violated rule in the repo's history.
6. **NOT self-narrating.** User-facing copy never contains words like "diegetic", "world engine", "pipeline", "beat". Those are our words, not the player's.

---

## The contrast law (mechanical, non-negotiable)

**Two independent failures made the game literally unreadable. Both are banned structurally, not by taste.**

### 1. The stage must not match the page

The diorama is the stage. It carries **all** scene atmosphere — fog, light temperature, sky, palette. It must be visibly distinct from the UI chrome behind/around it.

- The diorama's clear color must **never** be set to the page background value.
- Historical bug: clear color was hardcoded `0xe9e0cf` to "match `--bg`" — a token that no longer exists (it's `--page: #ede4d0` now). Beige objects in beige fog on a beige clear color under contrast-avoidant lighting = an invisible stage. Do not re-introduce this.
- If night is night, the stage gets dark. "Don't make it a pitch-black crypt" is not a reason to make it beige.

### 2. One palette resolver — never racing CSS layers

Scene state (biome / time / mood / weather) resolves to **one** palette through **one** function. Never through independent CSS rule sets.

- Historical bug: `app.css` had four layers (12 biomes × 4 times × 9 moods × 4 weathers) all writing `--page`, `--ink`, `--gold`, `--accent` at **identical specificity**, so source order silently decided the winner. Biome always beat time-of-day.
- Measured result: `night + forest` → contrast **1.01**. `night + crossroads` (the default seed location) → **1.03**. `night + any weather` → **1.03**. 1.0 is invisible. Seven of thirteen biomes rendered unreadable at night.
- Weather used self-referential `--page: color-mix(in srgb, var(--page) 92%, ...)`, which is invalid-at-computed-value-time for an `@property`-registered custom property — silently resetting `--page` to its light initial value while `--ink` stayed night-light.

**Rule: page-vs-ink contrast ≥ 4.5:1 in every reachable scene state. No exceptions, including the default seed.**

---

## Structural rules

- **No dead components.** If nothing imports it, delete it. (`ActionInput.svelte`, `Chronicle.svelte`, `Welcome.svelte` were dead in-tree for days, still readable as if they were the pattern to copy.)
- **No raw z-index.** Use the named scale. The tree once had 20 ad-hoc values including `97/96/95` and `33/32/31` clusters — the fingerprint of three agents each nudging a magic number to win a stacking fight none of them could see whole.
- **Colors come from tokens.** No hardcoded hex in components.
- **Viewport is never sampled once.** Anything sized from the viewport needs a resize handler and a zero-guard. `window.innerWidth` can be `0` at mount (iOS PWA cold start, backgrounded tabs, embedded panes). Sampling it once at `onMount` with no recovery means a permanently 0×0 canvas.

---

## Versioning

Bump `svelte.config.js` → `kit.version.name` as a **whole-number integer string** (`'27'` → `'28'`) on every push. Not semver. The service worker's update detection depends on it.

---

## Deploy

- Client: auto-deploys via GitHub Actions on push to `main`.
- Worker: `cd server && wrangler deploy` (Cloudflare Durable Object holds the Y.Doc per room).

---

## Before you open a PR, answer these

1. What does this retract?
2. Does the idle game view still show nothing but the diorama, a connection dot, and `⋮`?
3. Is page-vs-ink contrast ≥ 4.5 in every scene state you touched — including night, including weather?
4. Did you delete the thing you replaced?
