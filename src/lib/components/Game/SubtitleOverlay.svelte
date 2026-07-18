<script lang="ts">
    // SubtitleOverlay — the only narration surface in the cinematic layout.
    // Renders ONE beat at a time (the latest), film-subtitle style:
    //   - scene_set: hero card with Cinzel eyebrow + flowing prose + gold rule
    //   - action: tight narration paragraph, ink on paper
    //   - social: indented speaker block with small-caps NPC tag
    //   - world_ambient: italic with gold marker
    //   - whisper: dashed border, purple-tinted
    //
    // When a new beat arrives, the old crossfades out and the new crossfades in.
    // Loading state: subtle stage-label + breathing dots.
    // Error: burgundy-tinted, single line.

    type Beat = {
        id: number | string;
        narration: string;
        beat_profile?: 'scene_set' | 'action' | 'social' | 'world_ambient';
        is_scene_set?: boolean;
        location?: string;
        biome?: string;
    };

    type Props = {
        beat: Beat | null;
        isLoading: boolean;
        turnStageLabel: string;
        error: string | null;
    };

    let { beat, isLoading, turnStageLabel, error }: Props = $props();

    // Crossfade state — keep the previous beat mounted briefly so we can
    // animate it out under the new one. Driven by beat.id changes.
    let outgoing = $state<Beat | null>(null);
    let incoming = $state<Beat | null>(null);
    let phase: 'in' | 'out' = $state('in');

    $effect(() => {
        const next = beat;
        if (!next) {
            if (incoming) {
                outgoing = incoming;
                incoming = null;
                phase = 'out';
                const t = setTimeout(() => { outgoing = null; }, 360);
                return () => clearTimeout(t);
            }
            return;
        }
        if (incoming && (incoming.id === next.id)) return;
        outgoing = incoming;
        incoming = next;
        phase = 'out';
        const t1 = setTimeout(() => { phase = 'in'; }, 30);
        const t2 = setTimeout(() => { outgoing = null; }, 380);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    });

    // For scene_set beats, derive an eyebrow from biome/location if present.
    let sceneEyebrow = $derived(
        incoming?.is_scene_set
            ? (incoming.biome || incoming.location || 'A new scene')
            : null
    );
</script>

