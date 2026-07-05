export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // WebSockets upgrade request
    if (request.headers.get("Upgrade") === "websocket") {
      // Route connection based on "room" search parameter or URL path segment
      const room = url.searchParams.get("room") || "default";
      const id = env.SIGNALING_ROOM.idFromName(room);
      const roomObject = env.SIGNALING_ROOM.get(id);
      return roomObject.fetch(request);
    }
    
    return new Response("Yjs WebRTC Signaling Server. Connect via WebSockets.", {
      headers: { "Content-Type": "text/plain" }
    });
  }
};

export class SignalingRoom {
  constructor(state, env) {
    this.state = state;
    this.sessions = [];
  }

  async fetch(request) {
    const [client, server] = new WebSocketPair();
    await this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async handleSession(ws) {
    ws.accept();
    const session = { ws, topics: new Set() };
    this.sessions.push(session);

    ws.addEventListener("message", async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === "subscribe") {
          for (const topic of data.topics || []) {
            session.topics.add(topic);
          }
        } else if (data.type === "unsubscribe") {
          for (const topic of data.topics || []) {
            session.topics.delete(topic);
          }
        } else if (data.type === "publish") {
          const topic = data.topic;
          // Broadcast message to all other sessions joined in the same room/topic
          for (const s of this.sessions) {
            if (s.ws !== ws && s.topics.has(topic)) {
              s.ws.send(msg.data);
            }
          }
        } else if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch (e) {
        console.error("Signaling Socket Error:", e);
      }
    });

    const removeSession = () => {
      this.sessions = this.sessions.filter((s) => s.ws !== ws);
    };

    ws.addEventListener("close", removeSession);
    ws.addEventListener("error", removeSession);
  }
}
