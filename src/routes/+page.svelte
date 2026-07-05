<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import CinematicDiorama from '$lib/components/CinematicDiorama.svelte';
    import QTE_Overlay from '$lib/components/QTE_Overlay.svelte';
    import { createGameState } from '$lib/stores/gameStore';
    import { callAI } from '$lib/ai/dmEngine';
    import { buildBatchPrompt } from '$lib/ai/promptBuilder';

    let roomId = $state("crypt-99");
    let gameState = createGameState(roomId);

    let { chatStore, addChatEntry, ydoc, provider, yPendingActions, actionLock, reportKeyExhausted } = gameState;

    let chatLog = $state([]);
    let apiKey = $state(localStorage.getItem('rt_api_key') || '');
    let isReady = $derived(!!apiKey);
    let chatInput = $state('');
    let isLoading = $state(false);
    let showQTE = $state(false);
    let qteConfig = $state({ time_limit_ms: 1000, start_time: 0 });
    let currentSceneTags = $state({ biome: "crypt", weather: "none", mood: "oppressive" });
    
    // UI states
    let showCodexMobile = $state(false);
    let showSettings = $state(!apiKey);
    let connectionStatus = $state("Syncing");

    // Reconstruct Codex state reactively
    let codexData = $state({
        location: "The Black Crypt",
        plot_summary: "The party seeks the Ashen Crown.",
        scene_tags: { biome: "crypt", weather: "none", mood: "oppressive" },
        party: {
            "Fighter": { hp: 15, max_hp: 15, resolve: 0, corruption: 0, active_traits: [], permanent_conditions: [], echo_tags: [] }
        },
        inventory: {} as Record<string, { durability: number }>
    });

    const unsubscribe = chatStore.subscribe(value => {
        chatLog = value;
        // Scroll chat log to bottom
        setTimeout(() => {
            const el = document.querySelector('.chat-log-scroll');
            if (el) el.scrollTop = el.scrollHeight;
        }, 50);
    });

    // Monitor Yjs WebRTC peer events
    let activePeers = $state(0);
    
    onMount(() => {
        provider.on('peers', (event) => {
            activePeers = event.webrtcConns.size;
            connectionStatus = activePeers > 0 ? "Synced" : "Offline P2P";
        });

        const yCodex = ydoc.getMap('memoryCodex');
        yCodex.observe(() => {
            const raw = yCodex.toJSON();
            if (raw) {
                codexData = {
                    location: raw.location || "The Black Crypt",
                    plot_summary: raw.plot_summary || "",
                    scene_tags: raw.scene_tags || { biome: "crypt", weather: "none", mood: "oppressive" },
                    party: raw.party || {
                        "Fighter": { hp: 15, max_hp: 15, resolve: 0, corruption: 0, active_traits: [], permanent_conditions: [], echo_tags: [] }
                    },
                    inventory: raw.inventory || {}
                };
                if (codexData.scene_tags) currentSceneTags = codexData.scene_tags;
            }
        });
    });

    function saveSettings() {
        if (apiKey) { 
            localStorage.setItem('rt_api_key', apiKey); 
            isReady = true; 
            showSettings = false; 
        }
    }

    function switchRoom() {
        if (roomId.trim()) {
            provider.destroy();
            unsubscribe();
            
            // Reinitialize game state
            gameState = createGameState(roomId.trim());
            chatStore = gameState.chatStore;
            addChatEntry = gameState.addChatEntry;
            ydoc = gameState.ydoc;
            provider = gameState.provider;
            yPendingActions = gameState.yPendingActions;
            actionLock = gameState.actionLock;
            reportKeyExhausted = gameState.reportKeyExhausted;
            
            // Re-subscribe
            chatStore.subscribe(value => {
                chatLog = value;
                setTimeout(() => {
                    const el = document.querySelector('.chat-log-scroll');
                    if (el) el.scrollTop = el.scrollHeight;
                }, 50);
            });
            
            // Re-bind observers
            const yCodex = ydoc.getMap('memoryCodex');
            yCodex.observe(() => {
                const raw = yCodex.toJSON();
                if (raw) {
                    codexData = {
                        location: raw.location || "The Black Crypt",
                        plot_summary: raw.plot_summary || "",
                        scene_tags: raw.scene_tags || { biome: "crypt", weather: "none", mood: "oppressive" },
                        party: raw.party || {
                            "Fighter": { hp: 15, max_hp: 15, resolve: 0, corruption: 0, active_traits: [], permanent_conditions: [], echo_tags: [] }
                        },
                        inventory: raw.inventory || {}
                    };
                    if (codexData.scene_tags) currentSceneTags = codexData.scene_tags;
                }
            });
            
            addChatEntry({ author: 'System', text: `Moved to room: ${roomId}`, type: 'dm' });
        }
    }

    async function submitAction() {
        if (!chatInput.trim() || isLoading) return;
        const userAction = chatInput.trim();
        yPendingActions.push([{ text: userAction }]);
        chatInput = '';
        isLoading = true;

        let isProcessor = false;
        ydoc.transact(() => {
            if (!actionLock.get('locked')) {
                actionLock.set('locked', true);
                actionLock.set('processor', ydoc.clientID);
                isProcessor = true;
            }
        });

        // Visually echo local player input instantly
        addChatEntry({ author: 'You', text: userAction, type: 'player' });

        if (isProcessor) {
            addChatEntry({ author: 'System', text: 'Gathering party actions (5s window)...', type: 'dm' });
            await new Promise(r => setTimeout(r, 5000)); // 5s batch window
            const actionsToProcess = yPendingActions.toArray();
            yPendingActions.delete(0, yPendingActions.length);
            
            const prompt = buildBatchPrompt(actionsToProcess, ydoc);
            try {
                const response = await callAI(prompt, apiKey, ydoc, ydoc.clientID);
                addChatEntry({ author: 'Dungeon Master', text: response.narration, type: 'dm' });
                
                if (response.ui_update?.qte) {
                    qteConfig = { ...response.ui_update.qte, start_time: Date.now() + 1500 };
                    showQTE = true;
                }
            } catch (e) {
                addChatEntry({ author: 'System', text: 'Resolution collapsed. Check API key limits.', type: 'dm' });
            }
            
            actionLock.set('locked', false);
            actionLock.set('processor', null);
            isLoading = false;
        } else {
            // Wait for leader processor to resolve
            setTimeout(() => {
                isLoading = false;
            }, 7000);
        }
    }

    function handleQTEResult(success: boolean) {
        showQTE = false;
        addChatEntry({ 
            author: 'System', 
            text: success ? "DODGE SUCCESSFUL: Avoided the hazard." : "DODGE FAILED: Wound sustained.", 
            type: 'dm' 
        });
        
        // Haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate(success ? [40, 40] : 400);
        }
    }

    onDestroy(() => {
        provider.destroy();
        unsubscribe();
    });
