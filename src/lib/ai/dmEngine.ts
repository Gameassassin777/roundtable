import * as Y from 'yjs';

interface DMResponse {
    narration: string;
    scene_tags?: any;
    ui_update?: { qte?: { type: string; time_limit_ms: number } };
    new_codex?: any;
}

// Model fallback chain. gemini-2.0-flash is effectively quota-dead on the free tier
// now (instant 429), and gemini-3-flash-preview is frequently 503. 2.5-flash is the
// reliable free default; we fall through the list on 429/503 so a single model being
// rate-limited or overloaded never kills a turn.
export const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];

const SYSTEM_PROMPT = `You are the Grimdark Dungeon Master. Output ONLY valid JSON. No markdown.`;

/**
 * Calls the Gemini API, walking the model fallback chain on transient errors
 * (429 rate limit / 503 overloaded). Throws on hard errors (bad key = 400/403)
 * or when every model has been exhausted.
 */
export async function callGemini(body: any, apiKey: string): Promise<any> {
    let lastErr: any = new Error('No models attempted');
    for (const model of GEMINI_MODELS) {
        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
            );
            if (res.status === 429 || res.status === 503) {          // transient → try next model
                lastErr = new Error(`${model}: ${res.status}`);
                continue;
            }
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                lastErr = new Error(`API ${res.status}: ${data?.error?.message || ''}`);
                if (res.status === 400 || res.status === 403) throw lastErr;  // bad/blocked key — don't retry
                continue;
            }
            return data;
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr;
}

/** Pull the first text part out of a Gemini response, or '' if blocked/empty. */
export function extractText(data: any): string {
    if (data?.promptFeedback?.blockReason) return '';
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/** Parse a JSON object out of model text, tolerating code fences / stray prose. */
export function parseJsonLoose(text: string): any {
    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return null;
        return JSON.parse(match[0]);
    }
}

export async function callAI(prompt: string, apiKey: string, ydoc: Y.Doc, myClientId: number): Promise<DMResponse> {
    try {
        const data = await callGemini({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { response_mime_type: 'application/json' }
        }, apiKey);

        const rawText = extractText(data);
        if (!rawText) return { narration: 'The threads of fate blur — the vision refuses to form. Try a different action.', ui_update: {} };

        const parsed: DMResponse = parseJsonLoose(rawText) || { narration: rawText, ui_update: {} };

        // Deep-merge new_codex into Yjs (per-key so concurrent party edits survive).
        if (parsed.new_codex) {
            const yCodex = ydoc.getMap('memoryCodex');
            ydoc.transact(() => {
                for (const key in parsed.new_codex) {
                    if (key === 'party' && typeof parsed.new_codex[key] === 'object') {
                        const currentParty = yCodex.get('party') || {};
                        const updatedParty = { ...currentParty };
                        for (const player in parsed.new_codex.party) {
                            updatedParty[player] = { ...updatedParty[player], ...parsed.new_codex.party[player] };
                        }
                        yCodex.set('party', updatedParty);
                    } else {
                        yCodex.set(key, parsed.new_codex[key]);
                    }
                }
            });
        }
        return parsed;
    } catch (e) {
        console.error('Fatal AI Error:', e);
        throw e;
    }
}
