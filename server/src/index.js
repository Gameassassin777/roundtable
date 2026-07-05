import * as Y from 'yjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // WebSockets upgrade request
    if (request.headers.get("Upgrade") === "websocket") {
      const room = url.searchParams.get("room") || "default";
      const id = env.SIGNALING_ROOM.idFromName(room);
      const roomObject = env.SIGNALING_ROOM.get(id);
      return roomObject.fetch(request);
    }
    
    return new Response("Round Table Yjs Sync Server. Connect via WebSockets.", {
      headers: { "Content-Type": "text/plain" }
    });
  }
};

export class SignalingRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = [];
    
    // Initialize Y.Doc for this room
    this.yDoc = new Y.Doc();
    
    // Load persisted Yjs state asynchronously and seed default world structure if empty
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get("yDocState");
      if (stored) {
        Y.applyUpdate(this.yDoc, stored);
      } else {
        // Seed default structure for a new world on the server
        const yCodex = this.yDoc.getMap('memoryCodex');
        this.yDoc.transact(() => {
          yCodex.set('location', 'The Black Crypt');
          yCodex.set('plot_summary', 'The party seeks the Ashen Crown.');
          yCodex.set('scene_tags', { biome: 'crypt', weather: 'none', mood: 'oppressive' });
          yCodex.set('party', {});
          yCodex.set('inventory', {});
        });
        // Save initial seeded state
        const seeded = Y.encodeStateAsUpdate(this.yDoc);
        await this.state.storage.put("yDocState", seeded);
      }
    });
  }

  async fetch(request) {
    const [client, server] = new WebSocketPair();
    await this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async handleSession(ws) {
    ws.accept();
    const session = { ws, name: "Wanderer" };
    this.sessions.push(session);

    // Helpers to encode/decode Base64 in standard JS environments
    const uint8ArrayToBase64 = (uint8) => {
      let binary = '';
      const len = uint8.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      return btoa(binary);
    };

    const base64ToUint8Array = (base64) => {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    };

    const broadcast = (msg) => {
      const msgStr = JSON.stringify(msg);
      for (const s of this.sessions) {
        try {
          s.ws.send(msgStr);
        } catch {
          // ignore dead sockets
        }
      }
    };

    const sendPresence = () => {
      const players = this.sessions.map(s => s.name);
      broadcast({ type: "presence-list", players });
    };

    sendPresence();

    ws.addEventListener("message", async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === "sync-client") {
          const updateBytes = base64ToUint8Array(data.update);
          // Apply client update to master document
          Y.applyUpdate(this.yDoc, updateBytes);
          
          // Persist the merged document state to DO persistent store
          const newStoredBytes = Y.encodeStateAsUpdate(this.yDoc);
          await this.state.storage.put("yDocState", newStoredBytes);
          
          // Respond to the connecting client with the master synced state
          ws.send(JSON.stringify({
            type: "sync-init",
            update: uint8ArrayToBase64(newStoredBytes)
          }));
          
          // Broadcast client's new changes to all other connected sessions
          for (const s of this.sessions) {
            if (s.ws !== ws) {
              try {
                s.ws.send(JSON.stringify({ type: "update", update: data.update }));
              } catch {
                // ignore
              }
            }
          }
        } else if (data.type === "update") {
          const updateBytes = base64ToUint8Array(data.update);
          // Apply update to the server document
          Y.applyUpdate(this.yDoc, updateBytes);
          
          // Persist the updated state to Durable Object storage
          const newStoredBytes = Y.encodeStateAsUpdate(this.yDoc);
          await this.state.storage.put("yDocState", newStoredBytes);
          
          // Broadcast the update to all other connected sessions
          for (const s of this.sessions) {
            if (s.ws !== ws) {
              try {
                s.ws.send(msg.data);
              } catch {
                // ignore dead sockets
              }
            }
          }
        } else if (data.type === "presence-update") {
          session.name = data.name || "Wanderer";
          sendPresence();
        }
      } catch (e) {
        console.error("Socket Error:", e);
      }
    });

    const removeSession = () => {
      this.sessions = this.sessions.filter((s) => s.ws !== ws);
      sendPresence();
    };

    ws.addEventListener("close", removeSession);
    ws.addEventListener("error", removeSession);
  }
}