</script>

<main>
    <!-- Background Canvas Diorama -->
    <div class="canvas-container">
        <CinematicDiorama sceneTags={currentSceneTags} />
    </div>

    <!-- UI Overlay Grid -->
    <div class="layout-grid">
        
        <!-- Header HUD -->
        <header class="hud-header panel">
            <div class="hud-left">
                <button class="menu-toggle" onclick={() => showCodexMobile = !showCodexMobile}>
                    🛡️ Codex
                </button>
                <div class="brand">
                    <h1>ROUND TABLE</h1>
                    <span class="version">v1.1</span>
                </div>
            </div>
            
            <div class="hud-center">
                <div class="location-tag">
                    <span class="icon">📍</span>
                    <span class="loc-text">{codexData.location}</span>
                </div>
            </div>

            <div class="hud-right">
                <div class="status-orb {connectionStatus.toLowerCase().replace(' ', '-')}">
                    <span class="ping-pulse"></span>
                    <span class="status-text">{connectionStatus} ({activePeers} peers)</span>
                </div>
                <button class="settings-btn" onclick={() => showSettings = !showSettings}>
                    ⚙️
                </button>
            </div>
        </header>

        <div class="main-content">
            <!-- Left Sidebar: Soul Forge & Codex -->
            <aside class="codex-sidebar panel {showCodexMobile ? 'mobile-visible' : ''}">
                <div class="sidebar-header">
                    <h2>SOUL FORGE</h2>
                    <span class="archetype">FIGHTER - DEGRADABLE STATE</span>
                </div>

                <div class="sidebar-body">
                    <!-- HP Status -->
                    <div class="stat-group">
                        <div class="stat-label-row">
                            <span>VITALITY (HP)</span>
                            <span class="val red">{codexData.party.Fighter?.hp || 15} / {codexData.party.Fighter?.max_hp || 15}</span>
                        </div>
                        <div class="progress-bar">
                            <div class="fill hp" style="width: {((codexData.party.Fighter?.hp || 15) / (codexData.party.Fighter?.max_hp || 15)) * 100}%"></div>
                        </div>
                    </div>

                    <!-- Resolve Status -->
                    <div class="stat-group">
                        <div class="stat-label-row">
                            <span>SANITY / RESOLVE</span>
                            <span class="val gold">{codexData.party.Fighter?.resolve || 0} %</span>
                        </div>
                        <div class="progress-bar">
                            <div class="fill resolve" style="width: {codexData.party.Fighter?.resolve || 0}%"></div>
                        </div>
                    </div>

                    <!-- Corruption Status -->
                    <div class="stat-group">
                        <div class="stat-label-row">
                            <span>CORRUPTION</span>
                            <span class="val purple">{codexData.party.Fighter?.corruption || 0} %</span>
                        </div>
                        <div class="progress-bar">
                            <div class="fill corruption" style="width: {codexData.party.Fighter?.corruption || 0}%"></div>
                        </div>
                    </div>

                    <hr class="divider" />

                    <!-- Permanent Conditions -->
                    <div class="codex-section">
                        <h3>PERMANENT SCARS</h3>
                        {#if !codexData.party.Fighter?.permanent_conditions || codexData.party.Fighter.permanent_conditions.length === 0}
                            <p class="empty-state">No scars yet. Survive the night.</p>
                        {:else}
                            <ul class="scar-list">
                                {#each codexData.party.Fighter.permanent_conditions as scar}
                                    <li class="scar-item">{scar}</li>
                                {/each}
                            </ul>
                        {/if}
                    </div>

                    <hr class="divider" />

                    <!-- Inventory Grid -->
                    <div class="codex-section">
                        <h3>ACTIVE DEGRADABLES</h3>
                        <div class="inventory-grid">
                            {#each Array(6) as _, i}
                                {@const keys = Object.keys(codexData.inventory)}
                                {@const item = keys[i] ? { name: keys[i], ...codexData.inventory[keys[i]] } : null}
                                <div class="inv-slot {item ? 'occupied' : ''}">
                                    {#if item}
                                        <div class="item-name">{item.name}</div>
                                        <div class="durability-indicator">
                                            <span class="label">DUR:</span>
                                            <span class="dur-bar-bg">
                                                <span class="dur-bar-fill" style="width: {(item.durability / 3) * 100}%"></span>
                                            </span>
                                            <span class="count">{item.durability}/3</span>
                                        </div>
                                    {:else}
                                        <span class="slot-num">{i + 1}</span>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            </aside>

            <!-- Main Panel: Chat Log Console -->
            <section class="console-panel panel">
                <!-- Chat log body -->
                <div class="chat-log-scroll">
                    <div class="chat-log-container">
                        <!-- Default introduction if chat is empty -->
                        {#if chatLog.length === 0}
                            <div class="intro-card">
                                <h3>Welcome to the Round Table</h3>
                                <p>A fluid, serverless AI-driven Grimdark VTT. Provide player input to trigger batched turns and math rolls.</p>
                            </div>
                        {/if}

                        {#each chatLog as entry}
                            <div class="log-message {entry.type}">
                                <div class="message-header">
                                    <span class="sender">{entry.author}</span>
                                </div>
                                <div class="message-body">
                                    {#if entry.type === 'dm'}
                                        <p class="dm-narrative">{@html entry.text}</p>
                                    {:else}
                                        <p class="player-text">{entry.text}</p>
                                    {/if}
                                </div>
                            </div>
                        {/each}

                        {#if isLoading}
                            <div class="log-message dm loading">
                                <div class="message-header"><span class="sender">DM</span></div>
                                <div class="message-body">
                                    <div class="weaving-spinner">
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                        <span class="text">Weaving fate...</span>
                                    </div>
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Bottom Input: Action Crucible -->
                <div class="action-crucible">
                    <input 
                        type="text" 
                        bind:value={chatInput} 
                        onkeydown={(e) => e.key === 'Enter' && submitAction()} 
                        placeholder={isLoading ? 'The wheel of fate turns...' : 'Formulate your action (rolls d20 +5 vs DC 12)...'} 
                        disabled={isLoading || !isReady} 
                    />
                    <button class="act-btn" onclick={submitAction} disabled={isLoading || !isReady}>
                        {isLoading ? '...' : 'ACT'}
                    </button>
                </div>
            </section>
        </div>
    </div>

    <!-- Modal settings drawer -->
    {#if showSettings}
        <div class="modal-overlay">
            <div class="settings-drawer panel">
                <h2>HUD & COMPASS</h2>
                
                <div class="input-field">
                    <label for="room-id">VIRTUAL ROOM PATH</label>
                    <div class="room-input-group">
                        <input id="room-id" type="text" bind:value={roomId} placeholder="e.g. crypt-99" />
                        <button class="action-btn" onclick={switchRoom}>CONNECT</button>
                    </div>
                </div>

                <div class="input-field">
                    <label for="api-key">GOOGLE AI STUDIO KEY</label>
                    <input id="api-key" type="password" bind:value={apiKey} placeholder="AIzaSy..." />
                    <p class="note">Saved only on your browser's local storage. Never leaves the device.</p>
                </div>

                <div class="drawer-actions">
                    <button class="save-btn" onclick={saveSettings}>ENTER CRUCIBLE</button>
                    {#if isReady}
                        <button class="cancel-btn" onclick={() => showSettings = false}>CLOSE</button>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    <!-- Synced Quick Time Event Overlay -->
    {#if showQTE}
        <QTE_Overlay timeLimit={qteConfig.time_limit_ms} startTime={qteConfig.start_time} onresult={handleQTEResult} />
    {/if}
</main>

<style>
    main { 
        width: 100vw; 
        height: 100vh; 
        position: relative; 
        background: #060608; 
    }
    
    .canvas-container {
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
    }

    .layout-grid {
        position: absolute;
        inset: 0;
        z-index: 10;
        display: flex;
        flex-direction: column;
        padding: 1.5rem;
        gap: 1.2rem;
        pointer-events: none;
    }

    /* HUD Header Styles */
    .hud-header {
        height: 60px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 1.5rem;
        pointer-events: auto;
        border-bottom: 1.5px solid var(--gold-glow);
    }

    .hud-left {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .brand {
        display: flex;
        flex-direction: column;
    }

    .brand h1 {
        font-family: var(--font-serif);
        font-size: 1.15rem;
        letter-spacing: 2px;
        color: #fff;
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
        margin: 0;
    }

    .version {
        font-size: 0.6rem;
        color: var(--gold);
        letter-spacing: 1px;
    }

    .menu-toggle {
        display: none;
        padding: 0.4rem 0.8rem;
        font-size: 0.8rem;
    }

    .hud-center {
        display: flex;
        align-items: center;
    }

    .location-tag {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-family: var(--font-serif);
        font-size: 0.9rem;
        color: var(--gold);
        background: rgba(158, 27, 27, 0.1);
        border: 1px solid var(--gold-glow);
        padding: 0.3rem 1rem;
        border-radius: 20px;
        box-shadow: inset 0 0 8px rgba(158, 27, 27, 0.2);
    }

    .hud-right {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .status-orb {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    .status-orb.synced { color: #5cb85c; }
    .status-orb.syncing { color: #f0ad4e; }
    .status-orb.offline-p2p { color: #d9534f; }

    .ping-pulse {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: currentColor;
        box-shadow: 0 0 8px currentColor;
    }

    .status-orb.synced .ping-pulse {
        animation: pulse-green 1.5s infinite;
    }

    @keyframes pulse-green {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(92, 184, 92, 0.7); }
        70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(92, 184, 92, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(92, 184, 92, 0); }
    }

    .settings-btn {
        background: transparent;
        border: none;
        box-shadow: none;
        color: var(--ash-gray);
        font-size: 1.25rem;
        padding: 0;
        width: auto;
        cursor: pointer;
    }

    .settings-btn:hover {
        transform: rotate(30deg);
        color: var(--gold);
        box-shadow: none;
    }

    /* Main Body Panels */
    .main-content {
        display: flex;
        flex-grow: 1;
        gap: 1.2rem;
        height: calc(100% - 75px);
    }

    /* Codex Sidebar */
    .codex-sidebar {
        width: 320px;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        pointer-events: auto;
        padding: 1.2rem;
    }

    .sidebar-header {
        margin-bottom: 1.2rem;
        border-bottom: 1px solid var(--glass-border);
        padding-bottom: 0.6rem;
    }

    .sidebar-header h2 {
        font-family: var(--font-serif);
        font-size: 1.2rem;
        letter-spacing: 2px;
        color: #fff;
    }

    .archetype {
        font-size: 0.65rem;
        color: var(--gold);
        letter-spacing: 1px;
    }

    .sidebar-body {
        display: flex;
        flex-direction: column;
        gap: 1.2rem;
        overflow-y: auto;
        flex-grow: 1;
        padding-right: 2px;
    }

    .stat-group {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }

    .stat-label-row {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        font-weight: 500;
        letter-spacing: 1px;
        opacity: 0.8;
    }

    .stat-label-row .val {
        font-weight: bold;
    }

    .val.red { color: #d9534f; }
    .val.gold { color: var(--gold); }
    .val.purple { color: #aa86ff; }

    .progress-bar {
        width: 100%;
        height: 6px;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 3px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.03);
    }

    .fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.4s ease;
    }

    .fill.hp {
        background: linear-gradient(90deg, #d9534f, #ff6b6b);
        box-shadow: 0 0 6px rgba(217, 83, 79, 0.5);
    }

    .fill.resolve {
        background: linear-gradient(90deg, #d4af37, #ffd700);
        box-shadow: 0 0 6px rgba(212, 175, 55, 0.5);
    }

    .fill.corruption {
        background: linear-gradient(90deg, #8a2be2, #ba55d3);
        box-shadow: 0 0 6px rgba(138, 43, 226, 0.5);
    }

    .divider {
        border: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--glass-border), transparent);
    }

    .codex-section h3 {
        font-family: var(--font-serif);
        font-size: 0.85rem;
        letter-spacing: 1.5px;
        color: #fff;
        margin-bottom: 0.6rem;
    }

    .empty-state {
        font-size: 0.75rem;
        font-style: italic;
        opacity: 0.5;
        text-align: center;
        padding: 0.8rem 0;
    }

    .scar-list {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    .scar-item {
        font-size: 0.75rem;
        color: #ff6b6b;
        background: rgba(217, 83, 79, 0.08);
        border: 1px solid rgba(217, 83, 79, 0.2);
        padding: 0.4rem 0.6rem;
        border-radius: 6px;
        font-family: var(--font-serif);
    }

    /* Inventory Grid */
    .inventory-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.6rem;
    }

    .inv-slot {
        height: 70px;
        background: rgba(0, 0, 0, 0.4);
        border: 1px dashed var(--glass-border);
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 0.4rem;
        transition: all 0.3s ease;
    }

    .inv-slot.occupied {
        background: rgba(158, 27, 27, 0.05);
        border: 1px solid var(--gold-glow);
        box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.5);
    }

    .inv-slot.occupied:hover {
        border-color: var(--gold);
        box-shadow: 0 0 8px var(--gold-glow);
    }

    .slot-num {
        font-size: 0.9rem;
        opacity: 0.15;
        font-weight: bold;
    }

    .item-name {
        font-size: 0.7rem;
        font-weight: 600;
        letter-spacing: 0.5px;
        color: #fff;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
        margin-bottom: 0.3rem;
    }

    .durability-indicator {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        width: 100%;
    }

    .durability-indicator .label {
        font-size: 0.5rem;
        opacity: 0.5;
    }

    .dur-bar-bg {
        flex-grow: 1;
        height: 3px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 1.5px;
        overflow: hidden;
    }

    .dur-bar-fill {
        display: block;
        height: 100%;
        background: var(--gold);
    }

    .durability-indicator .count {
        font-size: 0.55rem;
        font-family: monospace;
        opacity: 0.8;
    }

    /* Console Chat Panel */
    .console-panel {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        pointer-events: auto;
        overflow: hidden;
    }

    .chat-log-scroll {
        flex-grow: 1;
        overflow-y: auto;
        padding: 1.5rem;
        background: rgba(6, 6, 8, 0.4);
    }

    .chat-log-container {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        justify-content: flex-end;
    }

    .intro-card {
        text-align: center;
        padding: 3rem 1.5rem;
        max-width: 460px;
        margin: auto;
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.2);
    }

    .intro-card h3 {
        font-family: var(--font-serif);
        color: #fff;
        margin-bottom: 0.8rem;
        letter-spacing: 1px;
    }

    .intro-card p {
        font-size: 0.85rem;
        line-height: 1.5;
        opacity: 0.6;
    }

    .log-message {
        display: flex;
        flex-direction: column;
        max-width: 85%;
        animation: message-appear 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes message-appear {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .log-message.player {
        align-self: flex-end;
        align-items: flex-end;
    }

    .log-message.dm {
        align-self: flex-start;
        align-items: flex-start;
        max-width: 90%;
    }

    .message-header {
        margin-bottom: 0.25rem;
    }

    .message-header .sender {
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-weight: 600;
        opacity: 0.5;
    }

    .log-message.player .message-header .sender {
        color: var(--ash-gray);
    }

    .log-message.dm .message-header .sender {
        color: var(--gold);
        font-family: var(--font-serif);
    }

    .message-body {
        padding: 0.8rem 1.2rem;
        border-radius: 12px;
        line-height: 1.55;
    }

    .log-message.player .message-body {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--glass-border);
        border-bottom-right-radius: 2px;
    }

    .player-text {
        font-size: 0.92rem;
        color: #fff;
    }

    .log-message.dm .message-body {
        background: rgba(158, 27, 27, 0.03);
        border-left: 2.5px solid var(--blood-red);
        border-top-left-radius: 2px;
        border-top: 1px solid rgba(258, 27, 27, 0.05);
        border-right: 1px solid rgba(258, 27, 27, 0.02);
        border-bottom: 1px solid rgba(258, 27, 27, 0.02);
        box-shadow: inset 5px 0 15px rgba(158, 27, 27, 0.05);
    }

    .dm-narrative {
        font-family: var(--font-serif);
        font-size: 0.95rem;
        color: #e3d3c3; /* Antique parchment text look */
        text-shadow: 1px 1px 0 rgba(0,0,0,0.4);
    }

    /* Weaving Fate loading state */
    .weaving-spinner {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-family: var(--font-serif);
        font-size: 0.85rem;
        color: var(--gold);
    }

    .weaving-spinner .dot {
        width: 5px;
        height: 5px;
        background: var(--gold);
        border-radius: 50%;
        display: inline-block;
        animation: bounce 1.4s infinite ease-in-out both;
    }

    .weaving-spinner .dot:nth-child(1) { animation-delay: -0.32s; }
    .weaving-spinner .dot:nth-child(2) { animation-delay: -0.16s; }

    @keyframes bounce {
        0%, 80%, 100% { transform: scale(0); }
        40% { transform: scale(1.0); }
    }

    .weaving-spinner .text {
        margin-left: 0.4rem;
        letter-spacing: 1px;
    }

    /* Crucible Input area */
    .action-crucible {
        height: 65px;
        border-top: 1px solid var(--glass-border);
        display: flex;
        background: rgba(0, 0, 0, 0.6);
    }

    .action-crucible input {
        flex-grow: 1;
        background: transparent;
        border: none;
        border-radius: 0;
        padding: 0 1.5rem;
        height: 100%;
        margin-bottom: 0;
        font-size: 0.95rem;
    }

    .action-crucible input:focus {
        box-shadow: none;
        background: rgba(255, 255, 255, 0.02);
    }

    .act-btn {
        width: 100px;
        height: 100%;
        border-radius: 0;
        border: none;
        border-left: 1px solid var(--glass-border);
        background: linear-gradient(180deg, rgba(158, 27, 27, 0.5), rgba(89, 15, 15, 0.5));
    }

    .act-btn:hover {
        background: linear-gradient(180deg, #9e1b1b, #590f0f);
        box-shadow: none;
    }

    /* Modal Overlay & Drawer Settings */
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(10px);
        z-index: 100;
        display: flex;
        justify-content: center;
        align-items: center;
        animation: fade-in 0.2s ease-out;
    }

    @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    .settings-drawer {
        width: 100%;
        max-width: 440px;
        padding: 2rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        animation: scale-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes scale-up {
        from { transform: scale(0.95); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
    }

    .settings-drawer h2 {
        font-family: var(--font-serif);
        font-size: 1.4rem;
        letter-spacing: 2px;
        color: #fff;
        text-align: center;
        border-bottom: 1px solid var(--glass-border);
        padding-bottom: 0.8rem;
    }

    .input-field {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .input-field label {
        font-size: 0.7rem;
        font-weight: 600;
        letter-spacing: 1px;
        color: var(--gold);
    }

    .room-input-group {
        display: flex;
        gap: 0.5rem;
    }

    .room-input-group input {
        flex-grow: 1;
        margin-bottom: 0;
    }

    .room-input-group button {
        width: auto;
        padding: 0 1rem;
        font-size: 0.8rem;
    }

    .note {
        font-size: 0.65rem;
        opacity: 0.5;
        font-style: italic;
    }

    .drawer-actions {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 1rem;
    }

    .save-btn {
        width: 100%;
    }

    .cancel-btn {
        background: transparent;
        border: 1px solid var(--glass-border);
        box-shadow: none;
        color: var(--ash-gray);
    }

    .cancel-btn:hover {
        background: rgba(255, 255, 255, 0.05);
        color: #fff;
        box-shadow: none;
    }

    /* Responsive adjustments */
    @media (max-width: 768px) {
        .layout-grid {
            padding: 0.8rem;
            gap: 0.8rem;
        }

        .menu-toggle {
            display: block;
        }

        .hud-center {
            display: none; /* Hide location tag in mobile header */
        }

        .main-content {
            position: relative;
        }

        .codex-sidebar {
            position: absolute;
            left: -340px;
            top: 0;
            bottom: 0;
            z-index: 20;
            width: 290px;
            background: var(--glass-bg);
            transition: left 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .codex-sidebar.mobile-visible {
            left: 0;
            box-shadow: 5px 0 25px rgba(0,0,0,0.9);
            pointer-events: auto;
        }

        .log-message {
            max-width: 95%;
        }
    }
</style>