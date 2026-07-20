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
    import { playHover, playClick } from '$lib/audio/ambient';
    import { onMount, onDestroy, flushSync } from 'svelte';
    import { DragGesture } from '@use-gesture/vanilla';
    import { ui } from '$lib/stores/uiStore.svelte';
    import Icon from '$lib/components/Icon.svelte';

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
    // Tick to update breathing flag when timer expires. `now` must be the
    // derived dependency — Date.now() alone is not reactive, so the class
    // never cleared on its own.
    let now = $state(Date.now());
    let breathing = $derived(now < breatheUntil);
    let breathInterval: ReturnType<typeof setInterval>;
    onMount(() => {
        breathInterval = setInterval(() => { now = Date.now(); }, 500);
    });
    onDestroy(() => clearInterval(breathInterval));

    function expand() {
        if (disabled) return;
        open = true;
        breatheUntil = 0;
        // iOS raises the soft keyboard ONLY when focus() runs inside the tap's
        // synchronous call stack and the target already exists. The textarea is
        // behind {#if open}, so the old rAF-deferred focus fired after the
        // gesture unwound onto an element that wasn't even mounted yet — iOS
        // silently refused the keyboard. flushSync mounts the sheet now, then we
        // focus in the same stack. No rAF/setTimeout, or the keyboard won't open.
        flushSync();
        el?.focus();
    }
    function collapse() {
        open = false;
        showTemplates = false;
    }
    function toggle() { open ? collapse() : expand(); }

    function submit(asWhisper?: boolean) {
        const trimmed = value.trim();
        if (!trimmed || disabled) return;
        onsubmit(trimmed, asWhisper ?? whisper);
        if (trimmed) {
            history.push(trimmed);
            cursor = history.length;
        }
        value = '';
        whisper = false;
        collapse();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            e.preventDefault();
            // Shift+Enter sends as a whisper regardless of the toggle
            // (documented in Shortcuts); plain Enter respects the toggle.
            submit(e.shiftKey ? true : undefined);
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

    // Global keyboard: "/" opens the sheet, "?" opens Shortcuts. Both are
    // inert while typing, while the sheet is open, or while a modal owns the
    // screen (an expanded sheet behind a modal is invisible — and confusing).
    function handleGlobalKey(e: KeyboardEvent) {
        if (open || ui.openModal) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.key === '/') {
            e.preventDefault();
            expand();
        } else if (e.key === '?') {
            e.preventDefault();
            ui.showModal('shortcuts');
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
    let promptInterval: ReturnType<typeof setInterval>;
    onMount(() => {
        promptInterval = setInterval(() => {
            if (!value) promptIndex = (promptIndex + 1) % PROMPTS.length;
        }, 3800);
    });
    onDestroy(() => clearInterval(promptInterval));
    let placeholder = $derived(whisper ? `Whisper privately as ${authorName}…` : PROMPTS[promptIndex]);

    // Swipe-down to dismiss (via @use-gesture/vanilla — handles edge cases
    // the manual touchstart/touchmove math misses: multi-touch, scroll
    // conflicts, momentum, velocity-based dismissal)
    let dragOffset = $state(0);

    // Keep the sheet flush on top of the iOS soft keyboard and stop the story
    // from being shoved off-screen. When the keyboard opens the visual viewport
    // shrinks to the space above it; we lift the sheet by exactly that overlap
    // (so its bottom edge meets the keyboard — no gap, no black bar) and pin the
    // document scroll to 0 so the narration behind the sheet stays where it is
    // instead of iOS scrolling the whole page up to chase the input.
    let kbLift = $state(0);
    function syncKeyboard() {
        const vv = window.visualViewport;
        if (!vv) return;
        kbLift = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        if (window.scrollY !== 0 || window.pageYOffset !== 0) window.scrollTo(0, 0);
    }
    onMount(() => {
        window.visualViewport?.addEventListener('resize', syncKeyboard);
        window.visualViewport?.addEventListener('scroll', syncKeyboard);
    });
    onDestroy(() => {
        window.visualViewport?.removeEventListener('resize', syncKeyboard);
        window.visualViewport?.removeEventListener('scroll', syncKeyboard);
    });

    function draggable(node: HTMLElement) {
        const gesture = new DragGesture(node, (state: any) => {
            const down = state.down;
            const my = state.movement[1];
            const vy = state.velocity[1];
            if (my > 0) dragOffset = my;
            if (!down) {
                if (my > 100 || (vy > 0.5 && my > 40)) {
                    collapse();
                }
                dragOffset = 0;
            }
        }, {
            axis: 'y',
            filterTaps: true
        });
        return { destroy() { gesture.destroy(); } };
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
        onclick={() => { playClick(); expand(); }}
        onmouseenter={() => playHover()}
        disabled={disabled && !isLoading}
        aria-label={isLoading ? 'World is responding' : 'Press to act'}
    >
        {#if isLoading}
            <span class="pill-dot" aria-hidden="true"></span>
            <span class="pill-text">The world responds…</span>
        {:else if whisperInFlight}
            <span class="pill-text">Whisper in flight…</span>
        {:else}
            <span class="pill-text">Press to act</span>
        {/if}
    </button>
{/if}

{#if open}
    <div class="backdrop" onclick={() => { playClick(); collapse(); }}></div>

    <form
        class="action-sheet film-surface"
        data-action-sheet
        data-whisper={whisper}
        style="bottom: {kbLift}px; transform: translateY({dragOffset}px)"
        onsubmit={(e) => { e.preventDefault(); submit(); }}
        use:draggable
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
                        onclick={() => { playClick(); applyTemplate(tpl); }}
                        onmouseenter={() => playHover()}
                    >
                        {tpl.label}
                    </button>
                {/each}
            </div>
        {/if}

        <div class="input-wrap">
            <pre class="input-mirror" aria-hidden="true">{value + '\n'}</pre>
            <textarea
                bind:this={el}
                bind:value
                onkeydown={handleKeydown}
                {placeholder}
                rows="1"
                disabled={disabled}
                aria-label="Action input"
            ></textarea>
        </div>

        <div class="sheet-row">
            <button
                type="button"
                class="btn-ghost text-btn"
                class:active={showTemplates}
                onclick={() => { playClick(); showTemplates = !showTemplates; }}
                onmouseenter={() => playHover()}
                title="Action templates"
                aria-label="Action templates"
            >
                <span class="lbl">Templates</span>
            </button>
            <button
                type="button"
                class="btn-ghost text-btn whisper-btn"
                class:active={whisper}
                onclick={() => { playClick(); whisper = !whisper; }}
                onmouseenter={() => playHover()}
                title="Whisper privately to the DM"
                aria-pressed={whisper}
                aria-label="Toggle whisper"
            >
                <span class="lbl">Whisper</span>
            </button>
            <div class="spacer"></div>
            <button type="submit" class="btn-primary send-btn" onclick={() => playClick()} onmouseenter={() => !disabled && value.trim() && playHover()} disabled={disabled || !value.trim()} aria-label="Submit action">
                <span class="send-glyph">{#if whisperInFlight}…{:else}<Icon name="send" size={16} />{/if}</span>
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
        /* Black, not parchment. A cream pill floating over a real stage reads
           as a web button pasted onto a film frame. It sits in the scrim now,
           so it belongs to the scrim. */
        background: rgba(10, 12, 14, 0.55);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid color-mix(in srgb, var(--gold-screen) 28%, transparent);
        border-radius: 999px;
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-sm);
        color: #ddd5c4;
        cursor: pointer;
        box-shadow: 0 2px 14px rgba(0, 0, 0, 0.45);
        opacity: 0.92;
        transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.22s ease, border-color 0.22s ease;
        pointer-events: auto;
    }
    .action-pill:hover, .action-pill:focus-visible {
        opacity: 1;
        transform: translateY(-2px);
        box-shadow: 0 6px 22px rgba(0, 0, 0, 0.55);
        border-color: color-mix(in srgb, var(--gold-screen) 70%, transparent);
        color: #f4efe3;
        outline: none;
    }
    .action-pill.breathing {
        animation: pill-breathe 1.2s ease-out;
        opacity: 1;
        border-color: color-mix(in srgb, var(--gold-screen) 70%, transparent);
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
        padding: 0.35rem 0.8rem;
        padding-bottom: max(0.35rem, var(--safe-bottom));
        padding-left: max(0.8rem, var(--safe-left));
        padding-right: max(0.8rem, var(--safe-right));
        background: var(--card);
        border-top: 1px solid var(--gold-soft);
        box-shadow: var(--shadow-sheet);
        border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
        z-index: 31;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        animation: sheet-in 0.36s cubic-bezier(0.2, 0.8, 0.2, 1);
        transition: transform 0.18s ease-out;
    }
    .action-sheet[data-whisper='true'] {
        background: linear-gradient(180deg, rgba(110, 79, 168, 0.07), var(--card) 60%);
        border-top: 1px solid var(--corruption);
    }
    @keyframes sheet-in {
        from { transform: translateY(100%); opacity: 0.4; }
        to   { transform: translateY(0); opacity: 1; }
    }

    .handle {
        width: 30px; height: 3px;
        background: var(--line-strong);
        border-radius: 999px;
        margin: 0 auto 0.05rem;
        opacity: 0.5;
        flex-shrink: 0;
    }

    /* Auto-expanding textarea — grid+pre mirror pattern.
       The <pre> mirrors content and forces the grid row to grow;
       the textarea matches its height. Identical typography on both. */
    .input-wrap {
        display: grid;
        align-items: start;
    }
    .input-mirror {
        grid-area: 1 / 1;
        font-family: var(--font-prose);
        font-size: 1rem;
        line-height: 1.45;
        padding: 0.35rem 0.1rem 0.4rem;
        margin: 0;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow: hidden;
        visibility: hidden;
        min-height: 40px;
        max-height: 132px;
    }
    textarea {
        grid-area: 1 / 1;
        width: 100%;
        font-family: var(--font-prose);
        font-size: 1rem;
        line-height: 1.45;
        padding: 0.35rem 0.1rem 0.4rem;
        background: transparent;
        border: none;
        border-bottom: 1px solid var(--line-soft);
        border-radius: 0;
        color: var(--ink);
        resize: none;
        overflow: hidden;
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

    .text-btn {
        min-height: 38px;
        padding: 0 0.7rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: 1px solid var(--line-soft);
        border-radius: var(--radius-sm);
        color: var(--ink-soft);
        cursor: pointer;
        transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease;
    }
    .text-btn:hover {
        color: var(--ink);
        border-color: var(--gold-soft);
    }
    .text-btn .lbl {
        font-family: var(--font-ui);
        font-size: var(--t-xs);
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
    .text-btn.active {
        color: var(--accent);
        border-color: var(--accent);
        background: var(--accent-soft);
    }
    .whisper-btn.active {
        background: var(--corruption);
        border-color: var(--corruption);
        color: #fdf6ec;
    }

    .send-btn {
        width: 40px; height: 40px;
        min-height: 40px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-pill);
    }
    .send-glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-ui);
        font-size: 1.1rem;
        font-weight: 600;
        line-height: 1;
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
