import * as Y from 'yjs';

interface DMResponse {
    narration: string;
    scene_tags?: any;
    ui_update?: { qte?: { type: string; time_limit_ms: number } };
    new_codex?: any;
}

const SYSTEM_PROMPT = `You are the Grimdark Dungeon Master. Output ONLY valid JSON. No markdown.`;

export async function callAI(prompt: string, apiKey: string, ydoc: Y.Doc, myClientId: number): Promise<DMResponse> {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { response_mime_type: "application/json" }
            })
        });

        if (response.status === 429) {
            ydoc.getMap('yKeyHealth').set(myClientId.toString(), 'exhausted');
            throw new Error("RATE_LIMITED");
        }

        const data = await response.json();
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        if (data.promptFeedback?.blockReason) return { narration: "The action collapses into chaos.", ui_update: {} };

        const parsed = JSON.parse(data.candidates[0].content.parts[0].text);

        // Deep Merge new_codex into Yjs
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
        console.error("Fatal AI Error:", e);
        throw e;
    }
}