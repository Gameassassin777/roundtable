<script lang="ts">
    // Sidebar / sheet for character + party + world state.
    // Mobile: slides up as bottom sheet (driven by ui.codexSheetOpen)
    // Desktop: pinned right rail.

    import type { CodexSlice } from '$lib/stores/gameStore';
    import Bar from './Bar.svelte';
    import { DragGesture } from '@use-gesture/vanilla';
    import { onMount, onDestroy } from 'svelte';

    type Props = {
        codex: CodexSlice;
        characterName: string;
        sheetOpen: boolean;
        onclose: () => void;
    };

    let { codex, characterName, sheetOpen, onclose }: Props = $props();

    let search = $state('');
    let query = $derived(search.trim().toLowerCase());

    // Swipe-down to dismiss (mobile sheet)
    let sheetEl: HTMLElement | null = $state(null);
    let dragOffset = $state(0);
    function draggable(node: HTMLElement) {
        const gesture = new DragGesture(node, (state: any) => {
            const down = state.down;
            const my = state.movement[1];
            const vy = state.velocity[1];
            if (my > 0) dragOffset = my;
            if (!down) {
                if (my > 100 || (vy > 0.5 && my > 40)) onclose();
                dragOffset = 0;
            }
        }, {
            axis: 'y',
            filterTaps: true
        });
        return { destroy() { gesture.destroy(); } };
    }

    // Active player's own sheet
    let myChar = $derived.by(() => {
        const party = codex.party || {};
        const c = party[characterName];
        return c ? { name: characterName, ...c } : null;
    });

    // Party (excluding active player)
    let partyRoster = $derived.by(() => {
        const party = codex.party || {};
        return Object.keys(party)
            .filter((n) => n !== characterName)
            .sort((a, b) => a.localeCompare(b));
    });

    let filteredNpcs = $derived.by(() => {
        const entries = Object.entries(codex.npcs || {});
        if (!query) return entries;
        return entries.filter(([name, val]: [string, any]) =>
            name.toLowerCase().includes(query)
            || (val?.role || '').toLowerCase().includes(query)
            || (val?.location || '').toLowerCase().includes(query)
        );
    });

    let filteredFactions = $derived.by(() => {
        const entries = Object.entries(codex.factions || {});
        if (!query) return entries;
        return entries.filter(([name, val]: [string, any]) =>
            name.toLowerCase().includes(query)
            || (val?.type || '').toLowerCase().includes(query)
            || (val?.agenda || '').toLowerCase().includes(query)
        );
    });

    let filteredThreads = $derived.by(() => {
        const list = (codex.threads || []).filter(
            (t: any) => t?.status === 'active' || t?.status === 'landed'
        );
        if (!query) return list;
        return list.filter((t: any) =>
            (t?.name || '').toLowerCase().includes(query)
            || (t?.description || '').toLowerCase().includes(query)
        );
    });

    let filteredLocations = $derived.by(() => {
        const entries = Object.entries(codex.locations || {});
        if (!query) return entries;
        return entries.filter(([name, val]: [string, any]) => {
            if (name.toLowerCase().includes(query)) return true;
            if ((val?.description || '').toLowerCase().includes(query)) return true;
            if ((val?.biome || '').toLowerCase().includes(query)) return true;
            if (Array.isArray(val?.exits) && val.exits.some((e: string) => e.toLowerCase().includes(query))) return true;
            return false;
        });
    });

    let filteredInventory = $derived.by(() => {
        const entries = Object.entries(codex.inventory || {});
        if (!query) return entries;
        return entries.filter(([name]: [string, any]) => name.toLowerCase().includes(query));
    });

    // Inline expansion
    let expanded = $state<Record<string, boolean>>({});
    function toggle(key: string) {
        expanded[key] = !expanded[key];
    }
    const key = (...parts: string[]) => parts.join('::');

    // Tab state — Hero / Party / World. Default to Hero.
    type Tab = 'hero' | 'party' | 'world';
    let activeTab = $state<Tab>('hero');

    // Per-tab counts for badges
    let partyCount = $derived(partyRoster.length);
    let worldCount = $derived(
        filteredNpcs.length + filteredFactions.length + filteredThreads.length + filteredLocations.length
    );

    function tabBadge(t: Tab): string {
        if (t === 'party') return partyCount ? String(partyCount) : '';
        if (t === 'world') return worldCount ? String(worldCount) : '';
        return '';
    }
