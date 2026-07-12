<script lang="ts">
    type Props = {
        apiKey: string;
        keySharePolicy: 'table' | 'solo' | 'host';
        roomId: string;
        onApiKey: (v: string) => void;
        onPolicy: (v: 'table' | 'solo' | 'host') => void;
        onRoomId: (v: string) => void;
        onBack: () => void;
        onContinue: () => void;
    };

    let {
        apiKey, keySharePolicy, roomId,
        onApiKey, onPolicy, onRoomId,
        onBack, onContinue
    }: Props = $props();

    const POLICIES: Array<{ id: 'table' | 'solo' | 'host'; label: string; title: string }> = [
        { id: 'table', label: 'Table', title: "Pool with the table — round-robins across all contributed keys so no one's quota burns first." },
        { id: 'solo', label: 'Solo', title: 'Only used for your own turns. Never pooled.' },
        { id: 'host', label: 'Host', title: 'Pooled, but only the host need contribute.' }
    ];
</script>

<div class="wizard-card panel">
    <header class="wizard-head">
        <span class="eyebrow">Step 1 of 2</span>
        <h2 class="display">Attune the Aether</h2>
        <p class="wizard-sub prose-italic">
            Round Table's AI forges your hero and narrates the world. Connect your free
            Google AI Studio key to power it.
        </p>
    </header>

    <label class="field">
        <span class="field-label">Google AI Studio key</span>
        <input
            type="password"
            value={apiKey}
            oninput={(e) => onApiKey((e.currentTarget as HTMLInputElement).value)}
            placeholder="AIza…"
            autocomplete="off"
        />
        <span class="field-help muted">
            Used by the world server to power AI turns for the whole table.
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a free key →</a>
        </span>
    </label>

    <div class="field">
        <span class="field-label">Key sharing</span>
        <div class="policy-row">
            {#each POLICIES as p}
                <button
                    type="button"
                    class="policy-chip"
                    class:selected={keySharePolicy === p.id}
                    onclick={() => onPolicy(p.id)}
                    title={p.title}
                >
                    {p.label}
                </button>
            {/each}
        </div>
        <span class="field-help muted">
            {#if keySharePolicy === 'table'}
                Pooled round-robin — fairest for even quota burn.
            {:else if keySharePolicy === 'solo'}
                Yours only — the table uses everyone else's keys but not yours.
            {:else}
                Host mode — only the host's key is pooled for the table.
            {/if}
        </span>
    </div>

    <label class="field">
        <span class="field-label">Table code</span>
        <input
            type="text"
            value={roomId}
            oninput={(e) => onRoomId((e.currentTarget as HTMLInputElement).value)}
            placeholder="crypt-99"
        />
        <span class="field-help muted">Share this code so friends join your table. Leave it as-is to play solo.</span>
    </label>

    <div class="wizard-actions">
        <button class="btn-ghost" onclick={onBack}>Back</button>
        <button class="btn-primary" disabled={!apiKey.trim()} onclick={onContinue}>Continue</button>
    </div>
</div>

<style>
    .wizard-card {
        width: min(540px, 92vw);
        padding: 1.8rem;
    }
    .wizard-head { margin-bottom: 1.4rem; }
    .wizard-head h2 { font-size: var(--t-lg); margin: 0.3rem 0; }
    .wizard-sub { color: var(--ink-soft); font-size: var(--t-sm); }

    .field {
        display: block;
        margin-bottom: 1.1rem;
    }
    .field-label {
        display: block;
        font-size: var(--t-xs);
        font-weight: 600;
        letter-spacing: 0.06em;
        color: var(--ink-soft);
        margin-bottom: 0.35rem;
    }
    .field-help {
        display: block;
        font-size: var(--t-xs);
        margin-top: 0.35rem;
        line-height: 1.4;
    }
    .field-help a { color: var(--accent); }

    .policy-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.35rem;
    }
    .policy-chip {
        padding: 0.5rem;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        font-size: var(--t-sm);
        color: var(--ink-soft);
    }
    .policy-chip:hover {
        background: var(--inset);
        color: var(--ink);
    }
    .policy-chip.selected {
        background: var(--accent);
        border-color: var(--accent);
        color: #fdf6ec;
    }

    .wizard-actions {
        display: flex;
        gap: 0.5rem;
        justify-content: space-between;
        margin-top: 1.5rem;
    }
    .wizard-actions .btn-primary { flex: 1; }
    .wizard-actions .btn-ghost { padding-left: 1.3rem; padding-right: 1.3rem; }
</style>
