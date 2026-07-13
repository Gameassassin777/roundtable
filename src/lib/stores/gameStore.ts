import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { writable } from 'svelte/store';
import * as sfx from '../audio/sfx';

export type CodexSlice = {
    location: string;
    plot_summary: string;
    scene_tags: { biome: string; weather: string; mood: string };
    party: Record<string, any>;
    inventory: Record<string, any>;
    world_clock: { turn: number; day: number; time_of_day: string };
    npcs: Record<string, any>;
    factions: Record<string, any>;
    threads: any[];
    locations: Record<string, any>;
    north_star: any;
    active_qte?: any;
};

export type ForgedCharacter = {
    name: string;
    hp: number;
    max_hp?: number;
    resolve: number;
    corruption: number;
    traits: { name: string; desc?: string }[];
    class_title: string;
    archetype: string;
    backstory: string;
    portrait?: string;
    portrait_url?: string;
    seed?: number;
    starting_item?: { name: string; note?: string };
};

export type QteConfig = {
    time_limit_ms: number;
    start_time: number;
};

const DEFAULT_CODEX: CodexSlice = {
    location: "a quiet crossroads at the edge of an unfinished map",
    plot_summary: "",
    scene_tags: { biome: "crossroads", weather: "clear", mood: "unsettled" },
    party: {},
    inventory: {},
    world_clock: { turn: 0, day: 1, time_of_day: "morning" },
    npcs: {},
    factions: {},
    threads: [],
    locations: {},
    north_star: null
};

