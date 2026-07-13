<script lang="ts">
    import { ACTION_TEMPLATES } from '$lib/actionTemplates';

    type Props = {
        onsubmit: (text: string, whisper: boolean) => void;
        disabled?: boolean;
        whisperInFlight?: boolean;
        authorName: string;
    };

    let { onsubmit, disabled = false, whisperInFlight = false, authorName }: Props = $props();

    let value = $state('');
    let whisper = $state(false);
    let actionHistory: string[] = [];
    let actionHistoryCursor = 0;
    let actionHistoryDraft = '';
    let el: HTMLTextAreaElement | null = $state(null);
    let showTemplates = $state(false);

    function submit() {
        const trimmed = value.trim();
        if (!trimmed || disabled) return;
        onsubmit(trimmed, whisper);
        if (trimmed) {
            actionHistory.push(trimmed);
            actionHistoryCursor = actionHistory.length;
        }
        value = '';
        whisper = false;
    }

    function handleKeydown(e: KeyboardEvent) {
        // Enter to submit, Shift+Enter for newline
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
            return;
        }
        // Up/Down recall (only when caret at start/end)
        if (e.key === 'ArrowUp' && el && el.selectionStart === 0 && el.selectionEnd === 0) {
            if (actionHistory.length === 0) return;
            if (actionHistoryCursor === actionHistory.length) actionHistoryDraft = value;
            actionHistoryCursor = Math.max(0, actionHistoryCursor - 1);
            value = actionHistory[actionHistoryCursor] || '';
            e.preventDefault();
        } else if (e.key === 'ArrowDown' && el && el.selectionStart === value.length) {
            if (actionHistoryCursor >= actionHistory.length - 1) {
                actionHistoryCursor = actionHistory.length;
                value = actionHistoryDraft;
            } else {
                actionHistoryCursor = Math.min(actionHistory.length, actionHistoryCursor + 1);
                value = actionHistory[actionHistoryCursor] || actionHistoryDraft;
            }
            e.preventDefault();
        }
    }

    function applyTemplate(tpl: { label: string; stem: string; cursor_at_end?: boolean }) {
        value = tpl.stem;
        showTemplates = false;
        requestAnimationFrame(() => {
            if (el) {
                el.focus();
                el.setSelectionRange(el.value.length, el.value.length);
            }
        });
    }
</script>

<div class="action-input" data-whisper={whisper}>
    {#if showTemplates}
        <div class="template-tray panel">
            <header class="eyebrow">Quick actions</header>
            <div class="template-grid">
                {#each ACTION_TEMPLATES as tpl}
                    <button class="tpl-btn" onclick={() => applyTemplate(tpl)}>
                        <span class="tpl-label">{tpl.label}</span>
                    </button>
                {/each}
            </div>
        </div>
    {/if}

    <form class="input-row" onsubmit={(e) => { e.preventDefault(); submit(); }}>
        <button
            type="button"
            class="btn-tiny btn-ghost tpl-toggle"
            onclick={() => (showTemplates = !showTemplates)}
            aria-label="Action templates"
            title="Action templates"
        >
            ⌘
        </button>

        <textarea
            bind:this={el}
            bind:value
            onkeydown={handleKeydown}
            placeholder={whisper ? `Whisper privately as ${authorName}…` : `What does ${authorName} do?`}
            rows="1"
            disabled={disabled}
            aria-label="Action input"
        ></textarea>

        <button
            type="button"
            class="btn-tiny whisper-toggle"
            class:active={whisper}
            onclick={() => (whisper = !whisper)}
            title="Whisper privately to the DM"
            aria-pressed={whisper}
        >
            ◷ Whisper
        </button>

        <button type="submit" class="btn-primary send-btn" disabled={disabled || !value.trim()}>
            {whisperInFlight ? '…' : 'Send'}
        </button>
    </form>
</div>

<style>
    .action-input {
        flex-shrink: 0;
        background: var(--page);
        border-top: 1px solid var(--line);
        padding: 0.5rem 0.6rem;
        padding-bottom: max(0.5rem, var(--safe-bottom));
        padding-left: max(0.6rem, var(--safe-left));
        padding-right: max(0.6rem, var(--safe-right));
        position: relative;
    }
    .action-input[data-whisper='true'] {
        background: rgba(110, 79, 168, 0.06);
        border-top-color: var(--corruption);
    }

    .input-row {
        display: flex;
        align-items: flex-end;
        gap: 0.4rem;
    }

    textarea {
        flex: 1;
        min-height: 44px;
        max-height: 140px;
        font-family: var(--font-ui);
        font-size: 16px;        /* iOS threshold — below this auto-zooms on focus */
        line-height: 1.4;
        padding: 0.55rem 0.8rem;
        background: var(--card);
        border-color: var(--line);
        border-radius: 8px;
        -webkit-appearance: none;
        appearance: none;
    }
    .action-input[data-whisper='true'] textarea {
        border-color: var(--corruption);
        background: var(--card);
    }
    textarea:focus { border-color: var(--accent); }

    .tpl-toggle, .whisper-toggle {
        align-self: flex-end;
        min-height: 44px;
        padding: 0 0.7rem;
    }
    .whisper-toggle.active {
        background: var(--corruption);
        color: #fdf6ec;
        border-color: var(--corruption);
    }
    .send-btn {
        align-self: flex-end;
        min-height: 44px;
    }

    .template-tray {
        position: absolute;
        bottom: calc(100% + 4px);
        left: 0.6rem;
        right: 0.6rem;
        padding: 0.6rem;
        z-index: 5;
    }
    .template-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 0.3rem;
        margin-top: 0.4rem;
    }
    .tpl-btn {
        text-align: left;
        padding: 0.45rem 0.6rem;
        background: var(--inset);
        border: 1px solid var(--line-soft);
        border-radius: var(--radius-sm);
        font-size: var(--t-xs);
        color: var(--ink-soft);
    }
    .tpl-btn:hover {
        background: var(--card);
        color: var(--ink);
    }
    .tpl-label { display: block; font-weight: 500; }
</style>
