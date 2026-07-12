<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { createGameState, type ForgedCharacter } from '$lib/stores/gameStore';
    import { ui } from '$lib/stores/uiStore.svelte';
    import * as sfx from '$lib/audio/sfx';
    import type { ChatEntry } from './chat-types';
    import type { CodexSlice } from '$lib/stores/gameStore';

    import PaperGrain from '$lib/components/Background/PaperGrain.svelte';
    import CinematicDiorama from '$lib/components/CinematicDiorama.svelte';
    import QTE_Overlay from '$lib/components/QTE_Overlay.svelte';
    import Welcome from '$lib/components/Onboarding/Welcome.svelte';
    import Attune from '$lib/components/Onboarding/Attune.svelte';
    import SoulForge from '$lib/components/Onboarding/SoulForge.svelte';
    import GameShell from '$lib/components/Game/GameShell.svelte';
    import Modal from '$lib/components/Modals/Modal.svelte';
    import SettingsBody from '$lib/components/Modals/SettingsBody.svelte';
    import NorthStarBody from '$lib/components/Modals/NorthStarBody.svelte';
    import WeaveReaderBody from '$lib/components/Modals/WeaveReaderBody.svelte';
    import AuditLogBody from '$lib/components/Modals/AuditLogBody.svelte';
    import ShortcutsBody from '$lib/components/Modals/ShortcutsBody.svelte';
    import InteractiveMap from '$lib/components/Modals/InteractiveMap.svelte';
    import { ADVENTURE_SEEDS, type AdventureSeed } from '$lib/adventureSeeds';

    // ---------- Session state ----------
    type WizardStep = 'welcome' | 'attune' | 'forge';
    let wizardStep = $state<WizardStep>('welcome');

    const initialRoomId = localStorage.getItem('rt_world') || 'crossroads-1';
    let roomId = $state(initialRoomId);
    let gameState = $state(createGameState(initialRoomId));
    let {
        chatStore, addChatEntry, ydoc, provider, providerStore,
        codex, qte, engineCountdown, serverEvents,
        sendAction, registerKey, engineControl,
        setCurrentCharacter, registerCurrentCharacter,
        awareness
    } = gameState;

    // ---------- API key + sharing ----------
    let apiKey = $state(localStorage.getItem('rt_api_key') || '');
    let keySharePolicy = $state<'table' | 'solo' | 'host'>(
        (localStorage.getItem('rt_share_policy') as any) || 'table'
    );
    let isReady = $state(!!localStorage.getItem('rt_api_key'));

    // ---------- Character state ----------
    let characterName = $state(localStorage.getItem('rt_char_name') || '');
    let characterSelected = $state(localStorage.getItem('rt_character_selected') === 'true');
    let selectedArc = $state(localStorage.getItem('rt_char_arc') || 'warrior');
    let classTitle = $state('');

    // ---------- Chat + UI state ----------
    let chatLog = $state<ChatEntry[]>([]);
    let localWhispers = $state<ChatEntry[]>([]);
    function addLocalWhisper(entry: ChatEntry) {
        localWhispers = [...localWhispers, entry];
    }

    let isLoading = $state(false);
    let whisperInFlight = $state(false);
    let turnStageLabel = $state('');
    let lastTurnError = $state<string | null>(null);

    let codexData = $state<CodexSlice>({
        location: "a quiet crossroads at the edge of an unfinished map",
        plot_summary: "",
        scene_tags: { biome: "crossroads", weather: "clear", mood: "unsettled" },
        party: {}, inventory: {},
        world_clock: { turn: 0, day: 1, time_of_day: "morning" },
        npcs: {}, factions: {}, threads: [], locations: {},
        north_star: null
    });
    let worldClock = $derived(codexData.world_clock || { turn: 0, day: 1, time_of_day: 'morning' });

    // ---------- Engine ticker ----------
    let enginePaused = $state(false);
    let engineNextTickAt = $state<number | null>(null);
    let nowTick = $state(Date.now());
    let engineSecondsLeft = $derived.by(() => {
        if (enginePaused || !engineNextTickAt) return null;
        const ms = engineNextTickAt - nowTick;
        return Math.max(0, Math.ceil(ms / 1000));
    });

    // ---------- Connection ----------
    let connectionStatus = $state('Connecting');
    let wsDisconnected = $state(false);
    let peers = $state(0);

    // ---------- QTE ----------
    let showQTE = $state(false);
    let qteConfig = $state<{ time_limit_ms: number; start_time: number } | null>(null);

    // ---------- Level-up toast ----------
    let showLevelUp = $state(false);
    let levelUpName = $state<string | null>(null);

    // ---------- Saved characters ----------
    type SavedCharacter = {
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
    let savedCharacters = $state<SavedCharacter[]>([]);

    // ---------- Subscriptions ----------
    let unsubChat: any;
    let unsubServer: any;
    let unsubProvider: any;
    let unsubCodex: any;
    let unsubQte: any;
    let unsubPeers: any;
    let tickInterval: any;
    let wsDisconnectTimer: any;

    function loadSavedCharacters() {
        try {
            const raw = localStorage.getItem('rt_saved_characters');
            savedCharacters = raw ? JSON.parse(raw) : [];
        } catch { savedCharacters = []; }
    }
    function persistSavedCharacters() {
        localStorage.setItem('rt_saved_characters', JSON.stringify(savedCharacters));
    }
    function saveCurrentCharacterSlot(forged: ForgedCharacter, name: string) {
        const slot: SavedCharacter = {
            name, archetype: forged.archetype, class_title: forged.class_title,
            portrait_url: forged.portrait_url || '', backstory: forged.backstory || '',
            traits: forged.traits.map(t => ({ name: t.name, desc: t.desc || '' })),
            hp: forged.hp, resolve: forged.resolve, corruption: forged.corruption,
            saved_at: Date.now()
        };
        const filtered = savedCharacters.filter(s => s.name !== slot.name);
        savedCharacters = [slot, ...filtered].slice(0, 12);
        persistSavedCharacters();
    }

    function rememberWorld(code: string) {
        const existing = JSON.parse(localStorage.getItem('rt_worlds') || '[]');
        const next = [code, ...existing.filter((c: string) => c !== code)].slice(0, 6);
        localStorage.setItem('rt_worlds', JSON.stringify(next));
        localStorage.setItem('rt_world', code);
    }

    function handleSubmit(text: string, whisper: boolean) {
        if (!characterName) return;
        if (whisper) {
            whisperInFlight = true;
            isLoading = true;
        } else {
            isLoading = true;
            addChatEntry({ author: characterName, text, type: 'player' });
        }
        const ok = sendAction(text, characterName, whisper);
        if (!ok) {
            isLoading = false;
            whisperInFlight = false;
            lastTurnError = 'Not connected to the world server.';
        }
        turnStageLabel = whisper ? 'Whispering to the DM…' : 'The world responds…';
    }

    function broadcastQTE(q: any) {
        if (!q) return;
        const start_time = q.start_time || Date.now();
        qteConfig = { time_limit_ms: q.time_limit_ms || 1000, start_time };
        showQTE = true;
        sfx.play('qte-start');
    }

    function handleQTEResult(success: boolean) {
        showQTE = false;
        addChatEntry({
            author: 'System',
            text: success ? 'Dodge successful — you avoided the hazard.' : 'Dodge failed — you sustain a wound.',
            type: 'dm'
        });
        sfx.play(success ? 'qte-success' : 'qte-fail');
        if (navigator.vibrate) navigator.vibrate(success ? [40, 40] : 400);
    }

    // ---------- Wizard handlers ----------
    function beginQuest() { wizardStep = 'attune'; }

    function attune() {
        if (!apiKey.trim()) return;
        sfx.resume();   // unlock Web Audio on first user gesture in the flow
        localStorage.setItem('rt_api_key', apiKey);
        localStorage.setItem('rt_share_policy', keySharePolicy);
        isReady = true;
        registerKey(apiKey, characterName || 'Wanderer', keySharePolicy);
        wizardStep = 'forge';
    }

    function loadSaved(slot: SavedCharacter) {
        const forged: ForgedCharacter = {
            name: slot.name,
            archetype: slot.archetype,
            class_title: slot.class_title,
            portrait_url: slot.portrait_url,
            portrait: slot.portrait_url || slot.name,
            backstory: slot.backstory,
            traits: slot.traits,
            hp: slot.hp,
            resolve: slot.resolve,
            corruption: slot.corruption,
            starting_item: { name: 'Heirloom', note: '' }
        } as ForgedCharacter;
        acceptCharacter(forged, slot.name);
        wizardStep = 'attune';
    }

    function acceptCharacter(forged: ForgedCharacter, name: string) {
        const cleanName = (name || forged.name || 'Nameless').trim();
        setCurrentCharacter(forged, cleanName);
        registerCurrentCharacter();

        localStorage.setItem('rt_char_name', cleanName);
        localStorage.setItem('rt_char_arc', forged.archetype);
        localStorage.setItem('rt_character_selected', 'true');
        localStorage.setItem('rt_character', JSON.stringify(forged));

        characterName = cleanName;
        selectedArc = forged.archetype;
        classTitle = forged.class_title;
        characterSelected = true;
        awareness.setLocalStateField('user', { name: cleanName });
        rememberWorld(roomId);
        saveCurrentCharacterSlot(forged, cleanName);
        addChatEntry({ author: 'System', text: `${cleanName} — ${forged.class_title} — has joined the table.`, type: 'dm' });
    }

    function onSoulForgeAccept(forged: ForgedCharacter, name: string) {
        acceptCharacter(forged, name);
    }

    // ---------- Lifecycle ----------
    onMount(() => {
        loadSavedCharacters();

        const sfxSettings = sfx.loadAudioSettings();
        audioMuted = sfxSettings.muted;
        audioVolume = sfxSettings.volume;

        // Restore saved character basics
        const savedName = localStorage.getItem('rt_char_name');
        const savedSelected = localStorage.getItem('rt_character_selected');
        if (savedName && savedSelected === 'true') {
            characterName = savedName;
            characterSelected = true;
        }

        // Returning-player routing
        if (characterSelected && !isReady) wizardStep = 'attune';

        // Subscriptions
        unsubChat = chatStore.subscribe((v: ChatEntry[]) => { chatLog = v; });
        unsubServer = serverEvents.subscribe(handleServerEvent);
        unsubProvider = providerStore.subscribe((p: any) => {
            if (p.status === 'connected') {
                connectionStatus = peers > 0 ? 'Live' : 'Solo';
                wsDisconnected = false;
                if (wsDisconnectTimer) { clearTimeout(wsDisconnectTimer); wsDisconnectTimer = null; }
            } else if (p.status === 'disconnected') {
                connectionStatus = 'Connecting';
                if (!wsDisconnectTimer) wsDisconnectTimer = setTimeout(() => { wsDisconnected = true; }, 1500);
            }
        });
        unsubCodex = codex.subscribe((c: CodexSlice) => { codexData = c; });
        unsubQte = qte.subscribe((cfg: any) => {
            if (cfg) {
                qteConfig = cfg;
                showQTE = true;
            } else {
                showQTE = false;
            }
        });

        tickInterval = setInterval(() => { nowTick = Date.now(); }, 1000);

        unsubPeers = bindPeers();

        setTimeout(() => {
            if (connectionStatus === 'Connecting') connectionStatus = 'Solo';
        }, 2500);

        // Re-register presence on connect (best-effort)
        awareness.setLocalStateField('user', { name: characterName || 'Wanderer' });
    });

    onDestroy(() => {
        unsubChat?.();
        unsubServer?.();
        unsubProvider?.();
        unsubCodex?.();
        unsubQte?.();
        unsubPeers?.();
        if (tickInterval) clearInterval(tickInterval);
        if (wsDisconnectTimer) clearTimeout(wsDisconnectTimer);
        try { gameState.destroy(); } catch { /* noop */ }
    });

    function handleServerEvent(evt: any) {
        if (!evt) return;
        if (evt.type === 'turn-start') {
            turnStageLabel = 'The world responds…';
        } else if (evt.type === 'turn-stage') {
            turnStageLabel = evt.label || 'The world responds…';
        } else if (evt.type === 'turn-result') {
            isLoading = false;
            whisperInFlight = false;
            turnStageLabel = '';
            if (evt.ui_update?.qte) broadcastQTE(evt.ui_update.qte);
            // Level-up detection: server's pipeline summary includes xp_awards
            // (turn.pipeline.xp_awards if present). Toast + sfx.
            if (evt.pipeline?.xp_awards) {
                const names = Object.keys(evt.pipeline.xp_awards);
                if (names.length) {
                    levelUpName = names[0];
                    showLevelUp = true;
                    sfx.play('level-up');
                    setTimeout(() => { showLevelUp = false; }, 2400);
                }
            }
            sfx.play('turn-result');
        } else if (evt.type === 'turn-error') {
            isLoading = false;
            whisperInFlight = false;
            turnStageLabel = '';
            const errText = evt.message || 'The world hesitates.';
            lastTurnError = errText;
            addChatEntry({ author: 'System', text: errText, type: 'dm' });
            sfx.play('turn-error');
        } else if (evt.type === 'whisper-result') {
            isLoading = false;
            whisperInFlight = false;
            if (evt.ui_update?.qte) broadcastQTE(evt.ui_update.qte);
            addLocalWhisper({
                author: 'DM (whisper)',
                text: evt.narration || '',
                type: 'whisper',
                timestamp: Date.now()
            });
            sfx.play('whisper');
        } else if (evt.type === 'whisper-error') {
            whisperInFlight = false;
            addLocalWhisper({
                author: 'System',
                text: evt.message || 'The DM did not hear you.',
                type: 'whisper',
                timestamp: Date.now()
            });
        } else if (evt.type === 'engine-status') {
            enginePaused = !!evt.paused;
            const newTick = evt.next_tick_at ?? null;
            const oldTick = engineNextTickAt;
            engineNextTickAt = newTick;
            if (!enginePaused && newTick && oldTick && newTick > oldTick + 2000) {
                sfx.play('world-tick');
            }
        }
    }

    // ---------- Codex sheet (mobile) ----------
    function toggleCodex() {
        ui.toggleCodexSheet();
    }

    function openModal(id: any) {
        ui.showModal(id);
    }

    // ---------- Peer awareness ----------
    function bindPeers() {
        const aw = (provider as any).awareness;
        if (!aw) return;
        aw.setLocalStateField('user', { name: characterName || 'Wanderer' });
        const update = () => {
            const states = aw.getStates();
            peers = Math.max(0, states.size - 1);
            connectionStatus = peers > 0 ? 'Live' : 'Solo';
        };
        aw.on('change', update);
        update();
        return () => { aw.off('change', update); };
    }

    // ---------- Audio ----------
    let audioMuted = $state(false);
    let audioVolume = $state(0.5);
    function handleAudioChange(muted: boolean, vol: number) {
        audioMuted = muted;
        audioVolume = vol;
    }

    // ---------- Recent worlds ----------
    function loadRecentWorlds(): string[] {
        try {
            return JSON.parse(localStorage.getItem('rt_worlds') || '[]');
        } catch { return []; }
    }
    let recentWorlds = $state<string[]>(loadRecentWorlds());

    // ---------- North Star ----------
    let nsPremise = $state('');
    let nsTone = $state('');
    let nsHook = $state('');

    function syncNorthStarFields() {
        const ns = (codexData as any).north_star || {};
        nsPremise = ns.premise || '';
        nsTone = ns.tone || '';
        nsHook = ns.opening_hook || '';
    }
    function openNorthStar() {
        syncNorthStarFields();
        ui.closeModal();
        ui.showModal('northstar');
    }
    function saveNorthStar() {
        const yMap = (ydoc as any).getMap('memoryCodex');
        yMap.set('north_star', {
            premise: nsPremise.trim(),
            tone: nsTone.trim(),
            opening_hook: nsHook.trim(),
            set_at: Date.now(),
            set_by: characterName || 'Host'
        });
        ui.closeModal();
    }
    function clearNorthStar() {
        const yMap = (ydoc as any).getMap('memoryCodex');
        yMap.set('north_star', { premise: '', tone: '', opening_hook: '', set_at: null, set_by: null });
        nsPremise = ''; nsTone = ''; nsHook = '';
        ui.closeModal();
    }
    function applySeed(seed: AdventureSeed) {
        nsPremise = seed.premise;
        nsTone = seed.tone;
        nsHook = seed.opening_hook;
    }

    // ---------- Weave reader ----------
    let readerData = $state<any>(null);
    let readerError = $state('');
    function openReader() {
        readerData = null;
        readerError = '';
        ui.closeModal();
        ui.showModal('weave');
    }
    async function handleWeaveFile(evt: Event) {
        const input = evt.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (!parsed || typeof parsed !== 'object' || !parsed.format) {
                readerError = 'Not a Round Table .weave file.';
                return;
            }
            readerData = parsed;
            readerError = '';
        } catch (e: any) {
            readerError = `Could not read file: ${e?.message || e}`;
            readerData = null;
        }
    }

    // ---------- .weave export ----------
    function exportWeave() {
        const wc = (codexData as any).world_clock || {};
        const scene = (codexData as any).scene_tags || {};
        const party = (codexData as any).party || {};
        const npcs = (codexData as any).npcs || {};
        const factions = (codexData as any).factions || {};
        const threads = (codexData as any).threads || [];
        const location = (codexData as any).location || '';

        const chronicle = [...chatLog, ...localWhispers]
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
            .filter(e => e.type === 'player' || e.type === 'dm' || e.type === 'world' || e.type === 'whisper')
            .map(e => ({
                type: e.type, author: e.author || '', text: e.text || '', timestamp: e.timestamp || null
            }));

        const proseLines: string[] = [];
        proseLines.push(`# Chronicle of ${roomId}`);
        proseLines.push(`# Day ${wc.day || 1} · ${wc.time_of_day || 'morning'} · Turn ${wc.turn || 0}`);
        if (location) proseLines.push(`# Location: ${location}`);
        if (scene.biome || scene.weather || scene.mood) {
            proseLines.push(`# Scene: ${[scene.biome, scene.weather, scene.mood].filter(Boolean).join(' · ')}`);
        }
        proseLines.push('');
        for (const entry of chronicle) {
            if (entry.type === 'world') proseLines.push(`◍ ${entry.text}`);
            else if (entry.type === 'whisper') proseLines.push(`(whisper) ${entry.author}: ${entry.text}`);
            else if (entry.type === 'player') proseLines.push(`▶ ${entry.author}: ${entry.text}`);
            else { proseLines.push(entry.text); proseLines.push(''); }
        }

        const snapshot = {
            format: 'round-table.weave', version: 1,
            exported_at: new Date().toISOString(),
            world: { room_id: roomId, location, world_clock: wc, scene_tags: scene },
            party, npcs, factions, threads,
            chronicle, prose: proseLines.join('\n')
        };

        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const safeId = roomId.replace(/[^a-z0-9_-]/gi, '_');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeId}-${stamp}.weave.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ---------- Audit log (derived from chatLog) ----------
    type AuditItem = {
        id: number | string;
        actions: Array<{ author: string; text: string }>;
        ruling: any;
        audit: any;
    };
    let auditItems = $derived.by<AuditItem[]>(() => {
        const out: AuditItem[] = [];
        let pending: Array<{ author: string; text: string }> = [];
        let turnN = 0;
        for (const e of chatLog) {
            if (e.type === 'player') {
                pending.push({ author: e.author, text: e.text });
            } else if (e.type === 'dm' && pending.length > 0) {
                turnN++;
                out.push({
                    id: turnN,
                    actions: pending,
                    ruling: (e as any).ruling_summary || null,
                    audit: (e as any).audit || null
                });
                pending = [];
            }
        }
        return out.reverse();
    });

    // ---------- Settings actions ----------
    function saveSettings() {
        if (apiKey) {
            localStorage.setItem('rt_api_key', apiKey);
            localStorage.setItem('rt_share_policy', keySharePolicy);
            isReady = true;
            registerKey(apiKey, characterName || 'Wanderer', keySharePolicy);
        }
        sfx.saveAudioSettings({ muted: audioMuted, volume: audioVolume });
        ui.closeModal();
    }

    function switchRoom() {
        if (!roomId.trim()) return;
        ui.closeModal();
        try { gameState.destroy(); } catch { /* noop */ }
        const next = createGameState(roomId.trim());
        gameState = next;
        ({
            chatStore, addChatEntry, ydoc, provider, providerStore,
            codex, qte, engineCountdown, serverEvents,
            sendAction, registerKey, engineControl,
            setCurrentCharacter, registerCurrentCharacter, awareness
        } = next);
        // Re-subscribe
        unsubChat?.(); unsubChat = chatStore.subscribe((v: ChatEntry[]) => { chatLog = v; });
        unsubServer?.(); unsubServer = serverEvents.subscribe(handleServerEvent);
        unsubProvider?.(); unsubProvider = providerStore.subscribe((p: any) => {
            if (p.status === 'connected') {
                connectionStatus = peers > 0 ? 'Live' : 'Solo';
                wsDisconnected = false;
                if (wsDisconnectTimer) { clearTimeout(wsDisconnectTimer); wsDisconnectTimer = null; }
            } else if (p.status === 'disconnected') {
                connectionStatus = 'Connecting';
                if (!wsDisconnectTimer) wsDisconnectTimer = setTimeout(() => { wsDisconnected = true; }, 1500);
            }
        });
        unsubCodex?.(); unsubCodex = codex.subscribe((c: CodexSlice) => { codexData = c; });
        unsubQte?.(); unsubQte = qte.subscribe((cfg: any) => {
            if (cfg) { qteConfig = cfg; showQTE = true; } else { showQTE = false; }
        });
        unsubPeers?.(); unsubPeers = bindPeers();
        if (apiKey) registerKey(apiKey, characterName || 'Wanderer', keySharePolicy);
        awareness.setLocalStateField('user', { name: characterName || 'Wanderer' });
        rememberWorld(roomId.trim());
        addChatEntry({ author: 'System', text: `Entered world: ${roomId}`, type: 'dm' });
    }

    function newWorld() {
        roomId = 'realm-' + Math.random().toString(36).slice(2, 7);
        switchRoom();
    }
    function joinWorld(code: string) {
        roomId = code;
        switchRoom();
    }

    function saveCurrentCharacterSlotFromSettings() {
        const raw = localStorage.getItem('rt_character');
        if (!raw) return;
        try {
            const forged = JSON.parse(raw) as ForgedCharacter;
            saveCurrentCharacterSlot(forged, characterName || forged.name || 'Wanderer');
        } catch { /* noop */ }
    }
    function deleteSavedByName(name: string) {
        savedCharacters = savedCharacters.filter(s => s.name !== name);
        persistSavedCharacters();
    }
