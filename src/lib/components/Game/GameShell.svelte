<script lang="ts">
    // Cinematic layout — Round Table as immersive story-decision game.
    //
    // Layers (bottom to top):
    //   1. CinematicDiorama — full viewport foreground stage, live during play
    //   2. PaperGrain — already global from +page.svelte
    //   3. Floating chrome (topbar + scene-strip) — low-opacity until interacted
    //   4. Bottom stack — SubtitleOverlay (latest beat only) + ActionSummon (pill
    //      that expands into sheet) + ChronicleHistory (swipe-up drawer)
    //   5. Codex sheet — slides from right when toggled
    //
    // The chat-flow chronicle is gone. Story lives in the diorama + subtitles.
    // Past beats are tucked behind the swipe-up drawer.

    import CinematicDiorama from '$lib/components/CinematicDiorama.svelte';
    import SubtitleOverlay from './SubtitleOverlay.svelte';
    import ActionSummon from './ActionSummon.svelte';
    import ChronicleHistory from './ChronicleHistory.svelte';
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

    type Beat = {
        id: number | string;
        narration: string;
        beat_profile?: 'scene_set' | 'action' | 'social' | 'world_ambient';
        is_scene_set?: boolean;
        location?: string;
        biome?: string;
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

    // ---- Scene classification (preserved verbatim from previous GameShell) ----
    function slugify(s: string): string {
        return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
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

    // ---- Latest beat for SubtitleOverlay ----
    // Pull the most recent DM narration from chatLog (skips System/Warning entries).
    let latestBeat = $derived.by<Beat | null>(() => {
        for (let i = chatLog.length - 1; i >= 0; i--) {
            const entry = chatLog[i];
            if (entry.type !== 'dm') continue;
            if (entry.author === 'System' || entry.author === 'Warning') continue;
            if (!entry.text) continue;
            return {
                id: entry.timestamp || i,
                narration: entry.text,
                beat_profile: entry.beat_profile as Beat['beat_profile'],
                is_scene_set: entry.is_scene_set,
                location: location || undefined,
                biome: scene?.biome || undefined,
            };
        }
        return null;
    });

    // ---- Chrome dimming ----
    // Floating chrome (topbar, scene-strip) is dim by default, brightens on
    // pointermove. After 3s of no movement, dims again. On touch devices, tap
    // toggles a "chrome active" state that holds for 4s.
    let chromeActive = $state(false);
    let chromeTimeout: ReturnType<typeof setTimeout> | null = null;
    function wakeChrome(durationMs = 3200) {
        chromeActive = true;
        if (chromeTimeout) clearTimeout(chromeTimeout);
        chromeTimeout = setTimeout(() => { chromeActive = false; }, durationMs);
    }
    function onPointerMove() { wakeChrome(); }

    // ---- More menu ----
    let moreMenuOpen = $state(false);
    function toggleMoreMenu() {
        moreMenuOpen = !moreMenuOpen;
        wakeChrome(8000);
    }
    function closeMoreMenu() { moreMenuOpen = false; }

    function engineAction(a: 'pause' | 'resume' | 'tick-now' | 'step-time') {
        onEngineControl(a);
        closeMoreMenu();
    }
    function openModalFromMenu(id: 'settings' | 'northstar' | 'weave' | 'audit' | 'shortcuts' | 'map') {
        onOpenModal(id);
        closeMoreMenu();
    }

    // ---- Chronicle drawer ----
    let chronicleOpen = $state(false);
    function setChronicleOpen(v: boolean) { chronicleOpen = v; }

    // ---- Click-outside handling for more-menu ----
    function handleShellClick(e: MouseEvent) {
        const t = e.target as HTMLElement;
        if (moreMenuOpen && !t.closest('[data-more-menu]') && !t.closest('[data-more-toggle]')) {
            closeMoreMenu();
        }
    }
    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            if (moreMenuOpen) closeMoreMenu();
            if (chronicleOpen) chronicleOpen = false;
        }
    }
</script>

<svelte:window
    onpointermove={onPointerMove}
    onclick={handleShellClick}
    onkeydown={handleKeydown}
/>

<!-- Foreground stage: live diorama fills the viewport behind everything -->
<CinematicDiorama sceneTags={scene} />

