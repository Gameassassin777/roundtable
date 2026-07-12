<script lang="ts">
    type Props = {
        data: any | null;
        error: string;
        onPickFile: (evt: Event) => void;
    };

    let { data, error, onPickFile }: Props = $props();
</script>

{#if !data}
    <div class="reader-import">
        <label class="btn-primary">
            Choose .weave.json file
            <input type="file" accept=".json,.weave,application/json" onchange={onPickFile} hidden />
        </label>
        {#if error}
            <p class="reader-error">{error}</p>
        {:else}
            <p class="reader-help muted">Pick an exported .weave file to read its chronicle and world state.</p>
        {/if}
    </div>
{:else}
    <div class="reader-content">
        <header class="reader-header">
            <h3 class="reader-title">Chronicle of {data.world?.room_id || '(unnamed world)'}</h3>
            {#if data.world?.world_clock}
                <p class="reader-meta muted">
                    Day {data.world.world_clock.day || 1} · {data.world.world_clock.time_of_day || 'morning'} · Turn {data.world.world_clock.turn || 0}
                </p>
            {/if}
            {#if data.world?.location}
                <p class="reader-meta muted">{data.world.location}</p>
            {/if}
            {#if data.world?.scene_tags}
                <p class="reader-meta muted">
                    {[data.world.scene_tags.biome, data.world.scene_tags.weather, data.world.scene_tags.mood].filter(Boolean).join(' · ')}
                </p>
            {/if}
        </header>

        {#if data.party && Object.keys(data.party).length > 0}
            <section class="reader-section">
                <h4>Party</h4>
                <ul class="reader-list">
                    {#each Object.entries(data.party) as [name, c]}
                        <li><strong>{name}</strong>{(c as any).class_title ? ` · ${(c as any).class_title}` : ''}</li>
                    {/each}
                </ul>
            </section>
        {/if}

        {#if data.npcs && Object.keys(data.npcs).length > 0}
            <section class="reader-section">
                <h4>NPCs</h4>
                <ul class="reader-list">
                    {#each Object.entries(data.npcs) as [name, npc]}
                        <li><strong>{name}</strong>{(npc as any).role ? ` · ${(npc as any).role}` : ''}{(npc as any).notes ? ` — ${(npc as any).notes}` : ''}</li>
                    {/each}
                </ul>
            </section>
        {/if}

        {#if data.threads && data.threads.length > 0}
            <section class="reader-section">
                <h4>Threads</h4>
                <ul class="reader-list">
                    {#each data.threads as t}
                        <li><strong>{t.name}</strong> <em>({t.status})</em>{t.description ? ` — ${t.description}` : ''}</li>
                    {/each}
                </ul>
            </section>
        {/if}

        <section class="reader-section">
            <h4>Chronicle</h4>
            <article class="reader-chronicle">
                {#if data.prose}
                    <pre class="reader-prose">{data.prose}</pre>
                {:else if data.chronicle}
                    {#each data.chronicle as entry}
                        {#if entry.type === 'world'}
                            <p class="reader-entry world">◍ {entry.text}</p>
                        {:else if entry.type === 'player'}
                            <p class="reader-entry player">▶ {entry.author}: {entry.text}</p>
                        {:else}
                            <p class="reader-entry dm">{entry.text}</p>
                        {/if}
                    {/each}
                {:else}
                    <p class="reader-empty muted">No chronicle entries.</p>
                {/if}
            </article>
        </section>
    </div>
{/if}

<style>
    .reader-import {
        text-align: center;
        padding: 2rem 1rem;
    }
    .reader-help { margin-top: 0.8rem; font-size: var(--t-sm); }
    .reader-error {
        color: var(--hp);
        margin-top: 0.8rem;
        font-size: var(--t-sm);
    }
    .reader-content {
        font-family: var(--font-prose);
        font-size: var(--t-sm);
        line-height: 1.55;
    }
    .reader-header {
        margin-bottom: 1rem;
        padding-bottom: 0.6rem;
        border-bottom: 1px solid var(--line-soft);
    }
    .reader-title {
        font-family: var(--font-display);
        font-size: var(--t-base);
        color: var(--ink);
        margin-bottom: 0.25rem;
    }
    .reader-meta { font-size: var(--t-xs); margin: 0.1rem 0; }
    .reader-section { margin: 0.75rem 0; }
    .reader-section h4 {
        font-family: var(--font-display);
        font-size: var(--t-xs);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--gold);
        margin-bottom: 0.4rem;
    }
    .reader-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .reader-list li {
        padding: 0.2rem 0;
        color: var(--ink-soft);
    }
    .reader-list strong { color: var(--ink); font-weight: 600; }
    .reader-chronicle {
        background: var(--inset);
        border-radius: var(--radius-sm);
        padding: 0.7rem;
    }
    .reader-entry { margin: 0.35rem 0; }
    .reader-entry.world { color: var(--gold); font-style: italic; }
    .reader-entry.player { color: var(--muted); }
    .reader-entry.dm { color: var(--ink); }
    .reader-prose {
        font-family: var(--font-prose);
        font-size: var(--t-sm);
        line-height: 1.5;
        white-space: pre-wrap;
        margin: 0;
        color: var(--ink);
    }
</style>