</script>

<PaperGrain />

{#if characterSelected && isReady}
    <!-- ============ MAIN GAME ============ -->
    {#if wsDisconnected}
        <div class="conn-banner" role="status" aria-live="polite">
            <span>Reconnecting to the world…</span>
        </div>
    {/if}

    <GameShell
        chatLog={chatLog}
        localWhispers={localWhispers}
        isLoading={isLoading}
        turnStageLabel={turnStageLabel}
        lastTurnError={lastTurnError}
        whisperInFlight={whisperInFlight}
        codex={codexData}
        characterName={characterName || 'Wanderer'}
        peers={peers}
        connectionStatus={connectionStatus}
        worldClock={worldClock}
        engineSecondsLeft={engineSecondsLeft}
        enginePaused={enginePaused}
        onsubmit={handleSubmit}
        onCodexToggle={toggleCodex}
        onOpenModal={openModal}
        onEngineControl={engineControl}
        codexSheetOpen={ui.codexSheetOpen}
        showLevelUp={showLevelUp}
        levelUpName={levelUpName}
    />

    {#if showQTE && qteConfig}
        <QTE_Overlay
            timeLimit={qteConfig.time_limit_ms}
            startTime={qteConfig.start_time}
            onresult={handleQTEResult}
        />
    {/if}
{:else}
    <!-- ============ ONBOARDING ============ -->
    <div class="onboarding-frame">
        <CinematicDiorama sceneTags={codexData.scene_tags} />
        <div class="onboarding-stage">
            {#if wizardStep === 'welcome'}
                <Welcome
                    savedCharacters={savedCharacters}
                    onBegin={beginQuest}
                    onLoadSaved={loadSaved}
                />
            {:else if wizardStep === 'attune'}
                <Attune
                    apiKey={apiKey}
                    keySharePolicy={keySharePolicy}
                    roomId={roomId}
                    onApiKey={(v) => (apiKey = v)}
                    onPolicy={(v) => (keySharePolicy = v)}
                    onRoomId={(v) => (roomId = v)}
                    onBack={() => (wizardStep = 'welcome')}
                    onContinue={attune}
                />
            {:else if wizardStep === 'forge'}
                <SoulForge
                    apiKey={apiKey}
                    nameHint={characterName}
                    onBack={() => (wizardStep = 'attune')}
                    onAccept={onSoulForgeAccept}
                />
            {/if}
        </div>
    </div>
{/if}

{#if ui.openModal}
    <Modal title={ui.openModal} onClose={() => ui.closeModal()}>
        {#if ui.openModal === 'settings'}
            <SettingsBody
                {roomId}
                {apiKey}
                {keySharePolicy}
                {audioMuted}
                {audioVolume}
                {characterName}
                {savedCharacters}
                {recentWorlds}
                hasChronicle={chatLog.length > 0}
                northStarPremise={(codexData as any).north_star?.premise || ''}
                onRoomIdChange={(v) => (roomId = v)}
                onApiKeyChange={(v) => (apiKey = v)}
                onPolicyChange={(v) => (keySharePolicy = v)}
                onAudioChange={handleAudioChange}
                onSwitchRoom={switchRoom}
                onNewWorld={newWorld}
                onJoinWorld={joinWorld}
                onSaveCurrentCharacter={saveCurrentCharacterSlotFromSettings}
                onDeleteSavedCharacter={deleteSavedByName}
                onExportWeave={exportWeave}
                onOpenReader={openReader}
                onOpenNorthStar={openNorthStar}
                onSaveSettings={saveSettings}
            />
        {:else if ui.openModal === 'northstar'}
            <NorthStarBody
                premise={nsPremise}
                tone={nsTone}
                hook={nsHook}
                onPremiseChange={(v) => (nsPremise = v)}
                onToneChange={(v) => (nsTone = v)}
                onHookChange={(v) => (nsHook = v)}
                onApplySeed={applySeed}
                onClear={clearNorthStar}
                onSave={saveNorthStar}
            />
        {:else if ui.openModal === 'weave'}
            <WeaveReaderBody data={readerData} error={readerError} onPickFile={handleWeaveFile} />
        {:else if ui.openModal === 'audit'}
            <AuditLogBody items={auditItems} />
        {:else if ui.openModal === 'shortcuts'}
            <ShortcutsBody />
        {:else if ui.openModal === 'map'}
            <InteractiveMap
                locations={(codexData as any).locations || {}}
                currentLocation={(codexData as any).location || ''}
            />
        {/if}
    </Modal>
{/if}

<style>
    .onboarding-frame {
        position: fixed;
        inset: 0;
        overflow: hidden;
    }
    .onboarding-stage {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        z-index: 3;
    }

    .conn-banner {
        position: fixed;
        top: 0; left: 0; right: 0;
        background: var(--hp);
        color: #fdf6ec;
        text-align: center;
        padding: 0.4rem;
        font-size: var(--t-sm);
        z-index: 60;
    }
</style>
