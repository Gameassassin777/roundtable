<script lang="ts">
    // Main chat-flow chronicle canvas. Owns the chatLog → chronicleItems grouping
    // (lifted verbatim from +page.svelte subscribeChat logic).
    //
    // Grouping rules (preserved):
    //   - 'player' entries open a new round
    //   - 'dm' entries close the round (with optional audit + ruling_summary)
    //   - 'whisper' is standalone
    //   - 'world' is standalone (ambient or whisper echo)

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

    type Props = {
        chatLog: ChatEntry[];
        localWhispers: ChatEntry[];
        isLoading: boolean;
        turnStageLabel: string;
        lastTurnError: string | null;
    };

    let { chatLog, localWhispers, isLoading, turnStageLabel, lastTurnError }: Props = $props();

    let scrollEl: HTMLElement | null = $state(null);
    let chronicleSearch = $state('');
    let chronicleWhisperOnly = $state(false);

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
        let currentRound:
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
            | null = null;
        let nextRoundId = 1;

        const flush = () => {
            if (currentRound && (currentRound.actions.length > 0 || currentRound.narration)) {
                items.push(currentRound);
            }
            currentRound = null;
        };

        for (const entry of displayChatLog) {
            if (entry.type === 'player') {
                if (!currentRound) {
                    currentRound = { kind: 'round', id: nextRoundId++, actions: [], narration: '' };
                }
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

    let filteredChronicleItems = $derived.by(() => {
        let pool = chronicleItems;
        if (chronicleWhisperOnly) {
            pool = pool.filter(
                (item: any) => item.kind === 'world' && typeof item.id === 'string' && item.id.startsWith('whisper-')
            );
        }
        const q = chronicleSearch.trim().toLowerCase();
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

    // Autoscroll to bottom when new content lands — but only if user is already
    // near the bottom (don't yank the scroll position when they're reading up).
    let pinnedToBottom = true;
    function handleScroll() {
        if (!scrollEl) return;
        const threshold = 80;
        pinnedToBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < threshold;
    }
    $effect(() => {
        if (scrollEl && pinnedToBottom) {
            scrollEl.scrollTop = scrollEl.scrollHeight;
        }
    });
</script>

<section class="chronicle" aria-label="Story chronicle">
    <div class="chronicle-toolbar">
        <input
            type="search"
            placeholder="Search the chronicle…"
            bind:value={chronicleSearch}
            aria-label="Search chronicle"
        />
        <button
            class="btn-tiny btn-ghost"
            class:active={chronicleWhisperOnly}
            onclick={() => (chronicleWhisperOnly = !chronicleWhisperOnly)}
            title="Show only whispered beats"
        >
            Whispers
        </button>
    </div>

    <div class="chronicle-scroll" bind:this={scrollEl} onscroll={handleScroll}>
        {#each filteredChronicleItems as item (item.id)}
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

<style>
    .chronicle {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }
    .chronicle-toolbar {
        display: flex;
        gap: 0.4rem;
        padding: 0.4rem 0.6rem;
        border-bottom: 1px solid var(--line-soft);
        background: var(--page);
        flex-shrink: 0;
    }
    .chronicle-toolbar input {
        flex: 1;
        font-size: var(--t-sm);
        padding: 0.4rem 0.6rem;
    }
    .chronicle-toolbar button.active {
        background: var(--accent-soft);
        border-color: var(--accent);
        color: var(--accent);
    }

    .chronicle-scroll {
        flex: 1;
        overflow-y: auto;
        padding: 0.5rem 1rem 6rem;
        min-height: 0;
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
    .typing {
        display: inline-flex;
        gap: 0.25rem;
    }
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
</style>
