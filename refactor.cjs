const fs = require('fs');

const file = '/Users/calvinslinde/.gemini/antigravity/scratch/roundtable/src/routes/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

// 1. Add import Modal
content = content.replace(
    "import QTE_Overlay from '$lib/components/QTE_Overlay.svelte';",
    "import QTE_Overlay from '$lib/components/QTE_Overlay.svelte';\n    import Modal from '$lib/components/Modal.svelte';"
);

// 2. Replace state (lines 60-113)
const stateStart = `    // Phase 30: NPC detail popover — opens when clicking an NPC name. Reads`;
const stateEnd = `    // Party roster — everyone except the active player. Used to render a small`;

const newState = `    // Unified Detail Popover State
    let activeDetail = $state<{ type: 'npc' | 'faction' | 'thread' | 'party' | 'location', id: string } | null>(null);

    let detailData = $derived.by(() => {
        if (!activeDetail) return null;
        const { type, id } = activeDetail;
        if (type === 'npc') {
            const data = ((codexData as any).npcs || {})[id];
            return data ? { name: id, ...data } : null;
        }
        if (type === 'faction') {
            const data = ((codexData as any).factions || {})[id];
            return data ? { name: id, ...data } : null;
        }
        if (type === 'thread') {
            const threads = (codexData as any).threads || [];
            return threads.find((x: any) => x?.id === id) || null;
        }
        if (type === 'party') {
            const data = ((codexData as any).party || {})[id];
            return data ? { name: id, ...data } : null;
        }
        if (type === 'location') {
            const data = ((codexData as any).locations || {})[id];
            return data ? { name: id, ...data } : null;
        }
        return null;
    });

    function openNpcDetail(name: string) { activeDetail = { type: 'npc', id: name }; }
    function closeNpcDetail() { activeDetail = null; }
    
    function openFactionDetail(name: string) { activeDetail = { type: 'faction', id: name }; }
    function closeFactionDetail() { activeDetail = null; }
    
    function openThreadDetail(id: string) { activeDetail = { type: 'thread', id }; }
    function closeThreadDetail() { activeDetail = null; }
    
    function openPartyDetail(name: string) { activeDetail = { type: 'party', id: name }; }
    function closePartyDetail() { activeDetail = null; }
    
    function closeUnifiedDetail() { activeDetail = null; }

    // Party roster — everyone except the active player. Used to render a small`;

const stateStartIndex = content.indexOf(stateStart);
const stateEndIndex = content.indexOf(stateEnd, stateStartIndex);

if (stateStartIndex > -1 && stateEndIndex > -1) {
    content = content.substring(0, stateStartIndex) + newState + content.substring(stateEndIndex + stateEnd.length);
} else {
    console.error("Could not find state block");
    process.exit(1);
}

// 3. Replace location state (lines 372-380)
const locStateStart = `    let locationDetailName = $state<string | null>(null);`;
const locStateEnd = `    function closeLocationDetail() { locationDetailName = null; }`;
const locStateStartIndex = content.indexOf(locStateStart);
const locStateEndIndex = content.indexOf(locStateEnd, locStateStartIndex);

const newLocState = `    function openLocationDetail(name: string) { activeDetail = { type: 'location', id: name }; }
    function closeLocationDetail() { activeDetail = null; }`;

if (locStateStartIndex > -1 && locStateEndIndex > -1) {
    content = content.substring(0, locStateStartIndex) + newLocState + content.substring(locStateEndIndex + locStateEnd.length);
} else {
    console.error("Could not find location state block");
    process.exit(1);
}

// 4. Replace html block (lines 2902-3179)
const htmlStart = `    <!-- Phase 30: NPC detail popover. Reads from live codex so it tracks\n         World Engine drift without re-opening. -->\n    {#if npcDetailName && npcDetailData}`;
const htmlEnd = `    <!-- Phase 34: pipeline audit log — flat scan view of every round with\n         audit or ruling data. Host-only debugging surface. -->\n    {#if showAuditLog}`;

const htmlStartIndex = content.indexOf(htmlStart);
const htmlEndIndex = content.indexOf(htmlEnd, htmlStartIndex);