<div
    class="shell"
    class:chrome-active={chromeActive || moreMenuOpen}
    data-biome={biomeClass || undefined}
    data-time={timeClass || undefined}
    data-mood={moodClass || undefined}
    data-weather={weatherClass || undefined}
>
    <!-- ====== Floating chrome — topbar ====== -->
    <header class="floating-chrome topbar">
        <div class="brand">
            <span class="brand-mark">✦</span>
            <span class="brand-text display">Round Table</span>
        </div>
        <div class="location-tag" title={location}>
            <span class="loc-dot" aria-hidden="true"></span>
            <span class="loc-text">{location || 'Uncharted'}</span>
        </div>
        <div class="topbar-actions">
            <span class="conn-chip" data-status={connectionStatus.toLowerCase()} title={`${connectionStatus} · ${peers} peer${peers === 1 ? '' : 's'}`}>
                <span class="conn-dot" aria-hidden="true"></span>
                {peers}
            </span>
            <button class="icon-btn" onclick={onCodexToggle} aria-label="Toggle codex" title="Codex">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 2h7l3 3v9H3z"/><path d="M10 2v3h3"/><path d="M5 8h6M5 11h6"/></svg>
            </button>
            <button
                class="icon-btn"
                data-more-toggle
                onclick={toggleMoreMenu}
                aria-label="More menu"
                aria-expanded={moreMenuOpen}
            >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="3" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="13" cy="8" r="1"/></svg>
            </button>

            {#if moreMenuOpen}
                <div class="more-menu" data-more-menu role="menu">
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

    <!-- ====== Floating chrome — scene strip ====== -->
    <div class="floating-chrome scene-strip">
        <span class="chip scene-chip">{worldClock.day !== 1 ? `Day ${worldClock.day} · ` : ''}{worldClock.time_of_day || 'Unset hour'}</span>
        {#if scene.biome}<span class="chip scene-chip">{scene.biome}</span>{/if}
        {#if scene.weather}<span class="chip scene-chip">{scene.weather}</span>{/if}
        {#if scene.mood}<span class="chip scene-chip mood-chip">{scene.mood}</span>{/if}
    </div>

    <!-- ====== Bottom stack — subtitles + action pill ====== -->
    <div class="bottom-stack">
        <SubtitleOverlay
            beat={latestBeat}
            {isLoading}
            {turnStageLabel}
            error={lastTurnError}
        />
        <ActionSummon
            {onsubmit}
            {whisperInFlight}
            authorName={characterName}
            {isLoading}
        />
    </div>

    <!-- ====== Chronicle history drawer (hidden by default) ====== -->
    <ChronicleHistory
        {chatLog}
        {localWhispers}
        {isLoading}
        {turnStageLabel}
        {lastTurnError}
        open={chronicleOpen}
        onOpenChange={setChronicleOpen}
    />

    <!-- ====== Codex sheet ====== -->
    <Codex
        {codex}
        {characterName}
        sheetOpen={codexSheetOpen}
        onclose={onCodexToggle}
    />

    {#if showLevelUp && levelUpName}
        <div class="level-toast" role="status" aria-live="polite">
            <span class="eyebrow">Level up</span>
            <span>{levelUpName} ascends</span>
        </div>
    {/if}
</div>

<style>
    .shell {
        position: relative;
        width: 100%;
        height: 100%;
        padding-top: var(--safe-top);
        z-index: 2;
        pointer-events: none; /* let diorama show through; children re-enable */
    }
    /* Make interactive elements receive pointer events */
    .shell > * { pointer-events: auto; }

    /* ---------- floating chrome ---------- */
    .floating-chrome {
        opacity: 0.42;
        transition: opacity 0.36s ease;
    }
    .shell.chrome-active .floating-chrome,
    .floating-chrome:hover,
    .floating-chrome:focus-within {
        opacity: 1;
    }

    /* ---------- topbar ---------- */
    .topbar {
        position: absolute;
        top: var(--safe-top, 0px);
        left: 0; right: 0;
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 0.7rem;
        padding: 0.5rem 0.8rem;
        padding-left: max(0.8rem, var(--safe-left));
        padding-right: max(0.8rem, var(--safe-right));
        background: linear-gradient(180deg, rgba(252, 248, 237, 0.92) 0%, rgba(252, 248, 237, 0.72) 70%, transparent 100%);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
    }
    .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
    }
    .brand-mark {
        color: var(--gold);
        font-size: 0.95rem;
        line-height: 1;
    }
    .brand-text {
        font-size: var(--t-sm);
        color: var(--ink);
        letter-spacing: 0.1em;
    }
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
        box-shadow: 0 0 8px rgba(169, 126, 60, 0.5);
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
        position: relative;
    }

    .conn-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.2rem 0.55rem;
        font-family: var(--font-ui);
        font-size: var(--t-xs);
        color: var(--ink-soft);
        background: var(--card);
        border: 1px solid var(--line-soft);
        border-radius: 999px;
        font-variant-numeric: tabular-nums;
    }
    .conn-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--muted);
        flex-shrink: 0;
    }
    .conn-chip[data-status='live'] .conn-dot { background: var(--good); }
    .conn-chip[data-status='live'] { color: var(--good); border-color: var(--good); }
    .conn-chip[data-status='connecting'] .conn-dot { background: var(--resolve); animation: pulse-dot 1.2s ease-in-out infinite; }
    .conn-chip[data-status='connecting'] { color: var(--resolve); }
    .conn-chip[data-status='disconnected'] .conn-dot { background: var(--hp); }
    .conn-chip[data-status='disconnected'] { color: var(--hp); }
    @keyframes pulse-dot {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 1; }
    }

    .icon-btn {
        width: 32px; height: 32px;
        min-height: 32px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--card);
        border: 1px solid var(--line-soft);
        border-radius: 999px;
        color: var(--ink-soft);
        cursor: pointer;
        line-height: 1;
        transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
    }
    .icon-btn:hover {
        background: var(--inset);
        color: var(--ink);
        border-color: var(--gold-soft);
    }

    .more-menu {
        position: absolute;
        top: calc(100% + 4px);
        right: max(0.8rem, var(--safe-right));
        min-width: 220px;
        padding: 0.55rem;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        box-shadow: 0 6px 24px rgba(60, 40, 20, 0.14);
        z-index: 40;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        animation: menu-in 0.14s ease-out;
        opacity: 1;
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
    :global(.btn-ghost.wide), :global(.btn-primary.wide) {
        width: 100%;
        text-align: left;
        justify-content: flex-start;
    }

    /* ---------- scene strip ---------- */
    .scene-strip {
        position: absolute;
        top: calc(var(--safe-top, 0px) + 3.2rem);
        left: max(0.8rem, var(--safe-left));
        right: max(0.8rem, var(--safe-right));
        display: flex;
        align-items: center;
        gap: 0.3rem;
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        padding: 0.2rem 0;
    }
    .scene-strip::-webkit-scrollbar { display: none; }
    .scene-chip {
        flex-shrink: 0;
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-xs);
        background: rgba(252, 248, 237, 0.7);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        border-color: var(--line-soft);
    }
    .scene-chip.mood-chip { color: var(--accent); border-color: var(--accent-soft); }
    .chip.paused { color: var(--hp); border-color: var(--hp); }

    /* ---------- bottom stack ---------- */
    .bottom-stack {
        position: absolute;
        left: 0; right: 0;
        bottom: 0;
        padding-bottom: var(--safe-bottom, 0px);
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 0.55rem;
        pointer-events: none;
    }
    .bottom-stack > * { pointer-events: auto; }

    /* ---------- level toast ---------- */
    .level-toast {
        position: fixed;
        top: calc(var(--safe-top, 0px) + 4rem);
        left: 50%;
        transform: translateX(-50%);
        background: var(--card);
        border: 1px solid var(--gold);
        box-shadow: 0 4px 20px rgba(60, 40, 20, 0.18);
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

    @media (max-width: 540px) {
        .topbar {
            grid-template-columns: auto 1fr auto;
            gap: 0.45rem;
            padding: 0.4rem 0.6rem;
        }
        .brand-text { display: none; }
        .scene-strip {
            top: calc(var(--safe-top, 0px) + 2.7rem);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .floating-chrome { transition: none; }
        .more-menu, .level-toast { animation: none !important; }
    }
</style>
