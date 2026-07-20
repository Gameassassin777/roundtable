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
    import Icon from '$lib/components/Icon.svelte';
    import type { CodexSlice } from '$lib/stores/gameStore';
    import { playHover, playClick } from '$lib/audio/ambient';
    import { ui } from '$lib/stores/uiStore.svelte';

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
        peerNames: string[];
        connectionStatus: string;
        worldClock: { turn: number; day: number; time_of_day: string };
        worldSeed: string;
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
        whisperInFlight, codex, characterName, peers, peerNames, connectionStatus,
        worldClock, worldSeed, engineSecondsLeft, enginePaused,
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
        warm: 'warm', cozy: 'warm', joyful: 'warm', festive: 'warm', tender: 'warm',
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

    // The stage gets NORMALISED tags, never raw scene_tags. The AI emits free
    // text ("misty woodland", "unsettled") and time_of_day lives in world_clock,
    // not scene_tags — so passing scene_tags straight through meant the diorama
    // never saw a time of day at all and silently rendered eternal noon.
    // `location` seeds the generator's RNG so a place stays the same place.
    // biome is left EMPTY when the AI invents something outside the known
    // families — that's the signal to synthesize a palette from biomeRaw rather
    // than collapse a brand-new place onto the default crossroads.
    // worldSeed + location make every world's forest its own forest.
    let stageTags = $derived({
        biome: (typeof localStorage !== 'undefined' && localStorage.getItem('rt_dbg_biome')) || biomeClass,
        biomeRaw: (typeof localStorage !== 'undefined' && localStorage.getItem('rt_dbg_biome')) || scene.biome || '',
        time_of_day: timeClass || 'day',
        mood: moodClass || '',
        weather: weatherClass || 'clear',
        location: codex?.location || '',
        worldSeed: worldSeed || '',
        // The DM's own visual direction for invented scenes — see SceneVisual.
        visual: (typeof localStorage !== 'undefined' && localStorage.getItem('rt_dbg_visual'))
            ? JSON.parse(localStorage.getItem('rt_dbg_visual')!)
            : ((scene as any).visual ?? null)
    });

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
            if (ui.openModal) return;   // the modal owns Escape while it's open
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
<CinematicDiorama sceneTags={stageTags} />

<div
    class="shell"
    class:chrome-active={chromeActive || moreMenuOpen}
    data-biome={biomeClass || undefined}
    data-time={timeClass || undefined}
    data-mood={moodClass || undefined}
    data-weather={weatherClass || undefined}