export function createGameState(roomId: string) {
    const ydoc = new Y.Doc();
    const room = `round-table-${roomId}`;

    // Offline-first local persistence: instant resume on reload, and the world survives
    // even the last peer leaving (it lives in every device's IndexedDB).
    const persistence = new IndexeddbPersistence(room, ydoc);

    // Allow local dev to point at a Worker on localhost (set rt_worker_host in localStorage)
    const workerHost = (typeof localStorage !== 'undefined' && localStorage.getItem('rt_worker_host'))
        || 'roundtable-signaling.gameassassin777.workers.dev';
    const wsUrl = `wss://${workerHost}?room=${roomId}`;
    let ws: WebSocket | null = null;
    const providerStore = writable({ status: 'connecting', peersCount: 0 });

    const engineCountdown = writable<{ next_tick_at: number | null, paused: boolean }>({
        next_tick_at: null,
        paused: false
    });

    const serverEvents = writable<{ type: string, [k: string]: any } | null>(null);

    let pendingKeyReg: { key: string, label: string, sharePolicy: string } | null = null;

    const awareness = {
        _states: new Map(),
        _listeners: [] as any[],
        setLocalStateField(key: string, val: any) {
            if (key === 'user' && val?.name) {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'presence-update', name: val.name }));
                }
            }
        },
        on(event: string, callback: any) {
            this._listeners.push(callback);
        },
        getStates() {
            return this._states;
        },
        trigger() {
            this._listeners.forEach(cb => {
                try { cb(); } catch { /* noop */ }
            });
        }
    };

    function uint8ArrayToBase64(uint8: Uint8Array) {
        let binary = '';
        const len = uint8.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8[i]);
        }
        return btoa(binary);
    }

    function base64ToUint8Array(base64: string) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    function connectWs() {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to server-hosted world:', roomId);
            providerStore.set({ status: 'connected', peersCount: 0 });

            const localState = Y.encodeStateAsUpdate(ydoc);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'sync-client', update: uint8ArrayToBase64(localState) }));
            }

            const myName = localStorage.getItem('rt_char_name') || 'Wanderer';
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'presence-update', name: myName }));
            }

            if (pendingKeyReg && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'register-key', ...pendingKeyReg }));
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'sync-init' || data.type === 'update') {
                    const updateBytes = base64ToUint8Array(data.update);
                    ydoc.transact(() => {
                        Y.applyUpdate(ydoc, updateBytes, 'server');
                    }, 'server');
                } else if (data.type === 'presence-list') {
                    awareness._states.clear();
                    data.players.forEach((p: string, idx: number) => {
                        awareness._states.set(idx, { user: { name: p } });
                    });
                    providerStore.set({ status: 'connected', peersCount: Math.max(0, data.players.length - 1) });
                    awareness.trigger();
                } else if (
                    data.type === 'turn-start' ||
                    data.type === 'turn-result' ||
                    data.type === 'turn-error' ||
                    data.type === 'turn-stage' ||
                    data.type === 'action-accepted' ||
                    data.type === 'key-usage' ||
                    data.type === 'whisper-result' ||
                    data.type === 'whisper-error' ||
                    data.type === 'whisper-status' ||
                    data.type === 'world-beat' ||
                    data.type === 'engine-status'
                ) {
                    serverEvents.set(data);
                    if (data.type === 'engine-status') {
                        engineCountdown.set({
                            next_tick_at: data.next_tick_at ?? null,
                            paused: !!data.paused
                        });
                    }
                }
            } catch (e) {
                console.error('Error handling WebSocket message:', e);
            }
        };

        ws.onclose = () => {
            console.log('World connection closed. Reconnecting...');
            providerStore.set({ status: 'disconnected', peersCount: 0 });
            setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
            if (ws) ws.close();
        };
    }

    ydoc.on('update', (update, origin) => {
        if (origin !== 'server' && ws && ws.readyState === WebSocket.OPEN) {
            const base64Update = uint8ArrayToBase64(update);
            ws.send(JSON.stringify({ type: 'update', update: base64Update }));
        }
    });

    connectWs();

    const provider = {
        awareness,
        destroy() {
            if (ws) {
                ws.onclose = null;
                ws.close();
            }
        }
    };

    const yChatLog = ydoc.getArray('chatLog');
    const chatStore = writable<any[]>([]);
    yChatLog.observe(() => chatStore.set(yChatLog.toArray()));

    const yPendingActions = ydoc.getArray('pendingActions');
    const actionLock = ydoc.getMap('actionLock');
    const yKeyHealth = ydoc.getMap('keyHealth');

    persistence.whenSynced.then(() => {
        console.log('Local IndexedDB sync completed for room:', roomId);
    });

    function addChatEntry(entry: { author: string, text: string, type: 'player' | 'dm' | 'world' | 'whisper' }) {
        ydoc.transact(() => { yChatLog.push([entry]); });
    }

    function reportKeyExhausted(clientId: number) { yKeyHealth.set(clientId.toString(), 'exhausted'); }
    function reportKeyHealthy(clientId: number) { yKeyHealth.set(clientId.toString(), 'healthy'); }

    function sendAction(text: string, author: string, whisper: boolean = false) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return false;
        ws.send(JSON.stringify({ type: 'submit-action', text, author, whisper }));
        return true;
    }

    function registerKey(key: string, label: string, sharePolicy: 'table' | 'solo' | 'host' = 'table') {
        if (!key) return;
        pendingKeyReg = { key, label, sharePolicy };
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'register-key', key, label, sharePolicy }));
        }
    }

    function requestKeyUsage() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'get-key-usage' }));
        }
    }

    function engineControl(action: 'pause' | 'resume' | 'tick-now' | 'step-time') {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'engine-control', action }));
        }
    }

    function triggerGenesis() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'trigger-genesis' }));
        }
    }

    // ---------- Codex binding ----------
    // Lifted verbatim from the old +page.svelte bindCodex (lines 783-822).
    // Three load-bearing pieces — preserving all of them:
    //   1. codexData update on every Yjs tick
    //   2. Self-heal: re-register local character if sync drops them
    //   3. Synced QTE trigger (fires on every peer aligned to shared start_time)
    const yCodex = ydoc.getMap('memoryCodex');
    const codex = writable<CodexSlice>({ ...DEFAULT_CODEX });
    const qte = writable<QteConfig | null>(null);
    let lastQteId: string | null = null;
    let currentCharacter: { forged: ForgedCharacter, name: string } | null = null;

    function registerCurrentCharacter() {
        if (!currentCharacter) return;
        const { forged, name } = currentCharacter;
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
            const party: Record<string, any> = yCodex.get('party') as Record<string, any> || {};
            if (!party[name]) { party[name] = charData; yCodex.set('party', party); }
            const inventory: Record<string, any> = yCodex.get('inventory') as Record<string, any> || {};
            if (forged.starting_item?.name && !inventory[forged.starting_item.name]) {
                inventory[forged.starting_item.name] = { durability: 3, note: forged.starting_item.note || '' };
                yCodex.set('inventory', inventory);
            }
        });
    }

    function setCurrentCharacter(forged: ForgedCharacter, name: string) {
        currentCharacter = { forged, name };
    }

    yCodex.observe(() => {
        const raw = yCodex.toJSON();
        if (!raw) return;
        const next: CodexSlice = {
            location: raw.location || DEFAULT_CODEX.location,
            plot_summary: raw.plot_summary || "",
            scene_tags: raw.scene_tags || DEFAULT_CODEX.scene_tags,
            party: raw.party || {},
            inventory: raw.inventory || {},
            world_clock: raw.world_clock || DEFAULT_CODEX.world_clock,
            npcs: raw.npcs || {},
            factions: raw.factions || {},
            threads: raw.threads || [],
            locations: raw.locations || {},
            north_star: raw.north_star || null
        };
        if (raw.active_qte) next.active_qte = raw.active_qte;
        codex.set(next);

        // Self-heal: re-register local character if a sync merge dropped them.
        if (currentCharacter && !(next.party as Record<string, any>)[currentCharacter.name]) {
            registerCurrentCharacter();
        }

        // Synced QTE — fires on EVERY peer, aligned to a shared future start_time.
        const q = raw.active_qte;
        if (q && q.id && q.id !== lastQteId && (q.start_time || 0) > Date.now() - 500) {
            lastQteId = q.id;
            qte.set({ time_limit_ms: q.time_limit_ms || 1000, start_time: q.start_time });
            sfx.play('qte-start');
        }
    });

    function destroy() {
        try { provider.destroy(); } catch { /* noop */ }
        try { persistence.destroy(); } catch { /* noop */ }
    }

    return {
        // Yjs + provider
        ydoc, provider, persistence, providerStore,
        // Chat + actions
        chatStore, addChatEntry,
        yPendingActions, actionLock,
        // Codex
        codex, setCurrentCharacter, registerCurrentCharacter,
        // QTE
        qte,
        // Engine
        engineCountdown, engineControl,
        // Genesis
        triggerGenesis,
        // Server events
        serverEvents,
        awareness,
        // Keys
        sendAction, registerKey, requestKeyUsage,
        reportKeyExhausted, reportKeyHealthy,
        destroy
    };
}

export type GameState = ReturnType<typeof createGameState>;
