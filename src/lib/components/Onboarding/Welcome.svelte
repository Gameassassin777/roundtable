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
        onBegin: () => void;
        onLoadSaved: (slot: SavedSlot) => void;
    };

    let { savedCharacters, onBegin, onLoadSaved }: Props = $props();

    const ICONS: Record<string, string> = {
        warrior: '⚔',
        mage: '✦',
        rogue: '✧',
        ranger: '➢',
        cleric: '☩',
        bard: '♪',
        scholar: '✎'
    };
    const icon = (arc: string) => ICONS[arc?.toLowerCase()] || '✦';
</script>

<div class="wizard-card welcome panel">
    <div class="emblem" aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="32" cy="32" r="22"/>
            <circle cx="32" cy="32" r="8"/>
            <path d="M32 10v8M32 46v8M10 32h8M46 32h8M17 17l6 6M41 41l6 6M47 17l-6 6M23 41l-6 6"/>
        </svg>
    </div>
    <h1 class="display title">Round Table</h1>
    <div class="title-rule" aria-hidden="true"></div>
    <p class="prose-italic tagline">A tabletop adventure, narrated by AI.</p>
    <p class="welcome-desc prose selectable">
        Create a hero, gather your party, and decide what to do. An AI Dungeon Master turns
        every roll of the dice into a living story that responds to every choice you make.
    </p>

    <button class="btn-primary wide" onclick={onBegin}>Begin Your Quest</button>

    {#if savedCharacters.length > 0}
        <div class="roster">
            <p class="roster-label eyebrow">Or return as a saved hero</p>
            <div class="roster-grid">
                {#each savedCharacters as slot}
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

    <p class="fineprint muted">Play solo or invite friends with a shared table code.</p>
</div>

<style>
    .wizard-card {
        width: min(540px, 92vw);
        padding: 2.2rem 1.8rem 2rem;
        text-align: center;
        animation: card-in 0.5s cubic-bezier(0.2, 0.7, 0.2, 1);
    }
    @keyframes card-in {
        from { transform: translateY(8px); opacity: 0; }
        to   { transform: translateY(0); opacity: 1; }
    }
    .emblem {
        color: var(--gold);
        width: 56px;
        margin: 0 auto 0.9rem;
        opacity: 0.85;
    }
    .emblem svg { width: 100%; height: auto; }
    .title {
        font-size: var(--t-xl);
        color: var(--ink);
        margin-bottom: 0.4rem;
        letter-spacing: 0.06em;
    }
    .title-rule {
        width: 60px;
        height: 1px;
        margin: 0 auto 0.7rem;
        background: linear-gradient(90deg, transparent, var(--gold) 50%, transparent);
        opacity: 0.6;
    }
    .tagline { color: var(--ink-soft); margin-bottom: 1.1rem; }
    .welcome-desc {
        font-size: var(--t-base);
        color: var(--ink-soft);
        max-width: 40ch;
        margin: 0 auto 1.5rem;
        line-height: 1.6;
    }
    .btn-primary.wide {
        width: 100%;
        padding: 0.85rem 1.5rem;
        font-size: var(--t-base);
        min-height: 48px;
        letter-spacing: 0.04em;
    }

    .roster { margin-top: 1.6rem; }
    .roster-label { margin-bottom: 0.6rem; }
    .roster-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 0.5rem;
    }
    .saved-chip {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        padding: 0.5rem 0.6rem;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        font-family: var(--font-ui);
        text-align: left;
        min-height: 44px;
        transition: border-color 0.18s ease, transform 0.18s ease, background 0.18s ease;
    }
    .saved-chip:hover {
        background: var(--card);
        border-color: var(--gold-soft);
        transform: translateY(-1px);
    }
    .saved-portrait {
        width: 32px; height: 32px;
        border-radius: var(--radius-sm);
        object-fit: cover;
        flex-shrink: 0;
    }
    .saved-glyph {
        font-size: 1.4rem;
        color: var(--gold);
        width: 32px; height: 32px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
    }
    .saved-text { display: flex; flex-direction: column; min-width: 0; }
    .saved-name { font-weight: 600; font-size: var(--t-sm); color: var(--ink); }
    .saved-class {
        font-size: var(--t-xs);
        color: var(--muted);
        font-family: var(--font-prose);
        font-style: italic;
    }

    .fineprint {
        margin-top: 1.3rem;
        font-size: var(--t-xs);
        font-family: var(--font-prose);
        font-style: italic;
    }

    @media (prefers-reduced-motion: reduce) {
        .wizard-card { animation: none !important; }
    }
</style>
