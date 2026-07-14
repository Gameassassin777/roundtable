<script lang="ts">
    // ActionSummon — collapsed pill that expands into the action sheet.
    //
    // Two states:
    //   pill  — centered, low-opacity, thumb-reachable. "Press to act" prompt.
    //   sheet — slides up, contains textarea + templates + whisper + send.
    //
    // Pill auto-pulses ("breathes") briefly when loading completes to draw
    // attention to the user's turn. Sheet collapses on submit / backdrop tap /
    // Escape / swipe-down on the handle.

    import { ACTION_TEMPLATES } from '$lib/actionTemplates';
    import { onMount, onDestroy } from 'svelte';

    type Props = {
        onsubmit: (text: string, whisper: boolean) => void;
        disabled?: boolean;
        whisperInFlight?: boolean;
        authorName: string;
        isLoading?: boolean;
    };

    let {
        onsubmit,
        disabled = false,
        whisperInFlight = false,
        authorName,
        isLoading = false
    }: Props = $props();

    let open = $state(false);
    let value = $state('');
    let whisper = $state(false);
    let showTemplates = $state(false);
    let el: HTMLTextAreaElement | null = $state(null);

    // Action recall (per-session, not persisted)
    let history: string[] = [];
    let cursor = 0;
    let draft = '';

    // Pill breathing — fires once when loading goes true → false.
    let lastLoading = false;
    let breatheUntil = $state(0);

    $effect(() => {
        if (lastLoading && !isLoading && !open) {
            breatheUntil = Date.now() + 2400;
        }
        lastLoading = isLoading;
    });
    let breathing = $derived(Date.now() < breatheUntil);

    // Tick to update breathing flag when timer expires
    let now = $state(Date.now());
    let interval: ReturnType<typeof setInterval>;
    onMount(() => {
        interval = setInterval(() => { now = Date.now(); }, 500);
    });
    onDestroy(() => clearInterval(interval));

    function expand() {
        if (disabled) return;
        open = true;
        breatheUntil = 0;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => el?.focus());
        });
    }
    function collapse() {
        open = false;
        showTemplates = false;
    }
    function toggle() { open ? collapse() : expand(); }

    function submit() {
        const trimmed = value.trim();
        if (!trimmed || disabled) return;
        onsubmit(trimmed, whisper);
        if (trimmed) {
            history.push(trimmed);
            cursor = history.length;
        }
        value = '';
        whisper = false;
        collapse();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
            return;
        }
        if (e.key === 'Escape') { collapse(); return; }
        // Recall — Up/Down through history
        if (e.key === 'ArrowUp' && el && el.selectionStart === 0 && el.selectionEnd === 0) {
            if (history.length === 0) return;
            if (cursor === history.length) draft = value;
            cursor = Math.max(0, cursor - 1);
            value = history[cursor] || '';
            e.preventDefault();
        } else if (e.key === 'ArrowDown' && el && el.selectionStart === value.length) {
            if (cursor >= history.length - 1) {
                cursor = history.length;
                value = draft;
            } else {
                cursor = Math.min(history.length, cursor + 1);
                value = history[cursor] || draft;
            }
            e.preventDefault();
        }
    }

    function applyTemplate(tpl: { label: string; stem: string }) {
        value = tpl.stem;
        showTemplates = false;
        requestAnimationFrame(() => {
            if (el) {
                el.focus();
                el.setSelectionRange(el.value.length, el.value.length);
            }
        });
    }

    // Global keyboard: "/" opens sheet, Esc closes (handled above)
    function handleGlobalKey(e: KeyboardEvent) {
        if (e.key === '/' && !open && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
            e.preventDefault();
            expand();
        }
    }
    onMount(() => window.addEventListener('keydown', handleGlobalKey));
    onDestroy(() => window.removeEventListener('keydown', handleGlobalKey));

    // Cycling placeholder prompts
    const PROMPTS = [
        `What does ${authorName} do?`,
        `Speak, ${authorName}.`,
        `Act.`,
        `${authorName}?`,
        `Your move.`,
    ];
    let promptIndex = $state(0);
    onMount(() => {
        interval = setInterval(() => {
            if (!value) promptIndex = (promptIndex + 1) % PROMPTS.length;
        }, 3800);
    });
    onDestroy(() => clearInterval(interval));
    let placeholder = $derived(whisper ? `Whisper privately as ${authorName}…` : PROMPTS[promptIndex]);

    // Swipe-down to dismiss
    let dragStartY: number | null = null;
    let dragOffset = $state(0);
    function onTouchStart(e: TouchEvent) {
        if (!open) return;
        dragStartY = e.touches[0].clientY;
    }
    function onTouchMove(e: TouchEvent) {
        if (dragStartY === null) return;
        const delta = e.touches[0].clientY - dragStartY;
        dragOffset = Math.max(0, delta);
    }
    function onTouchEnd() {
        if (dragOffset > 80) collapse();
        dragOffset = 0;
        dragStartY = null;
    }
