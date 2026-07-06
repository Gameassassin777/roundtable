// Phase 2 World Engine: simulates the world off-screen so the DM always has
// material waiting. Runs on the DO alarm. Director role — advances NPCs toward
// their goals, escalates simmering threads, drifts faction dispositions, and
// surfaces 0-1 ambient world beats (atmosphere, not forced action).
//
// Situation-not-plots: routes/branches emerge from this simulated state, not
// from hardcoded narrated branches. When the DM needs to narrate the next turn,
// it reads the codex the World Engine just advanced — and finds NPCs already
// mid-move, factions already mid-agenda, threads already on a clock.

export function buildWorldEnginePrompt(codexJson, recentChatJson) {
  return `CURRENT WORLD STATE (MEMORY CODEX):
${codexJson}

RECENT PARTY ACTIVITY (LAST FEW BEATS):
${recentChatJson}

YOU ARE THE WORLD ENGINE — the off-screen director. The party is not on stage right now.
Advance the world one tick. Do NOT narrate the party's actions. Do NOT force them into a scene.
Your job: make the world feel alive by having things move that they will encounter later.

For each NPC in npcs: if their situation would change in this short window, advance them by ONE step toward their goal. Drift disposition based on what the party has done. Update location/status only if it actually shifts.

For each FACTION in factions: advance their agenda by one increment. Raise tension if their plans meet resistance; lower it if they succeed at a step. If tension hits 5 and next_move_turn hasn't been set, schedule it for ~3 turns from now. If next_move_turn has arrived, mark the faction ready to act (the DM will pick it up next turn).

For each THREAD in threads: if escalate_after_turn has passed and status is 'simmering', flip to 'active'. If lands_at_turn has passed and status is 'active', flip to 'landed'. Otherwise leave alone.

Advance world_clock: turn += 1. Every 3 turns, rotate time_of_day (morning → afternoon → evening → night → morning). Every 9 turns (3 full cycles), day += 1.

If something genuinely new is happening in the world that the party could sense from where they are (smoke on the horizon, a bell, weather shift, a stranger arriving), include a world_beat: 1 to 2 plain sentences, descriptive, NO call to action, NO addressed-to-the-party language. Otherwise world_beat is null.

CONSTRAINTS:
- 1-2 sentences max for world_beat. Plain natural prose.
- No grimdark maximalism, no gore, no purple adjectives. Same word blacklist as the DM prompt (visceral, eldritch, dread, sickly, oozing, twisted, suffocating, malevolent, grotesque, writhing, noxious, tenebrous, abyssal, foul, wretched).
- Max 2 descriptive adjectives per sentence.
- Do not invent new NPCs unless the plot_summary or recent activity clearly calls for someone new. New NPCs are rare.
- Do not move a faction to action — only schedule. The DM turn is what lands confrontations.
- Do not change party or inventory — those are owned by the DM turn.

OUTPUT (STRICT JSON, no markdown):
{
  "world_beat": "1-2 sentences of ambient world movement, or null" | null,
  "world_clock": { "turn": <int>, "day": <int>, "time_of_day": "morning|afternoon|evening|night" },
  "npc_changes": { "<name>": { partial fields to merge } },
  "faction_changes": { "<name>": { partial fields to merge } },
  "thread_changes": [ { "id": "<id>", ...partial fields to merge } ],
  "new_npcs": { "<name>": { full npc object } } | null,
  "new_threads": [ { id, name, description, escalate_after_turn, lands_at_turn, status: "simmering" } ] | null
}`;
}

export function buildWorldEngineRequestBody(prompt) {
  return {
    system_instruction: { parts: [{ text: 'You are the World Engine for a fantasy adventure. Output ONLY valid JSON. No markdown.' }] },
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { response_mime_type: 'application/json' }
  };
}

// Rotate time_of_day one step.
export function advanceTimeOfDay(tod) {
  const order = ['morning', 'afternoon', 'evening', 'night'];
  const i = order.indexOf(tod);
  return order[(i + 1) % order.length] || 'morning';
}

// Compute next world_clock state from current, advancing one tick.
export function tickWorldClock(clock) {
  const turn = (clock?.turn || 0) + 1;
  const cycle = turn % 3 === 0;
  const fullDay = turn % 9 === 0 && turn > 0;
  const tod = cycle ? advanceTimeOfDay(clock?.time_of_day || 'morning') : (clock?.time_of_day || 'morning');
  const day = (clock?.day || 1) + (fullDay ? 1 : 0);
  return { turn, day, time_of_day: tod };
}
