<script lang="ts">
    type SavedSlot = {
        name: string;
        archetype: string;
        class_title: string;
        portrait_url: string;
        backstory: string;
        traits: { name: string; desc: string }[];
        hp: number;
        resolve: number;
        corruption: number;
        saved_at: number;
    };

    type Props = {
        savedCharacters: SavedSlot[];
        recentWorlds: string[];
        onBegin: () => void;        // New world flow
        onContinue: () => void;     // Continue with existing character + world
        onLoadSaved: (slot: SavedSlot) => void;
        onJoinWorld: (code: string) => void;
        onOpenSettings: () => void;
    };

    let {
        savedCharacters, recentWorlds,
        onBegin, onContinue, onLoadSaved, onJoinWorld, onOpenSettings
    }: Props = $props();

    let showJoin = $state(false);
    let joinCode = $state('');

    const ICONS: Record<string, string> = {
        warrior: '⚔', mage: '✦', rogue: '✧', ranger: '➢',
        cleric: '☩', bard: '♪', scholar: '✎'
    };
    const icon = (arc: string) => ICONS[arc?.toLowerCase()] || '✦';
</script>

<div class="title-stage">
    <div class="emblem" aria-hidden="true">
        <svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="48" cy="48" r="34" opacity="0.4"/>
            <circle cx="48" cy="48" r="26"/>
            <circle cx="48" cy="48" r="10"/>
            <path d="M48 14v10M48 72v10M14 48h10M72 48h10M27 27l8 8M61 61l8 8M69 27l-8 8M35 61l-8 8" opacity="0.6"/>
        </svg>
    </div>

    <h1 class="display title">Round Table</h1>
    <p class="prose-italic tagline">A tabletop adventure, narrated by AI.</p>

    <div class="actions">
        <button class="btn-primary wide" onclick={onBegin}>
            <span class="btn-label">Enter a New World</span>
            <span class="btn-sub">Forge a hero, cross the threshold.</span>
        </button>

        {#if savedCharacters.length > 0}
            <button class="btn-ghost wide" onclick={onContinue}>
                <span class="btn-label">Continue as {savedCharacters[0].name}</span>
                <span class="btn-sub">{savedCharacters[0].class_title}</span>
            </button>
        {/if}

        {#if recentWorlds.length > 0 && !showJoin}
            <button class="btn-tiny btn-ghost link-btn" onclick={() => (showJoin = true)}>Join a world by code</button>
        {/if}

        {#if showJoin}
            <div class="join-row">
                <input
                    type="text"
                    bind:value={joinCode}
                    placeholder="table code"
                    onkeydown={(e) => e.key === 'Enter' && joinCode.trim() && onJoinWorld(joinCode.trim())}
                />
                <button class="btn-tiny btn-ghost" onclick={() => (showJoin = false)}>Cancel</button>
                <button class="btn-tiny btn-primary" disabled={!joinCode.trim()} onclick={() => onJoinWorld(joinCode.trim())}>Join</button>
            </div>
        {/if}

        <button class="btn-tiny btn-ghost link-btn" onclick={onOpenSettings}>Settings</button>
    </div>

    {#if savedCharacters.length > 1}
        <div class="roster">
            <p class="roster-label eyebrow">Or return as a different hero</p>
            <div class="roster-grid">
                {#each savedCharacters.slice(1) as slot}
                    <button
                        type="button"
                        class="saved-chip"
                        onclick={() => onLoadSaved(slot)}
                        title={`Continue as ${slot.name} — ${slot.class_title}`}
                    >
                        {#if slot.portrait_url}
                            <img src={slot.portrait_url} alt={slot.name} class="saved-portrait" />
                        {:else}
                            <span class="saved-glyph">{icon(slot.archetype)}</span>
                        {/if}
                        <span class="saved-text">
                            <span class="saved-name">{slot.name}</span>
                            <span class="saved-class muted">{slot.class_title}</span>
                        </span>
                    </button>
                {/each}
            </div>
        </div>
    {/if}

    <p class="fineprint muted">Solo or with a party. Free Google AI Studio key powers every turn.</p>
</div>

<style>
    .title-stage {
        width: min(560px, 92vw);
        padding: 2rem 1.8rem;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .emblem {
        color: var(--accent);
        width: 72px;
        margin: 0 auto 0.6rem;
        animation: emblem-fade 1.4s ease-out;
    }
    .emblem svg { width: 100%; height: auto; }
    @keyframes emblem-fade {
        from { opacity: 0; transform: scale(0.92) translateY(4px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
    }

    .title {
        font-size: var(--t-xl);
        color: var(--ink);
        margin-bottom: 0.3rem;
        animation: title-fade 1.6s ease-out;
    }
    @keyframes title-fade {
        from { opacity: 0; letter-spacing: 0.4em; }
        to { opacity: 1; letter-spacing: 0.04em; }
    }
    .tagline { color: var(--ink-soft); margin-bottom: 1.8rem; }

    .actions {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: 100%;
        max-width: 380px;
    }

    .btn-primary.wide, .btn-ghost.wide {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        padding: 0.8rem 1.2rem;
        text-align: left;
        align-items: flex-start;
    }
    .btn-label {
        font-family: var(--font-display);
        font-size: var(--t-sm);
        letter-spacing: 0.04em;
    }
    .btn-sub {
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-xs);
        opacity: 0.85;
    }

    .link-btn {
        background: transparent;
        border: none;
        color: var(--muted);
        text-decoration: underline;
        text-underline-offset: 4px;
        font-size: var(--t-xs);
        min-height: 32px;
        padding: 0.3rem 0.5rem;
    }
    .link-btn:hover { color: var(--ink); background: transparent; }

    .join-row {
        display: flex;
        gap: 0.35rem;
        align-items: stretch;
    }
    .join-row input {
        flex: 1;
        font-size: var(--t-sm);
        padding: 0.5rem 0.7rem;
    }

    .roster { margin-top: 1.8rem; width: 100%; max-width: 380px; }
    .roster-label { margin-bottom: 0.55rem; }
    .roster-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 0.45rem;
    }
    .saved-chip {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.45rem 0.55rem;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        font-family: var(--font-ui);
        text-align: left;
    }
    .saved-chip:hover {
        background: var(--inset);
        border-color: var(--muted);
    }
    .saved-portrait {
        width: 32px; height: 32px;
        border-radius: var(--radius-sm);
        object-fit: cover;
        flex-shrink: 0;
    }
    .saved-glyph {
        font-size: 1.4rem;
        color: var(--accent);
        width: 32px; height: 32px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
    }
    .saved-text { display: flex; flex-direction: column; min-width: 0; }
    .saved-name { font-weight: 600; font-size: var(--t-sm); color: var(--ink); }
    .saved-class { font-size: var(--t-xs); }

    .fineprint {
        margin-top: 1.6rem;
        font-size: var(--t-xs);
    }
</style>