</script>

<svelte:window onclick={(e) => {
    if (!open) return;
    const t = e.target as HTMLElement;
    if (!t.closest('[data-action-sheet]') && !t.closest('[data-action-pill]')) collapse();
}} />

{#if !open}
    <button
        class="action-pill"
        class:breathing
        class:busy={isLoading || disabled}
        data-action-pill
        onclick={expand}
        disabled={disabled && !isLoading}
        aria-label={isLoading ? 'World is responding' : 'Press to act'}
    >
        {#if isLoading}
            <span class="pill-dot" aria-hidden="true"></span>
            <span class="pill-text">The world responds…</span>
        {:else if whisperInFlight}
            <span class="pill-text">Whisper in flight…</span>
        {:else}
            <span class="pill-glyph" aria-hidden="true">✦</span>
            <span class="pill-text">Press to act</span>
        {/if}
    </button>
{/if}

{#if open}
    <div class="backdrop" onclick={collapse}></div>

    <form
        class="action-sheet"
        data-action-sheet
        data-whisper={whisper}
        style="transform: translateY({dragOffset}px)"
        onsubmit={(e) => { e.preventDefault(); submit(); }}
        ontouchstart={onTouchStart}
        ontouchmove={onTouchMove}
        ontouchend={onTouchEnd}
        role="dialog"
        aria-label="Action input"
    >
        <div class="handle" aria-hidden="true"></div>

        {#if showTemplates}
            <div class="template-strip">
                {#each ACTION_TEMPLATES as tpl}
                    <button
                        type="button"
                        class="tpl-chip"
                        onclick={() => applyTemplate(tpl)}
                    >
                        {tpl.label}
                    </button>
                {/each}
            </div>
        {/if}

        <textarea
            bind:this={el}
            bind:value
            onkeydown={handleKeydown}
            {placeholder}
            rows="1"
            disabled={disabled}
            aria-label="Action input"
        ></textarea>

        <div class="sheet-row">
            <button
                type="button"
                class="btn-ghost icon-btn"
                class:active={showTemplates}
                onclick={() => (showTemplates = !showTemplates)}
                title="Action templates"
                aria-label="Action templates"
            >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4">
                    <rect x="2" y="2" width="12" height="12" rx="1.5"/>
                    <path d="M5 6h6M5 9h4"/>
                </svg>
            </button>
            <button
                type="button"
                class="btn-ghost icon-btn whisper-btn"
                class:active={whisper}
                onclick={() => (whisper = !whisper)}
                title="Whisper privately to the DM"
                aria-pressed={whisper}
                aria-label="Toggle whisper"
            >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4">
                    <path d="M2 4h9v6H6l-3 2.5V10H2z"/>
                    <path d="M14 6v2" opacity="0.6"/>
                </svg>
                {#if whisper}<span class="lbl">Whisper</span>{/if}
            </button>
            <div class="spacer"></div>
            <button type="submit" class="btn-primary send-btn" disabled={disabled || !value.trim()}>
                {whisperInFlight ? '…' : 'Send'}
            </button>
        </div>
    </form>
{/if}

<style>
    /* ---------- pill ---------- */
    .action-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        padding: 0.6rem 1.1rem;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 999px;
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-sm);
        color: var(--ink-soft);
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(60, 40, 20, 0.07);
        opacity: 0.82;
        transition: opacity 0.22s ease, transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
    }
    .action-pill:hover, .action-pill:focus-visible {
        opacity: 1;
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(60, 40, 20, 0.12);
        border-color: var(--gold-soft);
        color: var(--ink);
        outline: none;
    }
    .action-pill.breathing {
        animation: pill-breathe 1.2s ease-out;
        opacity: 1;
        border-color: var(--gold);
    }
    .action-pill.busy {
        cursor: default;
        opacity: 0.75;
    }
    .action-pill.busy:hover { transform: none; }
    @keyframes pill-breathe {
        0%   { box-shadow: 0 0 0 0 rgba(169, 126, 60, 0.4); }
        50%  { box-shadow: 0 0 0 14px rgba(169, 126, 60, 0); }
        100% { box-shadow: 0 0 0 0 rgba(169, 126, 60, 0); }
    }

    .pill-glyph {
        color: var(--gold);
        font-size: 0.85rem;
        line-height: 1;
    }
    .pill-text {
        letter-spacing: 0.01em;
    }
    .pill-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--gold);
        animation: pill-dot-pulse 1.6s ease-in-out infinite;
    }
    @keyframes pill-dot-pulse {
        0%, 100% { opacity: 0.4; transform: scale(0.85); }
        50%      { opacity: 1; transform: scale(1); }
    }

    /* ---------- backdrop ---------- */
    .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(42, 36, 32, 0.36);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        z-index: 30;
        animation: backdrop-in 0.28s ease-out;
    }
    @keyframes backdrop-in { from { opacity: 0; } to { opacity: 1; } }

    /* ---------- sheet ---------- */
    .action-sheet {
        position: fixed;
        left: 0; right: 0; bottom: 0;
        max-width: 720px;
        margin: 0 auto;
        padding: 0.55rem 0.9rem;
        padding-bottom: max(0.55rem, var(--safe-bottom));
        padding-left: max(0.9rem, var(--safe-left));
        padding-right: max(0.9rem, var(--safe-right));
        background: var(--card);
        border-top: 1px solid var(--line);
        border-radius: 6px 6px 0 0;
        box-shadow: 0 -8px 32px rgba(60, 40, 20, 0.16);
        z-index: 31;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        animation: sheet-in 0.36s cubic-bezier(0.2, 0.7, 0.2, 1);
        transition: transform 0.18s ease-out;
    }
    .action-sheet[data-whisper='true'] {
        background: linear-gradient(180deg, rgba(110, 79, 168, 0.07), var(--card) 60%);
        border-top-color: var(--corruption);
    }
    @keyframes sheet-in {
        from { transform: translateY(100%); opacity: 0.4; }
        to   { transform: translateY(0); opacity: 1; }
    }

    .handle {
        width: 36px; height: 4px;
        background: var(--line-strong);
        border-radius: 999px;
        margin: 0 auto 0.15rem;
        opacity: 0.6;
        flex-shrink: 0;
    }

    textarea {
        width: 100%;
        min-height: 56px;
        max-height: 180px;
        font-family: var(--font-prose);
        font-size: 1.06rem;
        line-height: 1.5;
        padding: 0.55rem 0.15rem 0.65rem;
        background: transparent;
        border: none;
        border-bottom: 1px solid var(--line-soft);
        border-radius: 0;
        color: var(--ink);
        resize: none;
        -webkit-appearance: none;
        appearance: none;
        transition: border-color 0.2s ease;
    }
    textarea:focus {
        outline: none;
        border-bottom-color: var(--gold);
    }
    .action-sheet[data-whisper='true'] textarea {
        border-bottom-color: var(--corruption);
    }

    .sheet-row {
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }
    .spacer { flex: 1; }

    .icon-btn {
        width: 40px; height: 40px;
        min-height: 40px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: var(--radius-sm);
        color: var(--ink-soft);
        cursor: pointer;
        transition: color 0.18s ease, background 0.18s ease;
    }
    .icon-btn:hover {
        background: var(--inset);
        color: var(--ink);
    }
    .icon-btn.active {
        color: var(--accent);
    }
    .whisper-btn { gap: 0.35rem; width: auto; padding: 0 0.7rem; }
    .whisper-btn .lbl {
        font-family: var(--font-ui);
        font-size: var(--t-xs);
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
    .whisper-btn.active {
        background: var(--corruption);
        color: #fdf6ec;
    }

    .send-btn {
        padding: 0.5rem 1.3rem;
        font-family: var(--font-display);
        letter-spacing: 0.08em;
        min-height: 40px;
    }

    .template-strip {
        display: flex;
        gap: 0.35rem;
        overflow-x: auto;
        padding-bottom: 0.2rem;
        scrollbar-width: none;
    }
    .template-strip::-webkit-scrollbar { display: none; }
    .tpl-chip {
        flex-shrink: 0;
        padding: 0.3rem 0.65rem;
        background: transparent;
        border: 1px solid var(--line-soft);
        border-radius: var(--radius-sm);
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-xs);
        color: var(--ink-soft);
        cursor: pointer;
        white-space: nowrap;
        transition: color 0.18s ease, border-color 0.18s ease;
    }
    .tpl-chip:hover {
        color: var(--ink);
        border-color: var(--gold-soft);
    }

    @media (prefers-reduced-motion: reduce) {
        .action-pill, .action-sheet, .backdrop, .pill-dot, .action-pill.breathing {
            animation: none !important;
            transition: none !important;
        }
    }
</style>
