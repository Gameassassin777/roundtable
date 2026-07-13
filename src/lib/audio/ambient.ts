// Title-screen atmosphere — drone + ember ticks + ceremony swells.
// Shares AudioContext with sfx.ts pattern. All long-lived nodes cleaned up on stop.
// Volume is intentionally low: drone ~6% master, ticks ~4%, swells ~5%.
// These are background textures, not foreground music.

let _ctx: AudioContext | null = null;

interface ActiveDrone {
    master: GainNode;
    nodes: AudioScheduledSourceNode[];
}

let drone: ActiveDrone | null = null;
let emberTimer: ReturnType<typeof setTimeout> | null = null;

function getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!_ctx) {
        const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return null;
        _ctx = new Ctor();
    }
    return _ctx;
}

export function ambientCtx(): AudioContext | null {
    return getCtx();
}

function isMuted(): boolean {
    try {
        const raw = localStorage.getItem('rt_audio_settings');
        return raw ? !!JSON.parse(raw).muted : false;
    } catch {
        return false;
    }
}

// 4-voice drone: C2 pedal, G2 fifth, C3 octave (detuned), E6 shimmer.
// LFO at 0.5 Hz slowly modulates the pedal gain.
// Returning hero variant adds Ab2 (minor sixth) for a haunting color.
// Ceremony flag = audio-on swell: faster ramp + slight overshoot + settle.
export async function startDrone(
    opts: { returning?: boolean; ceremony?: boolean } = {}
): Promise<void> {
    if (isMuted()) return;
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') {
        try { await c.resume(); } catch { /* noop */ }
    }
    if (drone) stopDrone(0.3);

    const now = c.currentTime;
    const master = c.createGain();
    master.gain.setValueAtTime(0.0001, now);

    const target = 0.06;
    const fadeDur = opts.ceremony ? 1.6 : 3.0;
    const peak = opts.ceremony ? target * 1.4 : target;

    if (opts.ceremony) {
        master.gain.exponentialRampToValueAtTime(peak, now + fadeDur * 0.65);
        master.gain.exponentialRampToValueAtTime(target, now + fadeDur);
    } else {
        master.gain.exponentialRampToValueAtTime(target, now + fadeDur);
    }
    master.connect(c.destination);

    const nodes: AudioScheduledSourceNode[] = [];

    const makeVoice = (
        freq: number, type: OscillatorType, gain: number, detune = 0
    ): GainNode => {
        const osc = c.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        if (detune) osc.detune.value = detune;
        const g = c.createGain();
        g.gain.value = gain;
        osc.connect(g);
        g.connect(master);
        osc.start(now);
        nodes.push(osc);
        return g;
    };

    const g1 = makeVoice(65.41, 'sine', 0.6);           // C2 pedal
    makeVoice(98.0, 'sine', 0.4);                        // G2 fifth
    makeVoice(130.81, 'triangle', 0.25, 6);              // C3 octave, slight detune
    if (opts.returning) makeVoice(103.83, 'sine', 0.3);  // Ab2 minor sixth
    makeVoice(1318.51, 'sine', 0.04);                    // E6 shimmer

    // LFO modulates pedal gain — slow swell
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.5;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.2;
    lfo.connect(lfoGain);
    lfoGain.connect(g1.gain);
    lfo.start(now);
    nodes.push(lfo);

    drone = { master, nodes };
}

export function stopDrone(fadeSec = 1.5): void {
    if (!drone || !_ctx) return;
    const c = _ctx;
    const now = c.currentTime;
    const masterGain = drone.master.gain;
    masterGain.cancelScheduledValues(now);
    masterGain.setValueAtTime(masterGain.value, now);
    masterGain.exponentialRampToValueAtTime(0.0001, now + fadeSec);
    const toStop = drone.nodes;
    const toDisconnect = drone.master;
    setTimeout(() => {
        toStop.forEach((n) => {
            try { n.stop(); } catch { /* noop */ }
            try { n.disconnect(); } catch { /* noop */ }
        });
        try { toDisconnect.disconnect(); } catch { /* noop */ }
    }, fadeSec * 1000 + 100);
    drone = null;
}

// Ember tick — soft high bell at random 2-6s intervals. Schedules itself.
export function startEmbers(): void {
    if (emberTimer !== null) return;
    const scheduleNext = () => {
        const delay = 2000 + Math.random() * 4000;
        emberTimer = setTimeout(() => {
            playEmberTick();
            scheduleNext();
        }, delay);
    };
    scheduleNext();
}

export function stopEmbers(): void {
    if (emberTimer !== null) {
        clearTimeout(emberTimer);
        emberTimer = null;
    }
}

function playEmberTick(): void {
    if (isMuted()) return;
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') return;
    const root = Math.random() < 0.5 ? 2093.0 : 2637.0; // C7 or E7
    const now = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    g.connect(c.destination);
    const o1 = c.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = root;
    o1.connect(g);
    o1.start(now);
    o1.stop(now + 1.3);
    const o2 = c.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = root * 1.5;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, now);
    g2.gain.exponentialRampToValueAtTime(0.02, now + 0.02);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    o2.connect(g2);
    g2.connect(c.destination);
    o2.start(now);
    o2.stop(now + 1.0);
}

// Reveal swell — soft resolving C-major chord, fires when title letters appear.
export function playReveal(): void {
    if (isMuted()) return;
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') return;
    const now = c.currentTime;
    [261.63, 329.63, 392.0].forEach((freq, i) => {
        const start = now + i * 0.04;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.04, start + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 1.4);
        g.connect(c.destination);
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq;
        o.connect(g);
        o.start(start);
        o.stop(start + 1.5);
    });
}

// UI SFX — short, percussive, layered.
export function playClick(): void {
    if (isMuted()) return;
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') return;
    const now = c.currentTime;
    [523.25, 783.99, 1046.5].forEach((freq) => {
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.06, now + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
        g.connect(c.destination);
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq;
        o.connect(g);
        o.start(now);
        o.stop(now + 0.45);
    });
}

export function playHover(): void {
    if (isMuted()) return;
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') return;
    const now = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.022, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    g.connect(c.destination);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = 1567.98; // G6
    o.connect(g);
    o.start(now);
    o.stop(now + 0.2);
}

// Portal iris swell — rising arpeggio resolving to tonic C6, for the
// "falling through the threshold" moment.
export function playPortalSwell(): void {
    if (isMuted()) return;
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') return;
    const now = c.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
        const start = now + i * 0.1;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.05, start + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 1.0);
        g.connect(c.destination);
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq;
        o.connect(g);
        o.start(start);
        o.stop(start + 1.1);
    });
}
