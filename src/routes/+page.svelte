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
    import Title from '$lib/components/Onboarding/Title.svelte';
    import Attune from '$lib/components/Onboarding/Attune.svelte';
    import SoulForge from '$lib/components/Onboarding/SoulForge.svelte';
    import Threshold from '$lib/components/Onboarding/Threshold.svelte';
    import GameShell from '$lib/components/Game/GameShell.svelte';
    import Toasts from '$lib/components/Toasts.svelte';
    import Modal from '$lib/components/Modals/Modal.svelte';
    import SettingsBody from '$lib/components/Modals/SettingsBody.svelte';
    import NorthStarBody from '$lib/components/Modals/NorthStarBody.svelte';
    import WeaveReaderBody from '$lib/components/Modals/WeaveReaderBody.svelte';
    import AuditLogBody from '$lib/components/Modals/AuditLogBody.svelte';
    import ShortcutsBody from '$lib/components/Modals/ShortcutsBody.svelte';
    import InteractiveMap from '$lib/components/Modals/InteractiveMap.svelte';
    import { ADVENTURE_SEEDS, type AdventureSeed } from '$lib/adventureSeeds';
    import { pushToast } from '$lib/stores/toastStore.svelte';

    // ---------- Session state ----------
    type WizardStep = 'title' | 'attune' | 'forge';
    let wizardStep = $state<WizardStep>('title');

    // Modal chapter titles — the header shows these, never the raw modal id.
    const MODAL_META: Record<string, { title: string; eyebrow: string }> = {
        settings: { title: 'Settings', eyebrow: 'The Table' },
        northstar: { title: 'North Star', eyebrow: 'The Promise' },
        weave: { title: 'Weave Reader', eyebrow: 'The Threads' },
        audit: { title: 'Audit Log', eyebrow: 'The Record' },
        shortcuts: { title: 'Shortcuts', eyebrow: 'The Keys' },
        map: { title: 'World Map', eyebrow: 'The Lands' }
    };

    // Threshold transition state. 'crossing' while genesis runs, 'arrived' once
    // the genesis beat lands in the chat log, 'failed' on genesis error.
    type ThresholdStage = 'crossing' | 'arrived' | 'failed';
    let thresholdOpen = $state(false);
    let thresholdStage = $state<ThresholdStage>('crossing');

    const initialRoomId = localStorage.getItem('rt_world') || 'crossroads-1';
    let roomId = $state(initialRoomId);
    // The room the live connection is actually joined to — the Attune screen's
    // table-code field edits `roomId`, so attune() compares and re-joins.
    let connectedRoomId = $state(initialRoomId);
    let gameState = createGameState(initialRoomId);
    let chatStore = $state(gameState.chatStore);
    let addChatEntry = $state(gameState.addChatEntry);
    let ydoc = $state(gameState.ydoc);
    let provider = $state(gameState.provider);
    let providerStore = $state(gameState.providerStore);
    let codex = $state(gameState.codex);
    let qte = $state(gameState.qte);
    let engineCountdown = $state(gameState.engineCountdown);
    let serverEvents = $state(gameState.serverEvents);
    let sendAction = $state(gameState.sendAction);
    let registerKey = $state(gameState.registerKey);
    let engineControl = $state(gameState.engineControl);
    let triggerGenesis = $state(gameState.triggerGenesis);
    let setCurrentCharacter = $state(gameState.setCurrentCharacter);
    let registerCurrentCharacter = $state(gameState.registerCurrentCharacter);
    let awareness = $state(gameState.awareness);

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
    let peerNames = $state<string[]>([]);

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

    // Reaps a turn whose terminal event never arrives — a socket dropped after
    // the send was acked, or the pipeline died mid-flight (429 between
    // turn-start and turn-result). Nothing else clears the spinner in those
    // cases, so without this the player is stuck on "The world responds…"
    // forever. Verified missing via the turn-lifecycle audit (GLM, 2026-07-15).
    let turnWatchdog: ReturnType<typeof setTimeout> | null = null;
    function clearTurnWatchdog() { if (turnWatchdog) { clearTimeout(turnWatchdog); turnWatchdog = null; } }
    // Dedupe the pipeline's multi-stage turn-error emits (see the turn-error handler).
    let lastErrorText = '';
    let lastErrorAt = 0;

    function handleSubmit(text: string, whisper: boolean) {
        if (!characterName) return;
        // One action in flight at a time. Without this guard a second submit
        // re-arms the spinner and the two turns' results cross-clear each other.
        if (isLoading || whisperInFlight) return;
        if (whisper) {
            // Whisper is a private side-channel — it must touch ONLY
            // whisperInFlight. If it also set isLoading, an arriving
            // whisper-result would clear a pending NORMAL turn's spinner and the
            // UI would show idle while the world is still resolving your action.
            whisperInFlight = true;
        } else {
            isLoading = true;
            addChatEntry({ author: characterName, text, type: 'player' });
        }
        const ok = sendAction(text, characterName, whisper);
        if (!ok) {
            isLoading = false;
            whisperInFlight = false;
            lastTurnError = 'Not connected to the world server.';
            return;
        }
        // A new turn supersedes the last failure — the subtitle surface shows
        // `error` ahead of narration, so a stale error would brick it forever.
        lastTurnError = null;
        turnStageLabel = whisper ? 'Whispering to the DM…' : 'The world responds…';
        clearTurnWatchdog();
        turnWatchdog = setTimeout(() => {
            if (isLoading || whisperInFlight) {
                isLoading = false;
                whisperInFlight = false;
                turnStageLabel = '';
                lastTurnError = 'The world fell silent. Try again.';
                pushToast('The world fell silent', { kind: 'error', detail: 'No response from the world — try again.', ttl: 5000 });
            }
        }, 45000);
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
    function beginNewWorld() {
        // New world flow: generate a fresh room code, refresh gameState, attune.
        const fresh = 'realm-' + Math.random().toString(36).slice(2, 7);
        roomId = fresh;
        switchRoom();
        wizardStep = 'attune';
    }

    function continueExisting() {
        // The wizard only renders when NOT (characterSelected && isReady), so
        // the old skip-to-forge branch here could never fire — attune is
        // always the next step; it flips the gate itself when both are set.
        wizardStep = 'attune';
    }

    function joinWorldFromTitle(code: string) {
        roomId = code;
        switchRoom();
        wizardStep = 'attune';
    }

    function attune() {
        if (!apiKey.trim()) return;
        sfx.resume();   // unlock Web Audio on first user gesture in the flow
        localStorage.setItem('rt_api_key', apiKey);
        localStorage.setItem('rt_share_policy', keySharePolicy);
        // The table-code field is a real choice: if it no longer matches the
        // room we're connected to, join the typed one before the forge.
        if (roomId.trim() && roomId.trim() !== connectedRoomId) switchRoom();
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
        // Continuing from a saved slot — go straight to attune to confirm key.
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
        // NOTE: the System "joined the table" beat was removed — the world now
        // speaks first via the genesis call. The first chatLog entry is the
        // world describing what the party sees when they arrive.
    }

    function onSoulForgeAccept(forged: ForgedCharacter, name: string) {
        acceptCharacter(forged, name);
        // Kick off the genesis call — the world speaks first.
        // Only fire if the chat log is empty (fresh world).
        if (chatLog.length === 0) {
            thresholdOpen = true;
            thresholdStage = 'crossing';
            // Give the threshold a beat to render, then trigger genesis.
            setTimeout(() => {
                triggerGenesis();
            }, 400);
        }
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

        // Returning-player routing — land on title by default; user can
        // continue or enter a new world from there.
        wizardStep = 'title';

        // Subscriptions
        unsubChat = chatStore.subscribe((v: ChatEntry[]) => { chatLog = v; });
        unsubServer = serverEvents.subscribe(handleServerEvent);
        unsubProvider = providerStore.subscribe((p: any) => {
            const prev = connectionStatus;
            if (p.status === 'connected') {
                connectionStatus = peers > 0 ? 'Live' : 'Solo';
                wsDisconnected = false;
                if (wsDisconnectTimer) { clearTimeout(wsDisconnectTimer); wsDisconnectTimer = null; }
                if (prev === 'Connecting') {
                    pushToast('Connected to the world', { kind: 'success', ttl: 2500 });
                }
            } else if (p.status === 'disconnected') {
                connectionStatus = 'Connecting';
                if (!wsDisconnectTimer) {
                    wsDisconnectTimer = setTimeout(() => {
                        wsDisconnected = true;
                        pushToast('Connection lost — retrying', {
                            kind: 'warning',
                            detail: 'Your local copy stays in sync. Reconnecting automatically.',
                            ttl: 5000
                        });
                    }, 1500);
                }
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
            clearTurnWatchdog();
            isLoading = false;
            whisperInFlight = false;
            turnStageLabel = '';
            lastTurnError = null;
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
            // Genesis landed — close the threshold transition.
            if (evt.is_genesis) {
                thresholdStage = 'arrived';
                setTimeout(() => { thresholdOpen = false; }, 1400);
                sfx.play('turn-result');
                return;
            }
            sfx.play('turn-result');
        } else if (evt.type === 'turn-error') {
            clearTurnWatchdog();
            isLoading = false;
            whisperInFlight = false;
            turnStageLabel = '';
            const errText = evt.message || 'The world hesitates.';
            lastTurnError = errText;
            // The server's Director→DM→Critic pipeline can emit a turn-error at
            // EACH stage for one dead-key action — observed live as 3 stacked
            // identical toasts. Collapse duplicates within a short window so one
            // failed action reads as one failure, not a pile-up.
            const now = Date.now();
            const dup = errText === lastErrorText && (now - lastErrorAt) < 4000;
            lastErrorText = errText; lastErrorAt = now;
            // Genesis failure: drop the threshold but let the user proceed —
            // their first action will trigger a normal DM turn.
            if (thresholdOpen) {
                thresholdStage = 'failed';
                setTimeout(() => { thresholdOpen = false; }, 1800);
            } else if (!dup) {
                addChatEntry({ author: 'System', text: errText, type: 'dm' });
                pushToast('The world hesitates', { kind: 'error', detail: errText, ttl: 5000 });
            }
            if (!dup) sfx.play('turn-error');
        } else if (evt.type === 'whisper-result') {
            clearTurnWatchdog();
            whisperInFlight = false;   // NOT isLoading — see handleSubmit
            lastTurnError = null;
            if (evt.ui_update?.qte) broadcastQTE(evt.ui_update.qte);
            addLocalWhisper({
                author: 'DM (whisper)',
                text: evt.narration || '',
                type: 'whisper',
                timestamp: Date.now()
            });
            sfx.play('whisper');
        } else if (evt.type === 'whisper-error') {
            clearTurnWatchdog();
            whisperInFlight = false;
            addLocalWhisper({
                author: 'System',
                text: evt.message || 'The DM did not hear you.',
                type: 'whisper',
                timestamp: Date.now()
            });
            pushToast('Whisper failed', { kind: 'warning', detail: evt.message || 'The DM did not hear you.', ttl: 4000 });
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
            peerNames = [...states.values()]
                .map((s: any) => s?.user?.name)
                .filter((n: any): n is string => !!n);
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
        // Seed-applied starting place lands with the premise that brought it.
        if (nsSeedLocation) yMap.set('location', nsSeedLocation);
        if (nsSeedTags) {
            const cur = (yMap.get('scene_tags') as any) || {};
            yMap.set('scene_tags', { ...cur, ...nsSeedTags });
        }
        nsSeedLocation = ''; nsSeedTags = null;
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
        // A seed is a WORLD, not just a premise — carry its starting place and
        // scene tags so Save actually starts the adventure it describes.
        nsSeedLocation = seed.starting_location || '';
        nsSeedTags = seed.starting_scene_tags || null;
    }
    let nsSeedLocation = $state('');
    let nsSeedTags = $state<{ biome: string; weather: string; mood: string } | null>(null);

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
        chatStore = next.chatStore;
        addChatEntry = next.addChatEntry;
        ydoc = next.ydoc;
        provider = next.provider;
        providerStore = next.providerStore;
        codex = next.codex;
        qte = next.qte;
        engineCountdown = next.engineCountdown;
        serverEvents = next.serverEvents;
        sendAction = next.sendAction;
        registerKey = next.registerKey;
        engineControl = next.engineControl;
        triggerGenesis = next.triggerGenesis;
        setCurrentCharacter = next.setCurrentCharacter;
        registerCurrentCharacter = next.registerCurrentCharacter;
        awareness = next.awareness;
        // Re-subscribe
        unsubChat?.(); unsubChat = chatStore.subscribe((v: ChatEntry[]) => { chatLog = v; });
        unsubServer?.(); unsubServer = serverEvents.subscribe(handleServerEvent);
        unsubProvider?.(); unsubProvider = providerStore.subscribe((p: any) => {
            const prev = connectionStatus;
            if (p.status === 'connected') {
                connectionStatus = peers > 0 ? 'Live' : 'Solo';
                wsDisconnected = false;
                if (wsDisconnectTimer) { clearTimeout(wsDisconnectTimer); wsDisconnectTimer = null; }
                if (prev === 'Connecting') {
                    pushToast('Joined ' + roomId.trim(), { kind: 'success', ttl: 2500 });
                }
            } else if (p.status === 'disconnected') {
                connectionStatus = 'Connecting';
                if (!wsDisconnectTimer) {
                    wsDisconnectTimer = setTimeout(() => {
                        wsDisconnected = true;
                        pushToast('Connection lost — retrying', {
                            kind: 'warning',
                            detail: 'Your local copy stays in sync. Reconnecting automatically.',
                            ttl: 5000
                        });
                    }, 1500);
                }
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
        connectedRoomId = roomId.trim();
        // No "Entered world" System line: ANY entry in the shared log defeats
        // the genesis gate — client-side (chatLog.length === 0) and server-side
        // (yChat.length > 0 aborts) — so a fresh world must stay silent until
        // the world speaks first. The "Joined <realm>" toast covers the feedback.
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
        peerNames={peerNames}
        connectionStatus={connectionStatus}
        worldClock={worldClock}
        worldSeed={roomId}
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
            {#if wizardStep === 'title'}
                <Title
                    savedCharacters={savedCharacters}
                    recentWorlds={recentWorlds}
                    onBegin={beginNewWorld}
                    onContinue={continueExisting}
                    onLoadSaved={loadSaved}
                    onJoinWorld={joinWorldFromTitle}
                    onOpenSettings={() => ui.showModal('settings')}
                />
            {:else if wizardStep === 'attune'}
                <Attune
                    apiKey={apiKey}
                    keySharePolicy={keySharePolicy}
                    roomId={roomId}
                    onApiKey={(v) => (apiKey = v)}
                    onPolicy={(v) => (keySharePolicy = v)}
                    onRoomId={(v) => (roomId = v)}
                    onBack={() => (wizardStep = 'title')}
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

{#if thresholdOpen}
    <Threshold
        characterName={characterName || 'Wanderer'}
        classTitle={classTitle || 'Adventurer'}
        stage={thresholdStage}
    />
{/if}

{#if ui.openModal}
    <Modal title={MODAL_META[ui.openModal]?.title ?? ui.openModal} eyebrow={MODAL_META[ui.openModal]?.eyebrow ?? 'Chapter'} onClose={() => ui.closeModal()}>
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

<Toasts />


<style>
    .onboarding-frame {
        position: fixed;
        inset: 0;
        padding-top: var(--safe-top);
        padding-bottom: var(--safe-bottom);
        padding-left: var(--safe-left);
        padding-right: var(--safe-right);
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
        top: var(--safe-top); left: 0; right: 0;
        background: var(--hp);
        color: #fdf6ec;
        text-align: center;
        padding: 0.4rem;
        font-size: var(--t-sm);
        z-index: 60;
    }
</style>
