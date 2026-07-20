<script lang="ts">
    // Cinematic title screen — "a candle-lit scriptorium at the edge of sleep."
    // 6-phase reveal ceremony: void → seed → emblem kindle → ring draw →
    // letter-by-letter title → ink-bleed tagline → CTAs fade up → steady state
    // (emblems breathe, star chart rotates, embers drift, drone + ticks under).
    // Iris exit ceremony on commit: rings expand, crest falls through, swell.
    //
    // Personalization: returning heroes get a portrait CTA, a different tagline,
    // a minor-sixth added to the drone, a memory-echo line, and star-chart
    // points shaped by their character name. New players get the standard set.

    import { onMount, onDestroy } from 'svelte';
    import Embers from '$lib/components/Background/Embers.svelte';
    import StarChart from '$lib/components/Background/StarChart.svelte';
    import {
        startDrone, stopDrone, startEmbers, stopEmbers,
        playReveal, playClick, playHover, playPortalSwell,
        ambientCtx,
    } from '$lib/audio/ambient';
    import { resume as sfxResume } from '$lib/audio/sfx';

    type SavedSlot = {
        name: string; archetype: string; class_title: string;
        portrait_url: string; backstory: string;
        traits: { name: string; desc: string }[];
        hp: number; resolve: number; corruption: number;
        saved_at: number;
    };

    type Props = {
        savedCharacters: SavedSlot[];
        recentWorlds: string[];
        onBegin: () => void;
        onContinue: () => void;
        onLoadSaved: (slot: SavedSlot) => void;
        onJoinWorld: (code: string) => void;
        onOpenSettings: () => void;
    };

    let {
        savedCharacters, recentWorlds,
        onBegin, onContinue, onLoadSaved, onJoinWorld, onOpenSettings
    }: Props = $props();

    let returningHero = $derived(savedCharacters.length > 0);

    // Reveal ceremony phases — CSS reads data-phase to advance animations.
    let phase = $state(0);

    // Iris exit state.
    let iris = $state<'idle' | 'opening' | 'fallen'>('idle');

    // Audio unlock
    let audioUnlocked = $state(false);
    let showSoundHint = $state(false);

    // UI state
    let showJoin = $state(false);
    let joinCode = $state('');

    // Cursor warmth
    let warmthEl: HTMLDivElement;
    let warmthRaf = 0;
    let cleanupWarmth: () => void = () => {};

    // Memory echo (returning heroes only)
    let memoryEcho: string | null = $state(null);
    let memoryVisible = $state(false);
    let echoCleanup: () => void = () => {};

    const TITLE = 'Round Table';
    const TAGLINE_FIRST = 'A tabletop adventure, narrated by AI.';
    const TAGLINE_RETURN = 'The realm remembers you.';

    // Procedural crest runes — 8 slots from pool of 12, seeded by primary
    // character name (returning) or fixed salt (new).
    const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ'];

    let runeSeed = $derived(
        returningHero && savedCharacters[0]?.name ? savedCharacters[0].name : 'roundtable-new'
    );

    let runes = $derived.by(() => {
        let h = 2166136261;
        const s = runeSeed + '';
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        let state = h >>> 0;
        const rng = () => {
            state = Math.imul(state ^ (state >>> 15), 0x2c1b3c6d);
            state = Math.imul(state ^ (state >>> 12), 0x297a2d39);
            state = (state ^ (state >>> 15)) >>> 0;
            return state / 4294967296;
        };
        const pool = [...RUNES];
        const out: string[] = [];
        for (let i = 0; i < 8; i++) {
            const idx = Math.floor(rng() * pool.length);
            out.push(pool.splice(idx, 1)[0]);
        }
        return out;
    });

    let starLocations = $derived(
        returningHero ? [{ name: savedCharacters[0].name }] : []
    );

    let titleLetters = $derived(TITLE.split(''));

    async function tryUnlockAudio(): Promise<void> {
        const c = ambientCtx();
        if (!c) return;
        if (c.state === 'running' && !audioUnlocked) {
            audioUnlocked = true;
            showSoundHint = false;
            await startDrone({ returning: returningHero, ceremony: true });
            startEmbers();
        } else if (c.state === 'running') {
            showSoundHint = false;
        }
    }

    function onFirstPointer() {
        sfxResume();
        tryUnlockAudio();
    }

    onMount(() => {
        tryUnlockAudio();
        window.addEventListener('pointerdown', onFirstPointer);

        // Show sound hint only if audio still locked after 4s
        const hintTimer = setTimeout(() => {
            const c = ambientCtx();
            if (c && c.state !== 'running' && !audioUnlocked) {
                showSoundHint = true;
            }
        }, 4000);
        echoCleanup = () => clearTimeout(hintTimer);

        // Reveal ceremony timeline
        const timers: ReturnType<typeof setTimeout>[] = [];
        timers.push(setTimeout(() => (phase = 1), 200));
        timers.push(setTimeout(() => (phase = 2), 600));
        timers.push(setTimeout(() => { phase = 3; playReveal(); }, 1900));
        timers.push(setTimeout(() => (phase = 4), 3400));
        timers.push(setTimeout(() => (phase = 5), 4600));
        timers.push(setTimeout(() => (phase = 6), 5800));

        // Cursor warmth — only on hover-capable devices
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const touchOnly = window.matchMedia('(hover: none)').matches;
        if (!reduced && !touchOnly) {
            let tx = window.innerWidth / 2;
            let ty = window.innerHeight / 2;
            let cx = tx, cy = ty;
            const onMove = (e: PointerEvent) => { tx = e.clientX; ty = e.clientY; };
            window.addEventListener('pointermove', onMove);
            const loop = () => {
                cx += (tx - cx) * 0.08;
                cy += (ty - cy) * 0.08;
                if (warmthEl) {
                    warmthEl.style.setProperty('--mx', cx + 'px');
                    warmthEl.style.setProperty('--my', cy + 'px');
                }
                warmthRaf = requestAnimationFrame(loop);
            };
            warmthRaf = requestAnimationFrame(loop);
            cleanupWarmth = () => {
                cancelAnimationFrame(warmthRaf);
                window.removeEventListener('pointermove', onMove);
            };
        }

        // Memory echo (returning heroes) — surface after 11s, hold 4.5s
        if (returningHero) {
            const slot = savedCharacters[0];
            memoryEcho = `${slot.name} stands once more at the threshold.`;
            const echoTimer = setTimeout(() => {
                memoryVisible = true;
                const hideTimer = setTimeout(() => (memoryVisible = false), 4500);
                echoCleanup = () => { clearTimeout(hideTimer); };
            }, 11000);
            const prev = echoCleanup;
            echoCleanup = () => { prev(); clearTimeout(echoTimer); };
        }

        return () => {
            timers.forEach(clearTimeout);
        };
    });

    onDestroy(() => {
        stopDrone(0.6);
        stopEmbers();
        window.removeEventListener('pointerdown', onFirstPointer);
        cleanupWarmth();
        echoCleanup();
    });

    function triggerIris(callback: () => void) {
        if (iris !== 'idle') return;
        iris = 'opening';
        playClick();
        playPortalSwell();
        stopDrone(1.4);
        stopEmbers();
        setTimeout(() => {
            iris = 'fallen';
            callback();
        }, 1250);
    }

    const handleBegin = () => triggerIris(onBegin);
    const handleContinue = () => triggerIris(onContinue);
    const handleLoadSaved = (slot: SavedSlot) => triggerIris(() => onLoadSaved(slot));
    const handleJoinWorld = (code: string) => triggerIris(() => onJoinWorld(code));

    const ICONS: Record<string, string> = {
        warrior: '⚔', mage: '✦', rogue: '✧', ranger: '➢',
        cleric: '☩', bard: '♪', scholar: '✎'
    };
    const icon = (arc: string) => ICONS[arc?.toLowerCase()] || '✦';
