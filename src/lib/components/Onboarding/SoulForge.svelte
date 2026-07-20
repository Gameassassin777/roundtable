<script lang="ts">
    import { forgeCharacter, forgeConverse, type ForgedCharacter, type ForgeMessage } from '$lib/ai/soulForge';
    import Icon from '$lib/components/Icon.svelte';

    type Props = {
        apiKey: string;
        nameHint: string;
        onBack: () => void;
        onAccept: (forged: ForgedCharacter, name: string) => void;
    };

    let { apiKey, nameHint, onBack, onAccept }: Props = $props();

    // Path: 'quick' (concept → compile) or 'custom' (interview → compile)
    let path = $state<'quick' | 'custom'>('quick');

    // Shared
    let forging = $state(false);
    let forgeError = $state('');
    let forged = $state<ForgedCharacter | null>(null);
    let characterName = $state('');

    // Quick path
    let quickConcept = $state('');
    const QUICK_EXAMPLES = [
        'A disgraced knight seeking redemption',
        'A hedge-witch with a debt to the wrong patron',
        'A scribe who found a page that shouldn\'t exist',
        'A hunter whose village vanished overnight',
        'A former inquisitor who lost faith but kept the blade',
        'A cartographer who has been to a place that isn\'t on any map'
    ];

    // Custom path
    let forgeMsgs = $state<ForgeMessage[]>([]);
    let forgeInput = $state('');
    let concept = '';
    let conversing = $state(false);
    const CONCEPT_EXAMPLES = QUICK_EXAMPLES;

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
        if (forging || !apiKey) return;
        if (path === 'quick' && !quickConcept.trim()) return;
        if (path === 'custom' && forgeMsgs.length === 0) return;
        forging = true; forgeError = '';
        try {
            const c = await forgeCharacter(concept || quickConcept, apiKey, {
                conversation: path === 'custom' ? forgeMsgs : undefined,
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

    // Quick path: forge directly from the concept input
    function quickForge() {
        concept = quickConcept.trim();
        if (!concept) return;
        runForge();
    }

    // Custom path: send a message to the interview
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

    function compileForge() { runForge(); }
    function reforge() { if (forged) runForge({ previous: forged }); }
    function backToConversation() { forged = null; }

    function switchPath(p: 'quick' | 'custom') {
        if (p === path || forging) return;
        path = p;
        forged = null;
        forgeError = '';
    }
</script>

<div class="wizard-card forge panel film-surface">
    <header class="wizard-head">
        <span class="eyebrow">Step 2 of 2</span>
        <h2 class="display">The Soul Forge</h2>
        <p class="wizard-sub prose-italic">
            Forge the hero you want to become. Quick for a fast compile, or Custom to talk it through with the Forge first.
        </p>
    </header>

    {#if !forged}
        <!-- Path toggle -->
        <div class="path-toggle" role="tablist">
            <button
                type="button"
                class="path-btn"
                class:active={path === 'quick'}
                onclick={() => switchPath('quick')}
                role="tab"
                aria-selected={path === 'quick'}
            >
                <span class="path-name">Quick Forge</span>
                <span class="path-desc muted">A concept, a moment, a hero.</span>
            </button>
            <button
                type="button"
                class="path-btn"
                class:active={path === 'custom'}
                onclick={() => switchPath('custom')}
                role="tab"
                aria-selected={path === 'custom'}
            >
                <span class="path-name">Full Custom</span>
                <span class="path-desc muted">Converse with the Forge until they know you.</span>
            </button>
        </div>

        {#if path === 'quick'}
            <!-- QUICK PATH -->
            <div class="quick-pane selectable">
                <label class="field">
                    <span class="field-label">In one line — who are they?</span>
                    <textarea
                        bind:value={quickConcept}
                        rows="2"
                        placeholder="A disgraced knight seeking redemption…"
                        onkeydown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), quickForge())}
                    ></textarea>
                </label>

                <div class="concept-chips">
                    <span class="chip-label eyebrow">Or pick a spark</span>
                    <div class="chip-flow">
                        {#each QUICK_EXAMPLES as ex}
                            <button
                                type="button"
                                class="chip-btn"
                                onclick={() => (quickConcept = ex, quickForge())}
                                disabled={forging}
                            >{ex}</button>
                        {/each}
                    </div>
                </div>
            </div>

            {#if forgeError}<p class="forge-error">{forgeError}</p>{/if}

            <div class="wizard-actions">
                <button class="btn-ghost" onclick={onBack} disabled={forging}>Back</button>
                <button class="btn-primary" disabled={forging || !quickConcept.trim()} onclick={quickForge}>
                    {forging ? 'Forging…' : 'Forge Hero'}
                </button>
            </div>
        {:else}
            <!-- CUSTOM PATH -->
            <div class="forge-chat selectable">
                {#if forgeMsgs.length === 0}
                    <p class="forge-hint prose muted">
                        Tell the Forge who you want to become. They will ask questions until your hero is clear —
                        then compile them from everything you agreed on.
                    </p>
                    <div class="concept-chips">
                        <span class="chip-label eyebrow">Sparks</span>
                        <div class="chip-flow">
                            {#each CONCEPT_EXAMPLES as ex}
                                <button type="button" class="chip-btn" onclick={() => sendForgeMessage(ex)} disabled={conversing}>{ex}</button>
                            {/each}
                        </div>
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
                <button class="btn-ghost" onclick={onBack} disabled={forging}>Back</button>
                <button class="btn-primary" disabled={forging || forgeMsgs.length === 0} onclick={compileForge}>
                    {forging ? 'Forging…' : 'Forge Character'}
                </button>
            </div>
        {/if}
    {:else}
        <div class="forged-card selectable">
            <div class="forged-head">
                <div class="forged-portrait">
                    {#if forged.portrait_url}
                        <img src={forged.portrait_url} alt={characterName || forged.name} />
                    {:else}
                        <span class="forged-glyph"><Icon name="star" size={26} /></span>
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
            <button class="btn-ghost" onclick={regeneratePortrait} disabled={forging}>New Portrait</button>
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
        padding: 1.9rem 1.8rem 1.7rem;
        border-radius: var(--radius-modal);
        box-shadow: var(--shadow-overlay);
        animation: card-in 0.5s var(--ease-out-soft);
    }
    @keyframes card-in {
        from { transform: translateY(8px); opacity: 0; }
        to   { transform: translateY(0); opacity: 1; }
    }
    .wizard-head { margin-bottom: 1.3rem; }
    .wizard-head .eyebrow { display: block; margin-bottom: 0.3rem; }
    .wizard-head h2 {
        font-size: var(--t-lg);
        margin: 0 0 0.5rem;
        letter-spacing: 0.03em;
    }
    .wizard-sub { color: var(--ink-soft); font-size: var(--t-sm); line-height: 1.55; }

    /* Path toggle */
    .path-toggle {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
        margin-bottom: 1.3rem;
    }
    .path-btn {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        padding: 0.7rem 0.75rem;
        background: var(--inset);
        border: 1px solid var(--line-soft);
        border-radius: var(--radius);
        font-family: var(--font-ui);
        text-align: left;
        cursor: pointer;
        min-height: 44px;
        transition: border-color 0.18s ease, background 0.18s ease;
    }
    .path-btn:hover { background: var(--card); border-color: var(--gold-soft); }
    .path-btn.active {
        background: var(--card);
        border-color: var(--gold);
        box-shadow: inset 0 0 0 1px var(--gold-soft);
    }
    .path-name {
        font-family: var(--font-display);
        font-size: var(--t-sm);
        font-weight: 600;
        color: var(--ink);
        letter-spacing: 0.04em;
    }
    .path-btn.active .path-name { color: var(--ink); }
    .path-desc {
        font-size: var(--t-xs);
        color: var(--muted);
        font-family: var(--font-prose);
        font-style: italic;
    }

    /* Quick pane */
    .quick-pane { display: flex; flex-direction: column; gap: 1rem; }
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
    .quick-pane textarea {
        font-size: var(--t-base);
        line-height: 1.55;
        min-height: 64px;
        font-family: var(--font-prose);
    }

    .concept-chips { display: flex; flex-direction: column; gap: 0.45rem; }
    .chip-label {
        font-size: var(--t-xs);
        letter-spacing: 0.18em;
    }
    .chip-flow { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .chip-btn {
        flex: 1 1 auto;
        text-align: left;
        padding: 0.5rem 0.75rem;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-sm);
        color: var(--ink-soft);
        min-height: 44px;
        cursor: pointer;
        transition: border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
    }
    .chip-btn:hover:not(:disabled) {
        background: var(--card);
        color: var(--ink);
        border-color: var(--gold-soft);
        transform: translateY(-1px);
    }
    .chip-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Custom path chat */
    .forge-chat {
        background: var(--inset);
        border: 1px solid var(--line-soft);
        border-radius: var(--radius-sm);
        padding: 0.85rem;
        min-height: 180px;
        max-height: 320px;
        max-height: 40dvh;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        margin-bottom: 0.7rem;
    }
    .forge-hint {
        font-size: var(--t-sm);
        margin-bottom: 0.8rem;
        line-height: 1.55;
    }

    .forge-msg {
        padding: 0.5rem 0.75rem;
        margin: 0.4rem 0;
        border-radius: var(--radius-sm);
        font-size: var(--t-sm);
        line-height: 1.55;
    }
    .forge-msg.user {
        background: var(--card);
        border-left: 2px solid var(--accent);
    }
    .forge-msg.model {
        background: var(--card);
        border-left: 2px solid var(--gold);
        font-family: var(--font-prose);
        font-style: italic;
    }
    .forge-msg.model.typing {
        display: inline-flex;
        gap: 0.25rem;
        align-items: center;
    }
    .dot {
        width: 5px; height: 5px;
        background: var(--gold);
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
        padding: 0.5rem 0.75rem;
        font-size: var(--t-xs);
        margin: 0.5rem 0;
        font-family: var(--font-prose);
        font-style: italic;
    }

    .refine-row {
        display: flex;
        gap: 0.4rem;
        margin-bottom: 1rem;
    }
    .refine-row input {
        flex: 1;
        font-family: var(--font-prose);
        font-style: italic;
    }
    .refine-row .btn-ghost { min-height: 44px; }

    .wizard-actions {
        display: flex;
        gap: 0.4rem;
        justify-content: space-between;
        flex-wrap: wrap;
    }
    .wizard-actions .btn-primary {
        flex: 1 1 60%;
        min-height: 48px;
        letter-spacing: 0.04em;
    }
    .wizard-actions .btn-ghost { flex: 0 0 auto; min-height: 44px; }

    /* Forged character card */
    .forged-card { margin-bottom: 1.1rem; }
    .forged-head {
        display: flex;
        gap: 0.9rem;
        align-items: center;
        margin-bottom: 1rem;
        padding-bottom: 0.9rem;
        border-bottom: 1px solid var(--gold-soft);
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
    .forged-glyph { font-size: 1.8rem; color: var(--gold); }
    .forged-id { flex: 1; min-width: 0; }
    .forged-name-input {
        font-family: var(--font-display);
        font-size: var(--t-lg);
        font-weight: 600;
        background: transparent;
        border: none;
        padding: 0;
        margin-bottom: 0.2rem;
        letter-spacing: 0.02em;
    }
    .forged-name-input:focus { box-shadow: none; border: none; }
    .forged-class {
        font-size: var(--t-sm);
        color: var(--muted);
        font-family: var(--font-prose);
        font-style: italic;
    }

    .stat-chips {
        display: flex;
        gap: 0.4rem;
        margin: 0.8rem 0;
        flex-wrap: wrap;
    }
    .stat-chips .chip b { font-weight: 600; margin-right: 0.2rem; }
    .chip.corrupt { color: var(--corruption); border-color: var(--corruption); }

    .forged-traits {
        background: var(--inset);
        border: 1px solid var(--line-soft);
        border-radius: var(--radius-sm);
        padding: 0.7rem 0.85rem;
        margin: 0.8rem 0;
        font-size: var(--t-sm);
        line-height: 1.55;
    }
    .trait-row {
        padding: 0.25rem 0;
        font-family: var(--font-prose);
    }
    .trait-row b {
        color: var(--gold);
        font-weight: 600;
        font-family: var(--font-display);
        font-size: var(--t-xs);
        letter-spacing: 0.06em;
        text-transform: uppercase;
        margin-right: 0.3rem;
    }

    .forged-item {
        font-size: var(--t-sm);
        color: var(--ink-soft);
        margin: 0.6rem 0;
        font-family: var(--font-prose);
    }
    .item-key {
        font-family: var(--font-display);
        font-size: var(--t-xs);
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--gold);
        margin-right: 0.3rem;
    }
    .forged-backstory {
        margin-top: 0.9rem;
        font-size: var(--t-sm);
        color: var(--ink);
        font-style: italic;
        line-height: 1.6;
    }

    @media (prefers-reduced-motion: reduce) {
        .wizard-card { animation: none !important; }
    }
</style>
