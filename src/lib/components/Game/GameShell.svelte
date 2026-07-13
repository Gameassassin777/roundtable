<script lang="ts">
    // Layout grid: TopBar / SituationBar (inlined) + Chronicle + ActionInput + Codex
    // Mobile-first single column; desktop 2-column (chronicle center, codex right rail).

    import Chronicle from './Chronicle.svelte';
    import ActionInput from './ActionInput.svelte';
    import Codex from './Codex.svelte';
    import type { CodexSlice } from '$lib/stores/gameStore';

    type ChatEntry = {
        author: string;
        text: string;
        type: 'player' | 'dm' | 'world' | 'whisper';
        timestamp?: number;
        audit?: any;
        ruling_summary?: any;
        beat_profile?: string;
        is_scene_set?: boolean;
        beat_types?: string[];
    };

    type Props = {
        chatLog: ChatEntry[];
        localWhispers: ChatEntry[];
        isLoading: boolean;
        turnStageLabel: string;
        lastTurnError: string | null;
        whisperInFlight: boolean;
        codex: CodexSlice;
        characterName: string;
        peers: number;
        connectionStatus: string;
        worldClock: { turn: number; day: number; time_of_day: string };
        engineSecondsLeft: number | null;
        enginePaused: boolean;
        onsubmit: (text: string, whisper: boolean) => void;
        onCodexToggle: () => void;
        onOpenModal: (id: 'settings' | 'northstar' | 'weave' | 'audit' | 'shortcuts' | 'map') => void;
        onEngineControl: (action: 'pause' | 'resume' | 'tick-now' | 'step-time') => void;
        codexSheetOpen: boolean;
        showLevelUp: boolean;
        levelUpName: string | null;
    };

    let {
        chatLog, localWhispers, isLoading, turnStageLabel, lastTurnError,
        whisperInFlight, codex, characterName, peers, connectionStatus,
        worldClock, engineSecondsLeft, enginePaused,
        onsubmit, onCodexToggle, onOpenModal, onEngineControl,
        codexSheetOpen, showLevelUp, levelUpName
    }: Props = $props();

    let scene = $derived(codex?.scene_tags || { biome: '', weather: '', mood: '' });
    let location = $derived(codex?.location || '');

    // ---- Scene-aware theming ----
    // The AI sets scene_tags + world_clock freely per turn. We normalize those
    // free-form strings into category slugs and attach them as data-attributes
    // on the shell root. CSS uses the slugs to tint the parchment palette.
    // Fluidity comes from the AI — the visual system just renders its intent.
    function slugify(s: string): string {
        return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    // Map free-form biome strings to a small set of tint families.
    // Unknown biomes fall through to "other" (no tint override).
    const BIOME_FAMILIES: Record<string, string> = {
        forest: 'forest', woods: 'forest', grove: 'forest', jungle: 'forest', taiga: 'forest',
        desert: 'desert', dune: 'desert', waste: 'desert', wastes: 'desert', sand: 'desert',
        arctic: 'arctic', tundra: 'arctic', snow: 'arctic', ice: 'arctic', glacier: 'arctic', frost: 'arctic',
        sea: 'sea', ocean: 'sea', coast: 'sea', shore: 'sea', island: 'sea', bay: 'sea', lake: 'sea',
        mountain: 'mountain', peak: 'mountain', cliff: 'mountain', pass: 'mountain', highlands: 'mountain',
        underground: 'underground', cave: 'underground', cavern: 'underground', dungeon: 'underground', crypt: 'underground', tunnels: 'underground',
        urban: 'urban', city: 'urban', town: 'urban', village: 'urban', streets: 'urban', market: 'urban',
        swamp: 'swamp', marsh: 'swamp', bog: 'swamp', fen: 'swamp',
        plains: 'plains', field: 'plains', fields: 'plains', meadow: 'plains', grassland: 'plains', steppe: 'plains',
        ruin: 'ruin', ruins: 'ruin', abandoned: 'ruin', shattered: 'ruin',
        void: 'void', abyss: 'void', stars: 'void', cosmic: 'void', heavens: 'void',
        fire: 'fire', volcanic: 'fire', lava: 'fire', ember: 'fire', pyre: 'fire',
        crossroads: 'crossroads', road: 'crossroads', path: 'crossroads', trail: 'crossroads',
    };
    function classifyBiome(raw: string): string {
        const s = slugify(raw);
        if (!s) return '';
        if (BIOME_FAMILIES[s]) return BIOME_FAMILIES[s];
        // Partial match — first biome family whose key appears as a substring
        for (const key of Object.keys(BIOME_FAMILIES)) {
            if (s.includes(key)) return BIOME_FAMILIES[key];
        }
        return '';
    }

    function classifyTime(raw: string): string {
        const s = slugify(raw);
        if (!s) return '';
        if (s.includes('dawn') || s.includes('sunrise') || s.includes('morning')) return 'morning';
        if (s.includes('noon') || s.includes('midday') || s.includes('day') || s.includes('afternoon')) return 'day';
        if (s.includes('dusk') || s.includes('sunset') || s.includes('twilight') || s.includes('evening')) return 'dusk';
        if (s.includes('night') || s.includes('midnight') || s.includes('dark')) return 'night';
        return '';
    }

    // Mood families — calm / tense / dark / corrupt / warm / sorrowful / hopeful.
    // Each tints the accent + page subtly.
    const MOOD_FAMILIES: Record<string, string> = {
        calm: 'calm', peaceful: 'calm', serene: 'calm', quiet: 'calm', still: 'calm', gentle: 'calm',
        tense: 'tense', anxious: 'tense', uneasy: 'tense', dread: 'tense', fearful: 'tense', suspense: 'tense', suspenseful: 'tense',
        dark: 'dark', grim: 'dark', grimdark: 'dark', haunted: 'dark', bleak: 'dark', hopeless: 'dark', forsaken: 'dark',
        corrupt: 'corrupt', corrupted: 'corrupt', blighted: 'corrupt', unholy: 'corrupt', profane: 'corrupt', cursed: 'corrupt',
        warm: 'warm', cozy: 'warm', hopeful: 'warm', joyful: 'warm', festive: 'warm', tender: 'warm',
        sorrowful: 'sorrowful', mournful: 'sorrowful', grieving: 'sorrowful', melancholic: 'sorrowful', melancholy: 'sorrowful', sad: 'sorrowful',
        hopeful: 'hopeful', bright: 'hopeful', defiant: 'hopeful', resolute: 'hopeful',
        violent: 'violent', chaotic: 'violent', raging: 'violent', battle: 'violent', blood: 'violent',
        mystical: 'mystical', arcane: 'mystical', otherworldly: 'mystical', fey: 'mystical', dreaming: 'mystical',
    };
    function classifyMood(raw: string): string {
        const s = slugify(raw);
        if (!s) return '';
        if (MOOD_FAMILIES[s]) return MOOD_FAMILIES[s];
        for (const key of Object.keys(MOOD_FAMILIES)) {
            if (s.includes(key)) return MOOD_FAMILIES[key];
        }
        return '';
    }

    function classifyWeather(raw: string): string {
        const s = slugify(raw);
        if (!s) return '';
        if (s.includes('rain') || s.includes('drizzle') || s.includes('storm')) return 'rain';
        if (s.includes('snow') || s.includes('blizzard') || s.includes('hail')) return 'snow';
        if (s.includes('fog') || s.includes('mist') || s.includes('haze')) return 'fog';
        if (s.includes('clear') || s.includes('fair') || s.includes('sun')) return 'clear';
        if (s.includes('overcast') || s.includes('cloud')) return 'overcast';
        if (s.includes('wind')) return 'wind';
        return '';
    }

    let biomeClass = $derived(classifyBiome(scene.biome));
    let timeClass = $derived(classifyTime(worldClock?.time_of_day || codex?.world_clock?.time_of_day || ''));
    let moodClass = $derived(classifyMood(scene.mood));
    let weatherClass = $derived(classifyWeather(scene.weather));

    // More-menu (⚙) — collapses all secondary chrome into one dropdown.
    // Engine controls, Map, Audit, North Star, Weave, Shortcuts, Settings.
    let moreMenuOpen = $state(false);

    function toggleMoreMenu() { moreMenuOpen = !moreMenuOpen; }
    function closeMoreMenu() { moreMenuOpen = false; }

    function engineAction(a: 'pause' | 'resume' | 'tick-now' | 'step-time') {
        onEngineControl(a);
        closeMoreMenu();
    }
    function openModalFromMenu(id: 'settings' | 'northstar' | 'weave' | 'audit' | 'shortcuts' | 'map') {
        onOpenModal(id);
        closeMoreMenu();
    }

    // Close more-menu on outside click / Escape
    function handleShellClick(e: MouseEvent) {
        const t = e.target as HTMLElement;
        if (moreMenuOpen && !t.closest('[data-more-menu]') && !t.closest('[data-more-toggle]')) {
            closeMoreMenu();
        }
    }
    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape' && moreMenuOpen) closeMoreMenu();
    }
