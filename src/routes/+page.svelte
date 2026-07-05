<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import CinematicDiorama from '$lib/components/CinematicDiorama.svelte';
    import QTE_Overlay from '$lib/components/QTE_Overlay.svelte';
    import { createGameState } from '$lib/stores/gameStore';
    import { callAI } from '$lib/ai/dmEngine';
    import { buildBatchPrompt } from '$lib/ai/promptBuilder';
    import { forgeCharacter, type ForgedCharacter } from '$lib/ai/soulForge';

    let roomId = $state("crypt-99");
    let gameState = createGameState(roomId);

    let { chatStore, addChatEntry, ydoc, provider, yPendingActions, actionLock, reportKeyExhausted } = gameState;

    let chatLog = $state([]);
    let apiKey = $state(localStorage.getItem('rt_api_key') || '');
    // Committed-key gate (NOT derived from apiKey — see saveSettings).
    let isReady = $state(!!localStorage.getItem('rt_api_key'));
    let chatInput = $state('');
    let isLoading = $state(false);
    let showQTE = $state(false);
    let qteConfig = $state({ time_limit_ms: 1000, start_time: 0 });
    let currentSceneTags = $state({ biome: "crypt", weather: "none", mood: "oppressive" });

    // UI states
    let showCodexMobile = $state(false);
    let showSettings = $state(false);
    let connectionStatus = $state("Connecting");

    // Onboarding wizard step: 'welcome' | 'attune' | 'forge'
    let wizardStep = $state('welcome');

    // Cohesive inline SVG icons, mapped from the AI-generated archetype keyword.
    const S = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
    const ICONS: Record<string, string> = {
        shield:  `<svg viewBox="0 0 24 24" ${S}><path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/></svg>`,
        dagger:  `<svg viewBox="0 0 24 24" ${S}><path d="M12 2.5l2.3 7h-4.6z"/><path d="M12 9.5v6.5"/><path d="M9 16h6"/><path d="M12 16v5.5"/></svg>`,
        chalice: `<svg viewBox="0 0 24 24" ${S}><path d="M7 4.5h10"/><path d="M8 4.5c0 4 1.6 6.5 4 6.5s4-2.5 4-6.5"/><path d="M12 11v5.5"/><path d="M8 20h8"/></svg>`,
        sparkle: `<svg viewBox="0 0 24 24" ${S}><path d="M11 3c.6 4.2 1.6 5.2 5.5 5.8C12.6 9.4 11.6 10.4 11 14.6c-.6-4.2-1.6-5.2-5.5-5.8C9.4 8.2 10.4 7.2 11 3z"/><path d="M18 14.5l.4 1.6 1.6.4-1.6.4-.4 1.6-.4-1.6-1.6-.4 1.6-.4z"/></svg>`,
        bow:     `<svg viewBox="0 0 24 24" ${S}><path d="M6 18A12 12 0 0 1 18 6"/><path d="M4 20L20 4"/><path d="M15 4h5v5"/></svg>`,
        note:    `<svg viewBox="0 0 24 24" ${S}><path d="M9 17V5l10-2v12"/><circle cx="6.5" cy="17" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/></svg>`,
        rune:    `<svg viewBox="0 0 24 24" ${S}><path d="M12 2l8 10-8 10-8-10z"/><path d="M12 7v10"/><path d="M8 12h8"/></svg>`
    };

    function iconFor(arc: string): string {
        const a = (arc || '').toLowerCase();
        if (/(rogue|thief|assassin|shadow|blade|knife)/.test(a)) return ICONS.dagger;
        if (/(mage|wizard|warlock|sorc|witch|arcan|ember|pyro|necro)/.test(a)) return ICONS.sparkle;
        if (/(cleric|priest|paladin|holy|monk|saint|acolyte)/.test(a)) return ICONS.chalice;
        if (/(ranger|hunter|archer|druid|beast|scout)/.test(a)) return ICONS.bow;
        if (/(bard|skald|minstrel|song)/.test(a)) return ICONS.note;
        if (/(warrior|fighter|knight|barbarian|guard|soldier|brute)/.test(a)) return ICONS.shield;
        return ICONS.rune;
    }

    let characterSelected = $state(false);
    let characterName = $state('');
    let selectedArc = $state('warrior');
    let classTitle = $state('');

    // --- Soul Forge (AI character genesis) ---
    let concept = $state('');
    let forging = $state(false);
    let forged = $state<ForgedCharacter | null>(null);
    let forgeError = $state('');
    let refineText = $state('');

    const CONCEPT_EXAMPLES = [
        'A rogue terrified of the dark who hides in shadows',
        'A defrocked priest who bargained his faith for necromancy',
        'A hulking blacksmith with a cursed hammer that whispers',
        'A silver-tongued swindler running from a debt to a fey lord'
    ];

    // Reconstruct Codex state reactively
    let codexData = $state({
        location: "The Black Crypt",
        plot_summary: "The party seeks the Ashen Crown.",
        scene_tags: { biome: "crypt", weather: "none", mood: "oppressive" },
        party: {} as Record<string, { hp: number, max_hp: number, resolve: number, corruption: number, active_traits: string[], permanent_conditions: string[], echo_tags: string[] }>,
        inventory: {} as Record<string, { durability: number }>
    });

    let myCharacter = $derived(
        codexData.party[characterName] || {
            hp: 15, max_hp: 15, resolve: 0, corruption: 0,
            active_traits: [] as string[], permanent_conditions: [] as string[]
        }
    );

    let myArchetypeLabel = $derived(
        classTitle || (selectedArc ? selectedArc.charAt(0).toUpperCase() + selectedArc.slice(1) : 'Wanderer')
    );

    // --- Live-sync wiring (extracted so switchRoom can rebind cleanly) ---
    function scrollChatToBottom() {
        setTimeout(() => {
            const el = document.querySelector('.chat-log-scroll');
            if (el) el.scrollTop = el.scrollHeight;
        }, 50);
    }

    function subscribeChat() {
        return chatStore.subscribe(value => {
            chatLog = value;
            scrollChatToBottom();
        });
    }

    function bindPeers() {
        provider.on('peers', (event: any) => {
            activePeers = event.webrtcConns.size;
            connectionStatus = activePeers > 0 ? "Live" : "Solo";
        });
    }

    function bindCodex() {
        const yCodex = ydoc.getMap('memoryCodex');
        yCodex.observe(() => {
            const raw = yCodex.toJSON();
            if (raw) {
                codexData = {
                    location: raw.location || "The Black Crypt",
                    plot_summary: raw.plot_summary || "",
                    scene_tags: raw.scene_tags || { biome: "crypt", weather: "none", mood: "oppressive" },
                    party: raw.party || {},
                    inventory: raw.inventory || {}
                };
                if (codexData.scene_tags) currentSceneTags = codexData.scene_tags;
            }
        });
    }

    let unsubscribe = subscribeChat();
    let activePeers = $state(0);

    onMount(() => {
        // Load saved character config
        const savedName = localStorage.getItem('rt_char_name');
        const savedSelected = localStorage.getItem('rt_character_selected');
        if (savedName && savedSelected === 'true') {
            characterName = savedName;
            selectedArc = localStorage.getItem('rt_char_arc') || 'warrior';
            characterSelected = true;
            try {
                const saved = localStorage.getItem('rt_character');
                if (saved) { forged = JSON.parse(saved); classTitle = forged?.class_title || ''; }
            } catch { /* ignore corrupt cache */ }
        }
        // Route returning players to the right onboarding step.
        if (characterSelected && !isReady) wizardStep = 'attune';
        else if (isReady && !characterSelected) wizardStep = 'forge';

        bindPeers();
        bindCodex();

        // If no peer event fires shortly, settle the badge to "Solo".
        setTimeout(() => { if (connectionStatus === "Connecting") connectionStatus = "Solo"; }, 2500);
    });

    function beginQuest() { wizardStep = 'attune'; }

    // Commit the key from the wizard, then advance to the Soul Forge.
    function attune() {
        if (!apiKey.trim()) return;
        localStorage.setItem('rt_api_key', apiKey);
        isReady = true;
        wizardStep = 'forge';
    }

    // In-game settings-drawer save (does not move the wizard).
    function saveSettings() {
        if (apiKey) {
            localStorage.setItem('rt_api_key', apiKey);
            isReady = true;
            showSettings = false;
        }
    }

    // --- Soul Forge actions ---
    async function runForge(opts: { previous?: ForgedCharacter; refine?: string; nameHint?: string }) {
        if (!concept.trim() || forging || !apiKey) return;
        forging = true; forgeError = '';
        try {
            forged = await forgeCharacter(concept.trim(), apiKey, opts);
            if (forged && !characterName.trim()) characterName = forged.name;
        } catch (e: any) {
            forgeError = e?.message || 'The forge went cold. Check your key and try again.';
        }
        forging = false;
    }
    function forge()   { runForge({ nameHint: characterName.trim() || undefined }); }
    function reforge() { if (forged) runForge({ previous: forged }); }
    function refine()  {
        if (!refineText.trim() || !forged) return;
        const r = refineText.trim(); refineText = '';
        runForge({ previous: forged, refine: r });
    }

    function acceptCharacter() {
        if (!forged) return;
        const name = (characterName || forged.name || 'Nameless').trim();
        const charData = {
            hp: forged.hp, max_hp: forged.hp,
            resolve: forged.resolve, corruption: forged.corruption,
            active_traits: forged.traits.map(t => t.name),
            trait_details: forged.traits,
            permanent_conditions: [], echo_tags: [],
            class_title: forged.class_title, archetype: forged.archetype,
            backstory: forged.backstory
        };
        ydoc.transact(() => {
            const yCodex = ydoc.getMap('memoryCodex');
            const party = yCodex.get('party') || {};
            party[name] = charData;
            yCodex.set('party', party);
            const inventory = yCodex.get('inventory') || {};
            inventory[forged.starting_item.name] = { durability: 3, note: forged.starting_item.note || '' };
            yCodex.set('inventory', inventory);
        });
        localStorage.setItem('rt_char_name', name);
        localStorage.setItem('rt_char_arc', forged.archetype);
        localStorage.setItem('rt_character_selected', 'true');
        localStorage.setItem('rt_character', JSON.stringify(forged));
        characterName = name;
        selectedArc = forged.archetype;
        classTitle = forged.class_title;
        characterSelected = true;
        addChatEntry({ author: 'System', text: `${name} — ${forged.class_title} — has joined the table.`, type: 'dm' });
    }

    function switchRoom() {
        if (roomId.trim()) {
            // Tear down the old room completely before rebuilding.
            unsubscribe();
            provider.destroy();

            gameState = createGameState(roomId.trim());
            chatStore = gameState.chatStore;
            addChatEntry = gameState.addChatEntry;
            ydoc = gameState.ydoc;
            provider = gameState.provider;
            yPendingActions = gameState.yPendingActions;
            actionLock = gameState.actionLock;
            reportKeyExhausted = gameState.reportKeyExhausted;

            // Rebind live sync to the new room, keeping the handle so onDestroy
            // (and the next switch) can clean it up.
            unsubscribe = subscribeChat();
            bindPeers();
            bindCodex();

            addChatEntry({ author: 'System', text: `Moved to table: ${roomId}`, type: 'dm' });
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

        addChatEntry({ author: characterName || 'You', text: userAction, type: 'player' });

        if (isProcessor) {
            addChatEntry({ author: 'System', text: 'Gathering party actions (5s window)…', type: 'dm' });
            await new Promise(r => setTimeout(r, 5000));
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
                addChatEntry({ author: 'System', text: 'The vision faltered. Check your API key or usage limits.', type: 'dm' });
            }

            actionLock.set('locked', false);
            actionLock.set('processor', null);
            isLoading = false;
        } else {
            setTimeout(() => { isLoading = false; }, 7000);
        }
    }

    function handleQTEResult(success: boolean) {
        showQTE = false;
        addChatEntry({
            author: 'System',
            text: success ? "Dodge successful — you avoided the hazard." : "Dodge failed — you sustain a wound.",
            type: 'dm'
        });
        if (navigator.vibrate) navigator.vibrate(success ? [40, 40] : 400);
    }

    onDestroy(() => {
        provider.destroy();
        unsubscribe();
    });