</script>

<div class="title-stage" data-phase={phase} data-iris={iris} data-returning={returningHero}>
    <StarChart locations={starLocations} seed={runeSeed} />
    <Embers />
    <div bind:this={warmthEl} class="cursor-warmth" aria-hidden="true"></div>
    <div class="vignette" aria-hidden="true"></div>

    <div class="seed" aria-hidden="true"></div>

    {#if showSoundHint && !audioUnlocked}
        <button
            class="sound-hint"
            onclick={() => { sfxResume(); tryUnlockAudio(); }}
        >
            <span class="sound-hint-dot"></span>
            tap for sound
        </button>
    {/if}

    <div class="crest-wrap">
        <div class="emblem" aria-hidden="true">
            <svg viewBox="0 0 96 96" fill="none" stroke="currentColor"
                 stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round">
                <circle class="ring outer" cx="48" cy="48" r="42" opacity="0.4" />
                <circle class="ring middle" cx="48" cy="48" r="32" opacity="0.7" />
                <circle class="ring inner" cx="48" cy="48" r="20" />
                <path class="mark" d="M48 4v6M48 86v6M4 48h6M86 48h6" opacity="0.7" />
                <path class="mark" d="M16 16l4 4M76 76l4 4M76 16l-4 4M16 76l4 4" opacity="0.5" />
                <path class="core" d="M48 38l6 10l-6 10l-6 -10z" />
                <circle cx="48" cy="48" r="2" fill="currentColor" />
                {#each runes as r, i}
                    {@const angle = (i / 8) * Math.PI * 2 - Math.PI / 2}
                    {@const x = 48 + Math.cos(angle) * 26}
                    {@const y = 48 + Math.sin(angle) * 26}
                    <text
                        x={x} y={y}
                        font-size="3.2"
                        fill="var(--gold)"
                        text-anchor="middle"
                        dominant-baseline="central"
                        opacity="0.7"
                        class="rune"
                    >{r}</text>
                {/each}
            </svg>
        </div>

        <h1 class="display title" aria-label={TITLE}>
            {#each titleLetters as letter, i}
                <span class="letter" style={`--i:${i}`}>{letter === ' ' ? ' ' : letter}</span>
            {/each}
        </h1>

        <p class="prose-italic tagline" class:visible={phase >= 4}>
            {returningHero ? TAGLINE_RETURN : TAGLINE_FIRST}
        </p>

        {#if memoryEcho}
            <p class="memory-echo" class:visible={memoryVisible}>{memoryEcho}</p>
        {/if}

        <div class="actions" class:visible={phase >= 5}>
            {#if returningHero}
                <button
                    class="btn-primary wide"
                    onclick={handleContinue}
                    onmouseenter={() => playHover()}
                >
                    {#if savedCharacters[0]?.portrait_url}
                        <img src={savedCharacters[0].portrait_url} alt="" class="btn-portrait" />
                    {:else}
                        <span class="btn-glyph">{icon(savedCharacters[0]?.archetype)}</span>
                    {/if}
                    <span class="btn-content">
                        <span class="btn-label">Continue as {savedCharacters[0]?.name}</span>
                        <span class="btn-sub">{savedCharacters[0]?.class_title}</span>
                    </span>
                </button>
                <button
                    class="btn-ghost wide"
                    onclick={handleBegin}
                    onmouseenter={() => playHover()}
                >
                    <span class="btn-content">
                        <span class="btn-label">Enter a New World</span>
                        <span class="btn-sub">Forge a different hero.</span>
                    </span>
                </button>
            {:else}
                <button
                    class="btn-primary wide"
                    onclick={handleBegin}
                    onmouseenter={() => playHover()}
                >
                    <span class="btn-content">
                        <span class="btn-label">Enter a New World</span>
                        <span class="btn-sub">Forge a hero, cross the threshold.</span>
                    </span>
                </button>
            {/if}

            {#if !showJoin}
                <button class="btn-tiny btn-ghost link-btn" onclick={() => { playClick(); showJoin = true; }} onmouseenter={() => playHover()}>
                    Join a world by code
                </button>
            {/if}

            {#if showJoin}
                <div class="join-row">
                    <input
                        type="text"
                        bind:value={joinCode}
                        placeholder="table code"
                        onkeydown={(e) => e.key === 'Enter' && joinCode.trim() && handleJoinWorld(joinCode.trim())}
                    />
                    <button class="btn-tiny btn-ghost" onclick={() => { playClick(); showJoin = false; }} onmouseenter={() => playHover()}>Cancel</button>
                    <button
                        class="btn-tiny btn-primary"
                        disabled={!joinCode.trim()}
                        onclick={() => { playClick(); handleJoinWorld(joinCode.trim()); }}
                        onmouseenter={() => joinCode.trim() && playHover()}
                    >Join</button>
                </div>
            {/if}

            <button class="btn-tiny btn-ghost link-btn" onclick={() => { playClick(); onOpenSettings(); }} onmouseenter={() => playHover()}>Settings</button>
        </div>

        {#if savedCharacters.length > 1}
            <div class="roster" class:visible={phase >= 6}>
                <p class="roster-label eyebrow">Or return as a different hero</p>
                <div class="roster-grid">
                    {#each savedCharacters.slice(1) as slot}
                        <button
                            type="button"
                            class="saved-chip"
                            onclick={() => handleLoadSaved(slot)}
                            onmouseenter={() => playHover()}
                            title={`Continue as ${slot.name} — ${slot.class_title}`}
                        >
                            {#if slot.portrait_url}
                                <img src={slot.portrait_url} alt={slot.name} class="saved-portrait" />
                            {:else}
                                <span class="saved-glyph">{icon(slot.archetype)}</span>
                            {/if}
                            <span class="saved-text">
                                <span class="saved-name">{slot.name}</span>
                                <span class="saved-class muted">{slot.class_title}</span>
                            </span>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

        <p class="fineprint muted" class:visible={phase >= 6}>
            Solo or with a party. Free Google AI Studio key powers every turn.
        </p>
    </div>

    <div class="iris-overlay" aria-hidden="true">
        <div class="iris-ring"></div>
        <div class="iris-ring" style="--delay: 0.12s"></div>
        <div class="iris-ring" style="--delay: 0.24s"></div>
    </div>
</div>

<style>
    .title-stage {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: radial-gradient(
            ellipse at 50% 42%,
            color-mix(in srgb, var(--gold) 8%, var(--page)) 0%,
            var(--page) 55%,
            color-mix(in srgb, var(--ink) 14%, var(--page)) 100%
        );
        animation: stage-fade-in 0.6s ease-out;
    }
    @keyframes stage-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    .crest-wrap {
        position: relative;
        z-index: 5;
        width: min(560px, 92vw);
        padding: 2rem 1.8rem;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        transition: opacity 0.4s ease, filter 0.4s ease, transform 0.4s ease;
    }

    /* ---- Seed ---- */
    .seed {
        position: absolute;
        top: 38%;
        left: 50%;
        width: 4px;
        height: 4px;
        margin: -2px 0 0 -2px;
        border-radius: 50%;
        background: var(--gold);
        box-shadow: 0 0 24px var(--gold), 0 0 60px var(--gold);
        opacity: 0;
        pointer-events: none;
        z-index: 4;
    }
    .title-stage[data-phase='1'] .seed {
        animation: seed-kindle 1.6s ease-out forwards;
    }
    .title-stage[data-phase='2'] .seed,
    .title-stage[data-phase='3'] .seed,
    .title-stage[data-phase='4'] .seed,
    .title-stage[data-phase='5'] .seed,
    .title-stage[data-phase='6'] .seed {
        opacity: 0;
    }
    @keyframes seed-kindle {
        0% { opacity: 0; transform: scale(0.4); }
        20% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(8); }
    }

    /* ---- Emblem ---- */
    .emblem {
        color: var(--accent);
        width: 96px;
        margin: 0 auto 1rem;
        opacity: 0;
        position: relative;
        z-index: 5;
        filter: drop-shadow(0 0 12px color-mix(in srgb, var(--gold) 40%, transparent));
    }
    .title-stage[data-phase='2'] .emblem,
    .title-stage[data-phase='3'] .emblem,
    .title-stage[data-phase='4'] .emblem,
    .title-stage[data-phase='5'] .emblem,
    .title-stage[data-phase='6'] .emblem {
        animation:
            emblem-emerge 1.6s cubic-bezier(0.2, 0.7, 0.2, 1) forwards,
            emblem-breath 8s ease-in-out 1.6s infinite;
    }
    @keyframes emblem-emerge {
        0% { opacity: 0; transform: scale(0.7); filter: blur(8px) drop-shadow(0 0 0 transparent); }
        100% { opacity: 1; transform: scale(1); filter: blur(0) drop-shadow(0 0 12px color-mix(in srgb, var(--gold) 40%, transparent)); }
    }
    @keyframes emblem-breath {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.03); }
    }
    .emblem svg { width: 100%; height: auto; }

    .emblem .ring {
        stroke-dasharray: 280;
        stroke-dashoffset: 280;
    }
    .title-stage[data-phase='2'] .emblem .ring,
    .title-stage[data-phase='3'] .emblem .ring,
    .title-stage[data-phase='4'] .emblem .ring,
    .title-stage[data-phase='5'] .emblem .ring,
    .title-stage[data-phase='6'] .emblem .ring {
        animation: ring-draw 1.4s ease-out forwards;
    }
    .title-stage[data-phase='2'] .emblem .outer,
    .title-stage[data-phase='3'] .emblem .outer,
    .title-stage[data-phase='4'] .emblem .outer,
    .title-stage[data-phase='5'] .emblem .outer,
    .title-stage[data-phase='6'] .emblem .outer { animation-delay: 0.2s; }
    .title-stage[data-phase='2'] .emblem .middle,
    .title-stage[data-phase='3'] .emblem .middle,
    .title-stage[data-phase='4'] .emblem .middle,
    .title-stage[data-phase='5'] .emblem .middle,
    .title-stage[data-phase='6'] .emblem .middle { animation-delay: 0.45s; }
    .title-stage[data-phase='2'] .emblem .inner,
    .title-stage[data-phase='3'] .emblem .inner,
    .title-stage[data-phase='4'] .emblem .inner,
    .title-stage[data-phase='5'] .emblem .inner,
    .title-stage[data-phase='6'] .emblem .inner { animation-delay: 0.7s; }
    @keyframes ring-draw {
        to { stroke-dashoffset: 0; }
    }

    .emblem .rune { opacity: 0; }
    .title-stage[data-phase='6'] .emblem .rune {
        animation: rune-fade 1.8s ease-out 1.6s forwards;
    }
    @keyframes rune-fade {
        to { opacity: 0.7; }
    }

    /* ---- Title ---- */
    .title {
        font-size: var(--t-xl);
        margin-bottom: 0.4rem;
        background: linear-gradient(
            135deg,
            color-mix(in srgb, var(--ink) 75%, var(--gold)) 0%,
            var(--gold) 50%,
            color-mix(in srgb, var(--ink) 75%, var(--gold)) 100%
        );
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        letter-spacing: 0.04em;
        position: relative;
        z-index: 5;
    }
    .title-stage[data-phase='6'] .title {
        animation: title-breathe 9s ease-in-out infinite;
    }
    @keyframes title-breathe {
        0%, 100% { letter-spacing: 0.04em; }
        50% { letter-spacing: 0.058em; }
    }

    .letter {
        display: inline-block;
        opacity: 0;
        transform: translateY(0.4em);
    }
    .title-stage[data-phase='3'] .letter,
    .title-stage[data-phase='4'] .letter,
    .title-stage[data-phase='5'] .letter,
    .title-stage[data-phase='6'] .letter {
        animation: letter-rise 0.8s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
        animation-delay: calc(var(--i) * 0.06s);
    }
    @keyframes letter-rise {
        to { opacity: 1; transform: translateY(0); }
    }

    /* ---- Tagline (ink-bleed reveal) ---- */
    .tagline {
        color: var(--ink-soft);
        margin-bottom: 1.6rem;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 1.2s ease, transform 1.2s ease;
        position: relative;
        z-index: 5;
    }
    .tagline.visible {
        opacity: 1;
        transform: translateY(0);
    }

    /* ---- Memory echo (returning heroes only) ---- */
    .memory-echo {
        font-family: var(--font-prose);
        font-style: italic;
        color: color-mix(in srgb, var(--ink-soft) 70%, transparent);
        font-size: var(--t-sm);
        margin: -1rem 0 1.5rem;
        opacity: 0;
        transition: opacity 1.5s ease;
        max-width: 360px;
        position: relative;
        z-index: 5;
    }
    .memory-echo.visible {
        opacity: 1;
    }

    /* ---- CTAs ---- */
    .actions {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        width: 100%;
        max-width: 380px;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 1.4s ease, transform 1.4s ease;
        pointer-events: none;
        position: relative;
        z-index: 5;
    }
    .actions.visible {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
    }

    .btn-primary.wide, .btn-ghost.wide {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0.7rem;
        padding: 0.8rem 1.2rem;
        text-align: left;
        position: relative;
        overflow: hidden;
        transition: transform 0.18s cubic-bezier(0.2, 0.7, 0.2, 1),
                    box-shadow 0.18s ease,
                    border-color 0.18s ease;
    }
    .btn-primary.wide:hover, .btn-ghost.wide:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(60, 40, 20, 0.12);
    }
    .btn-primary.wide:active, .btn-ghost.wide:active {
        transform: translateY(1px) scale(0.992);
        transition: transform 0.06s;
    }

    .btn-primary.wide::before,
    .btn-ghost.wide::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--gold) 35%, transparent) 0%,
            transparent 30%
        );
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
    }
    .btn-primary.wide:hover::before,
    .btn-ghost.wide:hover::before {
        opacity: 1;
    }

    .btn-primary.wide::after,
    .btn-ghost.wide::after {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 60%;
        height: 100%;
        background: linear-gradient(
            90deg,
            transparent,
            color-mix(in srgb, var(--gold) 28%, transparent),
            transparent
        );
        pointer-events: none;
    }
    .btn-primary.wide:active::after,
    .btn-ghost.wide:active::after {
        animation: sheen-sweep 0.5s ease-out;
    }
    @keyframes sheen-sweep {
        to { left: 130%; }
    }

    .btn-portrait {
        width: 36px; height: 36px;
        border-radius: var(--radius-sm);
        object-fit: cover;
        flex-shrink: 0;
        border: 1px solid var(--line);
    }
    .btn-glyph {
        font-size: 1.4rem;
        color: var(--accent);
        width: 36px; height: 36px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
    }
    .btn-content {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
    }
    .btn-label {
        font-family: var(--font-display);
        font-size: var(--t-sm);
        letter-spacing: 0.04em;
    }
    .btn-sub {
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-xs);
        opacity: 0.85;
    }

    .link-btn {
        background: transparent;
        border: none;
        color: var(--muted);
        font-size: var(--t-xs);
        min-height: 32px;
        padding: 0.3rem 0.5rem;
        font-family: var(--font-display);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        text-decoration: none;
    }
    .link-btn::before, .link-btn::after {
        content: '✦';
        color: var(--gold);
        font-size: 7px;
        opacity: 0;
        transition: opacity 0.22s ease, transform 0.22s ease;
    }
    .link-btn::before { transform: translateX(3px); }
    .link-btn::after { transform: translateX(-3px); }
    .link-btn:hover {
        color: var(--ink);
        background: transparent;
    }
    .link-btn:hover::before, .link-btn:hover::after {
        opacity: 0.8;
        transform: translateX(0);
    }

    .join-row {
        display: flex;
        gap: 0.35rem;
        align-items: stretch;
    }
    .join-row input {
        flex: 1;
        font-size: var(--t-sm);
        padding: 0.5rem 0.7rem;
    }

    .roster {
        margin-top: 1.6rem;
        width: 100%;
        max-width: 380px;
        opacity: 0;
        transition: opacity 1.4s ease;
        position: relative;
        z-index: 5;
    }
    .roster.visible {
        opacity: 1;
    }
    .roster-label {
        margin-bottom: 0.55rem;
    }
    .roster-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 0.45rem;
    }
    .saved-chip {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.45rem 0.55rem;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        font-family: var(--font-ui);
        text-align: left;
        transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
    }
    .saved-chip:hover {
        transform: translateY(-1px);
        border-color: var(--gold);
        background: var(--inset);
    }
    .saved-portrait {
        width: 32px; height: 32px;
        border-radius: var(--radius-sm);
        object-fit: cover;
        flex-shrink: 0;
    }
    .saved-glyph {
        font-size: 1.4rem;
        color: var(--accent);
        width: 32px; height: 32px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
    }
    .saved-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    .saved-name {
        font-weight: 600;
        font-size: var(--t-sm);
        color: var(--ink);
    }
    .saved-class {
        font-size: var(--t-xs);
    }

    .fineprint {
        margin-top: 1.4rem;
        font-size: var(--t-xs);
        opacity: 0;
        transition: opacity 1.4s ease;
        position: relative;
        z-index: 5;
    }
    .fineprint.visible {
        opacity: 1;
    }

    /* ---- Cursor warmth ---- */
    .cursor-warmth {
        position: fixed;
        inset: 0;
        z-index: 3;
        pointer-events: none;
        background: radial-gradient(
            circle 280px at var(--mx, 50%) var(--my, 50%),
            color-mix(in srgb, var(--gold) 18%, transparent) 0%,
            transparent 65%
        );
        mix-blend-mode: plus-lighter;
        opacity: 0.5;
    }
    @media (hover: none) {
        .cursor-warmth { display: none; }
    }

    /* ---- Vignette ---- */
    .vignette {
        position: fixed;
        inset: 0;
        z-index: 4;
        pointer-events: none;
        background: radial-gradient(
            ellipse at center,
            transparent 50%,
            color-mix(in srgb, var(--ink) 18%, transparent) 100%
        );
    }

    /* ---- Sound hint ---- */
    .sound-hint {
        position: fixed;
        bottom: max(20px, calc(var(--safe-bottom) + 20px));
        left: 50%;
        transform: translateX(-50%);
        z-index: 20;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.9rem;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 999px;
        box-shadow: var(--shadow);
        font-family: var(--font-ui);
        font-size: var(--t-xs);
        color: var(--ink-soft);
        cursor: pointer;
        animation: hint-fade-in 0.6s ease;
    }
    @keyframes hint-fade-in {
        from { opacity: 0; transform: translateX(-50%) translateY(8px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    .sound-hint-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--gold);
        animation: pulse-dot 2s ease-in-out infinite;
    }
    @keyframes pulse-dot {
        0%, 100% { opacity: 0.4; box-shadow: 0 0 0 var(--gold); }
        50% { opacity: 1; box-shadow: 0 0 8px var(--gold); }
    }

    /* ---- Iris exit ---- */
    .iris-overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        pointer-events: none;
        opacity: 0;
    }
    .title-stage[data-iris='opening'] .iris-overlay {
        opacity: 1;
    }
    .iris-ring {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 60px;
        height: 60px;
        margin: -30px 0 0 -30px;
        border-radius: 50%;
        border: 1px solid var(--gold);
        opacity: 0;
    }
    .title-stage[data-iris='opening'] .iris-ring {
        animation: iris-expand 1.25s cubic-bezier(0.4, 0, 0.2, 1) var(--delay, 0s) forwards;
    }
    @keyframes iris-expand {
        0% { opacity: 0; transform: scale(0.4); }
        15% { opacity: 0.8; }
        100% { opacity: 0; transform: scale(45); }
    }

    .title-stage[data-iris='opening'] .emblem {
        animation: emblem-iris 1.25s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
    }
    @keyframes emblem-iris {
        0% { transform: scale(1); opacity: 1; filter: drop-shadow(0 0 12px var(--gold)); }
        55% { transform: scale(2.4); opacity: 0.7; filter: drop-shadow(0 0 40px var(--gold)); }
        100% { transform: scale(20); opacity: 0; filter: blur(20px); }
    }

    .title-stage[data-iris='opening'] .crest-wrap {
        animation: crest-fall 1.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
    @keyframes crest-fall {
        0% { opacity: 1; filter: blur(0); transform: scale(1); }
        55% { opacity: 0.35; filter: blur(4px); transform: scale(1.08); }
        100% { opacity: 0; filter: blur(20px); transform: scale(1.15); }
    }

    @media (prefers-reduced-motion: reduce) {
        .title-stage[data-phase='6'] .emblem,
        .title-stage[data-phase='6'] .title,
        .title-stage[data-phase='6'] .emblem .outer {
            animation: none !important;
        }
        .letter { opacity: 1 !important; transform: none !important; }
        .actions, .tagline, .roster, .fineprint {
            opacity: 1 !important;
            transform: none !important;
            pointer-events: auto !important;
        }
        .emblem { opacity: 1 !important; }
        .emblem .ring { stroke-dashoffset: 0 !important; }
        .emblem .rune { opacity: 0.7 !important; }
    }
</style>
