import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { writable } from 'svelte/store';

export function createGameState(roomId: string) {
    const ydoc = new Y.Doc();
    const provider = new WebrtcProvider(`round-table-${roomId}`, ydoc, {
        signaling: ['wss://signaling.yjs.dev']
    });

    const yChatLog = ydoc.getArray('chatLog');
    const chatStore = writable([]);
    yChatLog.observe(() => chatStore.set(yChatLog.toArray()));

    const yPendingActions = ydoc.getArray('pendingActions');
    const actionLock = ydoc.getMap('actionLock');
    const yKeyHealth = ydoc.getMap('keyHealth');

    // Initialize Memory Codex if new
    if (!ydoc.getMap('memoryCodex').has('location')) {
        const yCodex = ydoc.getMap('memoryCodex');
        ydoc.transact(() => {
            yCodex.set('location', "The Black Crypt");
            yCodex.set('plot_summary', "The party seeks the Ashen Crown.");
            yCodex.set('scene_tags', { biome: "crypt", weather: "none", mood: "oppressive" });
            yCodex.set('party', {
                "Fighter": { hp: 15, max_hp: 15, resolve: 0, corruption: 0, active_traits: [], permanent_conditions: [], echo_tags: [] }
            });
            yCodex.set('inventory', { "Rusty Sword": { durability: 3 } });
        });
    }

    function addChatEntry(entry: { author: string, text: string, type: 'player' | 'dm' }) {
        ydoc.transact(() => { yChatLog.push([entry]); });
    }

    function reportKeyExhausted(clientId: number) { yKeyHealth.set(clientId.toString(), 'exhausted'); }
    function reportKeyHealthy(clientId: number) { yKeyHealth.set(clientId.toString(), 'healthy'); }

    return { chatStore, addChatEntry, ydoc, provider, yPendingActions, actionLock, reportKeyExhausted, reportKeyHealthy };
}