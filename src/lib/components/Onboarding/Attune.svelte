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
        padding: 1.9rem 1.8rem 1.7rem;
        animation: card-in 0.5s cubic-bezier(0.2, 0.7, 0.2, 1);
    }
    @keyframes card-in {
        from { transform: translateY(8px); opacity: 0; }
        to   { transform: translateY(0); opacity: 1; }
    }
    .wizard-head { margin-bottom: 1.5rem; }
    .wizard-head .eyebrow {
        display: block;
        margin-bottom: 0.3rem;
    }
    .wizard-head h2 {
        font-size: var(--t-lg);
        margin: 0 0 0.5rem;
        letter-spacing: 0.03em;
    }
    .wizard-sub { color: var(--ink-soft); font-size: var(--t-sm); line-height: 1.55; }

    .field {
        display: block;
        margin-bottom: 1.2rem;
    }
    .field-label {
        display: block;
        font-family: var(--font-display);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--gold);
        margin-bottom: 0.4rem;
    }
    .field-help {
        display: block;
        font-size: var(--t-xs);
        margin-top: 0.4rem;
        line-height: 1.5;
        font-family: var(--font-prose);
        font-style: italic;
    }
    .field-help a { color: var(--accent); }

    .policy-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.4rem;
    }
    .policy-chip {
        padding: 0.5rem 0.4rem;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        font-family: var(--font-display);
        font-size: var(--t-xs);
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--ink-soft);
        min-height: 44px;
        cursor: pointer;
        transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;
    }
    .policy-chip:hover {
        border-color: var(--gold-soft);
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
        margin-top: 1.6rem;
    }
    .wizard-actions .btn-primary {
        flex: 1;
        min-height: 48px;
        letter-spacing: 0.04em;
    }
    .wizard-actions .btn-ghost { padding-left: 1.3rem; padding-right: 1.3rem; }

    @media (prefers-reduced-motion: reduce) {
        .wizard-card { animation: none !important; }
    }
</style>