<div class="subtitle-stage" data-phase={phase} role="region" aria-label="Story narration">

    {#if error}
        <div class="subtitle error" role="alert">
            <p class="prose-error">{error}</p>
        </div>
    {:else if isLoading && !incoming}
        <div class="subtitle loading" aria-live="polite">
            <span class="stage-label eyebrow">{turnStageLabel || 'The world responds'}</span>
            <span class="breath-dots" aria-hidden="true">
                <span class="breath"></span>
                <span class="breath"></span>
                <span class="breath"></span>
            </span>
        </div>
    {:else if incoming}
        <div class="subtitle current" data-beat={incoming.is_scene_set ? 'scene_set' : (incoming.beat_profile || 'action')}>
            {#if incoming.is_scene_set}
                <div class="scene-frame">
                    {#if sceneEyebrow}
                        <span class="scene-eyebrow">{sceneEyebrow}</span>
                    {/if}
                    <p class="prose prose-scene selectable">{incoming.narration}</p>
                    <hr class="hr-gold" />
                </div>
            {:else if incoming.beat_profile === 'social'}
                <div class="social-frame">
                    <p class="prose prose-social selectable">{incoming.narration}</p>
                </div>
            {:else if incoming.beat_profile === 'world_ambient'}
                <div class="ambient-frame">
                    <p class="prose prose-ambient selectable">{incoming.narration}</p>
                </div>
            {:else}
                <p class="prose prose-action selectable">{incoming.narration}</p>
            {/if}
        </div>
    {:else if !isLoading && !incoming}
        <div class="subtitle idle">
            <span class="idle-hint">The world holds its breath</span>
        </div>
    {/if}

    {#if outgoing}
        <div class="subtitle outgoing" aria-hidden="true" data-beat={outgoing.is_scene_set ? 'scene_set' : (outgoing.beat_profile || 'action')}>
            {#if outgoing.is_scene_set}
                <div class="scene-frame">
                    <p class="prose prose-scene">{outgoing.narration}</p>
                    <hr class="hr-gold" />
                </div>
            {:else}
                <p class="prose prose-action">{outgoing.narration}</p>
            {/if}
        </div>
    {/if}

    {#if isLoading && incoming}
        <div class="pending-overlay" aria-live="polite">
            <span class="breath-dots small" aria-hidden="true">
                <span class="breath"></span>
                <span class="breath"></span>
                <span class="breath"></span>
            </span>
        </div>
    {/if}
</div>

<style>
    .subtitle-stage {
        position: relative;
        width: 100%;
        max-width: 720px;
        margin: 0 auto;
        min-height: 88px;
        padding: 1.1rem 1.4rem 0.9rem;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
    }

    /* Scrim moved to GameShell .bottom-stack::before so it reaches the true
       bottom edge of the screen (past the action pill + safe area). */

    .subtitle {
        position: relative;
        z-index: 1;
        animation: subtitle-in 0.42s cubic-bezier(0.2, 0.7, 0.2, 1) both;
    }
    .subtitle.outgoing {
        position: absolute;
        inset: 1.1rem 1.4rem 0.9rem;
        animation: subtitle-out 0.36s cubic-bezier(0.4, 0, 0.6, 1) both;
        pointer-events: none;
    }
    @keyframes subtitle-in {
        from { opacity: 0; transform: translateY(8px); filter: blur(2px); }
        to   { opacity: 1; transform: translateY(0); filter: blur(0); }
    }
    @keyframes subtitle-out {
        from { opacity: 1; }
        to   { opacity: 0; transform: translateY(-4px); filter: blur(3px); }
    }

    /* ---------- prose variants ---------- */
    .prose {
        font-family: var(--font-prose);
        color: #f4efe3;
        margin: 0;
        text-wrap: pretty;
        /* Light text + dark shadow — the film subtitle treatment. Legible over
           a bright desert AND a black void without knowing the scene. */
        text-shadow:
            0 1px 3px rgba(0, 0, 0, 0.9),
            0 0 16px rgba(0, 0, 0, 0.55);
    }
    .prose-scene {
        font-size: 1.14rem;
        line-height: 1.62;
        font-style: italic;
        color: #f7f2e6;
    }
    .prose-action {
        font-size: 1.06rem;
        line-height: 1.56;
    }
    .prose-social {
        font-size: 1.06rem;
        line-height: 1.56;
        font-style: italic;
    }
    .prose-ambient {
        font-size: 1.0rem;
        line-height: 1.5;
        font-style: italic;
        color: #cfc7b6;
    }
    .prose-error {
        font-family: var(--font-ui);
        font-size: var(--t-sm);
        color: #ff9b91;
        margin: 0;
    }

    /* ---------- scene_set hero ---------- */
    .scene-frame {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .scene-eyebrow {
        font-family: var(--font-display);
        font-size: var(--t-xs);
        font-weight: 600;
        letter-spacing: 0.22em;
        color: #e0b263;
        text-transform: uppercase;
        text-shadow:
            0 1px 3px rgba(0, 0, 0, 0.9),
            0 0 14px rgba(0, 0, 0, 0.5);
    }
    .scene-frame .hr-gold {
        margin: 0.4rem 0 0;
        width: 56px;
        border: none;
        border-top: 1px solid #e0b263;
        opacity: 0.7;
    }

    /* ---------- social ---------- */
    .social-frame {
        border-left: 2px solid #e0b263;
        padding-left: 1rem;
        margin-left: 0.15rem;
    }

    /* ---------- ambient ---------- */
    .ambient-frame {
        display: flex;
        align-items: flex-start;
        gap: 0.55rem;
        padding: 0.3rem 0 0.3rem 0.65rem;
        border-left: 1px solid #e0b263;
    }
    .ambient-mark {
        font-size: 0.85rem;
        color: #e0b263;
        line-height: 1.6;
        flex-shrink: 0;
    }

    /* ---------- whisper — dashed purple ---------- */
    .subtitle[data-beat='whisper'] {
        /* reserved for future speaker-style whisper rendering */
    }

    /* ---------- loading state ---------- */
    .subtitle.loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.55rem;
        padding: 0.4rem 0;
    }
    .stage-label {
        font-family: var(--font-display);
        font-size: var(--t-xs);
        font-weight: 600;
        letter-spacing: 0.2em;
        color: #b3ab99;
        text-transform: uppercase;
    }
    .breath-dots {
        display: inline-flex;
        gap: 0.4rem;
        align-items: center;
    }
    .breath-dots.small { gap: 0.25rem; }
    .breath {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--gold);
        opacity: 0.4;
        animation: breath 1.6s ease-in-out infinite;
    }
    .breath-dots.small .breath {
        width: 4px; height: 4px;
    }
    .breath:nth-child(2) { animation-delay: 0.25s; }
    .breath:nth-child(3) { animation-delay: 0.5s; }
    @keyframes breath {
        0%, 70%, 100% { opacity: 0.25; transform: scale(0.85); }
        35%           { opacity: 1; transform: scale(1.1); }
    }

    .pending-overlay {
        position: absolute;
        bottom: 0.4rem;
        right: 1.4rem;
        z-index: 2;
        opacity: 0.7;
    }

    /* ---------- idle state (no beats yet) ---------- */
    .subtitle.idle {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        justify-content: center;
        padding: 1.2rem 0;
        opacity: 0.82;
    }
    .idle-mark {
        color: #e0b263;
        font-size: 0.9rem;
        text-shadow:
            0 1px 3px rgba(0, 0, 0, 0.9),
            0 0 14px rgba(0, 0, 0, 0.5);
        animation: idle-twinkle 3s ease-in-out infinite;
    }
    .idle-hint {
        font-family: var(--font-prose);
        font-style: italic;
        color: #d6cfc0;
        font-size: var(--t-sm);
        text-shadow:
            0 1px 2px rgba(42, 36, 32, 0.45),
            0 0 14px rgba(252, 248, 237, 0.92),
            0 0 28px rgba(252, 248, 237, 0.7);
    }
    @keyframes idle-twinkle {
        0%, 100% { opacity: 0.5; }
        50%      { opacity: 1; }
    }

    /* ---------- error ---------- */
    .subtitle.error {
        text-align: center;
        padding: 0.6rem 0.9rem;
        background: rgba(160, 70, 64, 0.08);
        border-top: 1px solid rgba(160, 70, 64, 0.35);
        border-bottom: 1px solid rgba(160, 70, 64, 0.35);
    }

    /* ---------- reduced motion ---------- */
    @media (prefers-reduced-motion: reduce) {
        .subtitle, .subtitle.outgoing, .breath, .idle-mark {
            animation: none !important;
        }
        .subtitle { opacity: 1; transform: none; filter: none; }
    }

    @media (max-width: 540px) {
        .subtitle-stage {
            padding: 1rem 1.1rem 0.7rem;
            min-height: 78px;
        }
        .subtitle.outgoing {
            inset: 1rem 1.1rem 0.7rem;
        }
        .prose-scene { font-size: 1.06rem; }
        .prose-action { font-size: 1.0rem; }
        .prose-social { font-size: 1.0rem; }
        .prose-ambient { font-size: 0.95rem; }
    }
</style>
