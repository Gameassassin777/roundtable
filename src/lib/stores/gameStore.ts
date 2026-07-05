import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { IndexeddbPersistence } from 'y-indexeddb';
import { writable } from 'svelte/store';

export function createGameState(roomId: string) {
    const ydoc = new Y.Doc();
    const room = `round-table-${roomId}`;

    // Offline-first local persistence: instant resume on reload, and the world survives
    // even the last peer leaving (it lives in every device's IndexedDB).
    const persistence = new IndexeddbPersistence(room, ydoc);

    // Peer-to-peer real-time sync over WebRTC. The signaling worker only introduces peers;
    // no game data ever touches a server.
    const provider = new WebrtcProvider(room, ydoc, {
        signaling: ['wss://roundtable-signaling.gameassassin777.workers.dev']
    });

    const yChatLog = ydoc.getArray('chatLog');
    const chatStore = writable<any[]>([]);
    yChatLog.observe(() => chatStore.set(yChatLog.toArray()));

    const yPendingActions = ydoc.getArray('pendingActions');
    const actionLock = ydoc.getMap('actionLock');
    const yKeyHealth = ydoc.getMap('keyHealth');

    // Seed the Memory Codex only AFTER local + peer state has loaded, and only per missing
    // key — so we never overwrite a resumed or freshly-synced world with defaults.
    persistence.whenSynced.then(() => {
        const yCodex = ydoc.getMap('memoryCodex');
        ydoc.transact(() => {
            if (!yCodex.has('location')) yCodex.set('location', 'The Black Crypt');
            if (!yCodex.has('plot_summary')) yCodex.set('plot_summary', 'The party seeks the Ashen Crown.');
            if (!yCodex.has('scene_tags')) yCodex.set('scene_tags', { biome: 'crypt', weather: 'none', mood: 'oppressive' });
            if (!yCodex.has('party')) yCodex.set('party', {});
            if (!yCodex.has('inventory')) yCodex.set('inventory', {});
        });
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
        awareness: provider.awareness,
        yPendingActions, actionLock,
        reportKeyExhausted, reportKeyHealthy, destroy
    };
}
