// Phase 12 LLM Critic: runs AFTER the DM renders prose, BEFORE commitTurn.
// Catches what the deterministic prose lint cannot — structural failures
// against the Director's ruling and the codex. Cheap lint stays as the
// floor; this is the deeper pass.
//
// Cost guard: caller checks keyPool availability before invoking. If no
// spare key, returns { skip: true } so the pipeline falls through with the
// prose-lint-only result.

export function buildCriticPrompt(ruling, narration, codexJson) {
  return `CURRENT WORLD STATE (MEMORY CODEX):
${codexJson}

DIRECTOR'S RULING (canon — verdicts, consequences, codex writes):
${JSON.stringify(ruling, null, 2)}

DM'S NARRATION (the prose you are checking):
${narration}

YOU ARE THE CRITIC. Decide whether the narration is FAITHFUL to the ruling and the codex.
You do NOT decide outcomes. You do NOT write prose. You only flag violations.

Check for, and report each as a separate violation:
1. RULING_FIDELITY — does the narration contradict any verdict, consequence, or codex_write in the ruling? Does it invent outcomes the ruling did not authorize?
2. PLAYER_ADDRESSING — does the narration address the player directly ("you feel", "you must decide", second-person commands)? The narration may describe what happens to characters; it must not speak to the player.
3. OPTION_LISTING — does the narration list choices or ask what the player does next?
4. CODEX_CONTRADICTION — does the narration reference HP/wounds/inventory/location changes that the ruling did NOT authorize? Does it mention an NPC by name who is not in the codex or the ruling?
5. RULING_GAPS — did the narration SKIP a load-bearing piece of the ruling (a consequence, a QTE trigger, a thread change)?

For each violation: cite the rule id above, quote the offending phrase from the narration in one short line, and write a one-sentence fix instruction.

OUTPUT (STRICT JSON, no markdown):
{
  "passes": true | false,
  "violations": [
    { "rule": "RULING_FIDELITY", "quote": "...", "fix": "..." }
  ],
  "feedback": "single short paragraph the DM can use to rewrite, or empty string if passes"
}`;
}

export function buildCriticRequestBody(prompt) {
  return {
    system_instruction: { parts: [{ text: 'You are the Critic for a fantasy adventure. Output ONLY valid JSON. No markdown.' }] },
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { response_mime_type: 'application/json' }
  };
}
