<script lang="ts">
    // ChronicleHistory — swipe-up drawer holding the full chronicle.
    // Hidden by default. Drag the handle (or tap it) to reveal.
    //
    // Reuses the chatLog → chronicleItems grouping logic that used to live in
    // Chronicle.svelte (player opens a round, dm closes it, whisper/world are
    // standalone). Rendering is delegated to ChronicleBeat.

    import ChronicleBeat from './ChronicleBeat.svelte';

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

    type ChronicleItem =
        | {
              kind: 'round';
              id: number;
              actions: ChatEntry[];
              narration: string;
              audit?: any;
              ruling?: any;
              beat_profile?: string;
              is_scene_set?: boolean;
              beat_types?: string[];
          }
        | { kind: 'world'; id: string; text: string; timestamp?: number };

    type SceneInfo = {
        location: string;
        biome: string;
        weather: string;
        mood: string;
        day: number;
        time_of_day: string;
        peers: number;
        connectionStatus: string;
    };

    type Props = {
        chatLog: ChatEntry[];
        localWhispers: ChatEntry[];
        isLoading: boolean;
        turnStageLabel: string;
        lastTurnError: string | null;
        open: boolean;
        onOpenChange: (open: boolean) => void;
        sceneInfo?: SceneInfo;
    };

    let {
        chatLog, localWhispers, isLoading, turnStageLabel, lastTurnError,
        open, onOpenChange, sceneInfo
    }: Props = $props();

    let search = $state('');
    let whisperOnly = $state(false);
    let scrollEl: HTMLElement | null = $state(null);

    let displayChatLog = $derived.by(() => {
        if (localWhispers.length === 0) return chatLog;
        return [...chatLog, ...localWhispers].sort((a, b) => {
            const ta = a.timestamp || 0;
            const tb = b.timestamp || 0;
            return ta - tb;
        });
    });

    let chronicleItems = $derived.by(() => {
        const items: ChronicleItem[] = [];
        let currentRound: any = null;
        let nextRoundId = 1;

        const flush = () => {
            if (currentRound && (currentRound.actions.length > 0 || currentRound.narration)) {
                items.push(currentRound);
            }
            currentRound = null;
        };

        for (const entry of displayChatLog) {
            if (entry.type === 'player') {
                if (!currentRound) currentRound = { kind: 'round', id: nextRoundId++, actions: [], narration: '' };
                if (currentRound.narration) {
                    flush();
                    currentRound = { kind: 'round', id: nextRoundId++, actions: [], narration: '' };
                }
                currentRound.actions.push(entry);
            } else if (entry.type === 'whisper') {
                flush();
                items.push({
                    kind: 'world',
                    id: `whisper-${entry.timestamp || Math.random()}`,
                    text: `${entry.author}: ${entry.text}`,
                    timestamp: entry.timestamp
                });
            } else if (entry.type === 'dm') {
                if (entry.author === 'System' || entry.author === 'Warning') continue;
                if (!currentRound) currentRound = { kind: 'round', id: nextRoundId++, actions: [], narration: '' };
                currentRound.narration = entry.text;
                currentRound.audit = entry.audit;
                currentRound.ruling = entry.ruling_summary;
                currentRound.beat_profile = entry.beat_profile;
                currentRound.is_scene_set = entry.is_scene_set;
                currentRound.beat_types = entry.beat_types;
                flush();
            } else if (entry.type === 'world') {
                flush();
                items.push({
                    kind: 'world',
                    id: `world-${entry.timestamp || Math.random()}`,
                    text: entry.text,
                    timestamp: entry.timestamp
                });
            }
        }
        flush();
        return items;
    });

    let filteredItems = $derived.by(() => {
        let pool = chronicleItems;
        if (whisperOnly) {
            pool = pool.filter((item: any) => item.kind === 'world' && typeof item.id === 'string' && item.id.startsWith('whisper-'));
        }
        const q = search.trim().toLowerCase();
        if (!q) return pool;
        return pool.filter((item: any) => {
            if (item.kind === 'round') {
                if (item.narration && item.narration.toLowerCase().includes(q)) return true;
                for (const a of item.actions as any[]) {
                    if ((a.author || '').toLowerCase().includes(q)) return true;
                    if ((a.text || '').toLowerCase().includes(q)) return true;
                }
                return false;
            }
            if (item.kind === 'world') {
                return (item.text || '').toLowerCase().includes(q);
            }
            return false;
        });
    });

    let beatCount = $derived(chronicleItems.length);

    // Keep pinned to bottom on new beats — but only if user is at the bottom.
    let pinnedToBottom = true;
    function handleScroll() {
        if (!scrollEl) return;
        const threshold = 80;
        pinnedToBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < threshold;
    }
    $effect(() => {
        if (open && scrollEl && pinnedToBottom) {
            // Defer to next frame so the new content has rendered.
            requestAnimationFrame(() => {
                if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
            });
        }
    });

    function open_() { onOpenChange(true); }
    function close() { onOpenChange(false); }

    // Drag-down to dismiss
    let dragStartY: number | null = null;
    let dragOffset = $state(0);
    function onTouchStart(e: TouchEvent) {
        if (!scrollEl || scrollEl.scrollTop > 4) return;
        dragStartY = e.touches[0].clientY;
    }
    function onTouchMove(e: TouchEvent) {
        if (dragStartY === null) return;
        const delta = e.touches[0].clientY - dragStartY;
        dragOffset = Math.max(0, delta);
    }
    function onTouchEnd() {
        if (dragOffset > 100) close();
        dragOffset = 0;
        dragStartY = null;
    }
