import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { writable } from 'svelte/store';

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

    // Phase 37: World Engine countdown — ticks every second locally; the
    // server broadcasts the canonical next-tick timestamp via engine-status.
    // 180s default so the UI shows something before the first server message.
    const engineCountdown = writable<{ next_tick_at: number | null, paused: boolean }>({
        next_tick_at: null,
        paused: false
    });

    // Server-event store — UI subscribes to this for turn-start / turn-result /
    // turn-error / action-accepted / key-usage messages (AI pipeline status).
    const serverEvents = writable<{ type: string, [k: string]: any } | null>(null);

    // Pending key registration — held until the socket is open, then flushed.
    // Set by registerKey() before the WS is connected; consumed in ws.onopen.
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

            // Handshake step 1: Upload current local state to merge with server
            const localState = Y.encodeStateAsUpdate(ydoc);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'sync-client', update: uint8ArrayToBase64(localState) }));
            }

            // Handshake step 2: Send local presence update immediately upon connection
            const myName = localStorage.getItem('rt_char_name') || 'Wanderer';
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'presence-update', name: myName }));
            }

            // Handshake step 3: Re-register API key on every reconnect (server
            // drops the key when the socket closes). pendingKeyReg is set by
            // registerKey() and persisted across WS reconnects.
            if (pendingKeyReg && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'register-key', ...pendingKeyReg }));
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'sync-init' || data.type === 'update') {
                    const updateBytes = base64ToUint8Array(data.update);
                    // Apply update with origin 'server' so we don't echo it back
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
                    data.type === 'engine-status'
                ) {
                    serverEvents.set(data);
                    // Phase 37: mirror engine-status into the countdown store
                    // so the UI can render a live ticker independent of the
                    // event-stream subscription.
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

    // Listen to local Yjs updates and send them to the server
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

    // Seeding defaults is handled server-side to prevent client-side default racing.
    persistence.whenSynced.then(() => {
        console.log('Local IndexedDB sync completed for room:', roomId);
    });

    function addChatEntry(entry: { author: string, text: string, type: 'player' | 'dm' }) {
        ydoc.transact(() => { yChatLog.push([entry]); });
    }

    function reportKeyExhausted(clientId: number) { yKeyHealth.set(clientId.toString(), 'exhausted'); }
    function reportKeyHealthy(clientId: number) { yKeyHealth.set(clientId.toString(), 'healthy'); }

    // Server-side AI path: send an action to the Worker. The Worker batches,
    // calls Gemini with a pooled key, and writes the DM beat to Yjs (which
    // arrives here as a sync update). UI clears the input on action-accepted.
    // Phase 10: whisper=true routes the action to the whisper track so the
    // resulting narration lands only on this client.
    function sendAction(text: string, author: string, whisper: boolean = false) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return false;
        ws.send(JSON.stringify({ type: 'submit-action', text, author, whisper }));
        return true;
    }

    // Register an API key with the Worker's pool. Held until WS is open and
    // re-sent on every reconnect (server drops keys when sockets close).
    // sharePolicy: 'table' (default, pooled round-robin) | 'solo' (own calls only) | 'host'.
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

    // Phase 23: World Engine host controls. Server applies pause/resume
    // immediately and broadcasts engine-status so all clients reflect state.
    // tick-now forces an LLM-backed World Engine pass; step-time advances the
    // world clock one bucket without spending a key cycle.
    function engineControl(action: 'pause' | 'resume' | 'tick-now' | 'step-time') {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'engine-control', action }));
        }
    }

    function destroy() {
        try { provider.destroy(); } catch { /* noop */ }
        try { persistence.destroy(); } catch { /* noop */ }
    }

    return {
        chatStore, addChatEntry, ydoc, provider, persistence,
        providerStore,
        engineCountdown,
        awareness,
        yPendingActions, actionLock,
        serverEvents,
        sendAction, registerKey, requestKeyUsage, engineControl,
        reportKeyExhausted, reportKeyHealthy, destroy
    };
}
