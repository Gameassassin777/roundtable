<script lang="ts">
    import { onMount } from 'svelte';
    import { playHover, playClick } from '$lib/audio/ambient';
    import * as sfx from '$lib/audio/sfx';

    type Props = {
        characterName: string;
        onClose: () => void;
    };

    let { characterName, onClose }: Props = $props();

    let currentStep = $state(0);
    let targetRect = $state<{ top: number; left: number; width: number; height: number } | null>(null);

    const STEPS = [
        {
            title: "Welcome, Traveler",
            text: "Welcome to Round Table, a diegetic, collaborative RPG. The world engine narrates responses to your actions. Let us orient you to the interface.",
            selector: null
        },
        {
            title: "1. The Chronicle",
            text: "Located in the top-left, this book archives the story. Every action, roll, and description is recorded here. Click it to review history or search the text.",
            selector: ".history-handle"
        },
        {
            title: "2. The Seal of the Table",
            text: "Tap the coin in the top-right to open the game menu. From here, you can open the Map, adjust settings, and manage your game files.",
            selector: ".corner-anchor"
        },
        {
            title: "3. Your Codex",
            text: "Your codex lists inventory, character stats (HP, Resolve, Corruption), and companions. Open it via the game menu or by swiping from the edge.",
            selector: null
        },
        {
            title: "4. Act & Whisper",
            text: "Tap this pill at the bottom to write actions, cast spells, speak, or whisper secret thoughts. Type naturally—the world listens.",
            selector: ".action-pill"
        },
        {
            title: "Adventure Awaits",
            text: "May your name be etched in the annals of history. Your destiny is yours to write.",
            selector: null
        }
    ];

    function updateHighlight() {
        const step = STEPS[currentStep];
        if (step.selector) {
            const el = document.querySelector(step.selector);
            if (el) {
                const r = el.getBoundingClientRect();
                targetRect = {
                    top: r.top + window.scrollY,
                    left: r.left + window.scrollX,
                    width: r.width,
                    height: r.height
                };
                return;
            }
        }
        targetRect = null;
    }

    function nextStep() {
        playClick();
        if (currentStep < STEPS.length - 1) {
            currentStep += 1;
            updateHighlight();
        } else {
            finish();
        }
    }

    function prevStep() {
        playClick();
        if (currentStep > 0) {
            currentStep -= 1;
            updateHighlight();
        }
    }

    function finish() {
        playClick();
        sfx.play('turn-result');
        localStorage.setItem(`rt_tutorial_seen_${characterName}`, 'true');
        onClose();
    }

    onMount(() => {
        sfx.play('turn-result');
        // Small delay to let initial layout stabilize before computing element sizes
        const timer = setTimeout(updateHighlight, 300);
        
        // Listen for window resize to recompute overlay positions
        window.addEventListener('resize', updateHighlight);
        
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateHighlight);
        };
    });
</script>

<!-- Backdrop overlay -->
<div class="tutorial-backdrop" onclick={finish} role="presentation"></div>

<!-- Custom cut-out focus spotlight using large box-shadow -->
{#if targetRect}
    <div 
        class="highlight-ring" 
        style="
            top: {targetRect.top - 4}px; 
            left: {targetRect.left - 4}px; 
            width: {targetRect.width + 8}px; 
            height: {targetRect.height + 8}px;
        "
    ></div>
{/if}

<!-- Guided Card -->
<div class="tutorial-card" class:centered={!STEPS[currentStep].selector}>
    <header class="card-head">
        <span class="step-badge eyebrow">Guidance {currentStep + 1} / {STEPS.length}</span>
        <button class="skip-btn" onclick={finish} onmouseenter={() => playHover()} aria-label="Skip tutorial">Skip</button>
    </header>
    
    <div class="card-body">
        <h3 class="display">{STEPS[currentStep].title}</h3>
        <p class="prose-italic">{STEPS[currentStep].text}</p>
    </div>

    <footer class="card-footer">
        {#if currentStep > 0}
            <button class="btn-ghost" onclick={prevStep} onmouseenter={() => playHover()}>Back</button>
        {:else}
            <div></div>
        {/if}

        <button class="btn-primary" onclick={nextStep} onmouseenter={() => playHover()}>
            {currentStep === STEPS.length - 1 ? 'Begin Quest' : 'Continue'}
        </button>
    </footer>
</div>

<style>
    .tutorial-backdrop {
        position: fixed;
        inset: 0;
        z-index: 95;
        background: rgba(30, 20, 15, 0.2);
        cursor: pointer;
    }

    /* Cut-out box shadow mask creates a perfect spotlight */
    .highlight-ring {
        position: absolute;
        border: 2px solid var(--gold);
        border-radius: var(--radius-sm);
        box-shadow: 0 0 0 9999px rgba(30, 20, 15, 0.45), 0 0 15px var(--gold);
        pointer-events: none;
        z-index: 96;
        transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        animation: highlight-pulse 1.8s ease-in-out infinite;
    }

    @keyframes highlight-pulse {
        0%, 100% { border-color: var(--gold-soft); box-shadow: 0 0 0 9999px rgba(30, 20, 15, 0.45), 0 0 8px rgba(169, 126, 60, 0.4); }
        50%      { border-color: var(--gold); box-shadow: 0 0 0 9999px rgba(30, 20, 15, 0.45), 0 0 20px rgba(169, 126, 60, 0.8); }
    }

    .tutorial-card {
        position: fixed;
        left: 50%;
        bottom: 3.5rem;
        transform: translateX(-50%);
        width: min(420px, 92vw);
        background: var(--card);
        border: 3px double var(--gold);
        box-shadow: inset 0 0 0 1px var(--gold-soft), 0 10px 32px rgba(60, 40, 20, 0.28);
        border-radius: var(--radius);
        padding: 1.1rem;
        z-index: 97;
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        animation: card-in 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
        transition: bottom 0.3s ease, transform 0.3s ease, top 0.3s ease;
    }

    .tutorial-card.centered {
        top: 50%;
        bottom: auto;
        transform: translate(-50%, -50%);
    }

    @keyframes card-in {
        from { opacity: 0; transform: translate(-50%, 10px); }
        to   { opacity: 1; transform: translate(-50%, 0); }
    }
    .tutorial-card.centered {
        animation: card-in-center 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    @keyframes card-in-center {
        from { opacity: 0; transform: translate(-50%, -46%); }
        to   { opacity: 1; transform: translate(-50%, -50%); }
    }

    .card-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--gold-soft);
        padding-bottom: 0.35rem;
    }

    .step-badge {
        font-size: 9.5px !important;
        letter-spacing: 0.16em;
    }

    .skip-btn {
        background: transparent;
        border: none;
        color: var(--muted);
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-xs);
        cursor: pointer;
        transition: color 0.18s ease;
    }
    .skip-btn:hover {
        color: var(--gold);
    }

    .card-body h3 {
        margin-top: 0.25rem;
        font-size: var(--t-md);
        color: var(--ink);
        letter-spacing: 0.02em;
    }

    .card-body p {
        margin: 0.35rem 0 0;
        font-size: var(--t-sm);
        line-height: 1.5;
        color: var(--ink-soft);
    }

    .card-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 0.45rem;
    }

    .card-footer button {
        min-height: 38px;
    }
</style>
