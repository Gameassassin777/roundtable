import * as Y from 'yjs';
import { callGemini, extractText, parseJsonLoose, KeyPool, SYSTEM_PROMPT } from './lib/ai.js';
import { buildBatchPrompt, buildRequestBody } from './lib/promptBuilder.js';

// ---------------------------------------------------------------------------
// Worker entrypoint: route WebSocket upgrades to the per-world Durable Object.
// World ID = ?room=<id> query param. Each world = one DO instance, persisted.
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      const room = url.searchParams.get("room") || "default";
      const id = env.SIGNALING_ROOM.idFromName(room);
      const roomObject = env.SIGNALING_ROOM.get(id);
      return roomObject.fetch(request);
    }

    // Simple health endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response("Round Table sync + AI server. Connect via WebSocket.", {
        headers: { "Content-Type": "text/plain" }
      });
    }

    return new Response("Not found", { status: 404 });
  }
};

// ---------------------------------------------------------------------------
// Per-world Durable Object. Holds the Yjs doc, the API key pool, and the
// AI pipeline. One SignalingRoom per world id.
// ---------------------------------------------------------------------------
export class SignalingRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = [];   // { ws, name, keyValue }
    this.keyPool = new KeyPool();
    this.yDoc = new Y.Doc();
    this.alarmScheduled = false;
    this.batchWindow = null;     // timer id for the 5s action-flush window
    this.batchTimeoutMs = 5000;
    this.turnInFlight = false;
    this.pendingActions = [];

    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get("yDocState");
      if (stored) {
        Y.applyUpdate(this.yDoc, stored);
      } else {
        this.seedDefaultWorld();
        const seeded = Y.encodeStateAsUpdate(this.yDoc);
        await this.state.storage.put("yDocState", seeded);
      }
      // Persist doc on every remote update (debounced via update handler)
      this.yDoc.on('update', async (update, origin) => {
        // Only persist updates that came from clients (not local echoes)
        if (origin !== 'local') {
          const bytes = Y.encodeStateAsUpdate(this.yDoc);
          await this.state.storage.put("yDocState", bytes);
        }
      });
    });
  }

  // Neutral default world. No hardcoded grimdark — tone seed is open so the
  // Soul Forge and the DM find their own register from the player's concept.
  seedDefaultWorld() {
    const yCodex = this.yDoc.getMap('memoryCodex');
    this.yDoc.transact(() => {
      yCodex.set('location', 'a quiet crossroads at the edge of an unfinished map');
      yCodex.set('plot_summary', 'The party has just arrived, each looking for something different.');
      yCodex.set('scene_tags', { biome: 'crossroads', weather: 'clear', mood: 'unsettled' });
      yCodex.set('party', {});
      yCodex.set('inventory', {});
    });
  }

  async fetch(request) {
    const [client, server] = new WebSocketPair();
    await this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    // Phase 0: scaffold only. Phase 2 will run the World Engine here.
    // Reschedule so the alarm stays armed once World Engine lands.
    await this.state.storage.setAlarm(Date.now() + 60_000);
  }

  // -------------------------------------------------------------------------
  // WebSocket session lifecycle
  // -------------------------------------------------------------------------
  async handleSession(ws) {
    ws.accept();
    const session = { ws, name: 'Wanderer', keyValue: null };
    this.sessions.push(session);

    const uint8ToB64 = (uint8) => {
      let binary = '';
      const len = uint8.byteLength;
      for (let i = 0; i < len; i++) binary += String.fromCharCode(uint8[i]);
      return btoa(binary);
    };
    const b64ToUint8 = (b64) => {
      const s = atob(b64);
      const bytes = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
      return bytes;
    };

    const broadcast = (msg) => {
      const s = JSON.stringify(msg);
      for (const sess of this.sessions) {
        try { sess.ws.send(s); } catch { /* dead socket */ }
      }
    };

    const sendPresence = () => {
      const players = this.sessions.map(s => s.name);
      broadcast({ type: "presence-list", players });
    };

    sendPresence();

    ws.addEventListener("message", async (event) => {
      try {
        const data = JSON.parse(event.data);

        // ----- Yjs sync (unchanged from prior server) ---------------------
        if (data.type === "sync-client") {
          const updateBytes = b64ToUint8(data.update);
          Y.applyUpdate(this.yDoc, updateBytes);
          const merged = Y.encodeStateAsUpdate(this.yDoc);
          await this.state.storage.put("yDocState", merged);
          ws.send(JSON.stringify({
            type: "sync-init",
            update: uint8ToB64(merged)
          }));
          for (const s of this.sessions) {
            if (s.ws !== ws) {
              try { s.ws.send(JSON.stringify({ type: "update", update: data.update })); } catch {}
            }
          }
          return;
        }

        if (data.type === "update") {
          const updateBytes = b64ToUint8(data.update);
          Y.applyUpdate(this.yDoc, updateBytes);
          const merged = Y.encodeStateAsUpdate(this.yDoc);
          await this.state.storage.put("yDocState", merged);
          for (const s of this.sessions) {
            if (s.ws !== ws) {
              try { s.ws.send(event.data); } catch {}
            }
          }
          return;
        }

        if (data.type === "presence-update") {
          session.name = data.name || "Wanderer";
          sendPresence();
          return;
        }

        // ----- Key pool registration --------------------------------------
        if (data.type === "register-key") {
          // data: { key, label, sharePolicy: 'solo'|'table'|'host' }
          if (data.key && typeof data.key === 'string') {
            session.keyValue = data.key;
            // Solo-policy keys are not pooled; only used if explicitly requested
            // (Phase 0 treats all contributed keys as pool-eligible; the client
            // sends 'solo' only when the user opted out, in which case we skip.)
            if (data.sharePolicy !== 'solo') {
              this.keyPool.register(data.key, data.label || session.name, data.sharePolicy || 'table');
            }
          }
          return;
        }

        if (data.type === "unregister-key") {
          if (session.keyValue) {
            this.keyPool.remove(session.keyValue);
            session.keyValue = null;
          }
          return;
        }

        if (data.type === "get-key-usage") {
          ws.send(JSON.stringify({ type: "key-usage", usage: this.keyPool.usage() }));
          return;
        }

        // ----- Action submission (the new server-side AI path) ------------
        if (data.type === "submit-action") {
          // data: { text, author }
          if (!data.text || typeof data.text !== 'string') return;
          const action = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            author: data.author || session.name || 'Wanderer',
            text: data.text.slice(0, 1000)  // hard cap
          };
          this.pendingActions = this.pendingActions || [];
          this.pendingActions.push(action);

          // Acknowledge to the sender so the UI can clear the input
          ws.send(JSON.stringify({ type: "action-accepted", id: action.id }));

          // First action in the window starts the 5s timer; subsequent
          // actions join the batch. After the timer fires, run one turn.
          if (!this.batchWindow) {
            this.batchWindow = setTimeout(() => {
              this.batchWindow = null;
              this.flushBatch().catch(err => {
                console.error('flushBatch error:', err);
                this.turnInFlight = false;
              });
            }, this.batchTimeoutMs);
          }
          return;
        }
      } catch (e) {
        console.error("Socket message error:", e);
      }
    });

    const removeSession = () => {
      this.sessions = this.sessions.filter((s) => s.ws !== ws);
      if (session.keyValue) this.keyPool.remove(session.keyValue);
      sendPresence();
    };
    ws.addEventListener("close", removeSession);
    ws.addEventListener("error", removeSession);
  }

  // -------------------------------------------------------------------------
  // Turn pipeline (Phase 0: single AI call. Phase 1: Director + DM + Critic)
  // -------------------------------------------------------------------------
  async flushBatch() {
    if (this.turnInFlight) return;
    const actions = (this.pendingActions || []).slice();
    this.pendingActions = [];
    if (actions.length === 0) return;

    // Make sure alarm is armed (idempotent — alarm() reschedules itself)
    if (!this.alarmScheduled) {
      this.alarmScheduled = true;
      try { await this.state.storage.setAlarm(Date.now() + 60_000); } catch {}
    }

    const keyEntry = this.keyPool.next();
    if (!keyEntry) {
      const waitMs = Math.max(1000, this.keyPool.earliestThawMs());
      const waitSec = Math.ceil(waitMs / 1000);
      this.broadcast({
        type: 'turn-error',
        kind: 'keys-exhausted',
        message: `All API keys are cooling down. Table rests for ${waitSec}s…`,
        retryInMs: waitMs
      });
      // Re-queue the actions and try again after the wait
      this.pendingActions = actions;
      setTimeout(() => this.flushBatch().catch(() => {}), waitMs + 200);
      return;
    }

    this.turnInFlight = true;
    this.broadcast({ type: 'turn-start', actionIds: actions.map(a => a.id) });

    const codexJson = JSON.stringify(this.yDoc.getMap('memoryCodex').toJSON(), null, 2);
    const prompt = buildBatchPrompt(actions, codexJson);
    const body = buildRequestBody(prompt);

    const result = await callGemini(body, keyEntry.value);

    if (!result.ok) {
      if (result.status === 429) {
        this.keyPool.markThrottled(keyEntry.value, result.retryAfterMs || 60_000);
      }
      // Try once more with a different key from the pool
      const altKey = this.keyPool.next();
      if (altKey && altKey.value !== keyEntry.value) {
        const retry = await callGemini(body, altKey.value);
        if (retry.ok) {
          await this.commitTurn(retry, actions);
          this.turnInFlight = false;
          return;
        }
      }
      this.broadcast({
        type: 'turn-error',
        kind: 'ai-failed',
        message: 'The world hesitates — the AI could not respond. Try again in a moment.',
        error: result.error || `status ${result.status}`
      });
      this.turnInFlight = false;
      return;
    }

    await this.commitTurn(result, actions);
    this.turnInFlight = false;
  }

  async commitTurn(result, actions) {
    const rawText = extractText(result.data);
    if (!rawText) {
      this.broadcast({
        type: 'turn-error',
        kind: 'empty',
        message: 'The threads blur — try a different action.'
      });
      return;
    }
    const parsed = parseJsonLoose(rawText) || { narration: rawText };

    // Write the beat to the chat log AND apply codex updates atomically.
    // Both go through Yjs so all clients (and persistence) see them together.
    this.yDoc.transact(() => {
      const yChat = this.yDoc.getArray('chatLog');
      yChat.push([{
        author: 'Dungeon Master',
        text: parsed.narration,
        type: 'dm',
        timestamp: Date.now()
      }]);

      // Deep-merge codex updates (party is keyed by character name)
      if (parsed.new_codex) {
        const yCodex = this.yDoc.getMap('memoryCodex');
        for (const key in parsed.new_codex) {
          if (key === 'party' && typeof parsed.new_codex[key] === 'object') {
            const current = yCodex.get('party') || {};
            const updated = { ...current };
            for (const name in parsed.new_codex.party) {
              updated[name] = { ...(updated[name] || {}), ...parsed.new_codex.party[name] };
            }
            yCodex.set('party', updated);
          } else {
            yCodex.set(key, parsed.new_codex[key]);
          }
        }
      }
    });

    // Broadcast turn-result with the parsed payload (UI uses this for QTE,
    // scene_tags, etc.). The chat/codex already arrived via Yjs sync.
    this.broadcast({
      type: 'turn-result',
      narration: parsed.narration,
      scene_tags: parsed.scene_tags || null,
      ui_update: parsed.ui_update || null
    });

    // Persist updated doc
    const merged = Y.encodeStateAsUpdate(this.yDoc);
    await this.state.storage.put("yDocState", merged);
  }

  broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const sess of this.sessions) {
      try { sess.ws.send(s); } catch {}
    }
  }
}
