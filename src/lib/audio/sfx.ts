// Phase 44: lightweight Web Audio SFX. No external files — every sound is
// synthesized at runtime from oscillators + envelopes. Keeps the bundle
// tiny and avoids hotlinking freesound CDNs.
//
// AudioContext is created lazily on first use (browsers require a user
// gesture before audio can play). Call sfx.resume() from a click handler
// to unlock audio on first interaction.
//
// Volume + mute are read fresh on every play() so settings changes take
// effect immediately. State persists to localStorage.

let ctx: AudioContext | null = null;
let muted = false;
let masterGain = 0.4;

const STORAGE_KEY = 'rt_audio_settings';

type Settings = { muted: boolean; volume: number };
export function loadAudioSettings(): Settings {
    if (typeof localStorage === 'undefined') return { muted: false, volume: 0.4 };
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { muted: false, volume: 0.4 };
        const parsed = JSON.parse(raw);
        muted = !!parsed.muted;
        masterGain = typeof parsed.volume === 'number' ? parsed.volume : 0.4;
        return { muted, volume: masterGain };
    } catch {
        return { muted: false, volume: 0.4 };
    }
}

export function saveAudioSettings(s: Settings) {
    muted = s.muted;
    masterGain = s.volume;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

function ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
        const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return null;
        ctx = new Ctor();
    }
    return ctx;
}

// Browsers suspend AudioContext until a user gesture. Call this from any
// click/keydown handler to unlock audio.
export async function resume(): Promise<void> {
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') {
        try { await c.resume(); } catch { /* noop */ }
    }
}

// Single tone with attack/decay envelope. All SFX compose from this.
function tone(
    c: AudioContext,
    opts: {
        freq: number;
        duration: number;
        type?: OscillatorType;
        gain?: number;
        attack?: number;
        decay?: number;
        delay?: number;
        detune?: number;
    }
) {
    const {
        freq, duration, type = 'sine', gain = 0.3,
        attack = 0.005, decay = duration, delay = 0, detune = 0
    } = opts;
    const start = c.currentTime + delay;
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (detune) osc.detune.setValueAtTime(detune, start);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
    osc.connect(env);
    env.connect(c.destination);
    osc.start(start);
    osc.stop(start + attack + decay + 0.05);
}

export type SfxName =
    | 'turn-result'      // DM finished a beat — soft resolving chime
    | 'turn-error'       // submission failed — muted thud
    | 'whisper'          // whisper returned — quiet bell
    | 'qte-start'        // QTE triggered — tense alert
    | 'qte-success'      // QTE won — bright ping
    | 'qte-fail'         // QTE lost — descending pair
    | 'world-tick'       // World Engine ambient tick — distant pad
    | 'level-up'         // character level up — rising arpeggio
    | 'connect'          // reconnected — soft pair
    | 'disconnect';      // disconnected — falling pair

export function play(name: SfxName) {
    if (muted) return;
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') {
        // Try to resume — common on re-entry after backgrounded tab. If this
        // fails the SFX is silently dropped; the next gesture will unlock.
        c.resume().catch(() => { /* noop */ });
    }
    const g = masterGain;
    switch (name) {
        case 'turn-result':
            // Soft resolving chime — fundamental + perfect fifth.
            tone(c, { freq: 523.25, duration: 0.6, type: 'sine', gain: g * 0.25 });
            tone(c, { freq: 783.99, duration: 0.6, type: 'sine', gain: g * 0.18, delay: 0.04 });
            break;
        case 'turn-error':
            tone(c, { freq: 196, duration: 0.25, type: 'sine', gain: g * 0.3 });
            tone(c, { freq: 146.83, duration: 0.4, type: 'sine', gain: g * 0.25, delay: 0.08 });
            break;
        case 'whisper':
            // Quiet bell, lower to feel private.
            tone(c, { freq: 392, duration: 0.5, type: 'triangle', gain: g * 0.18, attack: 0.01 });
            break;
        case 'qte-start':
            // Tense alert — quick high pulse.
            tone(c, { freq: 880, duration: 0.12, type: 'square', gain: g * 0.18 });
            tone(c, { freq: 880, duration: 0.12, type: 'square', gain: g * 0.18, delay: 0.18 });
            break;
        case 'qte-success':
            tone(c, { freq: 1046.5, duration: 0.2, type: 'sine', gain: g * 0.25 });
            tone(c, { freq: 1567.98, duration: 0.3, type: 'sine', gain: g * 0.2, delay: 0.08 });
            break;
        case 'qte-fail':
            tone(c, { freq: 440, duration: 0.18, type: 'sawtooth', gain: g * 0.18 });
            tone(c, { freq: 311.13, duration: 0.35, type: 'sawtooth', gain: g * 0.2, delay: 0.12 });
            break;
        case 'world-tick':
            // Distant pad — very soft, low.
            tone(c, { freq: 174.61, duration: 1.2, type: 'sine', gain: g * 0.12, attack: 0.2 });
            tone(c, { freq: 261.63, duration: 1.2, type: 'sine', gain: g * 0.08, attack: 0.2, delay: 0.05 });
            break;
        case 'level-up':
            // Rising arpeggio.
            tone(c, { freq: 523.25, duration: 0.18, type: 'sine', gain: g * 0.22 });
            tone(c, { freq: 659.25, duration: 0.18, type: 'sine', gain: g * 0.22, delay: 0.12 });
            tone(c, { freq: 783.99, duration: 0.18, type: 'sine', gain: g * 0.22, delay: 0.24 });
            tone(c, { freq: 1046.5, duration: 0.5, type: 'sine', gain: g * 0.28, delay: 0.36 });
            break;
        case 'connect':
            tone(c, { freq: 523.25, duration: 0.2, type: 'sine', gain: g * 0.18 });
            tone(c, { freq: 659.25, duration: 0.25, type: 'sine', gain: g * 0.18, delay: 0.1 });
            break;
        case 'disconnect':
            tone(c, { freq: 523.25, duration: 0.2, type: 'sine', gain: g * 0.18 });
            tone(c, { freq: 392, duration: 0.3, type: 'sine', gain: g * 0.18, delay: 0.12 });
            break;
    }
}