</script>

{#if sheetOpen}
    <div class="codex-backdrop" onclick={onclose}></div>
{/if}

<aside
    class="codex"
    class:sheet-open={sheetOpen}
    aria-label="World codex"
    bind:this={sheetEl}
    use:draggable
    style={dragOffset > 0 ? `transform: translateY(${dragOffset}px)` : undefined}
>
    <header class="codex-head">
        <div class="head-row">
            <span class="head-eyebrow">Codex</span>
            <button class="close-btn" onclick={onclose} aria-label="Close codex">×</button>
        </div>
        <div class="find-row">
            <span class="find-glyph" aria-hidden="true">§</span>
            <input type="search" placeholder="Search the codex…" bind:value={search} aria-label="Search codex" />
        </div>
    </header>

    <!-- Tab strip -->
    <div class="tab-strip" role="tablist">
        <button
            class="tab-btn"
            class:active={activeTab === 'hero'}
            role="tab"
            aria-selected={activeTab === 'hero'}
            onclick={() => (activeTab = 'hero')}
        >
            <span class="tab-label">Hero</span>
        </button>
        <button
            class="tab-btn"
            class:active={activeTab === 'party'}
            role="tab"
            aria-selected={activeTab === 'party'}
            onclick={() => (activeTab = 'party')}
        >
            <span class="tab-label">Party</span>
            {#if tabBadge('party')}<span class="tab-badge">{tabBadge('party')}</span>{/if}
        </button>
        <button
            class="tab-btn"
            class:active={activeTab === 'world'}
            role="tab"
            aria-selected={activeTab === 'world'}
            onclick={() => (activeTab = 'world')}
        >
            <span class="tab-label">World</span>
            {#if tabBadge('world')}<span class="tab-badge">{tabBadge('world')}</span>{/if}
        </button>
    </div>

    <div class="codex-scroll">
        <!-- ============ HERO TAB ============ -->
        {#if activeTab === 'hero'}
            {#if myChar}
                <section class="block">
                    <div class="char-card">
                        <div class="char-head">
                            {#if myChar.portrait_url}
                                <img src={myChar.portrait_url} alt={myChar.name} class="portrait" />
                            {/if}
                            <div class="char-id">
                                <div class="char-name">{myChar.name}</div>
                                <div class="char-class muted">{myChar.class_title || myChar.archetype || 'Adventurer'}</div>
                            </div>
                        </div>
                        <div class="stat-block">
                            <Bar label="HP" value={myChar.hp} max={myChar.max_hp || myChar.hp} kind="hp" />
                            <Bar label="Resolve" value={myChar.resolve} max={myChar.resolve} kind="resolve" />
                            <Bar label="Corruption" value={myChar.corruption} max={10} kind="corruption" />
                        </div>
                        {#if myChar.level || myChar.xp !== undefined}
                            <div class="lvl-row">
                                <span class="chip">Lv {myChar.level || 1}</span>
                                <span class="chip">XP {myChar.xp || 0}</span>
                            </div>
                        {/if}
                        {#if Array.isArray(myChar.active_traits) && myChar.active_traits.length}
                            <ul class="trait-list">
                                {#each myChar.active_traits as t}
                                    <li class="trait">· {t}</li>
                                {/each}
                            </ul>
                        {/if}
                        {#if Array.isArray(myChar.permanent_conditions) && myChar.permanent_conditions.length}
                            <div class="conditions">
                                {#each myChar.permanent_conditions as c}
                                    <span class="chip condition">{c}</span>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </section>
            {:else}
                <div class="empty">
                    <p class="empty-mark" aria-hidden="true">✦</p>
                    <p class="empty-eyebrow">No hero yet</p>
                    <p class="empty-hint">Forge one to begin.</p>
                </div>
            {/if}

            <!-- Inventory lives under Hero (it's the active player's stuff) -->
            {#if filteredInventory.length}
                <section class="block">
                    <h3 class="block-title eyebrow">Inventory · {filteredInventory.length}</h3>
                    <ul class="flat-list">
                        {#each filteredInventory as [name, val]}
                            <li class="flat-item">
                                <span class="flat-name">{name}</span>
                                {#if (val as any)?.durability !== undefined}
                                    <span class="chip"> ⑎ {(val as any).durability}</span>
                                {/if}
                                {#if (val as any)?.note}
                                    <span class="flat-note muted">{(val as any).note}</span>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                </section>
            {/if}
        {/if}

        <!-- ============ PARTY TAB ============ -->
        {#if activeTab === 'party'}
            {#if partyRoster.length}
                <section class="block">
                    <ul class="roster-list">
                        {#each partyRoster as name}
                            <li class="roster-item">
                                <button class="row-btn" onclick={() => toggle(key('party', name))}>
                                    <span class="row-name">{name}</span>
                                    <span class="row-meta muted">{codex.party[name]?.class_title || ''}</span>
                                    <span class="chevron">{expanded[key('party', name)] ? '−' : '+'}</span>
                                </button>
                                {#if expanded[key('party', name)] && codex.party[name]}
                                    <div class="row-detail">
                                        <Bar label="HP" value={codex.party[name].hp} max={codex.party[name].max_hp || codex.party[name].hp} kind="hp" />
                                        {#if codex.party[name].level}<span class="chip">Lv {codex.party[name].level}</span>{/if}
                                        {#if Array.isArray(codex.party[name].active_traits)}
                                            <div class="trait-inline">{codex.party[name].active_traits.join(' · ')}</div>
                                        {/if}
                                    </div>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                </section>
            {:else}
                <div class="empty">
                    <p class="empty-mark" aria-hidden="true">✦</p>
                    <p class="empty-eyebrow">You ride alone</p>
                    <p class="empty-hint">Share the world code to gather a party.</p>
                </div>
            {/if}
        {/if}

        <!-- ============ WORLD TAB ============ -->
        {#if activeTab === 'world'}
            {#if filteredNpcs.length}
                <section class="block">
                    <h3 class="block-title eyebrow">NPCs · {filteredNpcs.length}</h3>
                    <ul class="roster-list">
                        {#each filteredNpcs as [name, val]}
                            <li class="roster-item">
                                <button class="row-btn" onclick={() => toggle(key('npc', name))}>
                                    <span class="row-name">{name}</span>
                                    <span class="row-meta muted">{(val as any)?.role || ''}</span>
                                    <span class="chevron">{expanded[key('npc', name)] ? '−' : '+'}</span>
                                </button>
                                {#if expanded[key('npc', name)]}
                                    <div class="row-detail">
                                        {#if (val as any)?.disposition}<div class="kv"><b>Disposition</b> {(val as any).disposition}</div>{/if}
                                        {#if (val as any)?.location}<div class="kv"><b>Where</b> {(val as any).location}</div>{/if}
                                        {#if (val as any)?.goal}<div class="kv"><b>Wants</b> {(val as any).goal}</div>{/if}
                                        {#if (val as any)?.notes}<div class="kv selectable"><b>Notes</b> {(val as any).notes}</div>{/if}
                                        {#if (val as any)?.status}<div class="kv"><b>Status</b> {(val as any).status}</div>{/if}
                                    </div>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                </section>
            {/if}

            {#if filteredFactions.length}
                <section class="block">
                    <h3 class="block-title eyebrow">Factions · {filteredFactions.length}</h3>
                    <ul class="roster-list">
                        {#each filteredFactions as [name, val]}
                            <li class="roster-item">
                                <button class="row-btn" onclick={() => toggle(key('fac', name))}>
                                    <span class="row-name">{name}</span>
                                    <span class="row-meta muted">{(val as any)?.type || ''}</span>
                                    <span class="chevron">{expanded[key('fac', name)] ? '−' : '+'}</span>
                                </button>
                                {#if expanded[key('fac', name)]}
                                    <div class="row-detail">
                                        {#if (val as any)?.agenda}<div class="kv selectable"><b>Agenda</b> {(val as any).agenda}</div>{/if}
                                        {#if (val as any)?.disposition}<div class="kv"><b>Disposition</b> {(val as any).disposition}</div>{/if}
                                        {#if (val as any)?.resources !== undefined}<div class="kv"><b>Resources</b> {(val as any).resources}</div>{/if}
                                    </div>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                </section>
            {/if}

            {#if filteredThreads.length}
                <section class="block">
                    <h3 class="block-title eyebrow">Threads · {filteredThreads.length}</h3>
                    <ul class="roster-list">
                        {#each filteredThreads as t}
                            <li class="roster-item">
                                <button class="row-btn" onclick={() => toggle(key('thr', (t as any).id))}>
                                    <span class="row-name">{(t as any).name || (t as any).id}</span>
                                    <span class="row-meta muted">{(t as any).status}</span>
                                    <span class="chevron">{expanded[key('thr', (t as any).id)] ? '−' : '+'}</span>
                                </button>
                                {#if expanded[key('thr', (t as any).id)]}
                                    <div class="row-detail selectable">
                                        {#if (t as any).description}<div class="kv">{(t as any).description}</div>{/if}
                                    </div>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                </section>
            {/if}

            {#if filteredLocations.length}
                <section class="block">
                    <h3 class="block-title eyebrow">Places · {filteredLocations.length}</h3>
                    <ul class="roster-list">
                        {#each filteredLocations as [name, val]}
                            <li class="roster-item">
                                <button class="row-btn" onclick={() => toggle(key('loc', name))}>
                                    <span class="row-name">{name}</span>
                                    <span class="row-meta muted">{(val as any)?.biome || ''}</span>
                                    <span class="chevron">{expanded[key('loc', name)] ? '−' : '+'}</span>
                                </button>
                                {#if expanded[key('loc', name)]}
                                    <div class="row-detail selectable">
                                        {#if (val as any)?.description}<div class="kv">{(val as any).description}</div>{/if}
                                        {#if Array.isArray((val as any)?.exits) && (val as any).exits.length}
                                            <div class="kv"><b>Exits</b> {(val as any).exits.join(' · ')}</div>
                                        {/if}
                                        {#if (val as any)?.notes}<div class="kv">{(val as any).notes}</div>{/if}
                                    </div>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                </section>
            {/if}

            {#if !filteredNpcs.length && !filteredFactions.length && !filteredThreads.length && !filteredLocations.length}
                <div class="empty">
                    <p class="empty-mark" aria-hidden="true">✦</p>
                    <p class="empty-eyebrow">The world is uncharted</p>
                    <p class="empty-hint">Play to discover its people and places.</p>
                </div>
            {/if}
        {/if}
    </div>
</aside>

<style>
    .codex {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--page);
        border-left: 1px solid var(--line);
        
        /* Desktop positioning — slides from right when sheetOpen */
        position: fixed;
        top: 0;
        bottom: 0;
        right: 0;
        width: 320px;
        z-index: 33;
        transform: translateX(100%);
        transition: transform 0.32s cubic-bezier(0.2, 0.7, 0.2, 1);
        box-shadow: -4px 0 24px rgba(60, 40, 20, 0.12);
    }

    .codex.sheet-open {
        transform: translateX(0);
        animation: desktop-slide-in 0.32s cubic-bezier(0.2, 0.7, 0.2, 1);
    }

    @keyframes desktop-slide-in {
        from { transform: translateX(100%); }
        to { transform: translateX(0); }
    }

    .codex-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(42, 36, 32, 0.4);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        z-index: 32;
        animation: backdrop-in 0.24s ease-out;
    }
    @keyframes backdrop-in { from { opacity: 0; } to { opacity: 1; } }

    .codex-head {
        padding: 0.55rem 0.9rem 0.5rem;
        border-bottom: 1px solid var(--gold-soft);
        flex-shrink: 0;
        background: var(--card);
    }
    .head-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.4rem;
    }
    .head-eyebrow {
        font-family: var(--font-display);
        font-size: var(--t-sm);
        font-weight: 600;
        letter-spacing: 0.18em;
        color: var(--ink);
        text-transform: uppercase;
    }
    .close-btn {
        width: 44px;
        height: 44px;
        min-height: 44px;
        padding: 0;
        background: transparent;
        border: none;
        color: var(--muted);
        font-family: var(--font-display);
        font-size: 1.4rem;
        line-height: 1;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: color 0.18s ease, transform 0.18s ease;
    }
    .close-btn:hover, .close-btn:focus-visible {
        color: var(--accent);
        transform: scale(1.08);
        outline: none;
    }

    .find-row {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.2rem 0;
        border-bottom: 1px solid var(--line-soft);
        transition: border-color 0.2s ease;
    }
    .find-row:focus-within { border-bottom-color: var(--gold); }
    .find-glyph {
        color: var(--gold);
        font-family: var(--font-display);
        font-size: 1.05rem;
        line-height: 1;
        flex-shrink: 0;
        opacity: 0.7;
    }
    .find-row input {
        flex: 1;
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-sm);
        color: var(--ink);
        background: transparent;
        border: none;
        outline: none;
        padding: 0.3rem 0;
        border-radius: 0;
    }
    .find-row input::placeholder { color: var(--muted); font-style: italic; }

    /* Tab strip — single-row, hairline underline */
    .tab-strip {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0;
        padding: 0 0.5rem;
        border-bottom: 1px solid var(--line-soft);
        background: var(--page);
        flex-shrink: 0;
    }
    .tab-btn {
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        padding: 0.55rem 0.4rem;
        font-family: var(--font-display);
        font-size: var(--t-xs);
        font-weight: 600;
        letter-spacing: 0.14em;
        color: var(--muted);
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.3rem;
        cursor: pointer;
        text-transform: uppercase;
        transition: color 0.18s ease, border-color 0.18s ease;
    }
    .tab-btn:hover { color: var(--ink); background: transparent; }
    .tab-btn.active {
        color: var(--ink);
        border-bottom-color: var(--gold);
    }
    .tab-badge {
        font-family: var(--font-ui);
        font-size: 10px;
        background: var(--inset);
        color: var(--ink-soft);
        padding: 0 0.35rem;
        border-radius: var(--radius-pill);
        line-height: 16px;
        font-variant-numeric: tabular-nums;
    }
    .tab-btn.active .tab-badge {
        background: var(--gold-soft);
        color: var(--gold);
    }

    .codex-scroll {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding: 0.5rem 0.9rem 2rem;
        min-height: 0;
        overscroll-behavior: contain;
    }

    .block { margin: 0.8rem 0; }
    .block-title {
        margin-bottom: 0.5rem;
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid var(--gold-soft);
    }

    /* ---------- Character card ---------- */
    .char-card {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 0.75rem;
        box-shadow: var(--shadow);
    }
    .char-head {
        display: flex;
        gap: 0.65rem;
        align-items: center;
        margin-bottom: 0.6rem;
        padding-bottom: 0.55rem;
        border-bottom: 1px solid var(--line-soft);
    }
    .portrait {
        width: 48px; height: 48px;
        border-radius: var(--radius-sm);
        object-fit: cover;
        border: 1px solid var(--line);
    }
    .char-id { flex: 1; min-width: 0; }
    .char-name { font-family: var(--font-display); font-weight: 600; font-size: var(--t-base); color: var(--ink); }
    .char-class { font-size: var(--t-xs); color: var(--muted); font-style: italic; font-family: var(--font-prose); }
    .stat-block {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }
    .lvl-row {
        display: flex;
        gap: 0.3rem;
        margin-top: 0.6rem;
    }
    .trait-list {
        list-style: none;
        margin: 0.55rem 0 0;
        padding: 0;
        font-size: var(--t-xs);
        color: var(--ink-soft);
        font-family: var(--font-prose);
        line-height: 1.5;
    }
    .trait { padding: 0.1rem 0; }
    .conditions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        margin-top: 0.45rem;
    }
    .chip.condition {
        background: rgba(160, 70, 64, 0.08);
        color: var(--hp);
        border-color: var(--hp);
    }

    /* ---------- Lists ---------- */
    .roster-list, .flat-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .roster-item {
        border-top: 1px solid var(--line-soft);
    }
    .roster-item:first-child {
        border-top: none;
    }
    .row-btn {
        width: 100%;
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 0.5rem;
        align-items: baseline;
        padding: 0.6rem 0.2rem;
        text-align: left;
        background: transparent;
        border: none;
        font-family: var(--font-ui);
        min-height: 44px;
        cursor: pointer;
        transition: background 0.15s ease;
    }
    .row-btn:hover { background: var(--gold-soft); }
    .row-name {
        font-size: var(--t-sm);
        color: var(--ink);
        font-weight: 500;
    }
    .row-meta {
        font-size: var(--t-xs);
        color: var(--muted);
        font-family: var(--font-prose);
        font-style: italic;
    }
    .chevron {
        color: var(--gold);
        font-size: var(--t-sm);
        width: 1rem;
        text-align: right;
        opacity: 0.7;
    }
    .row-detail {
        padding: 0.4rem 0.2rem 0.7rem;
        font-size: var(--t-xs);
        line-height: 1.55;
        color: var(--ink-soft);
        font-family: var(--font-prose);
    }
    .kv { margin: 0.2rem 0; }
    .kv b {
        font-weight: 500;
        color: var(--gold);
        margin-right: 0.35rem;
        font-family: var(--font-display);
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
    }

    .flat-list .flat-item {
        padding: 0.5rem 0.2rem;
        display: flex;
        gap: 0.4rem;
        align-items: baseline;
        font-size: var(--t-sm);
        border-top: 1px solid var(--line-soft);
        min-height: 44px;
    }
    .flat-list .flat-item:first-child { border-top: none; }
    .flat-name { font-weight: 500; color: var(--ink); }
    .flat-note {
        font-size: var(--t-xs);
        margin-left: auto;
        max-width: 50%;
        text-align: right;
        color: var(--muted);
        font-style: italic;
        font-family: var(--font-prose);
    }

    .empty {
        padding: 4rem 1rem;
        text-align: center;
    }
    .empty-mark {
        font-family: var(--font-display);
        color: var(--gold);
        font-size: 1.4rem;
        opacity: 0.5;
        margin-bottom: 0.6rem;
    }
    .empty-eyebrow {
        font-family: var(--font-display);
        font-size: var(--t-xs);
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--ink-soft);
        margin-bottom: 0.25rem;
    }
    .empty-hint {
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-sm);
        color: var(--muted);
    }

    /* ---------- Mobile / sheet mode ---------- */
    @media (max-width: 899px) {
        .codex {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            max-width: 760px;
            margin: 0 auto;
            height: 75dvh;
            transform: translateY(100%);
            transition: transform 0.32s cubic-bezier(0.2, 0.7, 0.2, 1);
            border-left: none;
            border-top: 1px solid var(--line);
            border-radius: 6px 6px 0 0;
            box-shadow: 0 -8px 32px rgba(60, 40, 20, 0.18);
            padding-bottom: var(--safe-bottom);
            z-index: 33;
        }
        .codex.sheet-open {
            transform: translateY(0);
            animation: sheet-in 0.4s cubic-bezier(0.2, 0.7, 0.2, 1);
        }
        @keyframes sheet-in {
            from { transform: translateY(100%); opacity: 0.4; }
            to   { transform: translateY(0); opacity: 1; }
        }
        .close-btn { display: inline-flex; }
    }

    @media (prefers-reduced-motion: reduce) {
        .codex, .codex-backdrop { animation: none !important; transition: none !important; }
    }
</style>