</script>

<main>
    <!-- Background diorama (in-game atmosphere) -->
    <div class="canvas-container">
        <CinematicDiorama sceneTags={currentSceneTags} />
    </div>

    {#if !(isReady && characterSelected)}
        <!-- ============ ONBOARDING WIZARD ============ -->
        <div class="onboarding">
            {#if wizardStep === 'welcome'}
                <div class="wizard-card welcome-card panel">
                    <div class="emblem">
                        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="32" cy="32" r="22"/>
                            <circle cx="32" cy="32" r="8"/>
                            <path d="M32 10v8M32 46v8M10 32h8M46 32h8M17 17l6 6M41 41l6 6M47 17l-6 6M23 41l-6 6"/>
                        </svg>
                    </div>
                    <h1 class="game-title">Round Table</h1>
                    <p class="tagline">A grimdark tabletop, narrated by AI.</p>
                    <p class="welcome-desc">
                        Forge a hero, gather your party, and speak your actions aloud. An AI Dungeon
                        Master weaves every roll of the dice into a living story — where loss is permanent
                        and choices leave scars.
                    </p>
                    <button class="btn-primary wide" onclick={beginQuest}>Begin Your Quest</button>
                    <p class="fineprint">Play solo or invite friends with a shared table code.</p>
                </div>

            {:else if wizardStep === 'attune'}
                <div class="wizard-card panel">
                    <div class="wizard-head">
                        <span class="step-tag">Step 1 of 2</span>
                        <h2>Attune the Aether</h2>
                        <p class="wizard-sub">Round Table's AI forges your hero and narrates the world. Connect your free Google AI Studio key to power it.</p>
                    </div>

                    <label class="field">
                        <span class="field-label">Google AI Studio key</span>
                        <input type="password" bind:value={apiKey} placeholder="AIza…" />
                        <span class="field-help">
                            Stored only in this browser — it never leaves your device.
                            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a free key →</a>
                        </span>
                    </label>

                    <label class="field">
                        <span class="field-label">Table code</span>
                        <input type="text" bind:value={roomId} placeholder="crypt-99" />
                        <span class="field-help">Share this code so friends join your table. Leave it as-is to play solo.</span>
                    </label>

                    <div class="wizard-actions">
                        <button class="btn-ghost" onclick={() => wizardStep = 'welcome'}>Back</button>
                        <button class="btn-primary" disabled={!apiKey.trim()} onclick={attune}>Continue</button>
                    </div>
                </div>

            {:else}
                <!-- Soul Forge — AI-generated custom character -->
                <div class="wizard-card forge-card panel">
                    <div class="wizard-head">
                        <span class="step-tag">Step 2 of 2</span>
                        <h2>The Soul Forge</h2>
                        <p class="wizard-sub">Describe the hero you imagine. The AI forges them — stats, class, traits, and all.</p>
                    </div>

                    <label class="field">
                        <span class="field-label">Your concept</span>
                        <textarea rows="3" bind:value={concept} placeholder="e.g. A rogue terrified of the dark who hides in shadows…"></textarea>
                    </label>

                    {#if !forged}
                        <div class="concept-chips">
                            {#each CONCEPT_EXAMPLES as ex}
                                <button type="button" class="chip-btn" onclick={() => concept = ex}>{ex}</button>
                            {/each}
                        </div>
                    {/if}

                    {#if forgeError}<p class="forge-error">{forgeError}</p>{/if}

                    {#if forged}
                        <div class="forged-card">
                            <div class="forged-head">
                                <span class="forged-icon">{@html iconFor(forged.archetype)}</span>
                                <div class="forged-id">
                                    <input class="forged-name-input" type="text" bind:value={characterName} placeholder={forged.name} />
                                    <span class="forged-class">{forged.class_title}</span>
                                </div>
                            </div>

                            <div class="stat-chips">
                                <span class="chip"><b>{forged.hp}</b> HP</span>
                                <span class="chip"><b>{forged.resolve}%</b> Resolve</span>
                                {#if forged.corruption > 0}<span class="chip corrupt"><b>{forged.corruption}%</b> Corruption</span>{/if}
                            </div>

                            <div class="forged-traits">
                                {#each forged.traits as t}
                                    <div class="trait-row"><b>{t.name}</b>{#if t.desc} — {t.desc}{/if}</div>
                                {/each}
                            </div>

                            <div class="forged-item">
                                <span class="item-key">Carries</span> {forged.starting_item.name}{#if forged.starting_item.note} — <i>{forged.starting_item.note}</i>{/if}
                            </div>

                            <p class="forged-backstory">{forged.backstory}</p>

                            <div class="refine-row">
                                <input type="text" bind:value={refineText} onkeydown={(e) => e.key === 'Enter' && refine()} placeholder="Tweak it… e.g. make them older, add a scar" disabled={forging} />
                                <button class="btn-ghost" onclick={refine} disabled={forging || !refineText.trim()}>Refine</button>
                            </div>
                        </div>
                    {/if}

                    <div class="wizard-actions forge-actions">
                        <button class="btn-ghost" onclick={() => wizardStep = 'attune'}>Back</button>
                        {#if !forged}
                            <button class="btn-primary" disabled={!concept.trim() || forging} onclick={forge}>
                                {forging ? 'Forging…' : 'Forge Character'}
                            </button>
                        {:else}
                            <button class="btn-ghost" onclick={reforge} disabled={forging}>{forging ? 'Forging…' : 'Reforge'}</button>
                            <button class="btn-primary" disabled={forging} onclick={acceptCharacter}>Enter the Realm</button>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>

    {:else}
        <!-- ============ MAIN GAME ============ -->
        <div class="layout-grid">
            <header class="hud-header panel">
                <div class="hud-left">
                    <button class="icon-btn menu-toggle" onclick={() => showCodexMobile = !showCodexMobile} aria-label="Toggle codex">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v15H6.5A1.5 1.5 0 0 0 5 20.5z"/><path d="M19 4v15"/></svg>
                    </button>
                    <div class="brand">
                        <h1>Round Table</h1>
                        <span class="version">v1.3</span>
                    </div>
                </div>

                <div class="hud-center">
                    <div class="location-tag">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5-6-10a6 6 0 1 1 12 0c0 5-6 10-6 10z"/><circle cx="12" cy="11" r="2"/></svg>
                        <span class="loc-text">{codexData.location}</span>
                    </div>
                </div>

                <div class="hud-right">
                    <div class="status-orb {connectionStatus.toLowerCase().replace(' ', '-')}">
                        <span class="ping-pulse"></span>
                        <span class="status-text">{connectionStatus}{activePeers > 0 ? ` · ${activePeers}` : ''}</span>
                    </div>
                    <button class="icon-btn settings-btn" onclick={() => showSettings = !showSettings} aria-label="Settings">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h9"/><circle cx="16" cy="7" r="2.2"/><path d="M19 7h1"/><path d="M4 17h6"/><circle cx="13" cy="17" r="2.2"/><path d="M17 17h3"/></svg>
                    </button>
                </div>
            </header>

            <div class="main-content">
                <!-- Character Codex -->
                <aside class="codex-sidebar panel {showCodexMobile ? 'mobile-visible' : ''}">
                    <div class="sidebar-header">
                        <div class="hero-id">
                            <span class="hero-avatar">{@html iconFor(selectedArc)}</span>
                            <div>
                                <h2>{characterName}</h2>
                                <span class="archetype">{myArchetypeLabel}</span>
                            </div>
                        </div>
                    </div>

                    <div class="sidebar-body">
                        <div class="stat-group">
                            <div class="stat-label-row"><span>Vitality</span><span class="val hp-val">{myCharacter.hp} / {myCharacter.max_hp}</span></div>
                            <div class="progress-bar"><div class="fill hp" style="width: {(myCharacter.hp / myCharacter.max_hp) * 100}%"></div></div>
                        </div>
                        <div class="stat-group">
                            <div class="stat-label-row"><span>Resolve</span><span class="val resolve-val">{myCharacter.resolve}%</span></div>
                            <div class="progress-bar"><div class="fill resolve" style="width: {myCharacter.resolve}%"></div></div>
                        </div>
                        <div class="stat-group">
                            <div class="stat-label-row"><span>Corruption</span><span class="val corruption-val">{myCharacter.corruption}%</span></div>
                            <div class="progress-bar"><div class="fill corruption" style="width: {myCharacter.corruption}%"></div></div>
                        </div>

                        <div class="codex-section">
                            <h3>Traits</h3>
                            {#if !myCharacter.active_traits || myCharacter.active_traits.length === 0}
                                <p class="empty-state">No traits yet.</p>
                            {:else}
                                <ul class="trait-list">
                                    {#each myCharacter.active_traits as trait}
                                        <li class="trait-tag">{trait}</li>
                                    {/each}
                                </ul>
                            {/if}
                        </div>

                        <div class="codex-section">
                            <h3>Permanent Scars</h3>
                            {#if !myCharacter.permanent_conditions || myCharacter.permanent_conditions.length === 0}
                                <p class="empty-state">None yet. Survive the night.</p>
                            {:else}
                                <ul class="scar-list">
                                    {#each myCharacter.permanent_conditions as scar}
                                        <li class="scar-item">{scar}</li>
                                    {/each}
                                </ul>
                            {/if}
                        </div>

                        <div class="codex-section">
                            <h3>Inventory</h3>
                            <div class="inventory-grid">
                                {#each Array(6) as _, i}
                                    {@const keys = Object.keys(codexData.inventory)}
                                    {@const item = keys[i] ? { name: keys[i], ...codexData.inventory[keys[i]] } : null}
                                    <div class="inv-slot {item ? 'occupied' : ''}">
                                        {#if item}
                                            <div class="item-name">{item.name}</div>
                                            <div class="durability-indicator">
                                                <span class="dur-bar-bg"><span class="dur-bar-fill" style="width: {(item.durability / 3) * 100}%"></span></span>
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

                <!-- Chat console -->
                <section class="console-panel panel">
                    <div class="chat-log-scroll">
                        <div class="chat-log-container">
                            {#if chatLog.length === 0}
                                <div class="intro-card">
                                    <h3>The adventure begins</h3>
                                    <p>Type an action below to shape the story. Every action rolls a d20 against fate.</p>
                                </div>
                            {/if}

                            {#each chatLog as entry}
                                <div class="log-message {entry.type}">
                                    <div class="message-header"><span class="sender">{entry.author}</span></div>
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
                                    <div class="message-header"><span class="sender">Dungeon Master</span></div>
                                    <div class="message-body">
                                        <div class="weaving-spinner">
                                            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
                                            <span class="text">Weaving fate…</span>
                                        </div>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    </div>

                    <div class="action-crucible">
                        <input
                            type="text"
                            bind:value={chatInput}
                            onkeydown={(e) => e.key === 'Enter' && submitAction()}
                            placeholder={isLoading ? 'The wheel of fate turns…' : 'Describe your action…'}
                            disabled={isLoading || !isReady}
                        />
                        <button class="act-btn" onclick={submitAction} disabled={isLoading || !isReady} aria-label="Act">
                            {#if isLoading}
                                <span class="mini-spinner"></span>
                            {:else}
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h14"/><path d="M12 6l6 6-6 6"/></svg>
                            {/if}
                        </button>
                    </div>
                </section>
            </div>
        </div>
    {/if}

    <!-- Settings drawer -->
    {#if showSettings && isReady && characterSelected}
        <div class="modal-overlay" onclick={(e) => { if (e.target === e.currentTarget) showSettings = false; }}>
            <div class="settings-drawer panel">
                <div class="drawer-head">
                    <h2>Table Settings</h2>
                    <button class="icon-btn" onclick={() => showSettings = false} aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                    </button>
                </div>

                <label class="field">
                    <span class="field-label">Table code</span>
                    <div class="room-input-group">
                        <input id="room-id" type="text" bind:value={roomId} placeholder="crypt-99" />
                        <button class="btn-ghost" onclick={switchRoom}>Join</button>
                    </div>
                    <span class="field-help">Switching tables starts a fresh session.</span>
                </label>

                <label class="field">
                    <span class="field-label">Google AI Studio key</span>
                    <input id="api-key" type="password" bind:value={apiKey} placeholder="AIza…" />
                    <span class="field-help">Stored only in this browser.</span>
                </label>

                <button class="btn-primary wide" onclick={saveSettings}>Save</button>
            </div>
        </div>
    {/if}

    {#if showQTE}
        <QTE_Overlay timeLimit={qteConfig.time_limit_ms} startTime={qteConfig.start_time} onresult={handleQTEResult} />
    {/if}
</main>

<style>
    main {
        width: 100vw;
        height: 100vh;
        height: 100dvh;
        position: relative;
        background: var(--bg);
        color: var(--ink);
    }

    .canvas-container {
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
    }

    /* ============ ONBOARDING ============ */
    .onboarding {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        overflow-y: auto;
        background:
            radial-gradient(1200px 700px at 50% -10%, #fbf6ec 0%, transparent 60%),
            linear-gradient(180deg, var(--bg-tint), var(--bg));
    }

    .wizard-card {
        width: 100%;
        max-width: 560px;
        padding: 2.4rem;
        display: flex;
        flex-direction: column;
        gap: 1.4rem;
        animation: rise 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes rise {
        from { opacity: 0; transform: translateY(14px); }
        to { opacity: 1; transform: translateY(0); }
    }

    /* Welcome */
    .welcome-card { text-align: center; align-items: center; }

    .emblem {
        width: 88px; height: 88px;
        color: var(--accent);
        display: flex; align-items: center; justify-content: center;
        border-radius: 50%;
        background: var(--accent-soft);
        margin-bottom: 0.2rem;
    }
    .emblem svg { width: 56px; height: 56px; }

    .game-title {
        font-family: var(--font-serif);
        font-size: 2.5rem;
        font-weight: 700;
        letter-spacing: 1px;
        color: var(--ink);
        line-height: 1;
    }
    .tagline {
        font-family: var(--font-serif);
        color: var(--accent);
        font-size: 1rem;
        letter-spacing: 0.5px;
    }
    .welcome-desc {
        color: var(--ink-soft);
        font-size: 0.98rem;
        line-height: 1.6;
        max-width: 44ch;
    }
    .fineprint { color: var(--muted); font-size: 0.8rem; }

    .wide { width: 100%; }
    .welcome-card .btn-primary { padding: 0.9rem 1.25rem; font-size: 1rem; }

    /* Wizard steps */
    .wizard-head { display: flex; flex-direction: column; gap: 0.35rem; }
    .step-tag {
        align-self: flex-start;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 1.2px;
        text-transform: uppercase;
        color: var(--accent);
        background: var(--accent-soft);
        padding: 0.25rem 0.6rem;
        border-radius: var(--radius-pill);
    }
    .wizard-head h2 {
        font-family: var(--font-serif);
        font-size: 1.6rem;
        color: var(--ink);
    }
    .wizard-sub { color: var(--ink-soft); font-size: 0.92rem; }

    /* Fields */
    .field { display: flex; flex-direction: column; gap: 0.4rem; }
    .field-label {
        font-size: 0.78rem;
        font-weight: 600;
        letter-spacing: 0.3px;
        color: var(--ink-soft);
    }
    .field-help { font-size: 0.76rem; color: var(--muted); line-height: 1.45; }
    .field-help a { font-weight: 600; white-space: nowrap; }

    .wizard-actions {
        display: flex;
        gap: 0.75rem;
        margin-top: 0.3rem;
    }
    .wizard-actions .btn-ghost { flex: 0 0 auto; }
    .wizard-actions .btn-primary { flex: 1; }

    /* ---- Soul Forge ---- */
    .forge-card { max-width: 600px; }
    textarea { resize: vertical; min-height: 74px; line-height: 1.5; }

    .concept-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .chip-btn {
        background: var(--surface-2);
        border: 1px solid var(--line);
        color: var(--ink-soft);
        border-radius: var(--radius-pill);
        padding: 0.35rem 0.7rem;
        font-size: 0.74rem;
        font-weight: 500;
        text-align: left;
    }
    .chip-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

    .forge-error { color: var(--hp); font-size: 0.82rem; }

    .forged-card {
        background: var(--surface-2);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 1.1rem;
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        animation: rise 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .forged-head { display: flex; align-items: center; gap: 0.7rem; }
    .forged-icon {
        width: 46px; height: 46px; flex-shrink: 0;
        color: var(--accent); background: var(--accent-soft);
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
    }
    .forged-icon :global(svg) { width: 26px; height: 26px; }
    .forged-id { display: flex; flex-direction: column; gap: 0.15rem; flex: 1; min-width: 0; }
    .forged-name-input {
        font-family: var(--font-serif);
        font-size: 1.15rem;
        font-weight: 600;
        color: var(--ink);
        border: none;
        background: transparent;
        padding: 0.1rem 0;
        border-bottom: 1px dashed var(--line-strong);
        border-radius: 0;
    }
    .forged-name-input:focus { box-shadow: none; border-bottom-color: var(--accent); background: transparent; }
    .forged-class { font-size: 0.78rem; color: var(--accent); font-weight: 600; letter-spacing: 0.3px; }

    .stat-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .chip {
        background: var(--surface);
        border: 1px solid var(--line-strong);
        border-radius: var(--radius-pill);
        padding: 0.25rem 0.7rem;
        font-size: 0.76rem;
        color: var(--ink-soft);
    }
    .chip b { color: var(--ink); }
    .chip.corrupt b { color: var(--corruption); }

    .forged-traits { display: flex; flex-direction: column; gap: 0.4rem; }
    .trait-row {
        font-size: 0.82rem;
        color: var(--ink-soft);
        line-height: 1.4;
        padding-left: 0.7rem;
        border-left: 2px solid var(--gold);
    }
    .trait-row b { color: var(--ink); }

    .forged-item { font-size: 0.82rem; color: var(--ink-soft); }
    .item-key { font-weight: 700; color: var(--gold); text-transform: uppercase; font-size: 0.66rem; letter-spacing: 0.5px; margin-right: 0.3rem; }
    .forged-item i { color: var(--muted); }

    .forged-backstory {
        font-family: var(--font-serif);
        font-size: 0.86rem;
        line-height: 1.55;
        color: var(--ink);
        font-style: italic;
        border-top: 1px solid var(--line);
        padding-top: 0.8rem;
    }

    .refine-row { display: flex; gap: 0.5rem; }
    .refine-row input { flex: 1; }
    .refine-row .btn-ghost { flex-shrink: 0; }

    .forge-actions { flex-wrap: wrap; }
    .forge-actions .btn-primary { flex: 1; min-width: 150px; }
    .forge-actions .btn-ghost { flex: 0 0 auto; }

    /* Sidebar trait tags */
    .trait-list { list-style: none; display: flex; flex-direction: column; gap: 0.35rem; }
    .trait-tag {
        font-size: 0.76rem;
        color: var(--ink);
        background: var(--gold-soft);
        border: 1px solid rgba(169, 126, 60, 0.3);
        padding: 0.35rem 0.6rem;
        border-radius: var(--radius-sm);
    }

    /* ============ GAME LAYOUT ============ */
    .layout-grid {
        position: absolute;
        inset: 0;
        z-index: 10;
        display: flex;
        flex-direction: column;
        padding: 1rem;
        gap: 1rem;
        pointer-events: none;
    }

    .hud-header {
        height: 58px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 0.9rem;
        pointer-events: auto;
        background: rgba(251, 248, 241, 0.9);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
    }
    .hud-left, .hud-right { display: flex; align-items: center; gap: 0.7rem; }

    .icon-btn {
        background: transparent;
        border: none;
        padding: 0.4rem;
        width: 38px; height: 38px;
        display: flex; align-items: center; justify-content: center;
        color: var(--ink-soft);
        border-radius: var(--radius-sm);
        box-shadow: none;
    }
    .icon-btn svg { width: 20px; height: 20px; }
    .icon-btn:hover { background: var(--surface-2); color: var(--accent); transform: none; }

    .brand { display: flex; flex-direction: column; line-height: 1.05; }
    .brand h1 {
        font-family: var(--font-serif);
        font-size: 1.05rem;
        letter-spacing: 0.5px;
        color: var(--ink);
    }
    .version { font-size: 0.62rem; color: var(--muted); letter-spacing: 0.5px; }

    .menu-toggle { display: none; }

    .location-tag {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-family: var(--font-serif);
        font-size: 0.85rem;
        color: var(--accent);
        background: var(--accent-soft);
        padding: 0.3rem 0.85rem;
        border-radius: var(--radius-pill);
    }
    .location-tag svg { width: 15px; height: 15px; }

    .status-orb {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.4px;
        color: var(--muted);
        padding: 0.3rem 0.7rem;
        border-radius: var(--radius-pill);
        background: var(--surface-2);
    }
    .status-orb.live { color: var(--good); }
    .status-orb.solo { color: var(--muted); }
    .status-orb.connecting { color: var(--resolve); }
    .ping-pulse {
        width: 7px; height: 7px;
        border-radius: 50%;
        background-color: currentColor;
    }
    .status-orb.live .ping-pulse { animation: pulse 1.6s infinite; }
    @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(63, 125, 85, 0.5); }
        70% { box-shadow: 0 0 0 6px rgba(63, 125, 85, 0); }
        100% { box-shadow: 0 0 0 0 rgba(63, 125, 85, 0); }
    }

    .main-content {
        display: flex;
        flex-grow: 1;
        gap: 1rem;
        min-height: 0;
    }

    /* Codex sidebar */
    .codex-sidebar {
        width: 300px;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        pointer-events: auto;
        padding: 1.1rem;
        background: rgba(251, 248, 241, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
    }

    .sidebar-header { margin-bottom: 1.1rem; }
    .hero-id { display: flex; align-items: center; gap: 0.7rem; }
    .hero-avatar {
        width: 44px; height: 44px;
        flex-shrink: 0;
        color: var(--accent);
        background: var(--accent-soft);
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
    }
    .hero-avatar :global(svg) { width: 26px; height: 26px; }
    .sidebar-header h2 {
        font-family: var(--font-serif);
        font-size: 1.2rem;
        color: var(--ink);
        line-height: 1.1;
    }
    .archetype { font-size: 0.72rem; color: var(--accent); font-weight: 600; letter-spacing: 0.4px; }

    .sidebar-body {
        display: flex;
        flex-direction: column;
        gap: 1.1rem;
        overflow-y: auto;
        flex-grow: 1;
        padding-right: 3px;
    }

    .stat-group { display: flex; flex-direction: column; gap: 0.35rem; }
    .stat-label-row {
        display: flex;
        justify-content: space-between;
        font-size: 0.76rem;
        font-weight: 500;
        color: var(--ink-soft);
    }
    .stat-label-row .val { font-weight: 700; font-variant-numeric: tabular-nums; }
    .hp-val { color: var(--hp); }
    .resolve-val { color: var(--resolve); }
    .corruption-val { color: var(--corruption); }

    .progress-bar {
        width: 100%;
        height: 7px;
        background: var(--surface-3);
        border-radius: var(--radius-pill);
        overflow: hidden;
    }
    .fill { height: 100%; border-radius: var(--radius-pill); transition: width 0.35s ease; }
    .fill.hp { background: linear-gradient(90deg, #c9564d, var(--hp)); }
    .fill.resolve { background: linear-gradient(90deg, #cfa14a, var(--resolve)); }
    .fill.corruption { background: linear-gradient(90deg, #9a76d0, var(--corruption)); }

    .codex-section h3 {
        font-family: var(--font-serif);
        font-size: 0.82rem;
        letter-spacing: 0.4px;
        color: var(--ink);
        margin-bottom: 0.55rem;
        padding-bottom: 0.4rem;
        border-bottom: 1px solid var(--line);
    }
    .empty-state { font-size: 0.78rem; font-style: italic; color: var(--muted); }

    .scar-list { list-style: none; display: flex; flex-direction: column; gap: 0.35rem; }
    .scar-item {
        font-size: 0.76rem;
        color: var(--hp);
        background: rgba(181, 67, 60, 0.08);
        border: 1px solid rgba(181, 67, 60, 0.2);
        padding: 0.4rem 0.6rem;
        border-radius: var(--radius-sm);
    }

    .inventory-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
    .inv-slot {
        height: 62px;
        background: var(--surface-2);
        border: 1px dashed var(--line-strong);
        border-radius: var(--radius-sm);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 0.4rem;
    }
    .inv-slot.occupied { border-style: solid; border-color: var(--gold); background: var(--gold-soft); }
    .slot-num { font-size: 0.9rem; color: var(--line-strong); font-weight: 700; }
    .item-name {
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--ink);
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
        margin-bottom: 0.35rem;
    }
    .durability-indicator { display: flex; align-items: center; gap: 0.3rem; width: 100%; }
    .dur-bar-bg { flex-grow: 1; height: 4px; background: var(--surface-3); border-radius: var(--radius-pill); overflow: hidden; }
    .dur-bar-fill { display: block; height: 100%; background: var(--gold); }
    .count { font-size: 0.6rem; color: var(--muted); font-variant-numeric: tabular-nums; }

    /* Console */
    .console-panel {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        pointer-events: auto;
        overflow: hidden;
        background: rgba(251, 248, 241, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        min-width: 0;
    }

    .chat-log-scroll { flex-grow: 1; overflow-y: auto; padding: 1.4rem; }
    .chat-log-container { display: flex; flex-direction: column; gap: 1.1rem; justify-content: flex-end; min-height: 100%; }

    .intro-card {
        text-align: center;
        padding: 2.4rem 1.5rem;
        max-width: 420px;
        margin: auto;
        border: 1px dashed var(--line-strong);
        border-radius: var(--radius);
        background: var(--surface-2);
    }
    .intro-card h3 { font-family: var(--font-serif); color: var(--ink); margin-bottom: 0.6rem; }
    .intro-card p { font-size: 0.86rem; line-height: 1.5; color: var(--muted); }

    .log-message {
        display: flex;
        flex-direction: column;
        max-width: 88%;
        animation: msg-appear 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes msg-appear { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    .log-message.player { align-self: flex-end; align-items: flex-end; }
    .log-message.dm { align-self: flex-start; align-items: flex-start; }

    .message-header { margin-bottom: 0.25rem; padding: 0 0.3rem; }
    .message-header .sender {
        font-size: 0.66rem;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        font-weight: 700;
        color: var(--muted);
    }
    .log-message.dm .message-header .sender { color: var(--accent); }

    .message-body { padding: 0.75rem 1rem; border-radius: var(--radius); line-height: 1.55; }
    .log-message.player .message-body {
        background: var(--accent);
        border-bottom-right-radius: 4px;
    }
    .player-text { font-size: 0.9rem; color: #fdf6ec; }

    .log-message.dm .message-body {
        background: var(--surface-2);
        border: 1px solid var(--line);
        border-left: 3px solid var(--accent);
        border-top-left-radius: 4px;
    }
    .dm-narrative { font-family: var(--font-serif); font-size: 0.92rem; color: var(--ink); }

    .weaving-spinner { display: flex; align-items: center; gap: 0.4rem; font-family: var(--font-serif); font-size: 0.85rem; color: var(--accent); }
    .weaving-spinner .dot { width: 5px; height: 5px; background: var(--accent); border-radius: 50%; display: inline-block; animation: bounce 1.4s infinite ease-in-out both; }
    .weaving-spinner .dot:nth-child(1) { animation-delay: -0.32s; }
    .weaving-spinner .dot:nth-child(2) { animation-delay: -0.16s; }
    @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
    .weaving-spinner .text { margin-left: 0.3rem; }

    .action-crucible {
        display: flex;
        gap: 0.6rem;
        padding: 0.7rem;
        border-top: 1px solid var(--line);
        background: var(--surface);
    }
    .action-crucible input { flex-grow: 1; }
    .act-btn {
        width: 48px;
        flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        padding: 0;
    }
    .act-btn svg { width: 20px; height: 20px; }

    .mini-spinner {
        width: 16px; height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.4);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Settings drawer */
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(44, 38, 33, 0.35);
        backdrop-filter: blur(4px);
        z-index: 100;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 1.5rem;
        animation: fade-in 0.2s ease-out;
        pointer-events: auto;
    }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

    .settings-drawer {
        width: 100%;
        max-width: 420px;
        padding: 1.8rem;
        display: flex;
        flex-direction: column;
        gap: 1.2rem;
        animation: rise 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .drawer-head { display: flex; justify-content: space-between; align-items: center; }
    .drawer-head h2 { font-family: var(--font-serif); font-size: 1.3rem; color: var(--ink); }

    .room-input-group { display: flex; gap: 0.5rem; }
    .room-input-group input { flex-grow: 1; }
    .room-input-group .btn-ghost { flex-shrink: 0; }

    /* Responsive */
    @media (max-width: 768px) {
        .layout-grid { padding: 0.7rem; gap: 0.7rem; }
        .menu-toggle { display: flex; }
        .hud-center { display: none; }
        .brand h1 { font-size: 0.95rem; }
        .status-text { display: none; }
        .status-orb { padding: 0.4rem; }

        .main-content { position: relative; }
        .codex-sidebar {
            position: absolute;
            left: -320px;
            top: 0; bottom: 0;
            z-index: 20;
            width: 280px;
            transition: left 0.28s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: var(--shadow-lg);
        }
        .codex-sidebar.mobile-visible { left: 0; }
        .log-message { max-width: 92%; }
        .wizard-card { padding: 1.6rem; }
        .game-title { font-size: 2.1rem; }
    }
</style>
