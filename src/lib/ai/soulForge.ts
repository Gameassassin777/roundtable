import { callGemini, extractText, parseJsonLoose } from './dmEngine';

export interface ForgeMessage { role: 'user' | 'model'; text: string; }

export interface ForgedTrait { name: string; desc: string; }

export interface ForgedCharacter {
    name: string;
    class_title: string;
    archetype: string;   // warrior | rogue | mage | cleric | ranger | warlock | bard | monk | ...
    hp: number;
    resolve: number;     // 0-50 (%)
    corruption: number;  // 0-40 (%)
    traits: ForgedTrait[];
    starting_item: { name: string; note?: string };
    backstory: string;
    portrait: string;     // short visual description (prompt for the image generator)
    portrait_url?: string; // generated Pollinations image URL
    seed?: number;         // seed used for the portrait (so it's reproducible / re-rollable)
}

const FORGE_SYSTEM = `You are the Soul Forge — a character architect for a lethal, grimdark tabletop RPG.
Given a player's freeform concept, invent ONE vivid, playable character that fits it.
Balance the numbers to the concept and to a brutal world: fragile glass-cannons and cursed
casters run low HP with some corruption; stalwarts run high HP with low corruption. Nothing is
a superhero. Invent an evocative CUSTOM class title — never just "Fighter/Rogue/Cleric/Mage".
Output ONLY valid JSON. No markdown, no commentary.`;

const SCHEMA = `Return strictly this JSON shape:
{
  "name": "a fitting proper name",
  "class_title": "an evocative custom class, 2-4 words (e.g. 'Ash-Choked Pyromancer')",
  "archetype": "the closest base archetype, one of: warrior, rogue, mage, cleric, ranger, warlock, bard, monk",
  "hp": integer 6-24,
  "resolve": integer 0-50,
  "corruption": integer 0-40,
  "traits": [ {"name":"short name","desc":"one clause of mechanical or flavor effect"} ],  // 2 to 3 traits
  "starting_item": {"name":"item name","note":"short sensory/flavor detail"},
  "backstory": "2-3 vivid, grim sentences in second person or third person",
  "portrait": "a short comma-separated visual description for an image generator"
}`;

const INTERVIEW_SYSTEM = `You are the Soul Forge — a patient, grim deity interviewing a soul about the hero it will become in a lethal, grimdark tabletop RPG.
Draw the character out through conversation: their nature, a defining wound or fear, what drives them, how they fight, what they have already lost.
Ask ONE evocative, probing question per turn, building on what they said. Keep every reply to 1-3 sentences, fully in-character — never break the fiction.
Do NOT output stats, bullet lists, or JSON — only converse. Once the hero feels vivid and clear, tell the soul they are ready and may forge their character.`;

/** One turn of the character-creation interview. Returns the Forge's next in-character reply. */
export async function forgeConverse(messages: ForgeMessage[], apiKey: string): Promise<string> {
    const contents = messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
    const data = await callGemini({
        system_instruction: { parts: [{ text: INTERVIEW_SYSTEM }] },
        contents,
        generationConfig: { temperature: 1.0 }
    }, apiKey);
    return extractText(data) || 'The forge falls silent for a moment… tell me more.';
}

function clampInt(v: any, lo: number, hi: number, fallback: number): number {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(lo, Math.min(hi, n));
}

/** Coerce whatever the model returned into a safe, complete ForgedCharacter. */
function normalize(raw: any, concept: string): ForgedCharacter {
    const traitsRaw = Array.isArray(raw?.traits) ? raw.traits : [];
    const traits: ForgedTrait[] = traitsRaw
        .map((t: any) => (typeof t === 'string' ? { name: t, desc: '' } : { name: String(t?.name ?? 'Trait'), desc: String(t?.desc ?? '') }))
        .filter((t: ForgedTrait) => t.name)
        .slice(0, 3);
    if (traits.length === 0) traits.push({ name: 'Survivor', desc: 'Has endured what should have killed them.' });

    const item = raw?.starting_item && typeof raw.starting_item === 'object'
        ? { name: String(raw.starting_item.name || 'Worn Blade'), note: raw.starting_item.note ? String(raw.starting_item.note) : '' }
        : { name: String(raw?.starting_item || 'Worn Blade'), note: '' };

    return {
        name: String(raw?.name || 'Nameless Wanderer').slice(0, 40),
        class_title: String(raw?.class_title || 'Grim Wanderer').slice(0, 48),
        archetype: String(raw?.archetype || 'warrior').toLowerCase().trim(),
        hp: clampInt(raw?.hp, 6, 24, 12),
        resolve: clampInt(raw?.resolve, 0, 50, 20),
        corruption: clampInt(raw?.corruption, 0, 40, 0),
        traits,
        starting_item: item,
        backstory: String(raw?.backstory || `Forged from the notion: "${concept}".`).slice(0, 600),
        portrait: String(raw?.portrait || concept).slice(0, 300)
    };
}

/**
 * Generate (or refine) a custom character from a freeform concept using the player's key.
 * Throws on hard API failure (bad key etc.) so the UI can show a real error.
 */
export async function forgeCharacter(
    concept: string,
    apiKey: string,
    opts: { refine?: string; previous?: ForgedCharacter; nameHint?: string; conversation?: ForgeMessage[] } = {}
): Promise<ForgedCharacter> {
    let userText: string;
    if (opts.conversation && opts.conversation.length) {
        const transcript = opts.conversation
            .map((m) => `${m.role === 'model' ? 'FORGE' : 'SOUL'}: ${m.text}`)
            .join('\n');
        userText = `A soul has spoken with the Soul Forge to design their hero. Here is their full conversation:\n\n${transcript}\n\nCompile the FINAL character they arrived at together, honoring everything the soul expressed and everything the two agreed on.\n\n`;
    } else {
        userText = `Player concept: ${concept}\n\n`;
    }
    if (opts.previous) {
        userText += `Here is the current draft as JSON:\n${JSON.stringify(opts.previous)}\n\n`;
        userText += opts.refine
            ? `Revise it per this instruction, keeping everything else consistent: "${opts.refine}".\n\n`
            : `Reforge it into a fresh take that still honors the conversation.\n\n`;
    }
    if (opts.nameHint) userText += `Prefer the name "${opts.nameHint}" if it fits.\n\n`;
    userText += SCHEMA;

    const data = await callGemini({
        system_instruction: { parts: [{ text: FORGE_SYSTEM }] },
        contents: [{ parts: [{ text: userText }] }],
        generationConfig: { response_mime_type: 'application/json', temperature: 1.0 }
    }, apiKey);

    const text = extractText(data);
    if (!text) throw new Error('The forge returned nothing (the request may have been blocked).');
    const parsed = parseJsonLoose(text);
    if (!parsed) throw new Error('The forge returned unreadable output.');
    return normalize(parsed, concept);
}
