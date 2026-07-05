import * as Y from 'yjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // WebSockets upgrade request
    if (request.headers.get("Upgrade") === "websocket") {
      // Route connection based on "room" search parameter
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
    
    // Load persisted Yjs state asynchronously before routing websocket messages
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get("yDocState");
      if (stored) {
        Y.applyUpdate(this.yDoc, stored);
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

    // Immediately send the current master document state to the connecting client
    const currentDocState = Y.encodeStateAsUpdate(this.yDoc);
    ws.send(JSON.stringify({
      type: "sync-init",
      update: uint8ArrayToBase64(currentDocState)
    }));
    
    sendPresence();

    ws.addEventListener("message", async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === "update") {
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
