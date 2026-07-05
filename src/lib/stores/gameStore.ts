import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { writable } from 'svelte/store';

export function createGameState(roomId: string) {
    const ydoc = new Y.Doc();
    const room = `round-table-${roomId}`;

    // Offline-first local persistence: instant resume on reload, and the world survives
    // even the last peer leaving (it lives in every device's IndexedDB).
    const persistence = new IndexeddbPersistence(room, ydoc);

    // Custom WebSocket provider to sync document state and presence with the server
    const wsUrl = `wss://roundtable-signaling.gameassassin777.workers.dev?room=${roomId}`;
    let ws: WebSocket | null = null;
    const providerStore = writable({ status: 'connecting', peersCount: 0 });

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

    function destroy() {
        try { provider.destroy(); } catch { /* noop */ }
        try { persistence.destroy(); } catch { /* noop */ }
    }

    return {
        chatStore, addChatEntry, ydoc, provider, persistence,
        awareness,
        yPendingActions, actionLock,
        reportKeyExhausted, reportKeyHealthy, destroy
    };
}
