// Phase 6: North Star formatter — renders the host-defined premise/tone
// as a top-of-prompt foundational block. Shared by Director, DM, World
// Engine, and Phase 0 fallback so all four pipelines honor the same
// premise. Empty north star → empty string (prompts improvise neutrally).

export function formatNorthStar(northStar) {
  if (!northStar || typeof northStar !== 'object') return '';
  const premise = (northStar.premise || '').trim();
  const tone = (northStar.tone || '').trim();
  const hook = (northStar.opening_hook || '').trim();
  if (!premise && !tone && !hook) return '';

  const lines = ['NORTH STAR (the host-defined foundation of this world — honor it in every ruling):'];
  if (premise) lines.push(`Premise: ${premise}`);
  if (tone) lines.push(`Tone: ${tone}`);
  if (hook) lines.push(`Opening hook (already in motion — do not rewind): ${hook}`);
  return lines.join('\n');
}
