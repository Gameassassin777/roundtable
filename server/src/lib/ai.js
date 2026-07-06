// Server-side Gemini call layer. Ported from client dmEngine.ts so all AI
// calls run in the Worker, not on client devices. The Worker holds the key
// pool; clients register keys via WebSocket and never call Gemini themselves.

// Model fallback chain. gemini-2.0-flash is quota-dead on free tier (4/2026);
// 2.5-flash is the reliable default, fall through on 429/503.
export const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];

export const SYSTEM_PROMPT = `You are the Dungeon Master for a fantasy adventure. Output ONLY valid JSON. No markdown.`;

/**
 * Calls the Gemini API, walking the model fallback chain on transient errors.
 * Returns the parsed JSON response, or throws on hard errors / all-models-exhausted.
 *
 * Returns { ok, data, status, retryAfterMs } so the caller can mark a key 429
 * without an exception, and distinguish bad-key (400/403) from transient.
 */
export async function callGemini(body, apiKey) {
  let lastErr = null;
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );

      // Transient: try next model, but tell the caller this key is hot
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
        lastErr = { status: 429, retryAfterMs: retryAfter * 1000, model };
        continue;
      }
      if (res.status === 503) {
        lastErr = { status: 503, model };
        continue;
      }

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // Bad/blocked key — don't retry, surface to caller
        return { ok: false, status: res.status, error: data?.error?.message || `API ${res.status}` };
      }
      return { ok: true, data };
    } catch (e) {
      lastErr = { status: 0, error: String(e), model };
    }
  }
  // All models exhausted. If the last error was 429, surface that so caller marks the key.
  if (lastErr && lastErr.status === 429) {
    return { ok: false, status: 429, retryAfterMs: lastErr.retryAfterMs };
  }
  return { ok: false, status: lastErr?.status || 500, error: lastErr?.error || 'All models exhausted' };
}

/** Pull the first text part out of a Gemini response, or '' if blocked/empty. */
export function extractText(data) {
  if (data?.promptFeedback?.blockReason) return '';
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/** Parse a JSON object out of model text, tolerating code fences / stray prose. */
export function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Round-robin key pool with 429-skip. Each call advances nextIdx so burn
 * distributes evenly across all contributed keys, regardless of whose turn
 * it is or who's online more. Throttled keys are skipped until their
 * cooldown expires; if all keys throttled, caller must queue.
 */
export class KeyPool {
  constructor() {
    this.keys = []; // { value, label, sharePolicy, throttledUntil, callsToday, lastUsed }
    this.nextIdx = 0;
  }

  register(value, label, sharePolicy = 'table') {
    // Dedupe by key value; update label/policy if re-registered
    const existing = this.keys.find(k => k.value === value);
    if (existing) {
      existing.label = label;
      existing.sharePolicy = sharePolicy;
      return;
    }
    this.keys.push({
      value,
      label: label || 'anonymous',
      sharePolicy,
      throttledUntil: 0,
      callsToday: 0,
      lastUsed: 0
    });
  }

  remove(value) {
    const i = this.keys.findIndex(k => k.value === value);
    if (i >= 0) this.keys.splice(i, 1);
  }

  available() {
    const now = Date.now();
    return this.keys.filter(k => k.throttledUntil < now);
  }

  next() {
    const now = Date.now();
    const n = this.keys.length;
    if (n === 0) return null;
    // Scan from nextIdx, wrap around, find first non-throttled
    for (let i = 0; i < n; i++) {
      const idx = (this.nextIdx + i) % n;
      const k = this.keys[idx];
      if (k.throttledUntil < now) {
        this.nextIdx = (idx + 1) % n;
        k.callsToday++;
        k.lastUsed = now;
        return k;
      }
    }
    // All throttled — return the one with earliest thaw for queueing math
    return null;
  }

  markThrottled(value, retryAfterMs = 60_000) {
    const k = this.keys.find(x => x.value === value);
    if (k) k.throttledUntil = Date.now() + retryAfterMs;
  }

  /** Find the soonest-thawing throttled key, for "table resting" UX. */
  earliestThawMs() {
    const now = Date.now();
    const throttled = this.keys.filter(k => k.throttledUntil > now);
    if (throttled.length === 0) return 0;
    return Math.min(...throttled.map(k => k.throttledUntil - now));
  }

  usage() {
    return this.keys.map(k => ({
      label: k.label,
      sharePolicy: k.sharePolicy,
      callsToday: k.callsToday,
      throttled: k.throttledUntil > Date.now(),
      lastUsedAge: k.lastUsed ? Date.now() - k.lastUsed : null
    }));
  }
}