const newHtml = `    <!-- Unified Details Modal -->
    <Modal isOpen={!!activeDetail} onClose={closeUnifiedDetail} customClass="npc-detail-card">
        {#if activeDetail && detailData}
            <header class="npc-detail-head" style="padding:0; border:none; background:transparent;">
                <div class="npc-detail-id">
                    <h3 style="margin:0;">{detailData.name || detailData.id}</h3>
                    {#if activeDetail.type === 'location'}
                        {#if detailData.name === currentLocationName}
                            <span class="npc-detail-role">· here ·</span>
                        {:else if detailData.biome}
                            <span class="npc-detail-role">{detailData.biome}</span>
                        {/if}
                    {:else if activeDetail.type === 'party'}
                        <span class="npc-detail-role">Party member</span>
                    {:else if detailData.role || detailData.type || detailData.status}
                        <span class="npc-detail-role">{detailData.role || detailData.type || detailData.status}</span>
                    {/if}
                </div>
            </header>
            
            <dl class="npc-detail-grid">
                {#if detailData.location}<div class="detail-row"><dt>Location</dt><dd>{detailData.location}</dd></div>{/if}
                {#if detailData.disposition !== undefined}<div class="detail-row"><dt>Disposition</dt><dd>{detailData.disposition}</dd></div>{/if}
                {#if detailData.status && activeDetail.type !== 'thread'}<div class="detail-row"><dt>Status</dt><dd>{detailData.status}</dd></div>{/if}
                {#if typeof detailData.last_seen_turn === 'number'}<div class="detail-row"><dt>Last seen</dt><dd>Turn {detailData.last_seen_turn} (now: {(codexData as any).world_clock?.turn || 0})</dd></div>{/if}
                {#if detailData.goal}<div class="detail-row"><dt>Goal</dt><dd>{detailData.goal}</dd></div>{/if}
                {#if typeof detailData.resources === 'number'}<div class="detail-row"><dt>Resources</dt><dd>{detailData.resources}</dd></div>{/if}
                {#if typeof detailData.tension === 'number'}<div class="detail-row"><dt>Tension</dt><dd>{detailData.tension}</dd></div>{/if}
                {#if typeof detailData.next_move_turn === 'number'}<div class="detail-row"><dt>Next move</dt><dd>Turn {detailData.next_move_turn} (now: {(codexData as any).world_clock?.turn || 0})</dd></div>{/if}
                {#if typeof detailData.lands_at_turn === 'number'}<div class="detail-row"><dt>Lands at</dt><dd>Turn {detailData.lands_at_turn} (now: {(codexData as any).world_clock?.turn || 0})</dd></div>{/if}
                {#if detailData.faction}<div class="detail-row"><dt>Faction</dt><dd>{detailData.faction}</dd></div>{/if}
                {#if detailData.scope}<div class="detail-row"><dt>Scope</dt><dd>{detailData.scope}</dd></div>{/if}
                {#if detailData.intensity !== undefined}<div class="detail-row"><dt>Intensity</dt><dd>{detailData.intensity}</dd></div>{/if}
                {#if typeof detailData.level === 'number'}<div class="detail-row"><dt>Level</dt><dd>{detailData.level}</dd></div>{/if}
                {#if typeof detailData.hp === 'number' && typeof detailData.max_hp === 'number'}
                    <div class="detail-row"><dt>Vitality</dt><dd>{detailData.hp} / {detailData.max_hp}</dd></div>
                {/if}
                {#if typeof detailData.xp === 'number'}
                    <div class="detail-row"><dt>XP</dt><dd>{detailData.xp} ({(detailData.xp % 10)} / 10 to next level)</dd></div>
                {/if}
                {#if typeof detailData.resolve === 'number'}<div class="detail-row"><dt>Resolve</dt><dd>{detailData.resolve}%</dd></div>{/if}
                {#if typeof detailData.corruption === 'number' && detailData.corruption > 0}<div class="detail-row"><dt>Corruption</dt><dd>{detailData.corruption}%</dd></div>{/if}
                {#if detailData.biome && detailData.name !== currentLocationName}<div class="detail-row"><dt>Biome</dt><dd>{detailData.biome}</dd></div>{/if}
                {#if typeof detailData.visited_turn === 'number'}<div class="detail-row"><dt>Last visited</dt><dd>Turn {detailData.visited_turn} (now: {(codexData as any).world_clock?.turn || 0})</dd></div>{/if}
                {#if detailData.exits && detailData.exits.length > 0}<div class="detail-row"><dt>Exits</dt><dd>{detailData.exits.join(', ')}</dd></div>{/if}
            </dl>

            {#if detailData.notes}
                <div class="npc-detail-notes"><h4>Notes</h4><p>{detailData.notes}</p></div>
            {/if}
            {#if detailData.agenda}
                <div class="npc-detail-notes"><h4>Agenda</h4><p>{detailData.agenda}</p></div>
            {/if}
            {#if detailData.description}
                <div class="npc-detail-notes"><h4>Description</h4><p>{detailData.description}</p></div>
            {/if}

            {#if detailData.active_traits && detailData.active_traits.length > 0}
                <div class="npc-detail-notes">
                    <h4>Traits</h4>
                    <ul class="trait-list">
                        {#each detailData.active_traits as trait}<li class="trait-tag">{trait}</li>{/each}
                    </ul>
                </div>
            {/if}
            {#if detailData.permanent_conditions && detailData.permanent_conditions.length > 0}
                <div class="npc-detail-notes">
                    <h4>Permanent scars</h4>
                    <ul class="scar-list">
                        {#each detailData.permanent_conditions as scar}<li class="scar-item">{scar}</li>{/each}
                    </ul>
                </div>
            {/if}
            {#if detailData.echo_tags && detailData.echo_tags.length > 0}
                <div class="npc-detail-notes">
                    <h4>Echo tags</h4>
                    <ul class="trait-list">
                        {#each detailData.echo_tags as tag}<li class="trait-tag">{tag}</li>{/each}
                    </ul>
                </div>
            {/if}

            {#if activeDetail.type !== 'thread'}
                <footer class="popover-actions">
                    <span class="popover-actions-label">Quick target:</span>
                    {#if activeDetail.type === 'npc'}
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Approach', detailData.name); closeUnifiedDetail(); }}>Approach</button>
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Ask', detailData.name); closeUnifiedDetail(); }}>Ask</button>
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Search', detailData.name); closeUnifiedDetail(); }}>Search</button>
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Persuade', detailData.name); closeUnifiedDetail(); }}>Persuade</button>
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Hide from', detailData.name); closeUnifiedDetail(); }}>Hide from</button>
                    {:else if activeDetail.type === 'faction'}
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Contact', detailData.name); closeUnifiedDetail(); }}>Contact</button>
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Approach', detailData.name); closeUnifiedDetail(); }}>Approach</button>
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Persuade', detailData.name); closeUnifiedDetail(); }}>Persuade</button>
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Investigate', detailData.name); closeUnifiedDetail(); }}>Investigate</button>
                    {:else if activeDetail.type === 'party'}
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Ask', detailData.name); closeUnifiedDetail(); }}>Ask</button>
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Persuade', detailData.name); closeUnifiedDetail(); }}>Persuade</button>
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Help', detailData.name); closeUnifiedDetail(); }}>Help</button>
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Heal', detailData.name); closeUnifiedDetail(); }}>Heal</button>
                    {:else if activeDetail.type === 'location'}
                        {#if detailData.name !== currentLocationName}
                            <button type="button" class="action-template-chip" onclick={() => { travelTo(detailData.name); closeUnifiedDetail(); }} disabled={isLoading}>Travel here</button>
                        {/if}
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Search', detailData.name); closeUnifiedDetail(); }}>Search</button>
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Investigate', detailData.name); closeUnifiedDetail(); }}>Investigate</button>
                        <button type="button" class="action-template-chip" onclick={() => { applyNpcTemplate('Look around', detailData.name); closeUnifiedDetail(); }}>Look around</button>
                    {/if}
                </footer>
            {/if}
        {/if}
    </Modal>
    
` + htmlEnd;

if (htmlStartIndex > -1 && htmlEndIndex > -1) {
    content = content.substring(0, htmlStartIndex) + newHtml + content.substring(htmlEndIndex + htmlEnd.length);
} else {
    console.error("Could not find HTML block");
    process.exit(1);
}

fs.writeFileSync(file, content);
console.log("Success");
