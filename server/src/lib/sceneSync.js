// Scene Sync — a tiny post-narration judge that keeps the World Director's
// scene_tags glued to the story's actual position. The Director only runs
// when a scene render triggers (arrival, teleport, explicit scene change);
// everything between renders is narration, and if the party walks from a
// calm crossroads into a drowned cathedral mid-turn, the stage stays wrong
// until something new triggers. Scene Sync closes that gap: after the DM
// text lands, it decides whether the fiction moved somewhere the current
// tags no longer describe, and if so emits a scene_tags_change that flows
// through the exact same merge/whitelist as a Director ruling.
//
// Cost: one small judge call per DM turn, on a spare key (same guard as the
// Critic — it is skipped entirely when no spare key exists).
//
// Scope: scene_tags ONLY. It never touches the codex or locations — moving
// the party on the world map has too many side effects to trigger from a
// text judge; new named places remain the codex extractor's job.

import { formatNorthStar } from './northstar.js';

const MOODS = ['calm', 'tense', 'dark', 'corrupt', 'warm', 'sorrowful', 'hopeful', 'mystical', 'violent'];
const WEATHERS = ['clear', 'rain', 'snow', 'fog', 'overcast'];

export function buildSceneSyncPrompt(narration, location, currentTags, northStar) {
  const ns = formatNorthStar(northStar);
  const tags = currentTags && typeof currentTags === 'object' ? currentTags : {};
  return `YOU ARE THE SCENE SYNC for a dark-fantasy tabletop RPG. One job: decide whether the story just MOVED — whether the DM narration below places the party somewhere (or transforms the place into something) the current scene tags no longer describe.

CURRENT LOCATION: ${location || 'unknown'}
CURRENT SCENE TAGS: biome=${tags.biome || '?'} | weather=${tags.weather || '?'} | mood=${tags.mood || '?'}${tags.visual ? ` | visual=${JSON.stringify(tags.visual)}` : ''}
${ns ? `CAMPAIGN TONE:\n${ns}\n` : ''}
DM NARRATION (excerpt):
"""
${String(narration || '').slice(0, 1500)}
"""

RULES:
- "moved" means the party ARRIVED somewhere with a different character (entered a building/cave/city/region, crossed into new terrain, plane-shifted), OR the immediate environment transformed (storm rolled in, fire swept through, the room flooded, reality broke). Walking a few steps, looking around, talking, fighting in place: NOT moved.
- When in doubt, DO NOT MOVE. False tag changes are worse than stale tags.
- If moved: describe the NEW place/conditions, not the old one. Weather must be one of: ${WEATHERS.join(', ')}. Mood must be one of: ${MOODS.join(', ')}. Biome is free lowercase text, 1-4 words, concrete (drowned cathedral interior, ash wastes, muscle-planet surface).
- Include "visual" ONLY if the new place would look alien to an ordinary person (floating geometry, impossible materials, a sky that is not a sky). For ordinary forests/castles/taverns, omit visual entirely. Visual fields (omit any that are ordinary): openness 0-1, silhouette 0-1, density 0-1, terrain one of floor|dunes|spires|terraces|chasm|lilypads, glow 0-1, order one of organic|assembly|arcade|grid|orbital, palette_hint a short color phrase.
- Commit to what the narration actually says, however impossible — the renderer obeys the tags, and the tags follow the fiction.

Output ONLY valid JSON, no markdown, no prose:
{"moved": false}
or
{"moved": true, "scene_tags_change": {"biome": "...", "weather": "...", "mood": "...", "visual": {...}}}`;
}

export function buildSceneSyncRequestBody(prompt) {
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    // maxOutputTokens must leave headroom for the 2.5-family thinking budget —
    // a tight cap gets consumed by reasoning and the JSON arrives truncated.
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2048 },
  };
}

export function sanitizeSyncChange(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.moved !== true) return null;
  const raw = parsed.scene_tags_change;
  if (!raw || typeof raw !== 'object') return null;
  const change = {};
  if (typeof raw.biome === 'string' && raw.biome.trim()) change.biome = raw.biome.trim().toLowerCase().slice(0, 80);
  if (typeof raw.weather === 'string' && WEATHERS.includes(raw.weather)) change.weather = raw.weather;
  if (typeof raw.mood === 'string' && MOODS.includes(raw.mood)) change.mood = raw.mood;
  if (raw.visual && typeof raw.visual === 'object') {
    const v = {};
    const src = raw.visual;
    if (typeof src.openness === 'number') v.openness = Math.max(0, Math.min(1, src.openness));
    if (typeof src.silhouette === 'number') v.silhouette = Math.max(0, Math.min(1, src.silhouette));
    if (typeof src.density === 'number') v.density = Math.max(0, Math.min(1, src.density));
    if (typeof src.terrain === 'string') v.terrain = src.terrain;
    if (typeof src.glow === 'number') v.glow = Math.max(0, Math.min(1, src.glow));
    if (typeof src.order === 'string') v.order = src.order;
    if (typeof src.palette_hint === 'string' && src.palette_hint.trim()) v.palette_hint = src.palette_hint.trim().slice(0, 120);
    if (Object.keys(v).length) change.visual = v;
  }
  return Object.keys(change).length ? change : null;
}
