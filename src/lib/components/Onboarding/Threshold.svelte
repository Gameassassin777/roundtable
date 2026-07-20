<script lang="ts">
    // Threshold transition: brief full-screen overlay between Soul Forge accept
    // and the game view. Plays a portal-crossing animation while the genesis
    // beat lands on the chat log. Fades itself out once the world speaks.
    type Props = {
        characterName: string;
        classTitle: string;
        stage: 'crossing' | 'arrived' | 'failed';
    };
    let { characterName, classTitle, stage }: Props = $props();
</script>

<div class="threshold" data-stage={stage} role="status" aria-live="polite">
    <div class="veil" aria-hidden="true"></div>
    <div class="portal" aria-hidden="true">
        <div class="ring r1"></div>
        <div class="ring r2"></div>
        <div class="ring r3"></div>
        <div class="core"></div>
    </div>
    <div class="passage">
        {#if stage === 'crossing'}
            <span class="eyebrow">Crossing the threshold</span>
            <p class="prose-italic passage-line">{characterName} steps through…</p>
        {:else if stage === 'arrived'}
            <span class="eyebrow arrived">The world opens</span>
            <p class="prose-italic passage-line">{classTitle} — arrived.</p>
        {:else}
            <span class="eyebrow">The threshold falters</span>
            <p class="prose-italic passage-line">The way will open on your first action.</p>
        {/if}
    </div>
</div>

<style>
    .threshold {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        overflow: hidden;
    }

    .veil {
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at center, rgba(40, 30, 20, 0) 0%, rgba(40, 30, 20, 0.92) 70%);
        animation: veil-in 0.8s ease-out forwards;
    }
    @keyframes veil-in {
        from { background: radial-gradient(circle at center, rgba(40, 30, 20, 0) 0%, rgba(40, 30, 20, 0) 70%); }
        to { background: radial-gradient(circle at center, rgba(40, 30, 20, 0) 0%, rgba(40, 30, 20, 0.92) 70%); }
    }
    .threshold[data-stage='arrived'] .veil { animation: veil-out 1.2s ease-in forwards; }
    .threshold[data-stage='failed'] .veil { animation: veil-out 1.2s ease-in forwards; }
    @keyframes veil-out {
        from { background: radial-gradient(circle at center, rgba(40, 30, 20, 0) 0%, rgba(40, 30, 20, 0.92) 70%); }
        to { background: radial-gradient(circle at center, rgba(40, 30, 20, 0) 0%, rgba(40, 30, 20, 0) 70%); opacity: 0; }
    }

    .portal {
        position: relative;
        width: 220px;
        height: 220px;
    }
    .ring {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 1px solid var(--gold);
        opacity: 0;
        animation: ring-expand 2.4s linear infinite;
    }
    .ring.r2 { animation-delay: 0.8s; }
    .ring.r3 { animation-delay: 1.6s; }
    @keyframes ring-expand {
        0% { transform: scale(0.2); opacity: 0; border-color: var(--accent); }
        20% { opacity: 0.9; }
        100% { transform: scale(1.6); opacity: 0; border-color: var(--gold); }
    }
    .core {
        position: absolute;
        inset: 50% 50% 50% 50%;
        width: 12px;
        height: 12px;
        margin: -6px 0 0 -6px;
        background: var(--gold);
        border-radius: 50%;
        box-shadow: 0 0 24px 8px var(--gold-soft), 0 0 4px 2px rgba(255, 240, 200, 0.4);
        animation: core-pulse 2.4s ease-in-out infinite;
    }
    @keyframes core-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.4); }
    }
    .threshold[data-stage='arrived'] .portal,
    .threshold[data-stage='failed'] .portal {
        animation: portal-fade 1s ease-out forwards;
    }
    @keyframes portal-fade {
        to { opacity: 0; transform: scale(0.6); }
    }

    .passage {
        position: absolute;
        bottom: 30%;
        left: 0; right: 0;
        text-align: center;
        padding: 0 1rem;
    }
    .passage .eyebrow { color: var(--gold); }
    /* Arrived = the world opens: screen gold with a soft bloom. It was
       --accent (burgundy) — dark red on the 0.92-dark veil, near-invisible. */
    .passage .eyebrow.arrived {
        color: var(--gold-screen);
        text-shadow: 0 0 18px rgba(224, 178, 99, 0.5), 0 1px 3px rgba(0, 0, 0, 0.7);
    }
    .passage-line {
        font-size: var(--t-prose);
        color: #fdf6ec;
        margin-top: 0.4rem;
    }
    .threshold[data-stage='arrived'] .passage,
    .threshold[data-stage='failed'] .passage {
        animation: passage-fade 1s ease-out forwards;
    }
    @keyframes passage-fade {
        to { opacity: 0; }
    }
</style>
