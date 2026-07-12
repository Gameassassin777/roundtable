<script lang="ts">
    // One chronicle entry — beat-type-aware rendering.
    // scene_set → hero card with location title + flowery prose
    // action   → tight Spectral paragraph, no decoration
    // social   → indented speaker block, NPC name in small caps
    // world_ambient → offset italic with gold border
    // whisper  → dashed border, italic, (whisper) tag

    type Props = {
        kind: 'round' | 'world';
        id: number | string;
        actions?: Array<{ author: string; text: string; timestamp?: number }>;
        narration?: string;
        narrationBeatProfile?: 'scene_set' | 'action' | 'social' | 'world_ambient';
        isSceneSet?: boolean;
        beatTypes?: string[];
        audit?: { lint_retried?: boolean; critic_passed?: boolean | null; critic_retried?: boolean } | null;
        ruling?: any;
        text?: string;
        timestamp?: number;
    };

    let {
        kind, id,
        actions = [], narration = '',
        narrationBeatProfile = 'action',
        isSceneSet = false,
        beatTypes = [],
        audit = null,
        ruling = null,
        text = '',
        timestamp
    }: Props = $props();

    let showRuling = $state(false);
</script>

{#if kind === 'round' && (narration || actions.length)}
    <article class="beat round" data-beat={isSceneSet ? 'scene_set' : narrationBeatProfile}>
        {#if isSceneSet}
            <!-- SCENE_SET hero card: Cinzel title + Spectral italic prose + gold rule -->
            <header class="scene-header">
                <span class="eyebrow">A new scene</span>
            </header>
            <p class="prose prose-scene selectable">{narration}</p>
            <hr class="hr-gold" />
        {:else if narrationBeatProfile === 'social' && actions.length}
            <!-- SOCIAL: indented speaker block -->
            <div class="social-block">
                <p class="prose prose-social selectable">{narration}</p>
            </div>
        {:else}
            <!-- ACTION (default): tight paragraph -->
            <p class="prose prose-action selectable">{narration}</p>
        {/if}

        {#if actions.length}
            <ul class="actions-row" aria-label="Player actions in this round">
                {#each actions as a, i}
                    <li class="action-chip">
                        <span class="action-author">{a.author}</span>
                        <span class="action-text selectable">{a.text}</span>
                    </li>
                {/each}
            </ul>
        {/if}

        {#if audit || ruling}
            <div class="audit-row">
                {#if audit}
                    <span class="chip" class:warn={audit.lint_retried} title="Lint retry indicator">
                        lint{audit.lint_retried ? ' ↻' : ' ✓'}
                    </span>
                    {#if audit.critic_passed !== null && audit.critic_passed !== undefined}
                        <span class="chip" class:warn={audit.critic_retried} class:bad={audit.critic_passed === false} title="Critic verdict">
                            critic{audit.critic_retried ? ' ↻' : (audit.critic_passed ? ' ✓' : ' ✗')}
                        </span>
                    {/if}
                {/if}
                {#if ruling}
                    <button class="btn-tiny btn-ghost" onclick={() => (showRuling = !showRuling)}>
                        {showRuling ? 'Hide' : 'Ruling'}
                    </button>
                {/if}
            </div>
            {#if showRuling && ruling}
                <pre class="ruling-preview selectable">{JSON.stringify(ruling, null, 2)}</pre>
            {/if}
        {/if}
    </article>
{:else if kind === 'world'}
    <article class="beat world" data-beat={typeof id === 'string' && id.startsWith('whisper-') ? 'whisper' : 'world_ambient'}>
        {#if typeof id === 'string' && id.startsWith('whisper-')}
            <!-- WHISPER: dashed border, italic, (whisper) tag -->
            <span class="whisper-tag">(whisper)</span>
            <p class="prose-italic whisper-text selectable">{text}</p>
        {:else}
            <!-- WORLD_AMBIENT: offset italic with gold left border -->
            <span class="ambient-mark" aria-hidden="true">◍</span>
            <p class="prose-italic ambient-text selectable">{text}</p>
        {/if}
    </article>
{/if}

<style>
    .beat {
        position: relative;
        padding: 0.85rem 0;
        border-bottom: 1px solid var(--line-soft);
    }
    .beat:last-child { border-bottom: none; }

    /* ---------- SCENE_SET hero ---------- */
    .beat[data-beat='scene_set'] {
        padding: 1.6rem 0 1.4rem;
        margin: 0.4rem 0;
        background: linear-gradient(180deg, rgba(169, 126, 60, 0.05), transparent 60%);
    }
    .scene-header { margin-bottom: 0.5rem; }
    .prose-scene {
        font-size: var(--t-prose);
        line-height: 1.6;
        color: var(--ink);
    }

    /* ---------- ACTION tight ---------- */
    .beat[data-beat='action'] .prose-action {
        font-size: var(--t-base);
        line-height: 1.55;
        color: var(--ink);
    }

    /* ---------- SOCIAL ---------- */
    .social-block {
        border-left: 2px solid var(--gold-soft);
        padding-left: 0.85rem;
        margin-left: 0.25rem;
    }
    .prose-social {
        font-size: var(--t-base);
        color: var(--ink);
    }

    /* ---------- Actions row (the player's submitted actions) ---------- */
    .actions-row {
        list-style: none;
        margin: 0.55rem 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .action-chip {
        font-size: var(--t-xs);
        color: var(--ink-soft);
        display: flex;
        gap: 0.45rem;
        align-items: baseline;
    }
    .action-author {
        font-family: var(--font-display);
        font-size: var(--t-xs);
        font-weight: 600;
        letter-spacing: 0.08em;
        color: var(--accent);
        flex-shrink: 0;
    }
    .action-text {
        font-family: var(--font-ui);
        color: var(--ink-soft);
        line-height: 1.4;
    }

    /* ---------- Audit row ---------- */
    .audit-row {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin-top: 0.45rem;
    }
    .chip.warn { color: var(--resolve); border-color: var(--gold-soft); }
    .chip.bad { color: var(--hp); border-color: var(--hp); }
    .ruling-preview {
        margin-top: 0.5rem;
        padding: 0.6rem;
        background: var(--inset);
        border: 1px solid var(--line-soft);
        border-radius: var(--radius-sm);
        font-family: ui-monospace, Menlo, monospace;
        font-size: 11px;
        line-height: 1.4;
        color: var(--ink-soft);
        max-height: 240px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
    }

    /* ---------- WORLD_AMBIENT ---------- */
    .beat[data-beat='world_ambient'] {
        padding: 0.65rem 0 0.65rem 1rem;
        margin: 0.2rem 0;
        border-left: 2px solid var(--gold);
        background: transparent;
    }
    .ambient-mark {
        position: absolute;
        left: -0.65rem;
        top: 0.6rem;
        color: var(--gold);
        font-size: var(--t-sm);
        background: var(--page);
        padding: 0 0.2rem;
    }
    .ambient-text {
        font-size: var(--t-sm);
        color: var(--ink-soft);
    }

    /* ---------- WHISPER ---------- */
    .beat[data-beat='whisper'] {
        padding: 0.55rem 0.8rem;
        margin: 0.3rem 0;
        border: 1px dashed var(--line-strong);
        border-radius: var(--radius-sm);
        background: var(--inset);
    }
    .whisper-tag {
        font-family: var(--font-display);
        font-size: var(--t-xs);
        font-weight: 600;
        letter-spacing: 0.16em;
        color: var(--corruption);
        text-transform: uppercase;
    }
    .whisper-text {
        font-size: var(--t-sm);
        color: var(--ink-soft);
        margin-top: 0.25rem;
    }
</style>
