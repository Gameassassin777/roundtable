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
        // The latest world beat — shown floating above the input so you can see
        // what you're responding to while you type.
        contextBeat?: { narration?: string } | null;
    };

    let {
        onsubmit,
        disabled = false,
        whisperInFlight = false,
        authorName,
        isLoading = false,
        contextBeat = null
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
    <!-- Compose overlay: the world stays in focus behind (no dim). The last beat
         floats in a box above a small input; buttons kept minimal for immersion.
         The whole stack rides above the keyboard via kbLift (+ resizes-content). -->
    <div
        class="composer"
        data-action-sheet
        data-whisper={whisper}
        style="bottom: {kbLift}px; transform: translateY({dragOffset}px)"
        role="dialog"
        aria-label="Compose your action"
    >
        {#if contextBeat?.narration}
            <div class="context-caption" aria-label="What just happened">
                <p class="context-prose selectable">{contextBeat.narration}</p>
            </div>
        {/if}

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

        <form
            class="compose-bar"
            data-whisper={whisper}
            onsubmit={(e) => { e.preventDefault(); submit(); }}
            use:draggable
        >
            <button
                type="button"
                class="mini-btn"
                class:active={showTemplates}
                onclick={() => { playClick(); showTemplates = !showTemplates; }}
                onmouseenter={() => playHover()}
                title="Action templates"
                aria-label="Action templates"
            >+</button>

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

            <button
                type="button"
                class="mini-btn whisper-btn"
                class:active={whisper}
                onclick={() => { playClick(); whisper = !whisper; }}
                onmouseenter={() => playHover()}
                title="Whisper privately to the DM"
                aria-pressed={whisper}
                aria-label="Toggle whisper"
            ><span class="wdot" aria-hidden="true"></span></button>

            <button type="submit" class="send-btn" onclick={() => playClick()} onmouseenter={() => !disabled && value.trim() && playHover()} disabled={disabled || !value.trim()} aria-label="Submit action">
                <span class="send-glyph">{#if whisperInFlight}…{:else}<Icon name="send" size={15} />{/if}</span>
            </button>
        </form>
    </div>
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

    /* ---------- compose overlay ----------
       Bottom-anchored, transparent stack that rides above the keyboard (bottom =
       kbLift). No backdrop — the world stays in focus behind it. The container
       is click-through; only the caption and bar catch taps. */
    .composer {
        position: fixed;
        left: 0; right: 0;
        bottom: 0;
        max-width: 720px;
        margin: 0 auto;
        padding: 0 max(0.6rem, var(--safe-right)) max(0.5rem, var(--safe-bottom)) max(0.6rem, var(--safe-left));
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        z-index: 31;
        pointer-events: none;
        transition: transform 0.18s ease-out;
        animation: composer-in 0.28s ease-out;
    }
    .composer > * { pointer-events: auto; }
    @keyframes composer-in { from { opacity: 0; } to { opacity: 1; } }

    /* Last beat, floating in a dark glass box over the world. */
    .context-caption {
        max-height: 32vh;
        overflow-y: auto;
        background: rgba(8, 10, 12, 0.66);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid color-mix(in srgb, var(--gold-screen) 20%, transparent);
        border-radius: 14px;
        padding: 0.65rem 0.85rem;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.42);
        scrollbar-width: thin;
    }
    .context-prose {
        font-family: var(--font-prose);
        font-size: 0.98rem;
        line-height: 1.5;
        color: #f1ece0;
        margin: 0;
        text-wrap: pretty;
    }

    /* Small dark input bar — matches the pill/caption, stays filmic. */
    .compose-bar {
        display: flex;
        align-items: flex-end;
        gap: 0.35rem;
        background: rgba(8, 10, 12, 0.66);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid color-mix(in srgb, var(--gold-screen) 26%, transparent);
        border-radius: 18px;
        padding: 0.3rem 0.35rem;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.42);
        transition: border-color 0.2s ease;
    }
    .compose-bar[data-whisper='true'] {
        border-color: color-mix(in srgb, var(--corruption) 55%, transparent);
    }

    /* Auto-expanding textarea — grid+pre mirror pattern. The <pre> mirrors the
       content to grow the row; the textarea matches its height. */
    .input-wrap {
        flex: 1;
        min-width: 0;
        display: grid;
        align-items: end;
    }
    .input-mirror {
        grid-area: 1 / 1;
        font-family: var(--font-prose);
        font-size: 0.98rem;
        line-height: 1.4;
        padding: 0.4rem 0.35rem;
        margin: 0;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow: hidden;
        visibility: hidden;
        min-height: 22px;
        max-height: 92px;
    }
    textarea {
        grid-area: 1 / 1;
        width: 100%;
        font-family: var(--font-prose);
        font-size: 0.98rem;
        line-height: 1.4;
        padding: 0.4rem 0.35rem;
        background: transparent;
        border: none;
        border-radius: 0;
        color: #f1ece0;
        resize: none;
        overflow-y: auto;
        -webkit-appearance: none;
        appearance: none;
    }
    textarea:focus { outline: none; }
    textarea::placeholder { color: rgba(230, 224, 210, 0.5); }

    /* Minimal round controls. */
    .mini-btn {
        flex-shrink: 0;
        width: 32px; height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: 1px solid color-mix(in srgb, var(--gold-screen) 22%, transparent);
        border-radius: 50%;
        color: #d8d0be;
        font-size: 1.1rem;
        line-height: 1;
        cursor: pointer;
        transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease;
    }
    .mini-btn:hover {
        color: #f4efe3;
        border-color: color-mix(in srgb, var(--gold-screen) 55%, transparent);
    }
    .mini-btn.active {
        color: var(--gold-screen);
        border-color: var(--gold-screen);
    }
    .wdot {
        width: 7px; height: 7px;
        border-radius: 50%;
        background: currentColor;
    }
    .whisper-btn.active {
        color: #d9c7f0;
        border-color: color-mix(in srgb, var(--corruption) 70%, transparent);
        background: color-mix(in srgb, var(--corruption) 22%, transparent);
    }

    .send-btn {
        flex-shrink: 0;
        width: 36px; height: 36px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 50%;
        background: var(--gold-screen);
        color: #14100a;
        cursor: pointer;
        transition: transform 0.06s ease, opacity 0.2s ease, background 0.2s ease;
    }
    .send-btn:disabled { opacity: 0.4; cursor: default; }
    .send-btn:active:not(:disabled) { transform: scale(0.94); }
    .compose-bar[data-whisper='true'] .send-btn {
        background: var(--corruption);
        color: #fdf6ec;
    }
    .send-glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
    }

    .template-strip {
        display: flex;
        gap: 0.35rem;
        overflow-x: auto;
        padding: 0.1rem;
        scrollbar-width: none;
    }
    .template-strip::-webkit-scrollbar { display: none; }
    .tpl-chip {
        flex-shrink: 0;
        padding: 0.35rem 0.7rem;
        background: rgba(8, 10, 12, 0.66);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid color-mix(in srgb, var(--gold-screen) 22%, transparent);
        border-radius: 999px;
        font-family: var(--font-prose);
        font-style: italic;
        font-size: 0.85rem;
        color: #e6dfce;
        cursor: pointer;
        white-space: nowrap;
        transition: color 0.18s ease, border-color 0.18s ease;
    }
    .tpl-chip:hover {
        color: #f4efe3;
        border-color: color-mix(in srgb, var(--gold-screen) 55%, transparent);
    }

    @media (prefers-reduced-motion: reduce) {
        .action-pill, .composer, .pill-dot, .action-pill.breathing {
            animation: none !important;
            transition: none !important;
        }
    }
</style>
