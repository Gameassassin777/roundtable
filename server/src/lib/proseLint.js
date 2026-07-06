// Phase 1 prose lint — deterministic checks on DM output. Cheap, no LLM call.
// If anything fails, return a feedback string the DM can use for retry.
// LLM-based semantic Critic is a future Phase 1.5; this catches the biggest
// pain points Calvin named (prose dragging, grimdark leakage, adjective overload)
// without adding a third call per turn.

const BLACKLIST = [
  'visceral', 'eldritch', 'dread', 'sickly', 'oozing', 'twisted', 'suffocating',
  'malevolent', 'grotesque', 'writhing', 'noxious', 'tenebrous', 'abyssal', 'foul', 'wretched'
];

// Common -ly adverbs and -ous/ful adjectives we want to budget. Cheap heuristic.
const ADJECTIVE_HINT = /\b\w+(ous|ful|ive|ic|ish|less|able|ible|y)\b/gi;
const ADJECTIVE_BUDGET_PER_SENTENCE = 2;

function splitSentences(text) {
  // Split on .!? — keep it simple. Filter empties.
  return (text || '')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function countWords(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Returns { passes, violations, feedback }.
 * passes=true iff no violations.
 * feedback is a single-string rewrite hint for the DM retry, or null on pass.
 */
export function lintProse(narration) {
  if (!narration || typeof narration !== 'string') {
    return {
      passes: false,
      violations: ['empty narration'],
      feedback: 'Narration is empty. Write 2-3 grounded sentences.'
    };
  }

  const violations = [];
  const sentences = splitSentences(narration);

  // Sentence count: 2-3
  if (sentences.length < 2) {
    violations.push(`too few sentences (${sentences.length}; need 2-3)`);
  } else if (sentences.length > 3) {
    violations.push(`too many sentences (${sentences.length}; need 2-3)`);
  }

  // Word count: 30-90 total (floor relaxed from 40 — caught a clean 39-word beat)
  const words = countWords(narration);
  if (words < 30) violations.push(`too short (${words} words; need 30-90)`);
  if (words > 90) violations.push(`too long (${words} words; need 30-90)`);

  // Blacklist
  const lower = narration.toLowerCase();
  const hits = BLACKLIST.filter(w => new RegExp(`\\b${w}\\w*\\b`).test(lower));
  if (hits.length > 0) {
    violations.push(`forbidden words: ${hits.join(', ')}`);
  }

  // Adjective budget per sentence
  const overBudget = [];
  sentences.forEach((s, i) => {
    const matches = s.match(ADJECTIVE_HINT) || [];
    if (matches.length > ADJECTIVE_BUDGET_PER_SENTENCE) {
      overBudget.push(`sentence ${i + 1} has ~${matches.length} adjective-shaped words (max ${ADJECTIVE_BUDGET_PER_SENTENCE})`);
    }
  });
  if (overBudget.length > 0) {
    violations.push(`adjective budget exceeded: ${overBudget.join('; ')}`);
  }

  // Option-listing detection: "Do you / Will you / You can / Your choice"
  if (/\b(you can|do you|will you|your choice|what do you do)\b/i.test(narration)) {
    violations.push('narration addresses the player or offers choices — render the scene, do not prompt');
  }

  if (violations.length === 0) {
    return { passes: true, violations: [], feedback: null };
  }
  return {
    passes: false,
    violations,
    feedback: `Fix these violations: ${violations.join('; ')}.`
  };
}

// Also export for tests
export const _internals = { BLACKLIST, splitSentences, countWords, ADJECTIVE_BUDGET_PER_SENTENCE };
