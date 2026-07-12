<script lang="ts">
    import { forgeCharacter, forgeConverse, type ForgedCharacter, type ForgeMessage } from '$lib/ai/soulForge';

    type Props = {
        apiKey: string;
        nameHint: string;
        onBack: () => void;
        onAccept: (forged: ForgedCharacter, name: string) => void;
    };

    let { apiKey, nameHint, onBack, onAccept }: Props = $props();

    let forgeMsgs = $state<ForgeMessage[]>([]);
    let forgeInput = $state('');
    let concept = '';
    let conversing = $state(false);
    let forging = $state(false);
    let forgeError = $state('');
    let forged = $state<ForgedCharacter | null>(null);
    let characterName = $state('');

    const CONCEPT_EXAMPLES = [
        'A disgraced knight seeking redemption',
        'A hedge-witch with a debt to the wrong patron',
        'A scribe who found a page that shouldn\'t exist',
        'A hunter whose village vanished overnight'
    ];

    async function sendForgeMessage(text?: string) {
        const msg = (text ?? forgeInput).trim();
        if (!msg || conversing || !apiKey) return;
        forgeMsgs = [...forgeMsgs, { role: 'user', text: msg }];
        if (!concept) concept = msg;
        forgeInput = '';
        conversing = true; forgeError = '';
        try {
            const reply = await forgeConverse(forgeMsgs, apiKey);
            forgeMsgs = [...forgeMsgs, { role: 'model', text: reply }];
        } catch (e: any) {
            forgeError = e?.message || 'The forge fell silent. Check your key and try again.';
        }
        conversing = false;
    }

    function portraitUrl(desc: string, seed: number): string {
        const prompt = `fantasy character portrait, ${desc}, head and shoulders, cinematic lighting, painterly, detailed`;
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&seed=${seed}&nologo=true&model=flux`;
    }
    function withPortrait(c: ForgedCharacter): ForgedCharacter {
        const seed = Math.floor(Math.random() * 1e6);
        return { ...c, seed, portrait_url: portraitUrl(c.portrait, seed) };
    }
    function regeneratePortrait() {
        if (forged) forged = withPortrait(forged);
    }

    async function runForge(opts: { previous?: ForgedCharacter } = {}) {
        if (forging || !apiKey || forgeMsgs.length === 0) return;
        forging = true; forgeError = '';
        try {
            const c = await forgeCharacter(concept, apiKey, {
                conversation: forgeMsgs,
                nameHint: characterName.trim() || nameHint.trim() || undefined,
                ...opts
            });
            forged = withPortrait(c as ForgedCharacter);
            if (!characterName.trim()) characterName = c.name || '';
        } catch (e: any) {
            forgeError = e?.message || 'The forge went cold. Check your key and try again.';
        }
        forging = false;
    }

    function compileForge() { runForge(); }
    function reforge() { if (forged) runForge({ previous: forged }); }
    function backToConversation() { forged = null; }
</script>

<div class="wizard-card forge panel">
    <header class="wizard-head">
        <span class="eyebrow">Step 2 of 2</span>
        <h2 class="display">The Soul Forge</h2>
        <p class="wizard-sub prose-italic">
            Talk with the Forge about the hero you want. When they feel right, forge them
            from your conversation.
        </p>
    </header>

    {#if !forged}
        <div class="forge-chat selectable">
            {#if forgeMsgs.length === 0}
                <p class="forge-hint prose muted">
                    Tell the Forge who you want to become. It will ask questions until your hero is clear —
                    then compile them from everything you agreed on.
                </p>
                <div class="concept-chips">
                    {#each CONCEPT_EXAMPLES as ex}
                        <button type="button" class="chip-btn" onclick={() => sendForgeMessage(ex)}>{ex}</button>
                    {/each}
                </div>
            {/if}

            {#each forgeMsgs as m}
                <div class="forge-msg {m.role}">{m.text}</div>
            {/each}

            {#if conversing}
                <div class="forge-msg model typing">
                    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
                </div>
            {/if}
        </div>

        {#if forgeError}<p class="forge-error">{forgeError}</p>{/if}

        <div class="refine-row">
            <input
                type="text"
                bind:value={forgeInput}
                onkeydown={(e) => e.key === 'Enter' && sendForgeMessage()}
                placeholder="Answer the Forge…"
                disabled={conversing}
            />
            <button class="btn-ghost" onclick={() => sendForgeMessage()} disabled={conversing || !forgeInput.trim()}>Send</button>
        </div>

        <div class="wizard-actions">
            <button class="btn-ghost" onclick={onBack}>Back</button>
            <button class="btn-primary" disabled={forging || forgeMsgs.length === 0} onclick={compileForge}>
                {forging ? 'Forging…' : 'Forge Character'}
            </button>
        </div>
    {:else}
        <div class="forged-card selectable">
            <div class="forged-head">
                <div class="forged-portrait">
                    {#if forged.portrait_url}
                        <img src={forged.portrait_url} alt={characterName || forged.name} />
                    {:else}
                        <span class="forged-glyph">✦</span>
                    {/if}
                </div>
                <div class="forged-id">
                    <input class="forged-name-input" type="text" bind:value={characterName} placeholder={forged.name} />
                    <span class="forged-class muted">{forged.class_title}</span>
                </div>
            </div>

            <div class="stat-chips">
                <span class="chip"><b>{forged.hp}</b> HP</span>
                <span class="chip"><b>{forged.resolve}</b> Resolve</span>
                {#if forged.corruption > 0}<span class="chip corrupt"><b>{forged.corruption}</b> Corruption</span>{/if}
            </div>

            <div class="forged-traits">
                {#each forged.traits as t}
                    <div class="trait-row"><b>{t.name}</b>{#if t.desc} — {t.desc}{/if}</div>
                {/each}
            </div>

            {#if forged.starting_item?.name}
                <div class="forged-item">
                    <span class="item-key muted">Carries</span> {forged.starting_item.name}
                    {#if forged.starting_item.note} — <i>{forged.starting_item.note}</i>{/if}
                </div>
            {/if}

            {#if forged.backstory}
                <p class="forged-backstory prose">{forged.backstory}</p>
            {/if}
        </div>

        {#if forgeError}<p class="forge-error">{forgeError}</p>{/if}

        <div class="wizard-actions">
            <button class="btn-ghost" onclick={backToConversation} disabled={forging}>Keep Talking</button>
            <button class="btn-ghost" onclick={reforge} disabled={forging}>{forging ? 'Forging…' : 'Reforge'}</button>
            <button class="btn-primary" disabled={forging} onclick={() => {
                if (forged) onAccept(forged, characterName || forged.name);
            }}>
                Enter the Realm
            </button>
        </div>
    {/if}
</div>

<style>
    .wizard-card {
        width: min(620px, 94vw);
        padding: 1.8rem;
    }
    .wizard-head { margin-bottom: 1.2rem; }
    .wizard-head h2 { font-size: var(--t-lg); margin: 0.3rem 0; }
    .wizard-sub { color: var(--ink-soft); font-size: var(--t-sm); }

    .forge-chat {
        background: var(--inset);
        border: 1px solid var(--line-soft);
        border-radius: var(--radius-sm);
        padding: 0.85rem;
        min-height: 180px;
        max-height: 320px;
        overflow-y: auto;
        margin-bottom: 0.7rem;
    }
    .forge-hint { font-size: var(--t-sm); margin-bottom: 0.7rem; }
    .concept-chips {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }
    .chip-btn {
        text-align: left;
        padding: 0.4rem 0.6rem;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        font-size: var(--t-sm);
        color: var(--ink-soft);
    }
    .chip-btn:hover { background: var(--page); color: var(--ink); }

    .forge-msg {
        padding: 0.45rem 0.7rem;
        margin: 0.35rem 0;
        border-radius: var(--radius-sm);
        font-size: var(--t-sm);
        line-height: 1.5;
    }
    .forge-msg.user {
        background: var(--card);
        border-left: 2px solid var(--accent);
    }
    .forge-msg.model {
        background: var(--card);
        border-left: 2px solid var(--gold);
        font-family: var(--font-prose);
    }
    .forge-msg.model.typing {
        display: inline-flex;
        gap: 0.2rem;
    }
    .dot {
        width: 5px; height: 5px;
        background: var(--muted);
        border-radius: 50%;
        animation: pulse 1.2s ease-in-out infinite;
    }
    .dot:nth-child(2) { animation-delay: 0.15s; }
    .dot:nth-child(3) { animation-delay: 0.3s; }
    @keyframes pulse {
        0%, 60%, 100% { opacity: 0.3; }
        30% { opacity: 1; }
    }

    .forge-error {
        background: rgba(160, 70, 64, 0.08);
        border: 1px solid var(--hp);
        border-radius: var(--radius-sm);
        color: var(--hp);
        padding: 0.45rem 0.7rem;
        font-size: var(--t-xs);
        margin: 0.4rem 0;
    }

    .refine-row {
        display: flex;
        gap: 0.35rem;
        margin-bottom: 0.9rem;
    }
    .refine-row input { flex: 1; }

    .wizard-actions {
        display: flex;
        gap: 0.4rem;
        justify-content: space-between;
    }
    .wizard-actions .btn-primary { flex: 1; }

    /* Forged character card */
    .forged-card { margin-bottom: 1rem; }
    .forged-head {
        display: flex;
        gap: 0.85rem;
        align-items: center;
        margin-bottom: 0.9rem;
    }
    .forged-portrait {
        width: 64px; height: 64px;
        background: var(--inset);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }
    .forged-portrait img { width: 100%; height: 100%; object-fit: cover; }
    .forged-glyph { font-size: 1.8rem; color: var(--accent); }
    .forged-id { flex: 1; min-width: 0; }
    .forged-name-input {
        font-family: var(--font-display);
        font-size: var(--t-lg);
        font-weight: 600;
        background: transparent;
        border: none;
        padding: 0;
        margin-bottom: 0.15rem;
    }
    .forged-name-input:focus { box-shadow: none; }
    .forged-class { font-size: var(--t-sm); }

    .stat-chips {
        display: flex;
        gap: 0.35rem;
        margin: 0.7rem 0;
        flex-wrap: wrap;
    }
    .stat-chips .chip b { font-weight: 600; margin-right: 0.2rem; }
    .chip.corrupt { color: var(--corruption); border-color: var(--corruption); }

    .forged-traits {
        background: var(--inset);
        border: 1px solid var(--line-soft);
        border-radius: var(--radius-sm);
        padding: 0.6rem 0.8rem;
        margin: 0.7rem 0;
        font-size: var(--t-sm);
        line-height: 1.5;
    }
    .trait-row { padding: 0.2rem 0; }
    .trait-row b { color: var(--accent); font-weight: 600; }

    .forged-item {
        font-size: var(--t-sm);
        color: var(--ink-soft);
        margin: 0.5rem 0;
    }
    .item-key {
        font-family: var(--font-display);
        font-size: var(--t-xs);
        letter-spacing: 0.1em;
        text-transform: uppercase;
        margin-right: 0.3rem;
    }
    .forged-backstory {
        margin-top: 0.8rem;
        font-size: var(--t-sm);
        color: var(--ink);
        font-style: italic;
    }
</style>
