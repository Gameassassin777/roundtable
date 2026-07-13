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
</script>

<div class="shell">
    <!-- TopBar (inlined) -->
    <header class="topbar">
        <div class="brand display">Round Table</div>
        <div class="location-tag" title={location}>
            <span class="loc-dot" aria-hidden="true"></span>
            <span class="loc-text">{location || 'Uncharted'}</span>
        </div>
        <div class="topbar-actions">
            <span class="chip" data-status={connectionStatus.toLowerCase()}>{connectionStatus} · {peers}</span>
            <button class="btn-tiny btn-ghost" onclick={onCodexToggle} aria-label="Toggle codex">Codex</button>
            <button class="btn-tiny btn-ghost" onclick={() => onOpenModal('settings')} aria-label="Settings">⚙</button>
        </div>
    </header>

    <!-- SituationBar (inlined) -->
    <div class="sitbar">
        <span class="chip">{worldClock.day !== 1 ? `Day ${worldClock.day} · ` : ''}{worldClock.time_of_day}</span>
        <span class="muted">·</span>
        <span class="chip">{scene.biome}</span>
        {#if scene.weather}<span class="chip">{scene.weather}</span>{/if}
        {#if scene.mood}<span class="chip">{scene.mood}</span>{/if}
        <div class="engine-controls">
            {#if enginePaused}
                <span class="chip paused">Engine paused</span>
                <button class="btn-tiny btn-ghost" onclick={() => onEngineControl('resume')}>Resume</button>
            {:else if engineSecondsLeft !== null}
                <span class="chip" title="World Engine next tick">◷ {engineSecondsLeft}s</span>
                <button class="btn-tiny btn-ghost" onclick={() => onEngineControl('pause')}>Pause</button>
            {/if}
            <button class="btn-tiny btn-ghost" onclick={() => onEngineControl('tick-now')} title="Force a world tick">Tick now</button>
            <button class="btn-tiny btn-ghost" onclick={() => onEngineControl('step-time')} title="Advance the clock one bucket">Step time</button>
        </div>
        <div class="sitbar-right">
            <button class="btn-tiny btn-ghost" onclick={() => onOpenModal('map')}>Map</button>
            <button class="btn-tiny btn-ghost" onclick={() => onOpenModal('audit')}>Audit</button>
        </div>
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
    }
    .chip[data-status='live'] { color: var(--good); border-color: var(--good); }
    .chip[data-status='solo'] { color: var(--muted); }
    .chip[data-status='connecting'] { color: var(--resolve); }

    .sitbar {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.4rem 0.8rem;
        padding-left: max(0.8rem, var(--safe-left));
        padding-right: max(0.8rem, var(--safe-right));
        background: var(--page);
        border-bottom: 1px solid var(--line-soft);
        flex-shrink: 0;
        flex-wrap: wrap;
        row-gap: 0.3rem;
    }
    .engine-controls {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        margin-left: 0.5rem;
    }
    .chip.paused { color: var(--hp); border-color: var(--hp); }
    .sitbar-right {
        margin-left: auto;
        display: flex;
        gap: 0.3rem;
    }

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