>
    <!-- ====== Minimal corner chrome — connection pulse (top-left) ====== -->
    <span
        class="corner-status"
        data-status={connectionStatus.toLowerCase()}
        title={`${connectionStatus}${peers > 0 ? ` · ${peers} peer${peers === 1 ? '' : 's'}` : ''}`}
        aria-hidden="true"
    ></span>

    <!-- ====== Minimal corner chrome — menu glyph (top-right) ====== -->
    <div class="corner-anchor floating-chrome">
        <button
            class="corner-glyph"
            data-more-toggle
            onclick={() => { playClick(); toggleMoreMenu(); }}
            aria-label="Menu"
            aria-expanded={moreMenuOpen}
        ><Icon name="menu" size={19} /></button>

        {#if moreMenuOpen}
            <div class="more-menu film-surface" data-more-menu role="menu">
                <div class="more-section table-presence">
                    <div class="more-label eyebrow">At the table</div>
                    {#if peerNames.length > 0}
                        {#each peerNames as n}
                            <span class="presence-row">
                                <span class="presence-dot" aria-hidden="true"></span>
                                {n}{#if n === characterName} <span class="muted">· you</span>{/if}
                            </span>
                        {/each}
                    {:else}
                        <span class="presence-row muted">Just you — share the table code to play together</span>
                    {/if}
                </div>

                <div class="more-section">
                    <button class="btn-ghost wide menu-row" role="menuitem" onclick={() => { playClick(); onCodexToggle(); closeMoreMenu(); }} onmouseenter={() => playHover()}>
                        <Icon name="codex" size={15} /><span>Codex</span>
                    </button>
                </div>

                <div class="more-section">
                    <div class="more-label eyebrow">Engine</div>
                    <div class="more-row">
                        {#if enginePaused}
                            <span class="chip paused"><Icon name="pause" size={12} /> Paused</span>
                            <button class="btn-tiny btn-ghost" role="menuitem" onclick={() => { playClick(); engineAction('resume'); }} onmouseenter={() => playHover()}><Icon name="play" size={12} /> Resume</button>
                        {:else if engineSecondsLeft !== null}
                            <span class="chip"><Icon name="clock" size={12} /> {engineSecondsLeft}s</span>
                            <button class="btn-tiny btn-ghost" role="menuitem" onclick={() => { playClick(); engineAction('pause'); }} onmouseenter={() => playHover()}><Icon name="pause" size={12} /> Pause</button>
                        {:else}
                            <span class="chip muted">Idle</span>
                        {/if}
                    </div>
                    <div class="more-row">
                        <button class="btn-tiny btn-ghost" role="menuitem" onclick={() => { playClick(); engineAction('tick-now'); }} onmouseenter={() => playHover()}>Tick now</button>
                        <button class="btn-tiny btn-ghost" role="menuitem" onclick={() => { playClick(); engineAction('step-time'); }} onmouseenter={() => playHover()}>Step time</button>
                    </div>
                </div>

                <div class="more-section">
                    <div class="more-label eyebrow">World</div>
                    <button class="btn-ghost wide menu-row" role="menuitem" onclick={() => { playClick(); openModalFromMenu('map'); }} onmouseenter={() => playHover()}>
                        <Icon name="map" size={15} /><span>Map</span>
                    </button>
                    <button class="btn-ghost wide menu-row" role="menuitem" onclick={() => { playClick(); openModalFromMenu('audit'); }} onmouseenter={() => playHover()}>
                        <Icon name="scroll" size={15} /><span>Audit Log</span>
                    </button>
                    <button class="btn-ghost wide menu-row" role="menuitem" onclick={() => { playClick(); openModalFromMenu('northstar'); }} onmouseenter={() => playHover()}>
                        <Icon name="star" size={15} /><span>North Star</span>
                    </button>
                    <button class="btn-ghost wide menu-row" role="menuitem" onclick={() => { playClick(); openModalFromMenu('weave'); }} onmouseenter={() => playHover()}>
                        <Icon name="weave" size={15} /><span>Weave</span>
                    </button>
                    <button class="btn-ghost wide menu-row" role="menuitem" onclick={() => { playClick(); openModalFromMenu('shortcuts'); }} onmouseenter={() => playHover()}>
                        <Icon name="keyboard" size={15} /><span>Shortcuts</span>
                    </button>
                </div>

                <div class="more-section">
                    <button class="btn-primary wide menu-row" role="menuitem" onclick={() => { playClick(); openModalFromMenu('settings'); }} onmouseenter={() => playHover()}>
                        <Icon name="gear" size={15} /><span>Settings</span>
                    </button>
                </div>
            </div>
        {/if}
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
        sceneInfo={{
            location,
            biome: scene.biome,
            weather: scene.weather,
            mood: scene.mood,
            day: worldClock.day,
            time_of_day: worldClock.time_of_day,
            peers,
            connectionStatus
        }}
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
    .shell > :global(*) { pointer-events: auto; }

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

    /* ---------- corner status (connection dot — top-left) ---------- */
    .corner-status {
        position: absolute;
        bottom: calc(var(--safe-bottom, 0px) + 0.75rem);
        left: max(0.9rem, var(--safe-left));
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--muted);
        box-shadow: 0 0 8px currentColor;
        opacity: 0.55;
        transition: opacity 0.3s ease, background 0.3s ease;
        pointer-events: none;
        z-index: 4;
    }
    .corner-status[data-status='live'] { background: var(--good); color: var(--good); opacity: 0.7; }
    .corner-status[data-status='connecting'] {
        background: var(--resolve); color: var(--resolve);
        animation: corner-pulse 1.6s ease-in-out infinite;
    }
    @keyframes corner-pulse {
        0%, 100% { opacity: 0.35; }
        50%      { opacity: 0.85; }
    }

    /* ---------- corner menu glyph (top-right) ---------- */
    .corner-anchor {
        position: absolute;
        top: calc(var(--safe-top, 0px) + 0.6rem);
        right: max(0.7rem, var(--safe-right));
        z-index: 5;
    }
    .corner-glyph {
        width: 40px; height: 40px;
        min-height: 40px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        /* Barely-there dark mark. Per CLAUDE.md the idle view is diorama + a
           status dot + one glyph; a filled cream disc with a gold ring is a
           web button pasted onto a film frame. */
        background: rgba(8, 10, 12, 0.34);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: none;
        border-radius: 50%;
        color: rgba(232, 224, 206, 0.82);
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.32);
        cursor: pointer;
        line-height: 1;
        font-size: 1.15rem;
        letter-spacing: 0;
        transition: color 0.22s ease, transform 0.22s ease, background 0.22s ease;
    }
    .corner-glyph:hover, .corner-glyph:focus-visible {
        background: rgba(8, 10, 12, 0.55);
        color: #f4efe3;
        transform: rotate(45deg) scale(1.05);
        box-shadow: inset 0 0 0 1px var(--gold), 0 4px 12px rgba(0, 0, 0, 0.4);
        outline: none;
    }

    .more-menu {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        min-width: 228px;
        padding: 0.55rem 0.5rem;
        /* Light glass (via .film-surface on the element) — the same material
           as the summoned sheets. The old 3px-double-gold parchment frame was
           the last cream card in the idle chrome. */
        background: var(--card);
        border: 1px solid var(--line-strong);
        box-shadow: var(--shadow-overlay), inset 0 0 0 1px var(--gold-soft);
        border-radius: var(--radius-modal);
        z-index: 40;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        animation: menu-in 0.22s var(--ease-out-soft);
        opacity: 1;
    }
    .more-menu .menu-row {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        text-align: left;
        padding-left: 0.7rem !important;
        position: relative;
        background: transparent;
        border: none;
        box-shadow: none;
    }
    .more-menu .menu-row :global(.icon) { color: var(--gold); flex-shrink: 0; }
    .more-menu .btn-primary.menu-row :global(.icon) { color: inherit; }
    .more-section {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        padding: 0.4rem 0;
        border-bottom: 1px solid var(--gold-soft);
        animation: menu-row-in 0.3s var(--ease-out-soft) both;
    }
    .more-section:nth-child(2) { animation-delay: 0.045s; }
    .more-section:nth-child(3) { animation-delay: 0.09s; }
    .more-section:nth-child(4) { animation-delay: 0.135s; }
    .more-section:nth-child(5) { animation-delay: 0.18s; }
    @keyframes menu-row-in {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes menu-in {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .more-section:last-child { border-bottom: none; padding-bottom: 0; }
    .more-section .chip { display: inline-flex; align-items: center; gap: 0.3rem; }
    .presence-row {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.15rem 0.2rem;
        font-size: var(--t-sm);
        color: var(--ink-soft);
        line-height: 1.3;
    }
    .presence-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--good);
        box-shadow: 0 0 6px color-mix(in srgb, var(--good) 65%, transparent);
        flex-shrink: 0;
    }
    .table-presence .presence-row.muted { font-size: var(--t-xs); }
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

    .chip.paused { color: var(--hp); border-color: var(--hp); }

    /* ---------- bottom stack ---------- */
    .bottom-stack {
        position: absolute;
        left: 0; right: 0;
        bottom: 0;
        padding-bottom: var(--safe-bottom, 0px);
        isolation: isolate;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.55rem;
        pointer-events: none;
        z-index: 20;
    }
    .bottom-stack > * { pointer-events: auto; position: relative; z-index: 1; }

    /* The scrim belongs HERE, not inside SubtitleOverlay. Scoped to the
       subtitle it stopped short of the action pill, the flex gap and the
       safe-area padding — so the page background resurfaced as a bar of beige
       across the bottom of the phone. This runs to the true bottom edge. */
    .bottom-stack::before {
        content: '';
        position: absolute;
        left: 0; right: 0; bottom: 0;
        top: -120px;
        background: linear-gradient(
            180deg,
            rgba(6, 8, 10, 0) 0%,
            rgba(6, 8, 10, 0.30) 26%,
            rgba(6, 8, 10, 0.66) 56%,
            rgba(6, 8, 10, 0.88) 80%,
            rgba(6, 8, 10, 0.96) 100%
        );
        pointer-events: none;
        z-index: 0;
    }

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
        .corner-status {
            bottom: calc(var(--safe-bottom, 0px) + 0.6rem);
            left: max(0.75rem, var(--safe-left));
        }
        .corner-anchor {
            top: calc(var(--safe-top, 0px) + 0.45rem);
            right: max(0.6rem, var(--safe-right));
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .floating-chrome { transition: none; }
        .more-menu, .more-section, .level-toast { animation: none !important; }
    }
</style>
