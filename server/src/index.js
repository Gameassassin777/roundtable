import * as Y from 'yjs';
import { callGemini, extractText, parseJsonLoose, KeyPool, SYSTEM_PROMPT } from './lib/ai.js';
import { buildDmPrompt, buildBatchPrompt, buildRequestBody } from './lib/promptBuilder.js';
import { buildDirectorPrompt, buildDirectorRequestBody } from './lib/director.js';
import { lintProse } from './lib/proseLint.js';
import { buildWorldEnginePrompt, buildWorldEngineRequestBody, tickWorldClock } from './lib/worldEngine.js';

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
  // Phase 2: includes world-clock + empty NPC/faction/thread scaffolds so the
  // World Engine has structure to write into from the first turn.
  seedDefaultWorld() {
    const yCodex = this.yDoc.getMap('memoryCodex');
    this.yDoc.transact(() => {
      yCodex.set('location', 'a quiet crossroads at the edge of an unfinished map');
      yCodex.set('plot_summary', 'The party has just arrived, each looking for something different.');
      yCodex.set('scene_tags', { biome: 'crossroads', weather: 'clear', mood: 'unsettled' });
      yCodex.set('party', {});
      yCodex.set('inventory', {});
      yCodex.set('world_clock', { turn: 0, day: 1, time_of_day: 'morning' });
      yCodex.set('npcs', {});
      yCodex.set('factions', {});
      yCodex.set('threads', []);
    });
  }

  async fetch(request) {
    const [client, server] = new WebSocketPair();
    await this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    // Phase 2 World Engine tick. Advance NPCs/factions/threads off-screen,
    // surface 0-1 ambient world beat, advance the world clock.

    // Idle: no sessions means no one's playing. Don't run, don't reschedule.
    // Next session's handleSession re-arms via ensureAlarm().
    if (this.sessions.length === 0) {
      this.alarmScheduled = false;
      return;
    }

    // Defer if a DM turn is in flight — the next alarm picks this up.
    if (this.turnInFlight) {
      try { await this.state.storage.setAlarm(Date.now() + 60_000); } catch {}
      return;
    }

    try {
      await this.runWorldEngine();
    } catch (e) {
      console.error('World Engine error:', e);
    }

    // Reschedule (every 3 min — long enough to feel ambient, short enough to matter)
    try {
      await this.state.storage.setAlarm(Date.now() + 180_000);
    } catch {}
  }

  ensureAlarm() {
    if (this.alarmScheduled) return;
    this.alarmScheduled = true;
    this.state.storage.setAlarm(Date.now() + 180_000).catch(() => {});
  }

  async runWorldEngine() {
    const keyEntry = this.keyPool.next();
    if (!keyEntry) return; // No key available this tick; try next alarm.

    const yCodex = this.yDoc.getMap('memoryCodex');
    const codexJson = JSON.stringify(yCodex.toJSON(), null, 2);

    // Pull last ~6 chat entries for context (what the party has been doing).
    const yChat = this.yDoc.getArray('chatLog');
    const recent = (yChat.toArray() || []).slice(-6);
    const recentChatJson = JSON.stringify(recent.map(e => ({
      author: e.author, text: e.text, type: e.type
    })), null, 2);

    const result = await this.callWithFallback(
      buildWorldEngineRequestBody(buildWorldEnginePrompt(codexJson, recentChatJson)),
      keyEntry
    );
    if (!result.ok) return;

    const text = extractText(result.data);
    const parsed = parseJsonLoose(text);
    if (!parsed) return;

    // Apply the world-clock tick we computed locally (the model's version
    // is a suggestion; we own the canonical tick to avoid double-advancing).
    const currentClock = yCodex.get('world_clock') || { turn: 0, day: 1, time_of_day: 'morning' };
    const newClock = tickWorldClock(currentClock);

    // Lint the world_beat with the same prose rules as the DM call.
    let beat = parsed.world_beat || null;
    if (beat) {
      // Quick 1-2 sentence check. Don't retry — just truncate hard if needed.
      const sentences = (beat.match(/[.!?]+\s/g) || []).length;
      if (sentences > 2) {
        // Cut to first two sentence-end positions.
        const m = beat.match(/^.+?[.!?]+\s.+?[.!?]+/);
        beat = m ? m[0] : beat;
      }
    }

    this.yDoc.transact(() => {
      yCodex.set('world_clock', newClock);

      // NPCs: merge changes + add new ones.
      if (parsed.npc_changes || parsed.new_npcs) {
        const npcs = { ...(yCodex.get('npcs') || {}) };
        for (const name in (parsed.npc_changes || {})) {
          npcs[name] = { ...(npcs[name] || {}), ...parsed.npc_changes[name] };
        }
        for (const name in (parsed.new_npcs || {})) {
          npcs[name] = parsed.new_npcs[name];
        }
        yCodex.set('npcs', npcs);
      }

      // Factions: merge.
      if (parsed.faction_changes) {
        const facs = { ...(yCodex.get('factions') || {}) };
        for (const name in parsed.faction_changes) {
          facs[name] = { ...(facs[name] || {}), ...parsed.faction_changes[name] };
        }
        yCodex.set('factions', facs);
      }

      // Threads: merge by id + append new ones.
      if (parsed.thread_changes || parsed.new_threads) {
        const threads = (yCodex.get('threads') || []).slice();
        const byId = new Map(threads.map(t => [t.id, t]));
        for (const change of (parsed.thread_changes || [])) {
          if (!change.id) continue;
          const cur = byId.get(change.id) || {};
          byId.set(change.id, { ...cur, ...change });
        }
        for (const t of (parsed.new_threads || [])) {
          if (t.id && !byId.has(t.id)) byId.set(t.id, t);
        }
        yCodex.set('threads', Array.from(byId.values()));
      }

      // Optional world_beat goes to chat as type 'world' (distinct from DM 'dm').
      if (beat) {
        yChat.push([{
          author: 'World',
          text: beat,
          type: 'world',
          timestamp: Date.now()
        }]);
      }
    });

    // Broadcast so clients without 'world' styling still render it.
    this.broadcast({
      type: 'world-beat',
      beat,
      world_clock: newClock
    });

    const merged = Y.encodeStateAsUpdate(this.yDoc);
    await this.state.storage.put("yDocState", merged);
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

    // First session in a previously-idle world re-arms the World Engine alarm.
    this.ensureAlarm();

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
  // Turn pipeline (Phase 1: Director → DM → prose lint, with single-call
  // Phase 0 path as fallback if the Director call fails).
  // -------------------------------------------------------------------------
  async flushBatch() {
    if (this.turnInFlight) return;
    const actions = (this.pendingActions || []).slice();
    this.pendingActions = [];
    if (actions.length === 0) return;

    // Make sure alarm is armed for the World Engine (Phase 2).
    this.ensureAlarm();

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

    // --- Phase 1: Director → DM → lint, with one retry on lint failure -----
    const directorResult = await this.callWithFallback(
      buildDirectorRequestBody(buildDirectorPrompt(actions, codexJson)),
      keyEntry
    );

    let turn;
    if (directorResult.ok) {
      const directorText = extractText(directorResult.data);
      const ruling = parseJsonLoose(directorText);
      if (ruling) {
        // DM call: render the ruling as prose.
        const dmResult = await this.callWithFallback(
          buildRequestBody(buildDmPrompt(ruling, codexJson)),
          keyEntry
        );
        if (dmResult.ok) {
          const dmText = extractText(dmResult.data);
          const dmParsed = parseJsonLoose(dmText) || { narration: dmText };

          // Lint pass 1
          let lint = lintProse(dmParsed.narration);
          let finalNarration = dmParsed.narration;
          let retried = false;

          // Lint retry: rewrite once with feedback
          if (!lint.passes) {
            retried = true;
            const retryResult = await this.callWithFallback(
              buildRequestBody(buildDmPrompt(ruling, codexJson, lint.feedback)),
              keyEntry
            );
            if (retryResult.ok) {
              const retryText = extractText(retryResult.data);
              const retryParsed = parseJsonLoose(retryText) || { narration: retryText };
              const lint2 = lintProse(retryParsed.narration);
              // Only adopt the retry if it actually improved
              if (lint2.passes || (!lint.passes && retryParsed.narration?.length > finalNarration.length)) {
                finalNarration = retryParsed.narration;
              }
            }
          }

          turn = {
            narration: finalNarration,
            scene_tags: ruling.scene_tags_change || null,
            ui_update: ruling.qte ? { qte: ruling.qte } : null,
            new_codex: ruling.codex_writes || {},
            lint_passed: lint.passes,
            lint_retried: retried,
            pipeline: 'director-dm'
          };
        }
      }
    }

    // Fallback: Phase 0 single-call path (Director call failed or produced
    // nothing usable). Same prompt + codex shape Calvin shipped in Phase 0.
    if (!turn) {
      const fallbackResult = await this.callWithFallback(
        buildRequestBody(buildBatchPrompt(actions, codexJson)),
        keyEntry
      );
      if (!fallbackResult.ok) {
        this.broadcast({
          type: 'turn-error',
          kind: 'ai-failed',
          message: 'The world hesitates — the AI could not respond. Try again in a moment.',
          error: fallbackResult.error || `status ${fallbackResult.status}`
        });
        this.turnInFlight = false;
        return;
      }
      const fbText = extractText(fallbackResult.data);
      const fbParsed = parseJsonLoose(fbText) || { narration: fbText };
      turn = {
        narration: fbParsed.narration,
        scene_tags: fbParsed.scene_tags || null,
        ui_update: fbParsed.ui_update || null,
        new_codex: fbParsed.new_codex || {},
        lint_passed: null,
        lint_retried: false,
        fallback: true,
        pipeline: 'phase0-fallback'
      };
    }

    await this.commitTurn(turn, actions);
    this.turnInFlight = false;
  }

  // Call Gemini with one key, retry once on a different key on 429/503.
  // Returns the same { ok, data, status, ... } shape as callGemini.
  async callWithFallback(body, primaryKey) {
    const r1 = await callGemini(body, primaryKey.value);
    if (r1.ok) return r1;
    if (r1.status === 429) {
      this.keyPool.markThrottled(primaryKey.value, r1.retryAfterMs || 60_000);
    }
    const alt = this.keyPool.next();
    if (alt && alt.value !== primaryKey.value) {
      const r2 = await callGemini(body, alt.value);
      if (r2.ok) return r2;
    }
    return r1;
  }

  async commitTurn(turn, actions) {
    if (!turn?.narration) {
      this.broadcast({
        type: 'turn-error',
        kind: 'empty',
        message: 'The threads blur — try a different action.'
      });
      return;
    }

    // Advance the world clock one tick (Phase 2 — every DM turn is a tick).
    const yCodex = this.yDoc.getMap('memoryCodex');
    const currentClock = yCodex.get('world_clock') || { turn: 0, day: 1, time_of_day: 'morning' };
    const newClock = tickWorldClock(currentClock);

    // Write the beat to the chat log AND apply codex updates atomically.
    // Both go through Yjs so all clients (and persistence) see them together.
    this.yDoc.transact(() => {
      const yChat = this.yDoc.getArray('chatLog');
      yChat.push([{
        author: 'Dungeon Master',
        text: turn.narration,
        type: 'dm',
        timestamp: Date.now()
      }]);

      yCodex.set('world_clock', newClock);

      // Apply scene_tags_change (Director) if present, else fall through.
      if (turn.scene_tags) {
        const cur = yCodex.get('scene_tags') || {};
        const merged = { ...cur };
        for (const k of ['biome', 'weather', 'mood']) {
          if (turn.scene_tags[k]) merged[k] = turn.scene_tags[k];
        }
        yCodex.set('scene_tags', merged);
      }

      // Deep-merge codex writes (party is keyed by character name).
      // Director output uses codex_writes; Phase 0 fallback uses new_codex.
      const writes = turn.new_codex || {};
      for (const key in writes) {
        if (key === 'party' && typeof writes[key] === 'object') {
          const current = yCodex.get('party') || {};
          const updated = { ...current };
          for (const name in writes.party) {
            updated[name] = { ...(updated[name] || {}), ...writes.party[name] };
          }
          yCodex.set('party', updated);
        } else if (key === 'scene_tags') {
          // Already handled above from turn.scene_tags; skip duplicate writes.
        } else if (key === 'world_clock') {
          // Already advanced above; ignore Director's clock (we own it).
        } else {
          yCodex.set(key, writes[key]);
        }
      }
    });

    // Broadcast turn-result with the parsed payload (UI uses this for QTE,
    // scene_tags, etc.). The chat/codex already arrived via Yjs sync.
    this.broadcast({
      type: 'turn-result',
      narration: turn.narration,
      scene_tags: turn.scene_tags || null,
      ui_update: turn.ui_update || null,
      world_clock: newClock
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