</script>

{#if !open}
    <!-- Chronicle handle — small marginalia tab pinned to the bottom-left
         corner, away from the action-pill axis. -->
    <button
        class="history-handle"
        onclick={open_}
        aria-label="Open chronicle"
        title="Past beats"
    >
        <span class="handle-mark" aria-hidden="true">⌃</span>
        <span class="handle-count">{beatCount} {beatCount === 1 ? 'beat' : 'beats'}</span>
    </button>
{/if}

{#if open}
    <div class="backdrop" onclick={close}></div>

    <section
        class="chronicle-drawer"
        role="dialog"
        aria-label="Chronicle history"
        style="transform: translateY({dragOffset}px)"
        ontouchstart={onTouchStart}
        ontouchmove={onTouchMove}
        ontouchend={onTouchEnd}
    >
        <div class="drawer-header">
            <div class="handle-bar" aria-hidden="true"></div>

            {#if sceneInfo}
                <div class="chapter-heading" aria-label="Current scene">
                    <span class="chapter-eyebrow">Chapter</span>
                    <div class="chapter-line">
                        {#if sceneInfo.location}
                            <span class="chapter-place">{sceneInfo.location}</span>
                        {/if}
                        {#if sceneInfo.biome}
                            <span class="chapter-sep" aria-hidden="true">·</span>
                            <span class="chapter-detail italic">{sceneInfo.biome}</span>
                        {/if}
                    </div>
                    <div class="chapter-line dim">
                        {#if sceneInfo.day && sceneInfo.time_of_day}
                            <span class="chapter-detail">Day {sceneInfo.day}, {sceneInfo.time_of_day}</span>
                        {/if}
                        {#if sceneInfo.weather}
                            <span class="chapter-sep" aria-hidden="true">·</span>
                            <span class="chapter-detail italic">{sceneInfo.weather}</span>
                        {/if}
                        {#if sceneInfo.mood}
                            <span class="chapter-sep" aria-hidden="true">·</span>
                            <span class="chapter-detail italic mood">{sceneInfo.mood}</span>
                        {/if}
                    </div>
                    {#if sceneInfo.peers > 0}
                        <div class="chapter-line dim">
                            <span class="chapter-detail">{sceneInfo.peers} companion{sceneInfo.peers === 1 ? '' : 's'} at the table</span>
                        </div>
                    {/if}
                </div>
            {/if}

            <div class="drawer-title-row">
                <span class="eyebrow">Chronicle</span>
                <span class="beat-count">{beatCount}</span>
                <button class="done-link" onclick={close}>Done</button>
            </div>
            <div class="toolbar">
                <div class="find-row">
                    <span class="find-glyph" aria-hidden="true">⌕</span>
                    <input
                        type="text"
                        placeholder="Search the chronicle…"
                        bind:value={search}
                        aria-label="Search chronicle"
                    />
                </div>
                <button
                    class="filter-pill"
                    class:active={whisperOnly}
                    onclick={() => (whisperOnly = !whisperOnly)}
                    title="Whispers only"
                >
                    Whispers
                </button>
            </div>
        </div>

        <div class="chronicle-scroll" bind:this={scrollEl} onscroll={handleScroll}>
            {#each filteredItems as item (item.id)}
                {#if item.kind === 'round'}
                    <ChronicleBeat
                        kind="round"
                        id={item.id}
                        actions={item.actions}
                        narration={item.narration}
                        narrationBeatProfile={(item as any).beat_profile || 'action'}
                        isSceneSet={(item as any).is_scene_set}
                        beatTypes={(item as any).beat_types}
                        audit={(item as any).audit}
                        ruling={(item as any).ruling}
                    />
                {:else}
                    <ChronicleBeat
                        kind="world"
                        id={item.id}
                        text={item.text}
                        timestamp={item.timestamp}
                    />
                {/if}
            {:else}
                <div class="chronicle-empty">
                    <p class="eyebrow">No beats yet</p>
                    <p class="muted">The chronicle begins with your first action.</p>
                </div>
            {/each}

            {#if isLoading}
                <div class="beat pending" aria-live="polite">
                    <span class="eyebrow">{turnStageLabel || 'The world responds…'}</span>
                    <div class="typing">
                        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
                    </div>
                </div>
            {/if}

            {#if lastTurnError}
                <div class="beat error" role="alert">
                    <p class="prose-italic">{lastTurnError}</p>
                </div>
            {/if}
        </div>
    </section>
{/if}

<style>
    /* ---------- handle (collapsed affordance — bottom-left marginalia) ---------- */
    .history-handle {
        position: fixed;
        bottom: calc(var(--safe-bottom, 0px) + 0.55rem);
        left: max(0.85rem, var(--safe-left));
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.3rem 0.65rem 0.3rem 0.45rem;
        background: rgba(252, 248, 237, 0.62);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        border: none;
        border-radius: var(--radius-sm);
        box-shadow: 0 1px 3px rgba(60, 40, 20, 0.08);
        cursor: pointer;
        z-index: 20;
        opacity: 0.62;
        transition: opacity 0.22s ease, transform 0.22s ease, color 0.22s ease;
    }
    .history-handle:hover {
        opacity: 1;
        transform: translateY(-1px);
    }
    .handle-mark {
        font-family: var(--font-prose);
        color: var(--gold);
        font-size: 0.85rem;
        line-height: 1;
        transform: translateY(-1px);
    }
    .handle-count {
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-xs);
        color: var(--ink-soft);
        letter-spacing: 0;
        text-transform: none;
        font-variant-numeric: tabular-nums;
    }

    /* ---------- backdrop ---------- */
    .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(42, 36, 32, 0.4);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        z-index: 32;
        animation: backdrop-in 0.28s ease-out;
    }
    @keyframes backdrop-in { from { opacity: 0; } to { opacity: 1; } }

    /* ---------- drawer ---------- */
    .chronicle-drawer {
        position: fixed;
        left: 0; right: 0; bottom: 0;
        max-width: 760px;
        margin: 0 auto;
        height: 75vh;
        background: var(--card);
        border-top: 1px solid var(--line);
        border-radius: 6px 6px 0 0;
        box-shadow: 0 -8px 32px rgba(60, 40, 20, 0.18);
        z-index: 33;
        display: flex;
        flex-direction: column;
        animation: drawer-in 0.4s cubic-bezier(0.2, 0.7, 0.2, 1);
        transition: transform 0.18s ease-out;
    }
    @keyframes drawer-in {
        from { transform: translateY(100%); opacity: 0.4; }
        to   { transform: translateY(0); opacity: 1; }
    }

    .drawer-header {
        flex-shrink: 0;
        padding: 0.55rem 0.9rem 0.5rem;
        border-bottom: 1px solid var(--line-soft);
        background: var(--card);
        border-radius: 6px 6px 0 0;
    }
    .drawer-header .handle-bar {
        margin: 0 auto 0.4rem;
        width: 36px; height: 4px;
        background: var(--line-strong);
        border-radius: 999px;
        opacity: 0.6;
    }
    .drawer-title-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }
    .drawer-title-row .eyebrow {
        font-family: var(--font-display);
        font-size: var(--t-sm);
        font-weight: 600;
        letter-spacing: 0.16em;
        color: var(--ink);
        text-transform: uppercase;
    }
    .beat-count {
        font-family: var(--font-ui);
        font-size: var(--t-xs);
        color: var(--muted);
        font-variant-numeric: tabular-nums;
    }
    .done-link {
        margin-left: auto;
        background: transparent;
        border: none;
        color: var(--accent);
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-sm);
        cursor: pointer;
        padding: 0.2rem 0.4rem;
        transition: color 0.18s ease;
    }
    .done-link:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }

    /* ---------- chapter heading (chronicle marginalia) ---------- */
    .chapter-heading {
        padding: 0.5rem 0 0.65rem;
        margin-bottom: 0.55rem;
        border-bottom: 1px solid var(--line-soft);
        display: flex;
        flex-direction: column;
        gap: 0.18rem;
    }
    .chapter-eyebrow {
        font-family: var(--font-display);
        font-size: 9.5px;
        font-weight: 600;
        letter-spacing: 0.28em;
        color: var(--gold);
        text-transform: uppercase;
        margin-bottom: 0.15rem;
    }
    .chapter-line {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.35rem;
        font-family: var(--font-prose);
        line-height: 1.45;
    }
    .chapter-line.dim { opacity: 0.75; }
    .chapter-place {
        font-family: var(--font-display);
        font-size: var(--t-md, 1rem);
        font-weight: 600;
        letter-spacing: 0.02em;
        color: var(--ink);
    }
    .chapter-detail {
        font-family: var(--font-prose);
        font-size: var(--t-sm);
        color: var(--ink-soft);
    }
    .chapter-detail.italic { font-style: italic; }
    .chapter-detail.mood { color: var(--accent); }
    .chapter-sep {
        color: var(--gold);
        opacity: 0.55;
        font-size: 0.7rem;
    }

    .toolbar {
        display: flex;
        gap: 0.4rem;
    }
    .find-row {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.35rem 0.65rem;
        background: transparent;
        border: none;
        border-bottom: 1px solid var(--line-soft);
        transition: border-color 0.2s ease;
    }
    .find-row:focus-within { border-bottom-color: var(--gold); }
    .find-glyph {
        color: var(--muted);
        font-size: 0.95rem;
        line-height: 1;
        flex-shrink: 0;
    }
    .find-row input {
        flex: 1;
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-sm);
        color: var(--ink);
        background: transparent;
        border: none;
        outline: none;
        padding: 0;
    }
    .find-row input::placeholder { color: var(--muted); font-style: italic; }
    .filter-pill {
        background: transparent;
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        padding: 0.3rem 0.7rem;
        font-family: var(--font-ui);
        font-size: var(--t-xs);
        color: var(--ink-soft);
        cursor: pointer;
        letter-spacing: 0.04em;
        transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease;
    }
    .filter-pill:hover { color: var(--ink); border-color: var(--gold-soft); }
    .filter-pill.active {
        background: var(--accent-soft);
        border-color: var(--accent);
        color: var(--accent);
    }

    .chronicle-scroll {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding: 0.3rem 1rem 2rem;
        min-height: 0;
        overscroll-behavior: contain;
    }

    .chronicle-empty {
        padding: 4rem 1rem;
        text-align: center;
    }
    .chronicle-empty p { margin: 0.3rem 0; }

    .pending {
        padding: 1rem 0;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }
    .typing { display: inline-flex; gap: 0.25rem; }
    .dot {
        width: 6px; height: 6px;
        background: var(--muted);
        border-radius: 50%;
        animation: pulse 1.2s ease-in-out infinite;
    }
    .dot:nth-child(2) { animation-delay: 0.15s; }
    .dot:nth-child(3) { animation-delay: 0.3s; }
    @keyframes pulse {
        0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
        30% { opacity: 1; transform: translateY(-3px); }
    }

    .error {
        padding: 0.7rem 0.9rem;
        background: rgba(160, 70, 64, 0.08);
        border: 1px solid var(--hp);
        border-radius: var(--radius-sm);
        margin: 0.3rem 0;
    }

    @media (prefers-reduced-motion: reduce) {
        .chronicle-drawer, .backdrop, .history-handle {
            animation: none !important;
            transition: none !important;
        }
    }
</style>
