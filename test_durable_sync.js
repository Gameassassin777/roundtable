import * as Y from 'yjs';
import WebSocket from 'ws';

const room = 'test-suite-' + Math.random().toString(36).slice(2, 8);
const wsUrl = `wss://roundtable-signaling.gameassassin777.workers.dev?room=${room}`;

console.log(`Starting multi-client sync test on room: ${room}`);
console.log(`Connecting to signaling server at: ${wsUrl}`);

function uint8ArrayToBase64(uint8) {
    let binary = '';
    const len = uint8.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8[i]);
    }
    return btoa(binary);
}

function base64ToUint8Array(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// Client helper
class TestClient {
    constructor(name, room) {
        this.name = name;
        this.ydoc = new Y.Doc();
        this.ws = null;
        this.activePeers = [];
        this.synced = false;
        
        // Listen to local changes
        this.ydoc.on('update', (update, origin) => {
            if (origin !== 'server' && this.ws && this.ws.readyState === WebSocket.OPEN) {
                const base64Update = uint8ArrayToBase64(update);
                this.ws.send(JSON.stringify({ type: 'update', update: base64Update }));
            }
        });
    }

    connect() {
        return new Promise((resolve) => {
            this.ws = new WebSocket(wsUrl);

            this.ws.on('open', () => {
                console.log(`[${this.name}] WebSocket connected.`);
                // Send sync-client handshake
                const localState = Y.encodeStateAsUpdate(this.ydoc);
                this.ws.send(JSON.stringify({ type: 'sync-client', update: uint8ArrayToBase64(localState) }));
                // Send presence
                this.ws.send(JSON.stringify({ type: 'presence-update', name: this.name }));
            });

            this.ws.on('message', (dataStr) => {
                try {
                    const data = JSON.parse(dataStr);
                    if (data.type === 'sync-init' || data.type === 'update') {
                        const updateBytes = base64ToUint8Array(data.update);
                        this.ydoc.transact(() => {
                            Y.applyUpdate(this.ydoc, updateBytes, 'server');
                        }, 'server');
                        
                        if (data.type === 'sync-init') {
                            this.synced = true;
                            resolve();
                        }
                    } else if (data.type === 'presence-list') {
                        this.activePeers = data.players;
                        console.log(`[${this.name}] Updated presence:`, this.activePeers);
                    }
                } catch (e) {
                    console.error(`[${this.name}] Error parsing message:`, e);
                }
            });
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

async function runTest() {
    // 1. Create client A (Kaelen)
    const clientA = new TestClient('Kaelen', room);
    
    // We expect the server to seed the defaults since the room is empty
    await clientA.connect();
    
    const codexA = clientA.ydoc.getMap('memoryCodex');
    console.log('\n--- Verify Default Seeding on Server ---');
    console.log('Location:', codexA.get('location'));
    console.log('Plot Summary:', codexA.get('plot_summary'));
    
    if (codexA.get('location') !== 'The Black Crypt') {
        console.error('FAIL: Default location was not seeded by the server!');
        process.exit(1);
    }
    console.log('PASS: Default location seeded successfully.');

    // 2. Connect client B (Silas)
    console.log('\n--- Connecting Client B ---');
    const clientB = new TestClient('Silas', room);
    await clientB.connect();

    // Verify client B received the location and plot summary
    const codexB = clientB.ydoc.getMap('memoryCodex');
    console.log('Client B Location:', codexB.get('location'));
    
    if (codexB.get('location') !== 'The Black Crypt') {
        console.error('FAIL: Client B did not sync the location!');
        process.exit(1);
    }
    console.log('PASS: Client B synchronized document state successfully.');

    // 3. Simulating custom character settings and turn updates
    console.log('\n--- Simulating Character Joins & Sync ---');
    clientA.ydoc.transact(() => {
        const party = codexA.get('party') || {};
        party['Kaelen'] = { hp: 18, max_hp: 18, class_title: 'Carrion Knight' };
        codexA.set('party', party);
    });

    // Wait a brief moment for update to propagate
    await new Promise(r => setTimeout(r, 1000));
    
    console.log('Client B Party Data for Kaelen:', JSON.stringify(codexB.get('party')?.Kaelen));
    if (codexB.get('party')?.Kaelen?.class_title !== 'Carrion Knight') {
        console.error('FAIL: Client B did not sync Kaelen\'s character sheet!');
        process.exit(1);
    }
    console.log('PASS: Character data successfully synchronized in real time.');

    // 4. Simulate a Game Turn
    console.log('\n--- Simulating Game Turn Action Batching ---');
    const pendingA = clientA.ydoc.getArray('pendingActions');
    const pendingB = clientB.ydoc.getArray('pendingActions');

    // Kaelen acts
    clientA.ydoc.transact(() => {
        pendingA.push([{ text: 'I scout the corridor', author: 'Kaelen' }]);
    });
    // Silas acts
    clientB.ydoc.transact(() => {
        pendingB.push([{ text: 'I light a torch', author: 'Silas' }]);
    });

    await new Promise(r => setTimeout(r, 1000));

    console.log('Client A sees pending actions:', JSON.stringify(pendingA.toArray()));
    console.log('Client B sees pending actions:', JSON.stringify(pendingB.toArray()));

    if (pendingA.length !== 2) {
        console.error('FAIL: Actions were not batched/synced across clients!');
        process.exit(1);
    }
    console.log('PASS: Simultaneous action inputs from separate clients batched successfully.');

    // 5. Test Offline Persistence & Handshake Sync
    console.log('\n--- Simulating Reconnection / Handshake Sync ---');
    
    // Client B disconnects, edits character sheet offline, then reconnects
    clientB.disconnect();
    console.log('Client B disconnected.');

    clientB.ydoc.transact(() => {
        const party = codexB.get('party') || {};
        party['Silas'] = { hp: 12, max_hp: 12, class_title: 'Plague Doctor' };
        codexB.set('party', party);
    });
    console.log('Client B updated sheet offline.');

    // Reconnect client B
    console.log('Client B reconnecting...');
    await clientB.connect();
    
    // Wait for merge
    await new Promise(r => setTimeout(r, 1000));

    console.log('Client A Party Data for Silas:', JSON.stringify(codexA.get('party')?.Silas));
    if (codexA.get('party')?.Silas?.class_title !== 'Plague Doctor') {
        console.error('FAIL: Reconnected Client B did not sync its offline updates to the server!');
        process.exit(1);
    }
    console.log('PASS: Offline changes successfully synchronized during reconnect handshake.');

    // Clean up
    clientA.disconnect();
    clientB.disconnect();
    console.log('\nALL TESTS PASSED SUCCESSFULLY!');
}

runTest().catch(e => {
    console.error('Test run failed with error:', e);
    process.exit(1);
});
