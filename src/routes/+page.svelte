<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { gsap } from 'gsap';
    import CinematicDiorama from '$lib/components/CinematicDiorama.svelte';
    import QTE_Overlay from '$lib/components/QTE_Overlay.svelte';
    import { createGameState } from '$lib/stores/gameStore';
    import { forgeCharacter, forgeConverse, type ForgedCharacter, type ForgeMessage } from '$lib/ai/soulForge';
    import { ADVENTURE_SEEDS, type AdventureSeed } from '$lib/adventureSeeds';
    import { ACTION_TEMPLATES } from '$lib/actionTemplates';

    let roomId = $state("crossroads-1");
    let gameState = createGameState(roomId);

    let { chatStore, addChatEntry, ydoc, provider, providerStore, serverEvents, sendAction, registerKey, reportKeyExhausted, engineControl } = gameState;

    type ChatEntry = { author: string; text: string; type: 'player' | 'dm' | 'world' | 'whisper'; timestamp?: number };
    let chatLog = $state<ChatEntry[]>([]);
    // Phase 10: local-only mirror for whispered beats. Never written to Yjs —
    // whisper echoes and whisper-result narrations live here so other clients
    // never see them. Merged into the chronicle via displayChatLog.
    let localWhispers = $state<ChatEntry[]>([]);
    function addLocalWhisper(entry: ChatEntry) {
        localWhispers = [...localWhispers, entry];
    }
    let displayChatLog = $derived.by(() => {
        if (localWhispers.length === 0) return chatLog;
        return [...chatLog, ...localWhispers].sort((a, b) => {
            const ta = a.timestamp || 0;
            const tb = b.timestamp || 0;
            return ta - tb;
        });
    });
    let apiKey = $state(localStorage.getItem('rt_api_key') || '');
    // Committed-key gate (NOT derived from apiKey — see saveSettings).
    let isReady = $state(!!localStorage.getItem('rt_api_key'));
    let chatInput = $state('');
    // Phase 26: in-memory action history for Up/Down recall in the action
    // field. Session-scoped — not persisted across reloads.
    let actionHistory: string[] = [];
    let actionHistoryCursor = 0;
    let actionHistoryDraft = '';
    let isLoading = $state(false);
    let whisperMode = $state(false);  // Phase 10: route submit through the whisper track
    let whisperInFlight = $state(false);  // separate spinner for the private track
    let turnStageLabel = $state('');      // Phase 16: pipeline progress text
    let actionFieldEl = $state<HTMLInputElement | null>(null);  // Phase 11: focus/position cursor after template apply
    let inventoryAddName = $state('');   // Phase 20: bound to the inline inventory add input
    let enginePaused = $state(false);   // Phase 23: World Engine alarm-loop pause state
    // Phase 25: connection banner — show only after a 1.5s grace so brief
    // hiccups don't flash. Banner is non-blocking and dismisses on reconnect.
    let wsDisconnected = $state(false);
    let wsDisconnectTimer: any = null;
    let showQTE = $state(false);
    let qteConfig = $state({ time_limit_ms: 1000, start_time: 0 });
    let currentSceneTags = $state({ biome: "crossroads", weather: "clear", mood: "unsettled" });
    let keySharePolicy = $state<'table' | 'solo' | 'host'>(
        (localStorage.getItem('rt_share_policy') as any) || 'table'
    );

    // UI states
    let showCodexMobile = $state(false);
    let showSettings = $state(false);
    let showChronicle = $state(false);
    let connectionStatus = $state("Connecting");
    let lastAction = $state('');

    // Chronicle stream — flat list so world beats (Phase 2 World Engine) can
    // interleave between rounds without belonging to any single round.
    type ChronicleItem =
        | { kind: 'round'; id: number; actions: ChatEntry[]; narration: string; audit?: { lint_retried: boolean; critic_passed: boolean | null; critic_retried: boolean }; ruling?: any }
        | { kind: 'world'; id: string; text: string; timestamp?: number };

    let chronicleItems = $derived.by(() => {
        const items: ChronicleItem[] = [];
        let currentRound: { kind: 'round'; id: number; actions: ChatEntry[]; narration: string; audit?: any; ruling?: any } | null = null;
        let nextRoundId = 1;

        const flush = () => {
            if (currentRound && (currentRound.actions.length > 0 || currentRound.narration)) {
                items.push(currentRound);
            }
            currentRound = null;
        };

        for (const entry of displayChatLog) {
            if (entry.type === 'player') {
                if (!currentRound) currentRound = { kind: 'round', id: nextRoundId++, actions: [], narration: '' };
                if (currentRound.narration) {
                    flush();
                    currentRound = { kind: 'round', id: nextRoundId++, actions: [], narration: '' };
                }
                currentRound.actions.push(entry);
            } else if (entry.type === 'whisper') {
                // Phase 10: whispers render as their own chronicle item so they
                // don't get bundled into a public round. System-markered whispers
                // (e.g. "DM did not hear you") still show up as standalone beats.
                flush();
                items.push({ kind: 'world', id: `whisper-${entry.timestamp || Math.random()}`, text: `(whisper) ${entry.author}: ${entry.text}`, timestamp: entry.timestamp });
            } else if (entry.type === 'dm') {
                if (entry.author === 'System' || entry.author === 'Warning') continue;
                if (!currentRound) currentRound = { kind: 'round', id: nextRoundId++, actions: [], narration: '' };
                currentRound.narration = entry.text;
                // Phase 22: carry the audit forward so the host can see pipeline
                // quality (lint/critic retries, critic verdict) per beat.
                currentRound.audit = (entry as any).audit;
                // Phase 27: carry the Director's ruling summary so the chronicle
                // can surface what was decided (collapsible under the narration).
                currentRound.ruling = (entry as any).ruling_summary;
                flush();
            } else if (entry.type === 'world') {
                flush();
                items.push({ kind: 'world', id: `world-${entry.timestamp || Math.random()}`, text: entry.text, timestamp: entry.timestamp });
            }
        }
        flush();
        return items;
    });

    // Back-compat alias so existing markup that references chronicleRounds keeps working
    // (typed as any because it's only used in template iteration).
    let chronicleRounds = $derived(chronicleItems.filter((i): i is any => i.kind === 'round'));

    // Phase 3: Situation surface — derived views over the live world state so
    // the player can see what the World Engine is simulating before they act.
    // Situation-not-plots requires situation visibility.
    let sceneSummary = $derived.by(() => {
        const tags = (codexData as any).scene_tags || {};
        const parts: string[] = [];
        if (tags.biome) parts.push(tags.biome);
        if (tags.weather && tags.weather !== tags.biome) parts.push(tags.weather);
        if (tags.mood) parts.push(tags.mood);
        return parts.join(' · ');
    });

    let presentNpcs = $derived.by(() => {
        const npcs = (codexData as any).npcs || {};
        const loc = (codexData as any).location;
        // NPCs at the party's current location. If location is unset, show all
        // NPCs with a location field — better than hiding them on first turn.
        const list = Object.entries(npcs).filter(([, v]: any) => !loc || !v.location || v.location === loc);
        return list.map(([name, v]: any) => ({ name, ...v }));
    });

    let activeThreads = $derived.by(() => {
        const threads = (codexData as any).threads || [];
        const turn = (codexData as any).world_clock?.turn || 0;
        return threads
            .filter((t: any) => t?.status === 'active' || t?.status === 'simmering')
            .map((t: any) => ({
                ...t,
                turnsUntilLands: typeof t.lands_at_turn === 'number' ? t.lands_at_turn - turn : null,
            }))
            .sort((a: any, b: any) => {
                if (a.status === 'active' && b.status !== 'active') return -1;
                if (b.status === 'active' && a.status !== 'active') return 1;
                return 0;
            });
    });

    let visibleFactions = $derived.by(() => {
        const facs = (codexData as any).factions || {};
        return Object.entries(facs).map(([name, v]: any) => ({ name, ...v }));
    });

    // One-line summary used by the ActionBrief ghost text when the player
    // focuses the action input. Grounds the action in the live scene.
    let situationLine = $derived.by(() => {
        const parts: string[] = [];
        const scene = sceneSummary.trim();
        if (scene) parts.push(scene.charAt(0).toUpperCase() + scene.slice(1));
        if (presentNpcs.length > 0) {
            const names = presentNpcs.slice(0, 3).map(n => n.name).join(', ');
            parts.push(`${presentNpcs.length === 1 ? 'Present' : 'Also here'}: ${names}`);
        }
        const tension = activeThreads.find((t: any) => t.status === 'active');
        if (tension) parts.push(`${tension.name}${tension.turnsUntilLands !== null && tension.turnsUntilLands <= 3 ? ` (lands turn ${tension.lands_at_turn})` : ''}`);
        return parts.join(' · ');
    });

    let actionInputFocused = $state(false);

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

    // Free, keyless AI portrait via Pollinations — generated straight from an <img> URL
    // (no fetch, no CORS, no storage). The seed makes it reproducible + re-rollable, and the
    // URL is saved on the character so it syncs to peers and persists.
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

    // Phase 4: Scene portraits — Pollinations scene image that reflects the live
    // scene_tags + world_clock. URL is deterministic from a hash of the scene so
    // it doesn't re-roll on every state update; only changes when the scene
    // actually changes. Cached by the browser for the (scene-hash) URL.
    let scenePortraitsEnabled = $state(localStorage.getItem('rt_scene_portraits') === '1');
    function hashSceneStr(s: string): number {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }
    let scenePortraitUrl = $derived.by(() => {
        const tags = (codexData as any).scene_tags || {};
        const wc = (codexData as any).world_clock || {};
        const parts: string[] = ['fantasy landscape'];
        if (tags.biome) parts.push(tags.biome);
        if (tags.weather && tags.weather !== 'clear') parts.push(tags.weather);
        if (tags.mood) parts.push(`${tags.mood} mood`);
        const tod = wc.time_of_day || 'morning';
        parts.push(`${tod} light`);
        parts.push('painterly atmospheric cinematic no characters no text');
        const prompt = parts.join(', ');
        const key = `${tags.biome || ''}|${tags.weather || ''}|${tags.mood || ''}|${tod}`;
        const seed = hashSceneStr(key);
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=512&seed=${seed}&nologo=true&model=flux`;
    });
    // Track the URL currently shown so we can fade between scene changes without
    // flashing the previous image. {#key} would unmount/remount; layered <img>
    // with opacity transitions is smoother.
    let scenePortraitShown = $state('');
    let scenePortraitLoading = $state(false);
    let lastAppliedSceneUrl = '';
    // Effect: when derived URL changes (and feature is enabled), kick off a load.
    $effect(() => {
        const url = scenePortraitUrl;
        if (!scenePortraitsEnabled) { scenePortraitShown = ''; return; }
        if (url === lastAppliedSceneUrl) return;
        lastAppliedSceneUrl = url;
        scenePortraitLoading = true;
        const img = new Image();
        img.onload = () => {
            scenePortraitShown = url;
            scenePortraitLoading = false;
        };
        img.onerror = () => { scenePortraitLoading = false; };
        img.src = url;
    });
    // Phase 4 + Phase 8: Scene + NPC portraits via Pollinations
    function toggleScenePortraits() {
        scenePortraitsEnabled = !scenePortraitsEnabled;
        localStorage.setItem('rt_scene_portraits', scenePortraitsEnabled ? '1' : '0');
        if (!scenePortraitsEnabled) scenePortraitShown = '';
    }
    // NPC portraits share the same toggle. Deterministic from name+role so the
    // same NPC renders the same portrait across sessions, devices, and players.
    function npcPortraitUrl(name: string, npc: any): string {
        const role = (npc?.role || '').trim();
        const notes = (npc?.notes || '').trim();
        const desc = [role, notes].filter(Boolean).join(', ') || 'a fantasy character';
        const prompt = `fantasy character portrait, ${name}${role ? `, ${role}` : ''}, ${desc}, head and shoulders, painterly, neutral expression, plain background`;
        const seedBase = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        // Hash the seed string to a 32-bit uint for Pollinations.
        let h = 2166136261 >>> 0;
        for (let i = 0; i < seedBase.length; i++) {
            h ^= seedBase.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=256&height=256&seed=${h >>> 0}&nologo=true&model=flux`;
    }

    // Phase 6: Host North Star — premise + tone + opening hook for the world.
    // Stored at memoryCodex.north_star and read by Director/DM/World Engine.
    let showNorthStar = $state(false);
    let nsPremise = $state('');
    let nsTone = $state('');
    let nsHook = $state('');
    const TONE_OPTIONS = ['Heroic', 'Bright', 'Grim', 'Picaresque', 'Mythic', 'Picaresque'];
    function openNorthStar() {
        const ns = (codexData as any).north_star || {};
        nsPremise = ns.premise || '';
        nsTone = ns.tone || '';
        nsHook = ns.opening_hook || '';
        showNorthStar = true;
    }
    function saveNorthStar() {
        const yMap = (ydoc as any).getMap('memoryCodex');
        const ns = {
            premise: nsPremise.trim(),
            tone: nsTone.trim(),
            opening_hook: nsHook.trim(),
            set_at: Date.now(),
            set_by: characterName || 'Host',
        };
        yMap.set('north_star', ns);
        // If premise implies a different starting location and none is set yet,
        // we leave location alone — host can set it from the world field.
        showNorthStar = false;
    }
    function clearNorthStar() {
        const yMap = (ydoc as any).getMap('memoryCodex');
        yMap.set('north_star', { premise: '', tone: '', opening_hook: '', set_at: null, set_by: null });
        nsPremise = ''; nsTone = ''; nsHook = '';
        showNorthStar = false;
    }

    // Phase 9: .weave reader — load an exported .weave.json file and render
    // the chronicle + world state read-only. Closes the loop with the export
    // button (Phase 5).
    let showReader = $state(false);
    let readerData: any = $state(null);
    let readerError = $state('');
    function openReader() {
        readerData = null;
        readerError = '';
        showReader = true;
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
    function applySeed(seed: AdventureSeed) {
        nsPremise = seed.premise;
        nsTone = seed.tone;
        nsHook = seed.opening_hook;
    }
    let showSeedLibrary = $state(false);

    let characterSelected = $state(false);
    let characterName = $state('');
    let selectedArc = $state('warrior');
    let classTitle = $state('');

    // --- Soul Forge (conversational AI character genesis) ---
    let concept = $state('');
    let forging = $state(false);
    let forged = $state<ForgedCharacter | null>(null);
    let forgeError = $state('');
    let forgeMsgs = $state<ForgeMessage[]>([]);
    let forgeInput = $state('');
    let conversing = $state(false);

    const CONCEPT_EXAMPLES = [
        'A rogue terrified of the dark who hides in shadows',
        'A defrocked priest who bargained his faith for necromancy',
        'A hulking blacksmith with a cursed hammer that whispers',
        'A silver-tongued swindler fleeing a debt to a fey lord'
    ];

    // --- Multiplayer sync state ---
    let lastQteId = '';
    let recentWorlds = $state<string[]>([]);

    // Reconstruct Codex state reactively
    let codexData = $state({
        location: "a quiet crossroads at the edge of an unfinished map",
        plot_summary: "The party has just arrived, each looking for something different.",
        scene_tags: { biome: "crossroads", weather: "clear", mood: "unsettled" },
        party: {} as Record<string, { hp: number, max_hp: number, resolve: number, corruption: number, active_traits: string[], permanent_conditions: string[], echo_tags: string[] }>,
        inventory: {} as Record<string, { durability: number }>,
        world_clock: { turn: 0, day: 1, time_of_day: "morning" } as { turn: number; day: number; time_of_day: string },
        npcs: {} as Record<string, { role?: string; location?: string; goal?: string; disposition?: number; status?: string; last_seen_turn?: number; notes?: string }>,
        factions: {} as Record<string, { type?: string; resources?: number; disposition?: number; agenda?: string; tension?: number; next_move_turn?: number }>,
        threads: [] as Array<{ id: string; name: string; description: string; status: string; escalate_after_turn?: number; lands_at_turn?: number }>,
        north_star: null as { premise: string; tone: string; opening_hook: string; set_at: number | null; set_by: string | null } | null
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

    // The current "moment" = the DM's latest narration, shown full-screen. Falls back to an opening line.
    let currentBeat = $derived.by(() => {
        // Pull from displayChatLog so whispered DM results also surface as the
        // current beat for the whisperer (they supersede the public beat).
        const log = displayChatLog;
        for (let i = log.length - 1; i >= 0; i--) {
            if (log[i]?.author === 'Dungeon Master' || log[i]?.author === 'DM (whisper)') return log[i].text as string;
        }
        return `You arrive at ${codexData.location}. ${codexData.plot_summary || ''}`.trim();
    });

    // --- Live-sync wiring (extracted so switchRoom can rebind cleanly) ---
    function scrollChatToBottom() {
        setTimeout(() => {
            const el = document.querySelector('.chat-log-scroll') as HTMLElement | null;
            if (!el) return;
            // Only auto-scroll when you're already near the bottom, so scrolling UP to read
            // the session history doesn't get yanked back down by new entries.
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            if (nearBottom) el.scrollTop = el.scrollHeight;
        }, 50);
    }

    function subscribeChat() {
        return chatStore.subscribe(value => {
            chatLog = value;
            scrollChatToBottom();
        });
    }

    function bindPeers() {
        const aw = provider.awareness;
        aw.setLocalStateField('user', { name: characterName || 'Wanderer' });
        const update = () => {
            const states = aw.getStates();
            const names: string[] = [];
            for (const s of states.values()) {
                const n = (s as any)?.user?.name;
                if (n && !names.includes(n)) names.push(n);
            }
            activePeers = Math.max(0, states.size - 1);
            // For the roster we want to include ourselves, so use the full list.
            tableRoster = names;
            connectionStatus = activePeers > 0 ? "Live" : "Solo";
        };
        aw.on('change', update);
        update();
    }

    function bindCodex() {
        const yCodex = ydoc.getMap('memoryCodex');
        yCodex.observe(() => {
            const raw = yCodex.toJSON();
            if (raw) {
                codexData = {
                    location: raw.location || "a quiet crossroads at the edge of an unfinished map",
                    plot_summary: raw.plot_summary || "",
                    scene_tags: raw.scene_tags || { biome: "crossroads", weather: "clear", mood: "unsettled" },
                    party: raw.party || {},
                    inventory: raw.inventory || {},
                    world_clock: raw.world_clock || { turn: 0, day: 1, time_of_day: "morning" },
                    npcs: raw.npcs || {},
                    factions: raw.factions || {},
                    threads: raw.threads || [],
                    north_star: raw.north_star || null
                };
                if (codexData.scene_tags) currentSceneTags = codexData.scene_tags;

                // Self-heal: if a sync merge ever drops our hero from this world's party,
                // put them straight back. Guarantees a character is never lost and always
                // re-enters whatever world it's in. registerCurrentCharacter only ADDS —
                // it never touches anyone else's character.
                if (characterSelected && forged && characterName && !(codexData.party as any)[characterName]) {
                    registerCurrentCharacter();
                }

                // Synced QTE — fires on EVERY peer, aligned to a shared future start_time,
                // so reflex events are fair across the table (not just the processor).
                const q = raw.active_qte;
                if (q && q.id && q.id !== lastQteId && (q.start_time || 0) > Date.now() - 500) {
                    lastQteId = q.id;
                    qteConfig = { time_limit_ms: q.time_limit_ms || 1000, start_time: q.start_time };
                    showQTE = true;
                }
            }
        });
    }

    let unsubscribe = subscribeChat();
    let unsubscribeServer = subscribeServerEvents();
    let unsubProvider: any = null;
    let activePeers = $state(0);
    let tableRoster = $state<string[]>([]);
    let rosterOpen = $state(false);

    onMount(() => {
        try { recentWorlds = JSON.parse(localStorage.getItem('rt_worlds') || '[]'); } catch { recentWorlds = []; }

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

        // Phase 25: subscribe to providerStore for connection banner. We
        // only show the banner after a 1.5s grace so brief blips don't
        // flash — long disconnects are the ones worth surfacing.
        unsubProvider = providerStore.subscribe((p: any) => {
            if (p.status === 'disconnected') {
                if (!wsDisconnectTimer) {
                    wsDisconnectTimer = setTimeout(() => { wsDisconnected = true; }, 1500);
                }
            } else {
                if (wsDisconnectTimer) { clearTimeout(wsDisconnectTimer); wsDisconnectTimer = null; }
                wsDisconnected = false;
            }
        });
    });

    function beginQuest() { wizardStep = 'attune'; }

    // Commit the key from the wizard, then advance to the Soul Forge.
    function attune() {
        if (!apiKey.trim()) return;
        localStorage.setItem('rt_api_key', apiKey);
        localStorage.setItem('rt_share_policy', keySharePolicy);
        isReady = true;
        // Register with the world's key pool so the server can use it for AI turns.
        registerKey(apiKey, characterName || 'Wanderer', keySharePolicy);
        wizardStep = 'forge';
    }

    // In-game settings-drawer save (does not move the wizard).
    function saveSettings() {
        if (apiKey) {
            localStorage.setItem('rt_api_key', apiKey);
            localStorage.setItem('rt_share_policy', keySharePolicy);
            isReady = true;
            // Re-register in case the key or sharing policy changed.
            registerKey(apiKey, characterName || 'Wanderer', keySharePolicy);
            showSettings = false;
        }
    }

    // --- Soul Forge (conversational: talk it out, then compile) ---
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

    // Compile the final character from the whole conversation.
    async function runForge(opts: { previous?: ForgedCharacter } = {}) {
        if (forging || !apiKey || forgeMsgs.length === 0) return;
        forging = true; forgeError = '';
        try {
            const c = await forgeCharacter(concept, apiKey, { conversation: forgeMsgs, nameHint: characterName.trim() || undefined, ...opts });
            forged = withPortrait(c);
            if (!characterName.trim()) characterName = c.name;
        } catch (e: any) {
            forgeError = e?.message || 'The forge went cold. Check your key and try again.';
        }
        forging = false;
    }
    function compileForge()       { runForge(); }
    function reforge()            { if (forged) runForge({ previous: forged }); }
    function backToConversation() { forged = null; }

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
            backstory: forged.backstory, portrait_url: forged.portrait_url || ''
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
        provider.awareness.setLocalStateField('user', { name });
        rememberWorld(roomId);
        addChatEntry({ author: 'System', text: `${name} — ${forged.class_title} — has joined the table.`, type: 'dm' });
    }

    // --- World management ---
    function rememberWorld(code: string) {
        recentWorlds = [code, ...recentWorlds.filter((c) => c !== code)].slice(0, 6);
        localStorage.setItem('rt_worlds', JSON.stringify(recentWorlds));
    }

    // Ensure the current hero exists in the current room's party (used when creating/joining a world).
    function registerCurrentCharacter() {
        if (!forged || !characterName) return;
        const charData = {
            hp: forged.hp, max_hp: forged.hp,
            resolve: forged.resolve, corruption: forged.corruption,
            active_traits: forged.traits.map((t) => t.name),
            trait_details: forged.traits,
            permanent_conditions: [], echo_tags: [],
            class_title: forged.class_title, archetype: forged.archetype,
            backstory: forged.backstory, portrait_url: forged.portrait_url || ''
        };
        ydoc.transact(() => {
            const yCodex = ydoc.getMap('memoryCodex');
            const party = yCodex.get('party') || {};
            if (!party[characterName]) { party[characterName] = charData; yCodex.set('party', party); }
            const inventory = yCodex.get('inventory') || {};
            if (forged.starting_item?.name && !inventory[forged.starting_item.name]) {
                inventory[forged.starting_item.name] = { durability: 3, note: forged.starting_item.note || '' };
                yCodex.set('inventory', inventory);
            }
        });
    }

    function newWorld() {
        roomId = 'realm-' + Math.random().toString(36).slice(2, 7);
        switchRoom();
    }

    function joinWorld(code: string) {
        roomId = code;
        switchRoom();
    }

    // Phase 5: .weave export — full snapshot of the chronicle stream + world
    // state as a downloadable JSON artifact. Format is structured for replay
    // tools; a `prose` field gives a human-readable plaintext rendition so the
    // file is openable without tooling.
    function exportWeave() {
        const wc = (codexData as any).world_clock || {};
        const scene = (codexData as any).scene_tags || {};
        const party = (codexData as any).party || {};
        const npcs = (codexData as any).npcs || {};
        const factions = (codexData as any).factions || {};
        const threads = (codexData as any).threads || [];
        const location = (codexData as any).location || '';

        // Build the chronicle stream. Order matters — chatLog is append-only
        // so timestamps preserve order even across late-arriving syncs. Pulls
        // from displayChatLog so the whisperer's local whispers also surface.
        const chronicle = displayChatLog
            .filter(e => e.type === 'player' || e.type === 'dm' || e.type === 'world' || e.type === 'whisper')
            .map(e => ({
                type: e.type,
                author: e.author || '',
                text: e.text || '',
                timestamp: e.timestamp || null,
            }));

        // Plaintext rendition for the `prose` field.
        const proseLines: string[] = [];
        proseLines.push(`# Chronicle of ${roomId}`);
        proseLines.push(`# Day ${wc.day || 1} · ${wc.time_of_day || 'morning'} · Turn ${wc.turn || 0}`);
        if (location) proseLines.push(`# Location: ${location}`);
        if (scene.biome || scene.weather || scene.mood) {
            const bits = [scene.biome, scene.weather, scene.mood].filter(Boolean).join(' · ');
            proseLines.push(`# Scene: ${bits}`);
        }
        proseLines.push('');
        for (const entry of chronicle) {
            if (entry.type === 'world') {
                proseLines.push(`◍ ${entry.text}`);
            } else if (entry.type === 'whisper') {
                proseLines.push(`(whisper) ${entry.author}: ${entry.text}`);
            } else if (entry.type === 'player') {
                proseLines.push(`▶ ${entry.author}: ${entry.text}`);
            } else {
                proseLines.push(`${entry.text}`);
                proseLines.push('');
            }
        }

        const snapshot = {
            format: 'round-table.weave',
            version: 1,
            exported_at: new Date().toISOString(),
            world: {
                room_id: roomId,
                location,
                world_clock: wc,
                scene_tags: scene,
            },
            party,
            npcs,
            factions,
            threads,
            chronicle,
            prose: proseLines.join('\n'),
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

    function switchRoom() {
        if (!roomId.trim()) return;
        showSettings = false;
        lastQteId = '';

        // Tear down the old room completely (WebRTC + IndexedDB) before rebuilding.
        unsubscribe();
        gameState.destroy();

        gameState = createGameState(roomId.trim());
        chatStore = gameState.chatStore;
        addChatEntry = gameState.addChatEntry;
        ydoc = gameState.ydoc;
        provider = gameState.provider;
        serverEvents = gameState.serverEvents;
        sendAction = gameState.sendAction;
        registerKey = gameState.registerKey;
        reportKeyExhausted = gameState.reportKeyExhausted;
        engineControl = gameState.engineControl;

        // Rebind live sync to the new room, keeping the handle so onDestroy
        // (and the next switch) can clean it up.
        unsubscribe = subscribeChat();
        unsubscribeServer?.();
        unsubscribeServer = subscribeServerEvents();
        bindPeers();
        bindCodex();

        // Re-register this client's API key with the new world's pool (the key
        // is bound to a single WS connection — every switch needs a fresh register).
        if (apiKey) registerKey(apiKey, characterName || 'Wanderer', keySharePolicy);

        // Carry the hero into the new/joined world once local state has loaded.
        gameState.persistence.whenSynced.then(() => registerCurrentCharacter());
        rememberWorld(roomId.trim());

        addChatEntry({ author: 'System', text: `Entered world: ${roomId}`, type: 'dm' });
    }

    // Broadcast a QTE to the whole table via the synced codex (all peers show it together).
    function broadcastQTE(qte: any) {
        ydoc.getMap('memoryCodex').set('active_qte', {
            id: Math.random().toString(36).slice(2),
            time_limit_ms: qte?.time_limit_ms || 1000,
            start_time: Date.now() + 1500   // buffer so every device starts the timer in sync
        });
    }

    // Phase 15: manual codex override. AI sometimes tracks HP wrong; the host
    // (or any player editing themselves) needs a way to fix it without writing
    // an in-character action. Writes through Yjs so all clients sync. The
    // override is tagged in the chronicle so it's clear this didn't come from
    // the AI pipeline.
    function overrideStat(name: string, key: 'hp' | 'resolve' | 'corruption', delta: number) {
        if (!name) return;
        const yCodex = (ydoc as any).getMap('memoryCodex');
        const party = yCodex.get('party') || {};
        const cur = (party[name] || {}) as any;
        const next = { ...cur };
        if (key === 'hp') {
            const max = cur.max_hp || 15;
            next.hp = Math.max(0, Math.min(max, (cur.hp ?? max) + delta));
        } else {
            next[key] = Math.max(0, Math.min(100, (cur[key] ?? 0) + delta));
        }

        // Phase 19: death's door. Stamp or clear the 'downed' condition as HP
        // crosses 0. Append/remove from permanent_conditions without dupes.
        const prevConds: string[] = Array.isArray(cur.permanent_conditions) ? cur.permanent_conditions.slice() : [];
        const hadDowned = prevConds.includes('downed');
        const isDowned = key === 'hp' && next.hp === 0;
        let downedChanged = false;
        if (isDowned && !hadDowned) {
            next.permanent_conditions = [...prevConds, 'downed'];
            downedChanged = true;
        } else if (!isDowned && key === 'hp' && hadDowned && next.hp > 0) {
            next.permanent_conditions = prevConds.filter(c => c !== 'downed');
            downedChanged = true;
        }

        party[name] = next;
        ydoc.transact(() => {
            yCodex.set('party', party);
            const yChat = (ydoc as any).getArray('chatLog');
            const notes: string[] = [];
            notes.push(`${name === characterName ? 'You' : name}: ${key === 'hp' ? 'Vitality' : key.charAt(0).toUpperCase() + key.slice(1)} ${delta > 0 ? '+' : ''}${delta} (manual override)`);
            if (downedChanged) {
                if (isDowned) {
                    notes.push(`${name === characterName ? 'You have' : `${name} has`} fallen — death's door.`);
                } else if (key === 'hp' && next.hp > 0) {
                    notes.push(`${name === characterName ? 'You' : name} steadies — back on ${name === characterName ? 'your' : 'their'} feet.`);
                }
            }
            for (const t of notes) {
                yChat.push([{
                    author: 'System',
                    text: t,
                    type: 'world',
                    timestamp: Date.now()
                }]);
            }
        });
    }

    // Phase 11: drop a verb stem into the action field and focus. Pure UX —
    // no AI hint, no semantic change. Player still has to complete and submit.
    function applyTemplate(tpl: { stem: string; cursor_at_end: boolean }) {
        chatInput = tpl.stem;
        setTimeout(() => {
            const el = actionFieldEl;
            if (!el) return;
            el.focus();
            if (tpl.cursor_at_end) {
                const pos = tpl.stem.length;
                el.setSelectionRange(pos, pos);
            }
        }, 0);
    }

    // Phase 17: same shape as applyTemplate but takes a verb + NPC name, so
    // chips like "Ask Mira" pre-fill "Ask Mira " and position the cursor at
    // the end for the player to type their actual question.
    function applyNpcTemplate(verb: string, npcName: string) {
        const stem = `${verb} ${npcName} `;
        applyTemplate({ stem, cursor_at_end: true });
    }

    // Phase 20: inline inventory add. AI sometimes fails to materialize items
    // the Director mentioned ("you find a brass key" but no key in inventory).
    // The host types the name, hits +, and the item lands via Yjs.
    function addItemToInventory(evt: Event) {
        evt.preventDefault();
        const name = inventoryAddName.trim();
        if (!name) return;
        const yCodex = (ydoc as any).getMap('memoryCodex');
        const inventory = yCodex.get('inventory') || {};
        if (inventory[name]) {
            inventoryAddName = '';
            return;
        }
        inventory[name] = { durability: 3, note: '' };
        ydoc.transact(() => {
            yCodex.set('inventory', inventory);
            const yChat = (ydoc as any).getArray('chatLog');
            yChat.push([{
                author: 'System',
                text: `${characterName || 'You'} acquired ${name} (manual add)`,
                type: 'world',
                timestamp: Date.now()
            }]);
        });
        inventoryAddName = '';
    }

    // Phase 18: cycle through locally-derived suggestions for the cold-start
    // "I don't know what to do" moment. No AI call — just structural prompts
    // drawn from the live situation (present NPCs, active threads, scene).
    let hintIndex = $state(0);
    let hintSuggestions = $derived.by(() => {
        const out: string[] = [];
        const scene = (codexData as any).scene_tags || {};
        if (scene.biome || scene.mood) {
            out.push(`Look around the ${scene.biome || 'scene'} — what details stand out?`);
        }
        if (presentNpcs.length > 0) {
            const n = presentNpcs[0].name;
            out.push(`Watch ${n} for a beat — what are they doing?`);
            out.push(`Ask ${n} about the situation.`);
        }
        if (activeThreads.length > 0) {
            const t = activeThreads[0];
            out.push(`Turn your attention to ${t.name} — what can you learn?`);
        }
        const inv = (codexData as any).inventory || {};
        const items = Object.keys(inv);
        if (items.length > 0) {
            out.push(`Check your ${items[0]} — any detail you missed?`);
        }
        if (out.length === 0) {
            out.push('Take a steadying breath and look closer at where you are.');
            out.push('What does the air smell like here?');
            out.push('Name one thing your character would notice.');
        }
        return out;
    });
    let currentHint = $state('');
    function cycleHint() {
        if (hintSuggestions.length === 0) return;
        currentHint = hintSuggestions[hintIndex % hintSuggestions.length];
        hintIndex += 1;
    }

    // Submit a free-text action to the server. Server batches for ~5s, calls the
    // AI with a pooled key, and writes the DM beat to Yjs (arrives here as a
    // chatLog update via sync). turn-result / turn-error clear isLoading.
    // Phase 10: when whisperMode is on, route through the whisper track — the
    // action is hidden from the table and the result returns as whisper-result.
    function submitAction(forceWhisper: boolean = false) {
        if (!chatInput.trim() || isLoading || whisperInFlight) return;
        const userAction = chatInput.trim();
        const author = characterName || 'You';
        lastAction = userAction;
        chatInput = '';

        // Phase 26: push to session history (dedup the most recent so rapid
        // identical resends don't pollute the cycle). Cursor resets to "after
        // last" so Up arrow recalls the just-sent action first.
        if (actionHistory[actionHistory.length - 1] !== userAction) {
            actionHistory.push(userAction);
        }
        actionHistoryCursor = actionHistory.length;
        actionHistoryDraft = '';

        if (whisperMode || forceWhisper) {
            whisperInFlight = true;
            addLocalWhisper({ author, text: userAction, type: 'whisper', timestamp: Date.now() });
            const sent = sendAction(userAction, author, true);
            if (!sent) {
                addLocalWhisper({ author: 'System', text: 'Not connected to the world — retrying…', type: 'whisper', timestamp: Date.now() });
                whisperInFlight = false;
            }
            return;
        }

        isLoading = true;
        turnStageLabel = 'The world responds…';
        // Echo our own action locally for instant feedback (peers see it via Yjs sync).
        addChatEntry({ author, text: userAction, type: 'player' });

        // Send to server — the Worker owns batching, AI calls, and beat delivery.
        const sent = sendAction(userAction, author);
        if (!sent) {
            addChatEntry({ author: 'System', text: 'Not connected to the world — retrying…', type: 'dm' });
            isLoading = false;
        }
    }

    // Server-event subscription: turn-start confirms batch received, turn-result
    // fires when the AI's beat has been written to Yjs (so the chat log already
    // has it by the time this fires), turn-error surfaces AI/key failures.
    let lastTurnError = $state('');
    function subscribeServerEvents() {
        return serverEvents.subscribe(evt => {
            if (!evt) return;
            if (evt.type === 'turn-start') {
                // Beat is in flight; keep isLoading = true.
                turnStageLabel = 'The world responds…';
            } else if (evt.type === 'turn-stage') {
                turnStageLabel = (evt as any).label || 'The world responds…';
            } else if (evt.type === 'turn-result') {
                isLoading = false;
                turnStageLabel = '';
                if (evt.ui_update?.qte) broadcastQTE(evt.ui_update.qte);
            } else if (evt.type === 'turn-error') {
                isLoading = false;
                turnStageLabel = '';
                lastTurnError = evt.message || 'The world hesitates.';
                addChatEntry({ author: 'System', text: lastTurnError, type: 'dm' });
            } else if (evt.type === 'whisper-result') {
                isLoading = false;
                if (evt.ui_update?.qte) broadcastQTE(evt.ui_update.qte);
            } else if (evt.type === 'turn-error') {
                isLoading = false;
                lastTurnError = evt.message || 'The world hesitates.';
                addChatEntry({ author: 'System', text: lastTurnError, type: 'dm' });
            } else if (evt.type === 'whisper-result') {
                whisperInFlight = false;
                if (evt.ui_update?.qte) broadcastQTE(evt.ui_update.qte);
                addLocalWhisper({ author: 'DM (whisper)', text: evt.narration || '', type: 'whisper', timestamp: Date.now() });
            } else if (evt.type === 'whisper-error') {
                whisperInFlight = false;
                addLocalWhisper({ author: 'System', text: evt.message || 'The DM did not hear you.', type: 'whisper', timestamp: Date.now() });
            } else if (evt.type === 'whisper-status') {
                // Optional UI hint; no state change required.
            } else if (evt.type === 'engine-status') {
                // Phase 23: pause reflects server truth, not local optimism.
                enginePaused = !!(evt as any).paused;
            }
        });
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

    // GSAP-powered Svelte custom transitions for the Chronicle book and overlay
    function chronicleTransition(node: HTMLElement) {
        return {
            duration: 400,
            tick: (t: number) => {
                gsap.set(node, {
                    scale: 0.9 + 0.1 * t,
                    y: (1 - t) * 30,
                    opacity: t
                });
            }
        };
    }

    function overlayTransition(node: HTMLElement) {
        return {
            duration: 300,
            tick: (t: number) => {
                gsap.set(node, { opacity: t });
            }
        };
    }

    onDestroy(() => {
        gameState.destroy();
        unsubscribe();
        unsubscribeServer?.();
        unsubProvider?.();
        if (wsDisconnectTimer) clearTimeout(wsDisconnectTimer);
    });
</script>

<main>
    <!-- Phase 25: Connection banner — non-blocking, appears only after a
         1.5s grace so brief blips don't flash. Auto-dismisses on reconnect. -->
    {#if wsDisconnected}
        <div class="conn-banner" role="status" aria-live="polite">
            <span class="conn-pulse"></span>
            <span class="conn-text">Rejoining the world — your actions and the DM's last beat are preserved.</span>
        </div>
    {/if}

    <!-- Background diorama (in-game atmosphere) -->
    <div class="canvas-container">
        <CinematicDiorama sceneTags={currentSceneTags} />
    </div>

    <!-- Phase 4: Scene portrait backdrop (Pollinations, fades in over diorama) -->
    {#if scenePortraitsEnabled && scenePortraitShown}
        <div class="scene-portrait-layer">
            <img src={scenePortraitShown} alt="" />
            <div class="scene-portrait-veil"></div>
        </div>
    {/if}
    {#if scenePortraitsEnabled && scenePortraitLoading}
        <div class="scene-portrait-loading">
            <span class="mini-spinner"></span>
        </div>
    {/if}

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
                    <p class="tagline">A tabletop adventure, narrated by AI.</p>
                    <p class="welcome-desc">
                        Create a hero, gather your party, and decide what to do. An AI Dungeon Master
                        turns every roll of the dice into a living story that responds to every choice
                        you make.
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
                            Used by the world server to power AI turns for the whole table.
                            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a free key →</a>
                        </span>
                    </label>

                    <div class="field">
                        <span class="field-label">Key sharing</span>
                        <div class="share-policy-row">
                            {#each [['table', 'Table', "Pool with the table — round-robins across all contributed keys so no one's quota burns first."], ['solo', 'Solo', 'Only used for your own turns. Never pooled.'], ['host', 'Host', 'Pooled, but only the host needs to contribute.']] as [val, label, title]}
                                <button type="button" class="share-chip" class:selected={keySharePolicy === val} onclick={() => keySharePolicy = val as any} title={title}>{label}</button>
                            {/each}
                        </div>
                        <span class="field-help">
                            {#if keySharePolicy === 'table'}
                                Pooled round-robin — fairest for even quota burn.
                            {:else if keySharePolicy === 'solo'}
                                Yours only — the table uses everyone else's keys but not yours.
                            {:else}
                                Host mode — only the host's key is pooled for the table.
                            {/if}
                        </span>
                    </div>

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
                <!-- Soul Forge — a back-and-forth with the AI, then compile from the conversation -->
                <div class="wizard-card forge-card panel">
                    <div class="wizard-head">
                        <span class="step-tag">Step 2 of 2</span>
                        <h2>The Soul Forge</h2>
                        <p class="wizard-sub">Talk with the Forge about the hero you want. When they feel right, forge them from your conversation.</p>
                    </div>

                    {#if !forged}
                        <div class="forge-chat">
                            {#if forgeMsgs.length === 0}
                                <p class="forge-hint">Tell the Forge who you want to become. It will ask questions until your hero is clear — then compile them from everything you agreed on.</p>
                                <div class="concept-chips">
                                    {#each CONCEPT_EXAMPLES as ex}
                                        <button type="button" class="chip-btn" onclick={() => sendForgeMessage(ex)}>{ex}</button>
                                    {/each}
                                </div>
                            {/if}
                            {#each forgeMsgs as m}
                                <div class="forge-msg {m.role}">{m.text}</div>
                            {/each}
                            {#if conversing}
                                <div class="forge-msg model typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
                            {/if}
                        </div>

                        {#if forgeError}<p class="forge-error">{forgeError}</p>{/if}

                        <div class="refine-row">
                            <input type="text" bind:value={forgeInput} onkeydown={(e) => e.key === 'Enter' && sendForgeMessage()} placeholder="Answer the Forge…" disabled={conversing} />
                            <button class="btn-ghost" onclick={() => sendForgeMessage()} disabled={conversing || !forgeInput.trim()}>Send</button>
                        </div>

                        <div class="wizard-actions forge-actions">
                            <button class="btn-ghost" onclick={() => wizardStep = 'attune'}>Back</button>
                            <button class="btn-primary" disabled={forging || forgeMsgs.length === 0} onclick={compileForge}>
                                {forging ? 'Forging…' : 'Forge Character'}
                            </button>
                        </div>
                    {:else}
                        <div class="forged-card">
                            <div class="forged-head">
                                <div class="forged-portrait">
                                    {#if forged.portrait_url}
                                        <img src={forged.portrait_url} alt={forged.name} />
                                    {:else}
                                        <span class="forged-icon">{@html iconFor(forged.archetype)}</span>
                                    {/if}
                                    <button class="portrait-reroll" onclick={regeneratePortrait} title="New portrait" aria-label="Regenerate portrait">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.2 5.6"/><path d="M20 5v6h-6"/></svg>
                                    </button>
                                </div>
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
                        </div>

                        {#if forgeError}<p class="forge-error">{forgeError}</p>{/if}

                        <div class="wizard-actions forge-actions">
                            <button class="btn-ghost" onclick={backToConversation} disabled={forging}>Keep Talking</button>
                            <button class="btn-ghost" onclick={reforge} disabled={forging}>{forging ? 'Forging…' : 'Reforge'}</button>
                            <button class="btn-primary" disabled={forging} onclick={acceptCharacter}>Enter the Realm</button>
                        </div>
                    {/if}
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
                        <span class="version">v3.0</span>
                    </div>
                </div>

                <div class="hud-center">
                    <div class="location-tag">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5-6-10a6 6 0 1 1 12 0c0 5-6 10-6 10z"/><circle cx="12" cy="11" r="2"/></svg>
                        <span class="loc-text">{codexData.location}</span>
                    </div>
                </div>

                <div class="hud-right">
                    <div class="roster-wrap">
                        <button
                            type="button"
                            class="status-orb {connectionStatus.toLowerCase().replace(' ', '-')}"
                            onclick={() => rosterOpen = !rosterOpen}
                            aria-expanded={rosterOpen}
                            aria-label={`Table roster: ${tableRoster.length} player${tableRoster.length === 1 ? '' : 's'}`}
                        >
                            <span class="ping-pulse"></span>
                            <span class="status-text">{connectionStatus}{activePeers > 0 ? ` · ${activePeers}` : ''}</span>
                        </button>
                        {#if rosterOpen}
                            <div class="roster-pop panel">
                                <header class="roster-head">
                                    <h4>At the Table</h4>
                                    <span class="roster-count">{tableRoster.length}</span>
                                </header>
                                {#if tableRoster.length === 0}
                                    <p class="roster-empty">No one here yet.</p>
                                {:else}
                                    <ul class="roster-list">
                                        {#each tableRoster as name}
                                            <li class="roster-name" class:is-self={name === characterName}>
                                                <span class="roster-dot"></span>
                                                <span>{name}</span>
                                                {#if name === characterName}<span class="roster-self-tag">you</span>{/if}
                                            </li>
                                        {/each}
                                    </ul>
                                {/if}
                            </div>
                        {/if}
                    </div>
                    <button class="icon-btn chronicle-btn" onclick={() => showChronicle = !showChronicle} class:active={showChronicle} aria-label="Chronicle">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                            <path d="M8 6h8"/>
                            <path d="M8 10h8"/>
                            <path d="M8 14h6"/>
                        </svg>
                    </button>
                    <button class="icon-btn settings-btn" onclick={() => showSettings = !showSettings} aria-label="Settings">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h9"/><circle cx="16" cy="7" r="2.2"/><path d="M19 7h1"/><path d="M4 17h6"/><circle cx="13" cy="17" r="2.2"/><path d="M17 17h3"/></svg>
                    </button>
                </div>
            </header>

            <!-- Phase 3: Situation Bar — surface the World Engine's live state -->
            {#if ((codexData as any).world_clock?.turn > 0) || presentNpcs.length > 0 || activeThreads.length > 0 || visibleFactions.length > 0 || sceneSummary}
                <div class="situation-bar panel">
                    <div class="sit-segment sit-clock">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                        <span class="sit-label">Day {(codexData as any).world_clock?.day || 1}</span>
                        <span class="sit-sep">·</span>
                        <span class="sit-value">{(codexData as any).world_clock?.time_of_day || 'morning'}</span>
                        <span class="sit-sep">·</span>
                        <span class="sit-value">Turn {(codexData as any).world_clock?.turn || 0}</span>
                    </div>

                    {#if sceneSummary}
                        <div class="sit-segment sit-scene">
                            <span class="sit-label">Scene</span>
                            <span class="sit-value">{sceneSummary}</span>
                        </div>
                    {/if}

                    {#if presentNpcs.length > 0}
                        <div class="sit-segment sit-present">
                            <span class="sit-label">Present</span>
                            {#each presentNpcs.slice(0, 4) as npc}
                                <span class="sit-chip npc-chip" data-disp={(npc as any).disposition || 'neutral'}>
                                    <span class="chip-name">{npc.name}</span>
                                    {#if (npc as any).disposition}
                                        <span class="chip-disp">{(npc as any).disposition}</span>
                                    {/if}
                                </span>
                            {/each}
                        </div>
                    {/if}

                    {#if visibleFactions.length > 0}
                        <div class="sit-segment sit-factions">
                            <span class="sit-label">In play</span>
                            {#each visibleFactions.slice(0, 3) as fac}
                                <span class="sit-chip faction-chip">
                                    <span class="chip-name">{fac.name}</span>
                                </span>
                            {/each}
                        </div>
                    {/if}

                    {#if activeThreads.length > 0}
                        <div class="sit-segment sit-threads">
                            <span class="sit-label">Tension</span>
                            {#each activeThreads.slice(0, 3) as t}
                                <span class="sit-chip thread-chip thread-{t.status}" class:thread-imminent={t.turnsUntilLands !== null && t.turnsUntilLands <= 3 && t.turnsUntilLands >= 0}>
                                    <span class="chip-name">{t.name}</span>
                                    {#if t.turnsUntilLands !== null && t.turnsUntilLands >= 0}
                                        <span class="chip-count">{t.turnsUntilLands === 0 ? 'lands now' : `${t.turnsUntilLands}t`}</span>
                                    {/if}
                                </span>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}

            <div class="main-content">
                <!-- Character Codex -->
                <aside class="codex-sidebar panel {showCodexMobile ? 'mobile-visible' : ''}">
                    <div class="sidebar-header">
                        <div class="hero-id">
                            <span class="hero-avatar">
                                {#if forged?.portrait_url}<img src={forged.portrait_url} alt={characterName} />{:else}{@html iconFor(selectedArc)}{/if}
                            </span>
                            <div>
                                <h2>{characterName}</h2>
                                <span class="archetype">{myArchetypeLabel}</span>
                            </div>
                        </div>
                    </div>

                    <div class="sidebar-body">
                        <div class="stat-group">
                            <div class="stat-label-row">
                                <span>Vitality</span>
                                <div class="stat-override">
                                    <button type="button" class="stat-btn" onclick={() => overrideStat(characterName, 'hp', -1)} aria-label="Lose 1 vitality" title="−1 vitality">−1</button>
                                    <span class="val hp-val">{myCharacter.hp} / {myCharacter.max_hp}</span>
                                    <button type="button" class="stat-btn" onclick={() => overrideStat(characterName, 'hp', 1)} aria-label="Gain 1 vitality" title="+1 vitality">+1</button>
                                </div>
                            </div>
                            <div class="progress-bar"><div class="fill hp" style="width: {(myCharacter.hp / myCharacter.max_hp) * 100}%"></div></div>
                        </div>
                        <div class="stat-group">
                            <div class="stat-label-row">
                                <span>Resolve</span>
                                <div class="stat-override">
                                    <button type="button" class="stat-btn" onclick={() => overrideStat(characterName, 'resolve', -5)} aria-label="−5 resolve" title="−5 resolve">−5</button>
                                    <span class="val resolve-val">{myCharacter.resolve}%</span>
                                    <button type="button" class="stat-btn" onclick={() => overrideStat(characterName, 'resolve', 5)} aria-label="+5 resolve" title="+5 resolve">+5</button>
                                </div>
                            </div>
                            <div class="progress-bar"><div class="fill resolve" style="width: {myCharacter.resolve}%"></div></div>
                        </div>
                        <div class="stat-group">
                            <div class="stat-label-row">
                                <span>Corruption</span>
                                <div class="stat-override">
                                    <button type="button" class="stat-btn" onclick={() => overrideStat(characterName, 'corruption', -5)} aria-label="−5 corruption" title="−5 corruption">−5</button>
                                    <span class="val corruption-val">{myCharacter.corruption}%</span>
                                    <button type="button" class="stat-btn" onclick={() => overrideStat(characterName, 'corruption', 5)} aria-label="+5 corruption" title="+5 corruption">+5</button>
                                </div>
                            </div>
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
                            <form class="inv-add" onsubmit={addItemToInventory}>
                                <input
                                    class="inv-add-input"
                                    type="text"
                                    bind:value={inventoryAddName}
                                    placeholder="Add item…"
                                    maxlength="40"
                                    aria-label="Add item to inventory"
                                />
                                <button type="submit" class="inv-add-btn" disabled={!inventoryAddName.trim()}>+</button>
                            </form>
                        </div>

                        {#if Object.keys(codexData.npcs || {}).length > 0 || (codexData.threads || []).length > 0 || Object.keys(codexData.factions || {}).length > 0 || (codexData as any).north_star?.premise}
                            <div class="codex-section world-section">
                                <h3>World</h3>
                                {#if (codexData as any).north_star?.premise}
                                    <div class="north-star-display">
                                        {#if (codexData as any).north_star.tone}
                                            <span class="ns-tone-chip">{(codexData as any).north_star.tone}</span>
                                        {/if}
                                        <p class="ns-premise-text">{(codexData as any).north_star.premise}</p>
                                    </div>
                                {/if}
                                <div class="world-clock-chip">
                                    <span class="clock-day">Day {codexData.world_clock?.day || 1}</span>
                                    <span class="clock-sep">·</span>
                                    <span class="clock-time">{(codexData.world_clock?.time_of_day || 'morning')}</span>
                                    <span class="clock-sep">·</span>
                                    <span class="clock-turn">Turn {codexData.world_clock?.turn || 0}</span>
                                </div>

                                <div class="engine-controls" title="World Engine host controls — pause the alarm loop, force a tick, or step time forward without an LLM call.">
                                    <button
                                        type="button"
                                        class="engine-btn"
                                        onclick={() => engineControl(enginePaused ? 'resume' : 'pause')}
                                        aria-label={enginePaused ? 'Resume World Engine' : 'Pause World Engine'}
                                    >
                                        {enginePaused ? '▶ Resume' : '⏸ Pause'}
                                    </button>
                                    <button
                                        type="button"
                                        class="engine-btn"
                                        onclick={() => engineControl('step-time')}
                                        disabled={enginePaused}
                                        aria-label="Step world clock forward one bucket"
                                        title="Advance world clock one bucket (morning → midday → evening → night) without an LLM call."
                                    >+Time</button>
                                    <button
                                        type="button"
                                        class="engine-btn"
                                        onclick={() => engineControl('tick-now')}
                                        aria-label="Force a World Engine tick now"
                                        title="Force the World Engine to run now — LLM-backed ambient beat + clock tick."
                                    >Tick now</button>
                                </div>

                                {#if Object.keys(codexData.npcs || {}).length > 0}
                                    <ul class="world-list npc-list">
                                        {#each Object.entries(codexData.npcs) as [name, npc]}
                                            <li class="world-item">
                                                {#if scenePortraitsEnabled}
                                                    <img class="npc-portrait" src={npcPortraitUrl(name, npc)} alt={name} loading="lazy" />
                                                {/if}
                                                <div class="world-item-text">
                                                    <span class="world-name">{name}</span>
                                                    {#if (npc as any).role}<span class="world-sub">{(npc as any).role}</span>{/if}
                                                    {#if (npc as any).location}<span class="world-meta">{(npc as any).location}</span>{/if}
                                                    {#if (npc as any).notes}<span class="world-note">{(npc as any).notes}</span>{/if}
                                                </div>
                                            </li>
                                        {/each}
                                    </ul>
                                {/if}

                                {#if Object.keys(codexData.factions || {}).length > 0}
                                    <ul class="world-list faction-list">
                                        {#each Object.entries(codexData.factions) as [name, fac]}
                                            <li class="world-item">
                                                <span class="world-name">{name}</span>
                                                {#if (fac as any).type}<span class="world-sub">{(fac as any).type}</span>{/if}
                                                {#if (fac as any).agenda}<span class="world-note">{(fac as any).agenda}</span>{/if}
                                            </li>
                                        {/each}
                                    </ul>
                                {/if}

                                {#if (codexData.threads || []).filter((t: any) => t.status === 'active' || t.status === 'landed').length > 0}
                                    <ul class="world-list thread-list">
                                        {#each (codexData.threads || []).filter((t: any) => t.status === 'active' || t.status === 'landed') as t}
                                            <li class="world-item thread-{t.status}">
                                                <span class="world-name">{t.name}</span>
                                                {#if t.description}<span class="world-note">{t.description}</span>{/if}
                                            </li>
                                        {/each}
                                    </ul>
                                {/if}
                            </div>
                        {/if}
                    </div>
                </aside>

                <!-- Immersive moment stage — one beat at a time, no scrolling log -->
                <section class="moment-stage panel">
                    <div class="stage-body">
                        {#if isLoading}
                            <div class="beat resolving">
                                {#if lastAction}<p class="your-move">“{lastAction}”</p>{/if}
                                <div class="resolving-ind">
                                    <span class="orb-pulse"></span>
                                    <span>{turnStageLabel || 'The world responds…'}</span>
                                </div>
                            </div>
                        {:else}
                            {#key currentBeat}
                                <p class="beat-text">{@html currentBeat}</p>
                            {/key}
                        {/if}
                    </div>

                    <div class="stage-action">
                        <span class="turn-cue">{characterName || 'You'} — what do you do?</span>
                        {#if myCharacter}
                            <div class="vitals-chip" aria-label="Your vitals">
                                <div class="vital vital-hp" title={`Vitality ${myCharacter.hp} / ${myCharacter.max_hp}`}>
                                    <span class="vital-icon">♥</span>
                                    <div class="vital-bar"><div class="vital-fill" style="width: {Math.max(0, Math.min(100, (myCharacter.hp / myCharacter.max_hp) * 100))}%"></div></div>
                                    <span class="vital-num">{myCharacter.hp}</span>
                                </div>
                                <div class="vital vital-resolve" title={`Resolve ${myCharacter.resolve}%`}>
                                    <span class="vital-icon">◈</span>
                                    <div class="vital-bar"><div class="vital-fill" style="width: {Math.max(0, Math.min(100, myCharacter.resolve))}%"></div></div>
                                </div>
                                {#if myCharacter.corruption > 0}
                                    <div class="vital vital-corruption" title={`Corruption ${myCharacter.corruption}%`}>
                                        <span class="vital-icon">☠</span>
                                        <div class="vital-bar"><div class="vital-fill" style="width: {Math.max(0, Math.min(100, myCharacter.corruption))}%"></div></div>
                                    </div>
                                {/if}
                                {#if myCharacter.permanent_conditions && myCharacter.permanent_conditions.length > 0}
                                    <span class="vital-scars" title="Permanent conditions">{myCharacter.permanent_conditions.length} scar{myCharacter.permanent_conditions.length === 1 ? '' : 's'}</span>
                                {/if}
                            </div>
                        {/if}
                        {#if actionInputFocused && situationLine && !isLoading}
                            <div class="action-brief">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                                <span>{situationLine}</span>
                            </div>
                        {/if}
                        {#if !isLoading && !whisperInFlight && chatInput.length === 0}
                            <div class="hint-row">
                                <button
                                    type="button"
                                    class="hint-chip"
                                    onclick={cycleHint}
                                    title="Get a nudge"
                                    aria-label="Get a suggestion"
                                >Hm…</button>
                                {#if currentHint}
                                    <span class="hint-text">{currentHint}</span>
                                    <button
                                        type="button"
                                        class="hint-apply"
                                        onclick={() => { if (currentHint) { chatInput = currentHint; currentHint = ''; } }}
                                        title="Use as action"
                                        aria-label="Use as action"
                                    >Use</button>
                                {/if}
                            </div>
                            {#if presentNpcs.length > 0}
                                <div class="action-templates npc-templates" role="group" aria-label="Address a present NPC">
                                    {#each presentNpcs.slice(0, 3) as npc}
                                        <button
                                            type="button"
                                            class="action-template-chip npc-chip"
                                            onclick={() => applyNpcTemplate('Ask', npc.name)}
                                            title={`Pre-fill: Ask ${npc.name}`}
                                        >Ask {npc.name}</button>
                                        <button
                                            type="button"
                                            class="action-template-chip npc-chip"
                                            onclick={() => applyNpcTemplate('Persuade', npc.name)}
                                            title={`Pre-fill: Persuade ${npc.name}`}
                                        >Persuade {npc.name}</button>
                                    {/each}
                                </div>
                            {/if}
                            <div class="action-templates" role="group" aria-label="Action templates">
                                {#each ACTION_TEMPLATES as tpl (tpl.id)}
                                    <button
                                        type="button"
                                        class="action-template-chip"
                                        onclick={() => applyTemplate(tpl)}
                                        title={`Pre-fill: ${tpl.stem.trim()}`}
                                    >{tpl.label}</button>
                                {/each}
                            </div>
                        {/if}
                        <div class="action-row">
                            <input
                                class="action-field"
                                type="text"
                                bind:value={chatInput}
                                bind:this={actionFieldEl}
                                onkeydown={(e) => {
                                    if (e.key === 'Enter') {
                                        submitAction(e.shiftKey);
                                        return;
                                    }
                                    // Phase 26: Up/Down cycles through this
                                    // session's submitted actions. Draft in
                                    // progress is saved when leaving the tail.
                                    if (e.key === 'ArrowUp') {
                                        if (actionHistory.length === 0) return;
                                        if (actionHistoryCursor === actionHistory.length) {
                                            actionHistoryDraft = chatInput;
                                        }
                                        actionHistoryCursor = Math.max(0, actionHistoryCursor - 1);
                                        chatInput = actionHistory[actionHistoryCursor] || '';
                                        e.preventDefault();
                                        // Move cursor to end so the recalled
                                        // text is ready to edit/append.
                                        requestAnimationFrame(() => {
                                            const len = chatInput.length;
                                            actionFieldEl?.setSelectionRange(len, len);
                                        });
                                    } else if (e.key === 'ArrowDown') {
                                        if (actionHistory.length === 0) return;
                                        if (actionHistoryCursor >= actionHistory.length) return;
                                        actionHistoryCursor += 1;
                                        if (actionHistoryCursor >= actionHistory.length) {
                                            chatInput = actionHistoryDraft;
                                        } else {
                                            chatInput = actionHistory[actionHistoryCursor] || '';
                                        }
                                        e.preventDefault();
                                        requestAnimationFrame(() => {
                                            const len = chatInput.length;
                                            actionFieldEl?.setSelectionRange(len, len);
                                        });
                                    }
                                }}
                                onfocus={() => actionInputFocused = true}
                                onblur={() => actionInputFocused = false}
                                placeholder={whisperMode ? 'Whisper to the DM…' : (isLoading || whisperInFlight ? 'The world responds…' : 'Speak your action…')}
                                disabled={isLoading || whisperInFlight || !isReady}
                            />
                            <button
                                class="whisper-toggle"
                                class:active={whisperMode}
                                onclick={() => whisperMode = !whisperMode}
                                disabled={isLoading || whisperInFlight}
                                aria-pressed={whisperMode}
                                title={whisperMode ? 'Whisper mode on — only the DM hears this' : 'Whisper to the DM (private action)'}
                                aria-label="Toggle whisper mode"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l4-2v9l-4-2v-5z"/><path d="M7 9l5-3v12l-5-3"/><path d="M12 6l5 0a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2l-5 0"/><path d="M19 9l2 0v6l-2 0"/></svg>
                            </button>
                            <button class="btn-primary act-go" onclick={() => submitAction()} disabled={isLoading || whisperInFlight || !isReady || !chatInput.trim()} aria-label="Act">
                                {#if isLoading || whisperInFlight}
                                    <span class="mini-spinner"></span>
                                {:else}
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h14"/><path d="M12 6l6 6-6 6"/></svg>
                                {/if}
                            </button>
                        </div>
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

                <div class="field">
                    <span class="field-label">World</span>
                    <div class="room-input-group">
                        <input id="room-id" type="text" bind:value={roomId} placeholder="realm code" />
                        <button class="btn-ghost" onclick={switchRoom}>Join</button>
                    </div>
                    <span class="field-help">Share this code so friends join your world in real time. Progress saves on your device and resumes when you return.</span>
                    <button class="btn-ghost wide new-world-btn" onclick={newWorld}>+ New World</button>
                    {#if recentWorlds.length > 0}
                        <div class="recent-worlds">
                            {#each recentWorlds as w}
                                <button class="world-chip {w === roomId ? 'current' : ''}" onclick={() => joinWorld(w)}>{w}</button>
                            {/each}
                        </div>
                    {/if}
                </div>

                <label class="field">
                    <span class="field-label">Google AI Studio key</span>
                    <input id="api-key" type="password" bind:value={apiKey} placeholder="AIza…" />
                    <span class="field-help">Stored only in this browser.</span>
                </label>

                <div class="field">
                    <span class="field-label">Key sharing</span>
                    <div class="share-policy-row">
                        {#each [['table', 'Table', 'Pool with the table — round-robins across all contributed keys.'], ['solo', 'Solo', 'Only used for your own turns. Never pooled.'], ['host', 'Host', 'Pooled, but only the host contributes.']] as [val, label, title]}
                            <button type="button" class="share-chip" class:selected={keySharePolicy === val} onclick={() => keySharePolicy = val as any} title={title}>{label}</button>
                        {/each}
                    </div>
                </div>

                <div class="field">
                    <span class="field-label">Presentation</span>
                    <label class="toggle-row">
                        <input type="checkbox" checked={scenePortraitsEnabled} onchange={toggleScenePortraits} />
                        <span class="toggle-label">Scene portraits</span>
                        <span class="field-help">AI-generated backdrop that reflects the live scene. Uses free Pollinations images (no key, no account).</span>
                    </label>
                </div>

                <div class="field">
                    <span class="field-label">Export</span>
                    <button class="btn-ghost wide" onclick={exportWeave} disabled={chronicleItems.length === 0}>
                        Download .weave
                    </button>
                    <button class="btn-ghost wide" onclick={openReader}>
                        Read a .weave file
                    </button>
                    <span class="field-help">Snapshot this world, or read a saved chronicle from disk.</span>
                </div>

                <div class="field">
                    <span class="field-label">World premise</span>
                    <button class="btn-ghost wide" onclick={openNorthStar}>
                        {(codexData as any).north_star?.premise ? 'Edit North Star' : 'Set North Star'}
                    </button>
                    <span class="field-help">{(codexData as any).north_star?.premise ? 'Premise is set — Director, DM, and World Engine all honor it.' : 'Define the world\'s premise, tone, and opening hook so the AI has a coherent foundation.'}</span>
                </div>

                <button class="btn-primary wide" onclick={saveSettings}>Save</button>
            </div>
        </div>
    {/if}

    <!-- Phase 6: Host North Star modal -->
    {#if showNorthStar && isReady && characterSelected}
        <div class="modal-overlay" onclick={(e) => { if (e.target === e.currentTarget) showNorthStar = false; }}>
            <div class="north-star-modal panel">
                <div class="drawer-head">
                    <h2>North Star</h2>
                    <button class="icon-btn" onclick={() => showNorthStar = false} aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                    </button>
                </div>

                <p class="ns-intro">The foundational premise of this world. The Director, DM, and World Engine all read this — keep it short and load-bearing. Empty fields mean "improvise neutrally."</p>

                <div class="field">
                    <button class="btn-ghost wide" onclick={() => showSeedLibrary = !showSeedLibrary}>
                        {showSeedLibrary ? 'Hide seeds' : 'Pick from seed library'}
                    </button>
                    {#if showSeedLibrary}
                        <div class="seed-library">
                            {#each ADVENTURE_SEEDS as seed (seed.id)}
                                <button class="seed-card" onclick={() => applySeed(seed)}>
                                    <div class="seed-card-head">
                                        <span class="seed-card-title">{seed.title}</span>
                                        <span class="ns-tone-chip">{seed.tone}</span>
                                    </div>
                                    <p class="seed-card-premise">{seed.premise}</p>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>

                <label class="field">
                    <span class="field-label">Premise</span>
                    <textarea class="ns-textarea" bind:value={nsPremise} rows="4" placeholder="A borderland village on the edge of a forest that has started growing back overnight, swallowing farms that have stood for generations…"></textarea>
                    <span class="field-help">2-4 sentences. The central situation the party is walking into.</span>
                </label>

                <div class="field">
                    <span class="field-label">Tone</span>
                    <div class="share-policy-row">
                        {#each ['Heroic', 'Bright', 'Grim', 'Mythic', 'Picaresque'] as tone}
                            <button type="button" class="share-chip" class:selected={nsTone === tone} onclick={() => nsTone = nsTone === tone ? '' : tone}>{tone}</button>
                        {/each}
                    </div>
                    <span class="field-help">One word. Guides adjective choices and consequence severity.</span>
                </div>

                <label class="field">
                    <span class="field-label">Opening hook</span>
                    <input class="ns-input" type="text" bind:value={nsHook} placeholder="The party arrives as the third farm disappears in a single night." />
                    <span class="field-help">The situation already in motion when turn 1 begins. Do not rewind past this.</span>
                </label>

                <div class="ns-actions">
                    <button class="btn-ghost" onclick={clearNorthStar}>Clear</button>
                    <button class="btn-primary" onclick={saveNorthStar} disabled={!nsPremise.trim() && !nsTone.trim() && !nsHook.trim()}>Set Premise</button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Phase 9: .weave reader modal -->
    {#if showReader}
        <div class="modal-overlay" onclick={(e) => { if (e.target === e.currentTarget) showReader = false; }}>
            <div class="reader-modal panel">
                <div class="drawer-head">
                    <h2>.weave Reader</h2>
                    <button class="icon-btn" onclick={() => showReader = false} aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                    </button>
                </div>

                {#if !readerData}
                    <div class="reader-import">
                        <label class="btn-primary">
                            Choose .weave.json file
                            <input type="file" accept=".json,.weave,application/json" onchange={handleWeaveFile} hidden />
                        </label>
                        {#if readerError}
                            <p class="reader-error">{readerError}</p>
                        {:else}
                            <p class="reader-help">Pick an exported .weave file to read its chronicle and world state.</p>
                        {/if}
                    </div>
                {:else}
                    <div class="reader-content scrollable-parchment">
                        <header class="reader-header">
                            <h3 class="reader-title">Chronicle of {readerData.world?.room_id || '(unnamed world)'}</h3>
                            {#if readerData.world?.world_clock}
                                <p class="reader-meta">
                                    Day {readerData.world.world_clock.day || 1} · {readerData.world.world_clock.time_of_day || 'morning'} · Turn {readerData.world.world_clock.turn || 0}
                                </p>
                            {/if}
                            {#if readerData.world?.location}
                                <p class="reader-meta">{readerData.world.location}</p>
                            {/if}
                            {#if readerData.world?.scene_tags}
                                <p class="reader-meta">{[readerData.world.scene_tags.biome, readerData.world.scene_tags.weather, readerData.world.scene_tags.mood].filter(Boolean).join(' · ')}</p>
                            {/if}
                        </header>

                        {#if readerData.party && Object.keys(readerData.party).length > 0}
                            <section class="reader-section">
                                <h4>Party</h4>
                                <ul class="reader-list">
                                    {#each Object.entries(readerData.party) as [name, c]}
                                        <li><strong>{name}</strong>{(c as any).class_title ? ` · ${(c as any).class_title}` : ''}</li>
                                    {/each}
                                </ul>
                            </section>
                        {/if}

                        {#if readerData.npcs && Object.keys(readerData.npcs).length > 0}
                            <section class="reader-section">
                                <h4>NPCs</h4>
                                <ul class="reader-list">
                                    {#each Object.entries(readerData.npcs) as [name, npc]}
                                        <li><strong>{name}</strong>{(npc as any).role ? ` · ${(npc as any).role}` : ''}{(npc as any).notes ? ` — ${(npc as any).notes}` : ''}</li>
                                    {/each}
                                </ul>
                            </section>
                        {/if}

                        {#if readerData.factions && Object.keys(readerData.factions).length > 0}
                            <section class="reader-section">
                                <h4>Factions</h4>
                                <ul class="reader-list">
                                    {#each Object.entries(readerData.factions) as [name, fac]}
                                        <li><strong>{name}</strong>{(fac as any).type ? ` · ${(fac as any).type}` : ''}{(fac as any).agenda ? ` — ${(fac as any).agenda}` : ''}</li>
                                    {/each}
                                </ul>
                            </section>
                        {/if}

                        {#if readerData.threads && readerData.threads.length > 0}
                            <section class="reader-section">
                                <h4>Threads</h4>
                                <ul class="reader-list">
                                    {#each readerData.threads as t}
                                        <li><strong>{t.name}</strong> <em>({t.status})</em>{t.description ? ` — ${t.description}` : ''}</li>
                                    {/each}
                                </ul>
                            </section>
                        {/if}

                        <section class="reader-section">
                            <h4>Chronicle</h4>
                            <article class="reader-chronicle">
                                {#if readerData.prose}
                                    <pre class="reader-prose">{readerData.prose}</pre>
                                {:else if readerData.chronicle}
                                    {#each readerData.chronicle as entry}
                                        {#if entry.type === 'world'}
                                            <p class="reader-entry reader-world">◍ {entry.text}</p>
                                        {:else if entry.type === 'player'}
                                            <p class="reader-entry reader-player">▶ {entry.author}: {entry.text}</p>
                                        {:else}
                                            <p class="reader-entry reader-dm">{entry.text}</p>
                                        {/if}
                                    {/each}
                                {:else}
                                    <p class="reader-empty">No chronicle entries.</p>
                                {/if}
                            </article>
                        </section>
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    <!-- Chronicle (Session History) modal -->
    {#if showChronicle && isReady && characterSelected}
        <div transition:overlayTransition class="modal-overlay chronicle-overlay-container" role="button" tabindex="-1" onkeydown={(e) => { if (e.key === 'Escape') showChronicle = false; }} onclick={(e) => { if (e.target === e.currentTarget) showChronicle = false; }}>
            <div transition:chronicleTransition class="chronicle-book panel">
                <div class="book-header">
                    <div class="book-title-group">
                        <span class="emblem-mini">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                            </svg>
                        </span>
                        <h2>Chronicle of {roomId}</h2>
                    </div>
                    <button class="btn-ghost weave-export-btn" onclick={exportWeave} disabled={chronicleItems.length === 0} title="Download .weave file">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>
                        <span>.weave</span>
                    </button>
                    <button class="icon-btn close-book-btn" onclick={() => showChronicle = false} aria-label="Close Chronicle">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                    </button>
                </div>

                <div class="book-body scrollable-parchment">
                    {#if chronicleItems.length === 0}
                        <div class="chronicle-empty">
                            <p class="empty-text">No deeds have been recorded in this realm yet. Begin your actions to write the chronicle.</p>
                        </div>
                    {:else}
                        <div class="rounds-list">
                            {#each chronicleItems as item (item.id)}
                                {#if item.kind === 'round'}
                                    <article class="round-entry">
                                        <header class="round-header-row">
                                            <h3 class="round-number">Round {item.id}</h3>
                                            <div class="round-divider-line"></div>
                                        </header>

                                        <div class="round-actions">
                                            {#each item.actions as action}
                                                <div class="action-bubble-row">
                                                    <span class="action-author">{action.author}:</span>
                                                    <span class="action-text">“{action.text}”</span>
                                                </div>
                                            {/each}
                                        </div>

                                        {#if item.narration}
                                            <div class="round-narration">
                                                <p class="narration-text">{@html item.narration}</p>
                                                {#if item.audit && (item.audit.lint_retried || item.audit.critic_retried || item.audit.critic_passed === false)}
                                                    <div class="audit-marks" title="Pipeline telemetry — host-only quality signal.">
                                                        {#if item.audit.lint_retried}
                                                            <span class="audit-mark lint" title="Cheap prose lint failed once and retried before passing.">lint↻</span>
                                                        {/if}
                                                        {#if item.audit.critic_retried}
                                                            <span class="audit-mark critic-retry" title="LLM Critic flagged the prose; the DM rewrote it once.">critic↻</span>
                                                        {/if}
                                                        {#if item.audit.critic_passed === false}
                                                            <span class="audit-mark critic-fail" title="LLM Critic flagged this beat and the retry did not pass — narration may drift from the ruling.">critic✗</span>
                                                        {/if}
                                                    </div>
                                                {/if}
                                                {#if item.ruling}
                                                    <details class="ruling-details">
                                                        <summary class="ruling-summary">Director's ruling</summary>
                                                        <div class="ruling-body">
                                                            {#if item.ruling.verdict}
                                                                <p class="ruling-line"><span class="ruling-key">Verdict:</span> {item.ruling.verdict}</p>
                                                            {/if}
                                                            {#if item.ruling.verdicts}
                                                                <p class="ruling-line"><span class="ruling-key">Verdicts:</span> {item.ruling.verdicts}</p>
                                                            {/if}
                                                            {#if item.ruling.consequences && item.ruling.consequences.length}
                                                                <ul class="ruling-consequences">
                                                                    {#each item.ruling.consequences as c}
                                                                        <li>{c}</li>
                                                                    {/each}
                                                                </ul>
                                                            {/if}
                                                            {#if item.ruling.qte}
                                                                <p class="ruling-line ruling-flag">Triggered a quick-time event.</p>
                                                            {/if}
                                                            {#if item.ruling.codex_write_keys && item.ruling.codex_write_keys.length}
                                                                <p class="ruling-line"><span class="ruling-key">Codex writes:</span> {item.ruling.codex_write_keys.join(', ')}</p>
                                                            {/if}
                                                            {#if item.ruling.npc_change_keys && item.ruling.npc_change_keys.length}
                                                                <p class="ruling-line"><span class="ruling-key">NPC changes:</span> {item.ruling.npc_change_keys.join(', ')}</p>
                                                            {/if}
                                                            {#if item.ruling.new_npc_keys && item.ruling.new_npc_keys.length}
                                                                <p class="ruling-line"><span class="ruling-key">New NPCs:</span> {item.ruling.new_npc_keys.join(', ')}</p>
                                                            {/if}
                                                            {#if item.ruling.faction_change_keys && item.ruling.faction_change_keys.length}
                                                                <p class="ruling-line"><span class="ruling-key">Faction changes:</span> {item.ruling.faction_change_keys.join(', ')}</p>
                                                            {/if}
                                                            {#if item.ruling.thread_change_ids && item.ruling.thread_change_ids.length}
                                                                <p class="ruling-line"><span class="ruling-key">Thread changes:</span> {item.ruling.thread_change_ids.join(', ')}</p>
                                                            {/if}
                                                            {#if item.ruling.scene_tags_change}
                                                                <p class="ruling-line"><span class="ruling-key">Scene:</span> {JSON.stringify(item.ruling.scene_tags_change)}</p>
                                                            {/if}
                                                        </div>
                                                    </details>
                                                {/if}
                                            </div>
                                        {/if}
                                    </article>
                                {:else}
                                    <article class="world-entry">
                                        <span class="world-marker" aria-hidden="true">◍</span>
                                        <p class="world-text">{item.text}</p>
                                    </article>
                                {/if}
                            {/each}
                        </div>
                    {/if}
                </div>
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

    .share-policy-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .share-chip {
        background: var(--surface-2);
        border: 1px solid var(--line);
        color: var(--ink-soft);
        border-radius: var(--radius-pill);
        padding: 0.35rem 0.85rem;
        font-size: 0.78rem;
        font-weight: 500;
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s, background 0.15s;
    }
    .share-chip:hover { border-color: var(--accent); color: var(--accent); }
    .share-chip.selected {
        background: var(--accent-soft);
        border-color: var(--accent);
        color: var(--accent);
    }

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

    .forged-portrait { position: relative; width: 72px; height: 72px; flex-shrink: 0; }
    .forged-portrait img {
        width: 72px; height: 72px; object-fit: cover;
        border-radius: 14px;
        border: 1px solid var(--line-strong);
        background: var(--surface-3);
        display: block;
    }
    .forged-portrait .forged-icon { width: 72px; height: 72px; border-radius: 14px; }
    .portrait-reroll {
        position: absolute; bottom: -7px; right: -7px;
        width: 27px; height: 27px; padding: 0;
        border-radius: 50%;
        background: var(--surface); border: 1px solid var(--line-strong);
        color: var(--ink-soft);
        display: flex; align-items: center; justify-content: center;
        box-shadow: var(--shadow-sm);
    }
    .portrait-reroll svg { width: 14px; height: 14px; }
    .portrait-reroll:hover { color: var(--accent); border-color: var(--accent); transform: none; }

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

    /* Conversational forge */
    .forge-chat {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        max-height: 320px;
        overflow-y: auto;
        padding-right: 4px;
    }
    .forge-hint { font-size: 0.84rem; color: var(--muted); line-height: 1.5; }
    .forge-msg {
        max-width: 88%;
        padding: 0.6rem 0.85rem;
        border-radius: var(--radius);
        font-size: 0.86rem;
        line-height: 1.5;
        animation: rise 0.25s ease;
    }
    .forge-msg.user {
        align-self: flex-end;
        background: var(--accent);
        color: #fdf6ec;
        border-bottom-right-radius: 4px;
    }
    .forge-msg.model {
        align-self: flex-start;
        background: var(--surface-2);
        border: 1px solid var(--line);
        border-left: 3px solid var(--gold);
        color: var(--ink);
        font-family: var(--font-serif);
        border-top-left-radius: 4px;
    }
    .forge-msg.typing { display: flex; gap: 4px; align-items: center; }
    .forge-msg.typing .dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--muted);
        animation: bounce 1.4s infinite ease-in-out both;
    }
    .forge-msg.typing .dot:nth-child(1) { animation-delay: -0.32s; }
    .forge-msg.typing .dot:nth-child(2) { animation-delay: -0.16s; }

    /* World management */
    .new-world-btn { margin-top: 0.5rem; }
    .recent-worlds { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.6rem; }
    .world-chip {
        background: var(--surface-2);
        border: 1px solid var(--line);
        color: var(--ink-soft);
        border-radius: var(--radius-pill);
        padding: 0.3rem 0.7rem;
        font-size: 0.74rem;
        font-family: monospace;
    }
    .world-chip:hover { border-color: var(--accent); color: var(--accent); }
    .world-chip.current { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }

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
    .hero-avatar img { width: 44px; height: 44px; object-fit: cover; border-radius: 50%; display: block; }
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
        align-items: center;
        font-size: 0.76rem;
        font-weight: 500;
        color: var(--ink-soft);
    }
    .stat-label-row .val { font-weight: 700; font-variant-numeric: tabular-nums; }
    .stat-override {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
    }
    .stat-btn {
        font-family: var(--font);
        font-size: 0.66rem;
        font-weight: 600;
        padding: 0.1rem 0.4rem;
        line-height: 1.2;
        background: var(--surface);
        color: var(--ink);
        opacity: 0.6;
        border: 1px solid var(--line);
        border-radius: 4px;
        cursor: pointer;
        transition: opacity 0.15s ease, border-color 0.15s ease, background 0.15s ease;
        font-variant-numeric: tabular-nums;
    }
    .stat-btn:hover {
        opacity: 1;
        border-color: var(--accent);
        background: rgba(140, 47, 47, 0.06);
    }
    .stat-btn:active { transform: translateY(1px); }
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

    /* Phase 20: inline inventory quick-add form */
    .inv-add {
        display: flex;
        gap: 0.35rem;
        margin-top: 0.5rem;
    }
    .inv-add-input {
        flex: 1 1 auto;
        min-width: 0;
        font-family: var(--font);
        font-size: 0.78rem;
        padding: 0.35rem 0.55rem;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 5px;
        color: var(--ink);
    }
    .inv-add-input:focus {
        outline: none;
        border-color: var(--accent);
    }
    .inv-add-btn {
        flex-shrink: 0;
        width: 32px;
        font-family: var(--font);
        font-size: 1.05rem;
        font-weight: 600;
        line-height: 1;
        background: var(--surface);
        color: var(--ink);
        opacity: 0.7;
        border: 1px solid var(--line);
        border-radius: 5px;
        cursor: pointer;
        transition: opacity 0.15s ease, border-color 0.15s ease, background 0.15s ease;
    }
    .inv-add-btn:hover:not(:disabled) {
        opacity: 1;
        border-color: var(--accent);
        background: rgba(140, 47, 47, 0.06);
        color: var(--accent);
    }
    .inv-add-btn:disabled { cursor: not-allowed; opacity: 0.35; }

    .world-section { border-top: 1px solid var(--line); padding-top: 0.8rem; margin-top: 0.4rem; }
    .world-clock-chip {
        display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;
        font-size: 0.74rem; color: var(--ink-soft);
        background: rgba(140, 47, 47, 0.05);
        padding: 0.35rem 0.55rem; border-radius: var(--radius-pill);
        margin-bottom: 0.6rem;
        text-transform: capitalize;
    }
    .clock-day { font-weight: 600; color: var(--accent); }
    .clock-sep { opacity: 0.4; }
    .clock-turn { opacity: 0.7; font-variant-numeric: tabular-nums; }

    /* Phase 23: World Engine host controls — small, quiet row under the
       world-clock chip. Anyone at the table can use them; co-op tool. */
    .engine-controls {
        display: flex; gap: 0.35rem; flex-wrap: wrap;
        margin-bottom: 0.6rem;
    }
    .engine-btn {
        font-family: var(--font-sans);
        font-size: 0.66rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 0.3rem 0.55rem;
        border-radius: var(--radius-pill);
        border: 1px solid var(--line);
        background: var(--surface-2);
        color: var(--ink-soft);
        cursor: pointer;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .engine-btn:hover:not(:disabled) {
        background: var(--surface-3);
        color: var(--ink);
        border-color: var(--line-strong);
    }
    .engine-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .world-list { list-style: none; padding: 0; margin: 0.35rem 0 0.6rem; display: flex; flex-direction: column; gap: 0.3rem; }
    .world-item {
        display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.5rem;
        align-items: baseline; padding: 0.3rem 0.4rem;
        background: var(--surface-2); border-radius: var(--radius-sm);
        font-size: 0.8rem;
    }
    .world-name { font-weight: 600; color: var(--ink); }
    .world-sub { color: var(--ink-soft); font-size: 0.72rem; font-style: italic; }
    .world-meta { font-size: 0.72rem; color: var(--ink-soft); grid-column: 2; }
    .world-note { font-size: 0.74rem; color: var(--ink-soft); grid-column: 1 / -1; line-height: 1.4; }
    .thread-active .world-name { color: var(--accent); }
    .thread-landed .world-name { color: var(--hp); }
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

    /* Immersive moment stage — one beat at a time, no scrolling log */
    .moment-stage {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        pointer-events: auto;
        overflow: hidden;
        background: rgba(251, 248, 241, 0.86);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        min-width: 0;
    }
    .stage-body {
        flex-grow: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2.5rem 2rem;
        overflow-y: auto;
        text-align: center;
    }
    .beat-text {
        font-family: var(--font-serif);
        font-size: 1.4rem;
        line-height: 1.75;
        color: var(--ink);
        max-width: 62ch;
        text-wrap: balance;
        animation: beat-in 0.65s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes beat-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

    .beat.resolving { display: flex; flex-direction: column; align-items: center; gap: 1.2rem; }
    .your-move {
        font-family: var(--font-serif);
        font-size: 1.15rem;
        line-height: 1.6;
        color: var(--ink-soft);
        font-style: italic;
        max-width: 50ch;
    }
    .resolving-ind {
        display: flex; align-items: center; gap: 0.6rem;
        font-family: var(--font-serif);
        font-size: 1rem;
        color: var(--accent);
        letter-spacing: 0.3px;
    }
    .orb-pulse {
        width: 9px; height: 9px; border-radius: 50%;
        background: var(--accent);
        animation: orb 1.4s ease-in-out infinite;
    }
    @keyframes orb { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }

    .stage-action {
        border-top: 1px solid var(--line);
        padding: 0.9rem 1.1rem 1.05rem;
        background: var(--surface);
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .turn-cue {
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        color: var(--accent);
    }

    /* Phase 3: Situation Bar */
    .situation-bar {
        pointer-events: auto;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.4rem 1.1rem;
        padding: 0.55rem 0.95rem;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 12px;
        font-size: 0.78rem;
        line-height: 1.4;
        color: var(--ink);
        box-shadow: 0 1px 0 rgba(0,0,0,0.03);
    }
    .sit-segment {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        min-width: 0;
    }
    .sit-segment > svg { width: 14px; height: 14px; opacity: 0.6; flex-shrink: 0; }
    .sit-label {
        font-size: 0.62rem;
        font-weight: 700;
        letter-spacing: 0.7px;
        text-transform: uppercase;
        color: var(--accent);
        opacity: 0.75;
        flex-shrink: 0;
    }
    .sit-value { color: var(--ink); }
    .sit-sep { opacity: 0.3; }
    .sit-clock .sit-value { font-weight: 600; }

    .sit-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.12rem 0.5rem;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.04);
        border: 1px solid rgba(0, 0, 0, 0.06);
        font-size: 0.72rem;
        line-height: 1.2;
        max-width: 14rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .chip-name { font-weight: 600; }
    .chip-disp { opacity: 0.55; font-size: 0.66rem; }
    .chip-count {
        font-size: 0.62rem;
        font-weight: 700;
        opacity: 0.6;
        padding-left: 0.15rem;
        border-left: 1px solid rgba(0,0,0,0.1);
        margin-left: 0.1rem;
    }

    /* NPC disposition color coding */
    .npc-chip[data-disp*="friend"] { background: rgba(80, 130, 70, 0.12); border-color: rgba(80, 130, 70, 0.25); }
    .npc-chip[data-disp*="hostile"] { background: rgba(140, 47, 47, 0.12); border-color: rgba(140, 47, 47, 0.28); }
    .npc-chip[data-disp*="wary"] , .npc-chip[data-disp*="suspicious"], .npc-chip[data-disp*="cool"] {
        background: rgba(160, 110, 40, 0.12); border-color: rgba(160, 110, 40, 0.22);
    }
    .npc-chip[data-disp*="neutral"] { background: rgba(0,0,0,0.04); }

    .thread-chip { background: rgba(0,0,0,0.04); }
    .thread-active {
        background: rgba(140, 47, 47, 0.10);
        border-color: rgba(140, 47, 47, 0.22);
    }
    .thread-imminent {
        background: rgba(180, 60, 40, 0.18);
        border-color: rgba(180, 60, 40, 0.4);
        animation: threadPulse 2.4s ease-in-out infinite;
    }
    @keyframes threadPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(180, 60, 40, 0); }
        50% { box-shadow: 0 0 0 3px rgba(180, 60, 40, 0.12); }
    }

    .action-brief {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.4rem 0.7rem;
        background: rgba(0, 0, 0, 0.025);
        border-left: 2px solid var(--accent);
        border-radius: 4px;
        font-size: 0.78rem;
        line-height: 1.35;
        color: var(--ink);
        opacity: 0.85;
    }
    .action-brief svg { width: 13px; height: 13px; opacity: 0.55; flex-shrink: 0; }
    .action-brief span {
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
    }

    .action-row { display: flex; gap: 0.6rem; }

    /* Phase 11: action-templates palette — small chips above the input */
    .action-templates {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
        margin-bottom: 0.4rem;
    }

    /* Phase 18: Hm... hint chip — soft nudge for the cold-start moment */
    .hint-row {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        margin-bottom: 0.4rem;
        flex-wrap: wrap;
        font-size: 0.76rem;
    }
    .hint-chip {
        font-family: var(--font);
        font-size: 0.72rem;
        font-style: italic;
        padding: 0.22rem 0.6rem;
        background: transparent;
        color: var(--ink);
        opacity: 0.55;
        border: 1px dashed var(--line);
        border-radius: 999px;
        cursor: pointer;
        transition: opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }
    .hint-chip:hover {
        opacity: 0.9;
        border-style: solid;
        border-color: var(--accent);
        color: var(--accent);
    }
    .hint-text {
        flex: 1 1 auto;
        line-height: 1.4;
        color: var(--ink);
        opacity: 0.75;
        font-style: italic;
        min-width: 0;
    }
    .hint-apply {
        font-family: var(--font);
        font-size: 0.68rem;
        padding: 0.2rem 0.5rem;
        background: var(--surface);
        color: var(--ink);
        opacity: 0.7;
        border: 1px solid var(--line);
        border-radius: 4px;
        cursor: pointer;
        flex-shrink: 0;
        transition: opacity 0.15s ease, border-color 0.15s ease;
    }
    .hint-apply:hover {
        opacity: 1;
        border-color: var(--accent);
        color: var(--accent);
    }

    /* Phase 14: table roster popover */
    .roster-wrap { position: relative; }
    .status-orb {
        cursor: pointer;
        font-family: var(--font);
        transition: opacity 0.15s ease;
    }
    .status-orb:hover { opacity: 0.85; }
    .roster-pop {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        min-width: 200px;
        max-width: 260px;
        padding: 0.6rem 0.75rem;
        z-index: 50;
        background: var(--surface);
        box-shadow: 0 6px 22px rgba(0,0,0,0.12);
        animation: fade-in 0.15s ease-out;
    }
    .roster-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.4rem;
    }
    .roster-head h4 {
        margin: 0;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.7px;
        text-transform: uppercase;
        opacity: 0.6;
    }
    .roster-count {
        font-size: 0.7rem;
        font-weight: 600;
        opacity: 0.55;
    }
    .roster-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
    }
    .roster-name {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.82rem;
        padding: 0.25rem 0.3rem;
        border-radius: 4px;
    }
    .roster-name.is-self { background: rgba(140,47,47,0.06); }
    .roster-dot {
        width: 6px; height: 6px;
        background: #4a7d6c;
        border-radius: 50%;
        flex-shrink: 0;
    }
    .roster-self-tag {
        margin-left: auto;
        font-size: 0.62rem;
        padding: 0.05rem 0.35rem;
        background: var(--accent);
        color: #fff;
        border-radius: 3px;
        font-weight: 600;
        letter-spacing: 0.4px;
        text-transform: uppercase;
    }
    .roster-empty {
        margin: 0;
        padding: 0.3rem 0;
        font-size: 0.78rem;
        opacity: 0.55;
        font-style: italic;
    }
    .vitals-chip {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        margin: 0.3rem 0 0.5rem;
        flex-wrap: wrap;
    }
    .vital {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        font-size: 0.72rem;
        color: var(--ink);
        opacity: 0.85;
    }
    .vital-icon { width: 12px; text-align: center; opacity: 0.7; line-height: 1; }
    .vital-bar {
        width: 54px;
        height: 5px;
        background: rgba(0,0,0,0.08);
        border-radius: 3px;
        overflow: hidden;
    }
    .vital-fill {
        height: 100%;
        transition: width 0.4s ease;
        border-radius: 3px;
    }
    .vital-hp .vital-fill { background: #b03a3a; }
    .vital-resolve .vital-fill { background: #4a7d6c; }
    .vital-corruption .vital-fill { background: #6b4a8a; }
    .vital-num { font-weight: 600; min-width: 1.4rem; text-align: right; opacity: 0.9; }
    .vital-scars {
        font-size: 0.68rem;
        padding: 0.1rem 0.4rem;
        background: rgba(107, 74, 138, 0.15);
        color: #6b4a8a;
        border-radius: 999px;
        font-weight: 600;
        letter-spacing: 0.3px;
    }
    .action-template-chip {
        font-family: var(--font);
        font-size: 0.74rem;
        font-weight: 500;
        padding: 0.25rem 0.55rem;
        background: var(--surface);
        color: var(--ink);
        opacity: 0.7;
        border: 1px solid var(--line);
        border-radius: 999px;
        cursor: pointer;
        transition: opacity 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
    }
    .action-template-chip:hover {
        opacity: 1;
        border-color: var(--accent);
        transform: translateY(-1px);
    }
    .action-template-chip:active { transform: translateY(0); }
    .npc-templates { margin-bottom: 0.2rem; }
    .npc-chip {
        background: rgba(140, 47, 47, 0.06);
        border-color: rgba(140, 47, 47, 0.2);
        color: var(--accent);
        opacity: 0.85;
    }
    .npc-chip:hover {
        background: rgba(140, 47, 47, 0.12);
        border-color: var(--accent);
        opacity: 1;
    }
    .action-field { flex: 1; font-size: 1rem; }

    /* Phase 4: Scene portrait backdrop */
    .scene-portrait-layer {
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        opacity: 0;
        animation: portraitFade 1.6s ease-out forwards;
    }
    .scene-portrait-layer img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: saturate(0.85) brightness(0.92);
    }
    .scene-portrait-veil {
        position: absolute;
        inset: 0;
        background:
            radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 75%, rgba(0,0,0,0.55) 100%),
            linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 100%);
    }
    @keyframes portraitFade {
        from { opacity: 0; }
        to { opacity: 0.85; }
    }
    .scene-portrait-loading {
        position: absolute;
        bottom: 1rem;
        right: 1rem;
        z-index: 2;
        opacity: 0.5;
        pointer-events: none;
    }

    /* Phase 4: Settings toggle row */
    .toggle-row {
        display: grid;
        grid-template-columns: auto 1fr;
        grid-template-rows: auto auto;
        gap: 0.15rem 0.7rem;
        align-items: center;
        cursor: pointer;
    }
    .toggle-row input[type="checkbox"] {
        width: 16px; height: 16px;
        accent-color: var(--accent);
        margin: 0;
    }
    .toggle-label {
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--ink);
    }
    .toggle-row .field-help {
        grid-column: 2 / 3;
        font-size: 0.72rem;
        opacity: 0.65;
        line-height: 1.35;
    }

    /* Phase 5: Chronicle modal export button */
    .weave-export-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.35rem 0.7rem;
        font-size: 0.78rem;
    }
    .weave-export-btn svg { width: 14px; height: 14px; }
    .weave-export-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Phase 6: North Star modal */
    .north-star-modal {
        width: min(540px, 92vw);
        max-height: 86vh;
        overflow-y: auto;
        padding: 1.4rem 1.5rem 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .ns-intro {
        font-size: 0.82rem;
        line-height: 1.45;
        opacity: 0.75;
        margin: 0;
        padding: 0.7rem 0.85rem;
        background: rgba(0,0,0,0.03);
        border-left: 2px solid var(--accent);
        border-radius: 4px;
    }
    .ns-textarea {
        width: 100%;
        font-family: var(--font);
        font-size: 0.92rem;
        line-height: 1.5;
        padding: 0.6rem 0.7rem;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 6px;
        resize: vertical;
        color: var(--ink);
    }
    .ns-input {
        width: 100%;
        font-family: var(--font);
        font-size: 0.9rem;
        padding: 0.5rem 0.7rem;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 6px;
        color: var(--ink);
    }
    .ns-actions {
        display: flex;
        gap: 0.6rem;
        justify-content: flex-end;
        margin-top: 0.3rem;
    }

    /* Phase 7: Adventure seed library */
    .seed-library {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.6rem;
        margin-top: 0.5rem;
    }
    @media (max-width: 540px) {
        .seed-library { grid-template-columns: 1fr; }
    }
    .seed-card {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.7rem 0.8rem;
        text-align: left;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 8px;
        cursor: pointer;
        font-family: var(--font);
        transition: border-color 0.15s ease, transform 0.1s ease;
    }
    .seed-card:hover { border-color: var(--accent); transform: translateY(-1px); }
    .seed-card-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
    }
    .seed-card-title {
        font-size: 0.88rem;
        font-weight: 700;
        color: var(--ink);
    }
    .seed-card-premise {
        font-size: 0.76rem;
        line-height: 1.4;
        margin: 0;
        opacity: 0.75;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    /* Phase 9: .weave reader modal */
    .reader-modal {
        width: min(720px, 92vw);
        max-height: 86vh;
        overflow-y: auto;
        padding: 1.4rem 1.5rem 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .reader-import {
        padding: 0.8rem 0.9rem;
        background: rgba(0,0,0,0.03);
        border: 1px dashed var(--line);
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        align-items: flex-start;
    }
    .reader-error {
        font-size: 0.78rem;
        color: var(--accent);
        margin: 0;
    }
    .reader-help {
        font-size: 0.78rem;
        opacity: 0.65;
        margin: 0;
        line-height: 1.4;
    }
    .reader-content {
        display: flex;
        flex-direction: column;
        gap: 1.1rem;
    }
    .reader-header {
        border-bottom: 1px solid var(--line);
        padding-bottom: 0.7rem;
    }
    .reader-title {
        margin: 0 0 0.4rem;
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--ink);
    }
    .reader-meta {
        font-size: 0.78rem;
        line-height: 1.5;
        opacity: 0.75;
        margin: 0.15rem 0;
    }
    .reader-section h4 {
        margin: 0 0 0.4rem;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.7px;
        text-transform: uppercase;
        opacity: 0.6;
    }
    .reader-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .reader-list li {
        font-size: 0.82rem;
        line-height: 1.45;
        padding: 0.3rem 0.5rem;
        background: rgba(0,0,0,0.02);
        border-left: 2px solid var(--line);
        border-radius: 3px;
    }
    .reader-chronicle {
        margin-top: 0.3rem;
        padding: 0.7rem 0.85rem;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .reader-prose {
        margin: 0;
        font-family: var(--font);
        font-size: 0.88rem;
        line-height: 1.6;
        color: var(--ink);
        white-space: pre-wrap;
    }
    .reader-entry {
        margin: 0;
        font-size: 0.85rem;
        line-height: 1.55;
        padding: 0.25rem 0;
    }
    .reader-world { color: var(--accent); opacity: 0.85; font-style: italic; }
    .reader-player { color: var(--ink); }
    .reader-dm { color: var(--ink); opacity: 0.9; border-left: 2px solid var(--accent); padding-left: 0.6rem; }
    .reader-empty {
        font-size: 0.82rem;
        opacity: 0.55;
        font-style: italic;
        margin: 0;
    }

    /* Phase 8: NPC portrait thumbnails in codex sidebar */
    .world-list.npc-list .world-item {
        display: grid;
        grid-template-columns: 36px 1fr;
        gap: 0.5rem;
        align-items: start;
    }
    .world-item-text {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;
    }
    .npc-portrait {
        width: 36px;
        height: 36px;
        border-radius: 4px;
        object-fit: cover;
        border: 1px solid var(--line);
        background: rgba(0,0,0,0.05);
    }

    /* Codex sidebar North Star display */
    .north-star-display {
        padding: 0.55rem 0.7rem;
        margin-bottom: 0.5rem;
        background: rgba(140, 47, 47, 0.05);
        border-left: 2px solid var(--accent);
        border-radius: 4px;
    }
    .ns-tone-chip {
        display: inline-block;
        padding: 0.1rem 0.45rem;
        background: var(--accent);
        color: #fff;
        font-size: 0.6rem;
        font-weight: 700;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        border-radius: 3px;
        margin-bottom: 0.35rem;
    }
    .ns-premise-text {
        font-size: 0.78rem;
        line-height: 1.4;
        color: var(--ink);
        margin: 0;
        font-style: italic;
        opacity: 0.85;
    }
    .act-go {
        width: 52px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        padding: 0;
    }
    .act-go svg { width: 20px; height: 20px; }

    /* Phase 10: whisper-toggle — soft-corner button next to the action send */
    .whisper-toggle {
        width: 44px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        padding: 0;
        background: var(--surface);
        color: var(--ink);
        opacity: 0.55;
        border: 1px solid var(--line);
        border-radius: 8px;
        cursor: pointer;
        transition: opacity 0.15s ease, border-color 0.15s ease, background 0.15s ease;
    }
    .whisper-toggle:hover:not(:disabled) { opacity: 0.85; }
    .whisper-toggle.active {
        opacity: 1;
        background: rgba(140, 47, 47, 0.1);
        border-color: var(--accent);
        color: var(--accent);
    }
    .whisper-toggle:disabled { cursor: not-allowed; opacity: 0.35; }
    .whisper-toggle svg { width: 20px; height: 20px; }

    @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

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
        .stage-body { padding: 1.6rem 1.2rem; }
        .beat-text { font-size: 1.2rem; line-height: 1.7; }
        .your-move { font-size: 1.05rem; }
        .wizard-card { padding: 1.6rem; }
        .game-title { font-size: 2.1rem; }
    }

    /* Chronicle Book Layout */
    .chronicle-overlay-container {
        background: rgba(28, 22, 17, 0.48);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        padding: 2rem;
        z-index: 120;
    }

    .chronicle-book {
        width: 100%;
        max-width: 920px;
        height: 85vh;
        height: 85dvh;
        background: #fdfaf2;
        border: 4px double var(--line-strong);
        border-radius: 12px;
        box-shadow: var(--shadow-lg), 0 35px 80px rgba(32, 26, 21, 0.5);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
        pointer-events: auto;
    }

    /* Custom shadow to simulate book binding line down the center on desktop */
    @media (min-width: 769px) {
        .chronicle-book::before {
            content: '';
            position: absolute;
            top: 0; bottom: 0; left: 50%;
            width: 30px;
            transform: translateX(-50%);
            background: linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(20,15,10,0.04) 40%, rgba(20,15,10,0.08) 50%, rgba(20,15,10,0.04) 60%, rgba(0,0,0,0) 100%);
            pointer-events: none;
            z-index: 5;
        }
    }

    .book-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.4rem 2rem;
        border-bottom: 1px solid var(--line);
        background: var(--surface-2);
    }

    .book-title-group {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .book-title-group h2 {
        font-family: var(--font-serif);
        font-size: 1.25rem;
        color: var(--accent);
        letter-spacing: 0.5px;
    }

    .emblem-mini svg {
        width: 20px;
        height: 20px;
        color: var(--accent);
    }

    .scrollable-parchment {
        flex-grow: 1;
        overflow-y: auto;
        padding: 2.5rem 3rem;
        background: #fdfaf2;
    }

    /* Custom parchment scrollbar */
    .scrollable-parchment::-webkit-scrollbar {
        width: 8px;
    }
    .scrollable-parchment::-webkit-scrollbar-track {
        background: rgba(233, 224, 207, 0.3);
    }
    .scrollable-parchment::-webkit-scrollbar-thumb {
        background: var(--line-strong);
        border-radius: 4px;
    }
    .scrollable-parchment::-webkit-scrollbar-thumb:hover {
        background: var(--accent);
    }

    .chronicle-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        text-align: center;
        padding: 4rem 2rem;
    }

    .chronicle-empty .empty-text {
        font-family: var(--font-serif);
        font-size: 1.1rem;
        font-style: italic;
        color: var(--muted);
        max-width: 440px;
        line-height: 1.6;
    }

    .rounds-list {
        display: flex;
        flex-direction: column;
        gap: 3.5rem;
        max-width: 840px;
        margin: 0 auto;
    }

    /* Double page layout simulation on desktop */
    @media (min-width: 769px) {
        .rounds-list {
            display: grid;
            grid-template-columns: 1fr 1fr;
            column-gap: 5rem;
            row-gap: 4rem;
        }
        .round-entry {
            break-inside: avoid;
        }
    }

    .round-entry {
        display: flex;
        flex-direction: column;
        gap: 1.1rem;
        animation: book-fade-in 0.4s ease-out;
    }
    @keyframes book-fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

    .round-header-row {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .round-number {
        font-family: var(--font-serif);
        font-size: 1.2rem;
        color: var(--accent);
        font-weight: 700;
        white-space: nowrap;
        letter-spacing: 0.5px;
    }

    .round-divider-line {
        flex-grow: 1;
        height: 1px;
        background: linear-gradient(to right, var(--line-strong), rgba(210, 195, 175, 0));
    }

    .round-actions {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        padding-left: 0.5rem;
    }

    .action-bubble-row {
        font-size: 0.88rem;
        line-height: 1.45;
        color: var(--ink);
    }

    .action-author {
        font-weight: 700;
        color: var(--accent);
        margin-right: 0.3rem;
        text-transform: uppercase;
        font-size: 0.76rem;
        letter-spacing: 0.4px;
    }

    .action-text {
        font-style: italic;
        opacity: 0.9;
    }

    .round-narration {
        background: rgba(247, 241, 227, 0.45);
        border-left: 2px solid var(--line-strong);
        padding: 0.9rem 1.1rem;
        border-radius: 4px;
    }

    .narration-text {
        font-family: var(--font-serif);
        font-size: 0.92rem;
        line-height: 1.6;
        color: var(--ink);
        text-align: justify;
    }

    /* Phase 22: pipeline audit marks — small, host-only quality signals
       shown on retried or critic-flagged beats. Quiet by design. */
    .audit-marks {
        display: flex;
        gap: 0.4rem;
        margin-top: 0.55rem;
        flex-wrap: wrap;
    }
    .audit-mark {
        font-size: 0.62rem;
        font-family: var(--font-sans);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 0.12rem 0.45rem;
        border-radius: 999px;
        border: 1px solid var(--line);
        color: var(--ink-soft);
        background: rgba(255, 255, 255, 0.55);
        cursor: help;
    }
    .audit-mark.lint {
        color: #8a6a1a;
        border-color: rgba(138, 106, 26, 0.4);
        background: rgba(232, 200, 110, 0.18);
    }
    .audit-mark.critic-retry {
        color: #6a4a8a;
        border-color: rgba(106, 74, 138, 0.4);
        background: rgba(186, 160, 220, 0.18);
    }
    .audit-mark.critic-fail {
        color: #8a2a2a;
        border-color: rgba(138, 42, 42, 0.4);
        background: rgba(220, 160, 160, 0.18);
    }

    /* Phase 27: Director ruling transparency — collapsible under narration. */
    .ruling-details {
        margin-top: 0.6rem;
        font-family: var(--font-sans);
        font-size: 0.76rem;
        border-top: 1px dashed var(--line);
        padding-top: 0.45rem;
        color: var(--ink-soft);
    }
    .ruling-summary {
        cursor: pointer;
        font-weight: 600;
        color: var(--accent);
        letter-spacing: 0.03em;
        text-transform: uppercase;
        font-size: 0.66rem;
        outline: none;
        user-select: none;
    }
    .ruling-summary::-webkit-details-marker { color: var(--accent); }
    .ruling-body {
        margin-top: 0.45rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .ruling-line { margin: 0; line-height: 1.5; }
    .ruling-key {
        font-weight: 600;
        color: var(--ink);
        letter-spacing: 0.02em;
    }
    .ruling-flag {
        font-style: italic;
        color: #8a4a1a;
    }
    .ruling-consequences {
        margin: 0;
        padding-left: 1.1rem;
        line-height: 1.55;
    }
    .ruling-consequences li { font-size: 0.74rem; }

    .world-entry {
        display: flex;
        gap: 0.6rem;
        align-items: flex-start;
        padding: 0.55rem 0.9rem;
        margin: 0.35rem 0;
        background: rgba(140, 47, 47, 0.04);
        border-left: 1px dashed var(--line);
        border-radius: 3px;
    }
    .world-marker {
        color: var(--accent);
        opacity: 0.55;
        font-size: 0.9rem;
        line-height: 1.4;
        flex-shrink: 0;
    }
    .world-text {
        font-family: var(--font-serif);
        font-style: italic;
        font-size: 0.82rem;
        line-height: 1.55;
        color: var(--ink-soft);
        margin: 0;
    }

    .narration-text::first-letter {
        font-size: 2.2rem;
        font-weight: 700;
        float: left;
        margin-top: 0.15rem;
        margin-right: 0.45rem;
        line-height: 0.85;
        color: var(--accent);
        font-family: var(--font-serif);
    }

    /* Active state for Chronicle button */
    .chronicle-btn.active {
        color: var(--accent);
        background: var(--surface-3);
    }

    /* Phase 25: Connection banner — top-center, non-blocking, quiet. */
    .conn-banner {
        position: fixed;
        top: 0.8rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 90;
        display: flex;
        align-items: center;
        gap: 0.55rem;
        padding: 0.5rem 0.9rem;
        background: rgba(28, 22, 17, 0.88);
        color: #f5ecda;
        font-family: var(--font-sans);
        font-size: 0.78rem;
        border-radius: var(--radius-pill);
        box-shadow: 0 8px 24px rgba(0,0,0,0.18);
        max-width: 92vw;
        animation: connSlide 0.32s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes connSlide {
        from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    .conn-pulse {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: #d29a3a;
        box-shadow: 0 0 0 0 rgba(210, 154, 58, 0.6);
        animation: connPulse 1.4s infinite;
        flex-shrink: 0;
    }
    @keyframes connPulse {
        0% { box-shadow: 0 0 0 0 rgba(210, 154, 58, 0.55); }
        70% { box-shadow: 0 0 0 7px rgba(210, 154, 58, 0); }
        100% { box-shadow: 0 0 0 0 rgba(210, 154, 58, 0); }
    }
    .conn-text { line-height: 1.35; }

    @media (max-width: 540px) {
        .conn-banner { font-size: 0.72rem; padding: 0.45rem 0.7rem; top: 0.5rem; }
    }

    /* ============ Phase 24: Mobile responsive audit ============
       Phone-class refinements (≤540px). The 768px block handles the
       basic drawer + hide-center transformation; this block fixes the
       pieces that still cramped or broke at phone width. */
    @media (max-width: 540px) {
        /* Header: collapse brand subtitle, tighten icon gaps. */
        .hud-header { padding: 0.55rem 0.7rem; gap: 0.4rem; }
        .hud-left, .hud-right { gap: 0.35rem; }
        .brand .version { display: none; }
        .brand h1 { font-size: 0.85rem; letter-spacing: 0.02em; }
        .icon-btn { width: 32px; height: 32px; padding: 0; }

        /* Status orb — just the dot, no count text on the smallest screens. */
        .status-orb { padding: 0.32rem; }
        .roster-pop {
            right: 0.4rem;
            min-width: 180px;
        }

        /* Layout-grid tighter gutters so the stage gets more room. */
        .layout-grid { padding: 0.5rem; gap: 0.5rem; }

        /* Situation bar — allow wrap, slightly smaller text. */
        .situation-bar {
            padding: 0.45rem 0.55rem;
            font-size: 0.7rem;
            flex-wrap: wrap;
            gap: 0.3rem 0.5rem;
        }
        .sit-segment { flex-basis: auto; }
        .sit-segment > svg { width: 12px; height: 12px; }

        /* Codex drawer is near-fullscreen on phone. */
        .codex-sidebar.mobile-visible {
            width: 88vw;
            max-width: 320px;
        }
        .codex-sidebar { width: 88vw; max-width: 320px; }

        /* Stage body: smaller padding, smaller beat text, but still readable. */
        .stage-body { padding: 1rem 0.9rem; }
        .beat-text { font-size: 1.05rem; line-height: 1.6; }
        .your-move { font-size: 0.95rem; }

        /* Action templates and NPC chips: horizontal scroll, no wrap. */
        .action-templates, .action-templates.npc-templates {
            flex-wrap: nowrap;
            overflow-x: auto;
            scrollbar-width: thin;
            scrollbar-color: var(--line) transparent;
            padding-bottom: 0.25rem;
            margin-bottom: 0.35rem;
            -webkit-overflow-scrolling: touch;
        }
        .action-template-chip { flex-shrink: 0; }

        /* Action row: keep input dominant, square icon buttons. */
        .action-row { gap: 0.4rem; }
        .action-field { font-size: 0.95rem; padding: 0.6rem 0.7rem; }
        .whisper-toggle, .act-go {
            width: 38px; height: 38px;
            padding: 0;
            flex-shrink: 0;
            display: inline-flex; align-items: center; justify-content: center;
        }

        /* Stat override rows — keep them on one line. */
        .stat-override { gap: 0.3rem; }
        .stat-btn { padding: 0.25rem 0.45rem; font-size: 0.7rem; }
        .stat-label-row { font-size: 0.74rem; }

        /* Inventory grid: 3 cols on phone instead of 6. */
        .inventory-grid { grid-template-columns: repeat(3, 1fr); }

        /* Engine controls: smaller text, full-width row. */
        .engine-btn { font-size: 0.6rem; padding: 0.25rem 0.45rem; }

        /* Chronicle book: near-fullscreen, smaller padding. */
        .chronicle-overlay-container { padding: 0.5rem; }
        .chronicle-book {
            height: 94vh;
            height: 94dvh;
            border-width: 2px;
            border-radius: 8px;
        }
        .book-header { padding: 0.7rem 0.9rem; }
        .book-title { font-size: 1rem; }
        .book-body { padding: 0.9rem 0.8rem; }
        .round-number { font-size: 0.85rem; }
        .narration-text { font-size: 0.88rem; }
        .narration-text::first-letter { font-size: 1.7rem; margin-right: 0.3rem; }

        /* Wizard cards: vertical tighter. */
        .wizard-card { padding: 1.2rem; gap: 1rem; }
        .game-title { font-size: 1.7rem; }
        .emblem { width: 64px; height: 64px; }
        .emblem svg { width: 40px; height: 40px; }

        /* Settings drawer: full-width sheet from bottom-ish. */
        .settings-drawer { max-width: 100%; }

        /* Vital chip — trim the suffix on phone. */
        .vital-chip { font-size: 0.66rem; padding: 0.22rem 0.4rem; gap: 0.2rem; }
        .vital-bars { gap: 0.18rem; }

        /* Roster popover: anchor properly under the orb. */
        .roster-pop { right: 0; left: auto; }
    }

    /* Very-small phones (≤380px): one more squeeze pass. */
    @media (max-width: 380px) {
        .brand h1 { font-size: 0.78rem; }
        .icon-btn { width: 30px; height: 30px; }
        .situation-bar { font-size: 0.66rem; }
        .beat-text { font-size: 0.98rem; }
        .action-field { font-size: 0.9rem; padding: 0.55rem 0.6rem; }
        .whisper-toggle, .act-go { width: 34px; height: 34px; }
    }
</style>
