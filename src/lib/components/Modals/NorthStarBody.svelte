<script lang="ts">
    import { ADVENTURE_SEEDS, type AdventureSeed } from '$lib/adventureSeeds';

    type Props = {
        premise: string;
        tone: string;
        hook: string;
        onPremiseChange: (v: string) => void;
        onToneChange: (v: string) => void;
        onHookChange: (v: string) => void;
        onApplySeed: (seed: AdventureSeed) => void;
        onClear: () => void;
        onSave: () => void;
    };

    let {
        premise, tone, hook,
        onPremiseChange, onToneChange, onHookChange,
        onApplySeed, onClear, onSave
    }: Props = $props();

    let showSeeds = $state(false);
    const TONES = ['Heroic', 'Bright', 'Grim', 'Mythic', 'Picaresque'];

    let canSave = $derived(premise.trim() !== '' || tone.trim() !== '' || hook.trim() !== '');
</script>

<p class="ns-intro prose muted">
    The foundational premise of this world. The Director, DM, and World Engine all read this —
    keep it short and load-bearing. Empty fields mean "improvise neutrally."
</p>

<div class="field">
    <button class="btn-ghost wide" onclick={() => (showSeeds = !showSeeds)}>
        {showSeeds ? 'Hide seeds' : 'Pick from seed library'}
    </button>
    {#if showSeeds}
        <div class="seed-library">
            {#each ADVENTURE_SEEDS as seed (seed.id)}
                <button class="seed-card" onclick={() => onApplySeed(seed)}>
                    <div class="seed-head">
                        <span class="seed-title">{seed.title}</span>
                        <span class="chip">{seed.tone}</span>
                    </div>
                    <p class="seed-premise">{seed.premise}</p>
                </button>
            {/each}
        </div>
    {/if}
</div>

<label class="field">
    <span class="field-label">Premise</span>
    <textarea rows="4" value={premise} oninput={(e) => onPremiseChange((e.currentTarget as HTMLTextAreaElement).value)} placeholder="A borderland village on the edge of a forest that has started growing back overnight, swallowing farms that have stood for generations…"></textarea>
    <span class="field-help">2-4 sentences. The central situation the party is walking into.</span>
</label>

<div class="field">
    <span class="field-label">Tone</span>
    <div class="tone-row">
        {#each TONES as t}
            <button type="button" class="chip" class:selected={tone === t} onclick={() => onToneChange(tone === t ? '' : t)}>{t}</button>
        {/each}
    </div>
</div>

<label class="field">
    <span class="field-label">Opening hook</span>
    <input type="text" value={hook} oninput={(e) => onHookChange((e.currentTarget as HTMLInputElement).value)} placeholder="The party arrives as the third farm disappears in a single night." />
    <span class="field-help">The situation already in motion when turn 1 begins.</span>
</label>

<div class="ns-actions">
    <button class="btn-ghost" onclick={onClear}>Clear</button>
    <button class="btn-primary" onclick={onSave} disabled={!canSave}>Set Premise</button>
</div>

<style>
    .ns-intro {
        font-size: var(--t-sm);
        margin-bottom: 0.8rem;
        line-height: 1.5;
        font-family: var(--font-prose);
        font-style: italic;
        color: var(--ink-soft);
    }
    .field {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        margin-bottom: 0.75rem;
    }
    .field-label {
        font-family: var(--font-display);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--gold);
    }
    .field-help {
        font-size: var(--t-xs);
        color: var(--ink-soft);
        line-height: 1.5;
        font-family: var(--font-prose);
        font-style: italic;
    }
    textarea, input[type="text"] {
        font-family: var(--font-ui);
        font-size: var(--t-sm);
        padding: 0.55rem 0.7rem;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        resize: vertical;
        min-height: 44px;
    }
    textarea:focus, input[type="text"]:focus { border-color: var(--gold); }

    .btn-ghost.wide { min-height: 44px; }

    .seed-library {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-top: 0.4rem;
    }
    .seed-card {
        text-align: left;
        padding: 0.55rem 0.7rem;
        background: var(--inset);
        border: 1px solid var(--line-soft);
        border-radius: var(--radius-sm);
        min-height: 44px;
        transition: border-color 0.18s ease, transform 0.18s ease, background 0.18s ease;
    }
    .seed-card:hover {
        background: var(--card);
        border-color: var(--gold-soft);
        transform: translateY(-1px);
    }
    .seed-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 0.5rem;
        margin-bottom: 0.25rem;
    }
    .seed-title {
        font-family: var(--font-display);
        font-weight: 600;
        font-size: var(--t-sm);
        color: var(--ink);
        letter-spacing: 0.03em;
    }
    .seed-premise {
        font-family: var(--font-prose);
        font-size: var(--t-sm);
        color: var(--ink-soft);
        line-height: 1.5;
        margin: 0;
        font-style: italic;
    }

    .tone-row {
        display: flex;
        gap: 0.3rem;
        flex-wrap: wrap;
    }
    .tone-row .chip {
        min-height: 36px;
        display: inline-flex;
        align-items: center;
        cursor: pointer;
    }
    .chip.selected {
        background: var(--accent);
        color: #fdf6ec;
        border-color: var(--accent);
    }

    .ns-actions {
        display: flex;
        gap: 0.4rem;
        justify-content: flex-end;
        margin-top: 0.8rem;
    }
    .ns-actions .btn-primary {
        min-height: 48px;
        letter-spacing: 0.04em;
    }
    .ns-actions .btn-ghost {
        min-height: 44px;
        padding-left: 1.3rem;
        padding-right: 1.3rem;
    }
</style>
