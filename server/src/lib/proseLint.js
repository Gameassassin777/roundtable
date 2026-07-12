// Phase 1 prose lint — deterministic checks on DM output. Cheap, no LLM call.
// Profile-driven: scene_set (flowery), action (terse), social (NPC reply),
// world_ambient (1-2 sentence off-stage beat). All profiles share the blacklist
// and per-sentence adjective budget; length and sentence-count bounds come from
// the profile. deriveLintProfile(ruling) picks the right one for a turn.

const BLACKLIST = [
  'visceral', 'eldritch', 'dread', 'sickly', 'oozing', 'twisted', 'suffocating',
  'malevolent', 'grotesque', 'writhing', 'noxious', 'tenebrous', 'abyssal', 'foul', 'wretched'
];

const ADJECTIVE_HINT = /\b\w+(ous|ful|ive|ic|ish|less|able|ible|y)\b/gi;
const ADJECTIVE_BUDGET_PER_SENTENCE = 2;

const PROFILES = {
  scene_set:     { minSentences: 2, maxSentences: 4, minWords: 30, maxWords: 100 },
  action:        { minSentences: 1, maxSentences: 3, minWords: 8,  maxWords: 50  },
  social:        { minSentences: 1, maxSentences: 4, minWords: 12, maxWords: 90  },
  world_ambient: { minSentences: 1, maxSentences: 2, minWords: 8,  maxWords: 30  }
};

function splitSentences(text) {
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
 * profileName ∈ { scene_set, action, social, world_ambient }. Unknown → action.
 */
export function lintProse(narration, profileName = 'action') {
  if (!narration || typeof narration !== 'string') {
    return {
      passes: false,
      violations: ['empty narration'],
      feedback: `Narration is empty. Write for a ${profileName} beat.`
    };
  }

  const profile = PROFILES[profileName] || PROFILES.action;
  const violations = [];
  const sentences = splitSentences(narration);

  if (sentences.length < profile.minSentences) {
    violations.push(`too few sentences (${sentences.length}; need ${profile.minSentences}-${profile.maxSentences} for ${profileName})`);
  } else if (sentences.length > profile.maxSentences) {
    violations.push(`too many sentences (${sentences.length}; need ${profile.minSentences}-${profile.maxSentences} for ${profileName})`);
  }

  const words = countWords(narration);
  if (words < profile.minWords) violations.push(`too short (${words} words; need ${profile.minWords}-${profile.maxWords} for ${profileName})`);
  if (words > profile.maxWords) violations.push(`too long (${words} words; need ${profile.minWords}-${profile.maxWords} for ${profileName})`);

  const lower = narration.toLowerCase();
  const hits = BLACKLIST.filter(w => new RegExp(`\\b${w}\\w*\\b`).test(lower));
  if (hits.length > 0) {
    violations.push(`forbidden words: ${hits.join(', ')}`);
  }

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

  if (/\b(you can|do you|will you|your choice|what do you do)\b/i.test(narration)) {
    violations.push('narration addresses the player or offers choices — render the scene, do not prompt');
  }

  if (violations.length === 0) {
    return { passes: true, violations: [], feedback: null };
  }
  return {
    passes: false,
    violations,
    feedback: `Fix these violations (${profileName} profile): ${violations.join('; ')}.`
  };
}

// Pick the lint profile for a turn from the Director's ruling.
// is_scene_set wins — opening a new location reads as scene_set regardless of
// the action/social mix inside it. Otherwise action dominates (action is the
// default beat_type when the Director doesn't classify).
export function deriveLintProfile(ruling) {
  if (!ruling || typeof ruling !== 'object') return 'action';
  if (ruling.is_scene_set) return 'scene_set';
  const beats = Array.isArray(ruling.rulings) ? ruling.rulings : [];
  const hasAction = beats.some(r => !r?.beat_type || r?.beat_type === 'action');
  if (hasAction) return 'action';
  if (beats.some(r => r?.beat_type === 'social')) return 'social';
  return 'action';
}

export const _internals = { BLACKLIST, PROFILES, splitSentences, countWords, ADJECTIVE_BUDGET_PER_SENTENCE };