</script>

<svelte:window onclick={handleShellClick} onkeydown={handleKeydown} />

<div
    class="shell"
    data-biome={biomeClass || undefined}
    data-time={timeClass || undefined}
    data-mood={moodClass || undefined}
    data-weather={weatherClass || undefined}
>
    <!-- TopBar — minimal: brand + location + connection + more-menu -->
    <header class="topbar">
        <div class="brand display">Round Table</div>
        <div class="location-tag" title={location}>
            <span class="loc-dot" aria-hidden="true"></span>
            <span class="loc-text">{location || 'Uncharted'}</span>
        </div>
        <div class="topbar-actions">
            <span class="chip conn" data-status={connectionStatus.toLowerCase()} title={`${connectionStatus} · ${peers} peer${peers === 1 ? '' : 's'}`}>
                <span class="conn-dot" aria-hidden="true"></span>
                {peers}
            </span>
            <button class="btn-tiny btn-ghost icon-only" onclick={onCodexToggle} aria-label="Toggle codex" title="Codex">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 2h7l3 3v9H3z"/><path d="M10 2v3h3"/><path d="M5 8h6M5 11h6"/></svg>
            </button>
            <button
                class="btn-tiny btn-ghost icon-only"
                data-more-toggle
                onclick={toggleMoreMenu}
                aria-label="More menu"
                aria-expanded={moreMenuOpen}
            >⚙</button>

            {#if moreMenuOpen}
                <div class="more-menu panel" data-more-menu role="menu">
                    <div class="more-section">
                        <div class="more-label eyebrow">Engine</div>
                        <div class="more-row">
                            {#if enginePaused}
                                <span class="chip paused">Paused</span>
                                <button class="btn-tiny btn-ghost" role="menuitem" onclick={() => engineAction('resume')}>Resume</button>
                            {:else if engineSecondsLeft !== null}
                                <span class="chip">◷ {engineSecondsLeft}s</span>
                                <button class="btn-tiny btn-ghost" role="menuitem" onclick={() => engineAction('pause')}>Pause</button>
                            {:else}
                                <span class="chip muted">Idle</span>
                            {/if}
                        </div>
                        <div class="more-row">
                            <button class="btn-tiny btn-ghost" role="menuitem" onclick={() => engineAction('tick-now')}>Tick now</button>
                            <button class="btn-tiny btn-ghost" role="menuitem" onclick={() => engineAction('step-time')}>Step time</button>
                        </div>
                    </div>

                    <div class="more-section">
                        <div class="more-label eyebrow">World</div>
                        <button class="btn-ghost wide" role="menuitem" onclick={() => openModalFromMenu('map')}>Map</button>
                        <button class="btn-ghost wide" role="menuitem" onclick={() => openModalFromMenu('audit')}>Audit Log</button>
                        <button class="btn-ghost wide" role="menuitem" onclick={() => openModalFromMenu('northstar')}>North Star</button>
                        <button class="btn-ghost wide" role="menuitem" onclick={() => openModalFromMenu('weave')}>Weave</button>
                        <button class="btn-ghost wide" role="menuitem" onclick={() => openModalFromMenu('shortcuts')}>Shortcuts</button>
                    </div>

                    <div class="more-section">
                        <button class="btn-primary wide" role="menuitem" onclick={() => openModalFromMenu('settings')}>Settings</button>
                    </div>
                </div>
            {/if}
        </div>
    </header>

    <!-- Scene strip — thin context band (day/time + scene tags) above chronicle -->
    <div class="scene-strip">
        <span class="chip scene-chip">{worldClock.day !== 1 ? `Day ${worldClock.day} · ` : ''}{worldClock.time_of_day || 'Unset hour'}</span>
        {#if scene.biome}<span class="chip scene-chip">{scene.biome}</span>{/if}
        {#if scene.weather}<span class="chip scene-chip">{scene.weather}</span>{/if}
        {#if scene.mood}<span class="chip scene-chip mood-chip">{scene.mood}</span>{/if}
    </div>

    <!-- Main grid -->
    <main class="grid">
        <section class="chronicle-col">
            <Chronicle
                {chatLog}
                {localWhispers}
                {isLoading}
                {turnStageLabel}
                {lastTurnError}
            />
            <ActionInput
                onsubmit={onsubmit}
                {whisperInFlight}
                authorName={characterName}
            />
        </section>

        <Codex
            {codex}
            {characterName}
            sheetOpen={codexSheetOpen}
            onclose={onCodexToggle}
        />
    </main>

    {#if showLevelUp && levelUpName}
        <div class="level-toast" role="status" aria-live="polite">
            <span class="eyebrow">Level up</span>
            <span>{levelUpName} ascends</span>
        </div>
    {/if}
</div>

<style>
    .shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding-top: var(--safe-top);
        position: relative;
        z-index: 2;
    }

    .topbar {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 0.8rem;
        padding: 0.45rem 0.8rem;
        padding-left: max(0.8rem, var(--safe-left));
        padding-right: max(0.8rem, var(--safe-right));
        background: var(--page);
        border-bottom: 1px solid var(--line);
        flex-shrink: 0;
    }
    .brand { font-size: var(--t-base); color: var(--ink); letter-spacing: 0.06em; }
    .location-tag {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        font-size: var(--t-sm);
        color: var(--ink-soft);
        font-family: var(--font-prose);
        font-style: italic;
        min-width: 0;
    }
    .loc-dot {
        width: 6px; height: 6px;
        background: var(--gold);
        border-radius: 50%;
        flex-shrink: 0;
    }
    .loc-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .topbar-actions {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        position: relative; /* anchor for more-menu dropdown */
    }
    .chip[data-status='live'] { color: var(--good); border-color: var(--good); }
    .chip[data-status='solo'] { color: var(--muted); }
    .chip[data-status='connecting'] { color: var(--resolve); }

    /* Connection chip — dot + peer count, compact */
    .conn {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.2rem 0.5rem;
        font-variant-numeric: tabular-nums;
    }
    .conn-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--muted);
        flex-shrink: 0;
    }
    .conn[data-status='live'] .conn-dot { background: var(--good); }
    .conn[data-status='connecting'] .conn-dot { background: var(--resolve); animation: pulse-dot 1.2s ease-in-out infinite; }
    .conn[data-status='disconnected'] .conn-dot { background: var(--hp); }
    @keyframes pulse-dot {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 1; }
    }

    /* Icon-only buttons for topbar */
    .icon-only {
        padding: 0.4rem;
        width: 32px;
        height: 32px;
        min-height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
    }

    /* More-menu — dropdown panel under ⚙ */
    .more-menu {
        position: absolute;
        top: calc(100% + 4px);
        right: max(0.8rem, var(--safe-right));
        min-width: 220px;
        padding: 0.55rem;
        z-index: 40;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        animation: menu-in 0.14s ease-out;
    }
    @keyframes menu-in {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .more-section {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        padding: 0.35rem 0;
        border-bottom: 1px solid var(--line-soft);
    }
    .more-section:last-child { border-bottom: none; padding-bottom: 0; }
    .more-label {
        font-size: var(--t-xs);
        padding: 0 0.2rem 0.2rem;
    }
    .more-row {
        display: flex;
        gap: 0.3rem;
        align-items: center;
        flex-wrap: wrap;
    }
    .more-row .btn-tiny { flex: 1 1 auto; min-width: 80px; }
    .more-section .wide { width: 100%; }
    .btn-ghost.wide, .btn-primary.wide {
        width: 100%;
        text-align: left;
        justify-content: flex-start;
    }

    /* Scene strip — single thin band of chips, scrolls horizontally on mobile */
    .scene-strip {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.35rem 0.8rem;
        padding-left: max(0.8rem, var(--safe-left));
        padding-right: max(0.8rem, var(--safe-right));
        background: var(--page);
        border-bottom: 1px solid var(--line-soft);
        flex-shrink: 0;
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
    }
    .scene-strip::-webkit-scrollbar { display: none; }
    .scene-chip {
        flex-shrink: 0;
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-xs);
    }
    .scene-chip.mood-chip { color: var(--accent); border-color: var(--accent-soft); }
    .chip.paused { color: var(--hp); border-color: var(--hp); }

    .grid {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr;
        min-height: 0;
    }
    .chronicle-col {
        display: flex;
        flex-direction: column;
        min-height: 0;
        order: 1;
    }

    /* Desktop: 2-column */
    @media (min-width: 900px) {
        .grid {
            grid-template-columns: 1fr 340px;
        }
        .chronicle-col {
            max-width: 720px;
            margin: 0 auto;
            width: 100%;
        }
    }

    .level-toast {
        position: fixed;
        top: 4rem;
        left: 50%;
        transform: translateX(-50%);
        background: var(--card);
        border: 1px solid var(--gold);
        box-shadow: var(--shadow);
        padding: 0.6rem 1.1rem;
        border-radius: var(--radius);
        display: flex;
        flex-direction: column;
        align-items: center;
        z-index: 50;
        animation: toast-in 0.4s ease;
    }
    .level-toast .eyebrow { color: var(--gold); }
    .level-toast span:last-child { font-family: var(--font-display); font-size: var(--t-sm); }
    @keyframes toast-in {
        from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
</style>
