import * as Y from 'yjs';
import { callGemini, extractText, parseJsonLoose, KeyPool, SYSTEM_PROMPT } from './lib/ai.js';
import { buildDmPrompt, buildBatchPrompt, buildRequestBody, buildGenesisPrompt } from './lib/promptBuilder.js';
import { buildDirectorPrompt, buildDirectorRequestBody } from './lib/director.js';
import { lintProse, deriveLintProfile } from './lib/proseLint.js';
import { buildCriticPrompt, buildCriticRequestBody } from './lib/critic.js';
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
    // Phase 23: host can pause/resume the World Engine alarm loop and force
    // ticks. enginePaused stops runWorldEngine from running on alarm ticks;
    // alarm is still scheduled so resume picks up cleanly.
    this.enginePaused = false;
    this.batchWindow = null;     // timer id for the 5s action-flush window
    this.batchTimeoutMs = 5000;
    this.turnInFlight = false;
    this.pendingActions = [];
    this.genesisInFlight = false;
    this.genesisFired = false;
    // Phase 10: whisper batches, one per session. Each drains on its own timer
    // and the resulting narration is unicast to the whisperer only (codex
    // changes still land on the shared doc). Other players see nothing.
    this.whisperBatches = new Map();

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
      // Phase 45: Travel — discovered locations keyed by name. Each entry
      // holds description, exits (names of connected locations, may include
      // undiscovered ones the party has only heard of), biome, visited_turn.
      // The legacy top-level `location` string is the CURRENT location name
      // (a key into this map). Ad-hoc scene descriptions still flow through
      // scene_tags / plot_summary.
      if (!yCodex.get('locations')) yCodex.set('locations', {});
      // Phase 6: North Star — host-defined premise + tone. Empty by default;
      // prompts treat an empty north_star as "improvise neutrally".
      if (!yCodex.get('north_star')) {
        yCodex.set('north_star', {
          premise: '',
          tone: '',
          opening_hook: '',
          set_at: null,
          set_by: null,
        });
      }
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
      this.broadcastEngineStatus();
      return;
    }

    // Phase 23: host pause — keep the alarm scheduled but skip the actual
    // engine work. Resume picks up on the next tick.
    if (this.enginePaused) {
      try { await this.state.storage.setAlarm(Date.now() + 180_000); } catch {}
      this.broadcastEngineStatus();
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
    // Phase 37: clients reset their countdown to the new alarm time.
    this.broadcastEngineStatus();
  }

  ensureAlarm() {
    if (this.alarmScheduled) return;
    this.alarmScheduled = true;
    this.state.storage.setAlarm(Date.now() + 180_000).catch(() => {});
  }

  // Phase 37: broadcast engine-status with the next-tick timestamp so
  // clients can render a live countdown. Optional extra fields merge in
  // (e.g. world_clock on step-time). Target one socket by passing ws; omit
  // to broadcast to all sessions. Reads getAlarm() so it tracks the actual
  // scheduled time rather than guessing 180s from now.
  async broadcastEngineStatus(extra = {}, ws = null) {
    let next_tick_at = null;
    try {
      next_tick_at = await this.state.storage.getAlarm();
    } catch { /* noop */ }
    const payload = { type: 'engine-status', paused: this.enginePaused, next_tick_at, ...extra };
    const text = JSON.stringify(payload);
    if (ws) {
      try { ws.send(text); } catch { /* noop */ }
    } else {
      this.broadcast(text);
    }
  }

  // Phase 37: backwards-compat shim — original connect path passed the raw
  // socket. broadcastEngineStatus now handles ws-or-broadcast.
  sendEngineStatus(ws) { this.broadcastEngineStatus({}, ws); }

  async runWorldEngine() {
    const keyEntry = this.keyPool.next();
    if (!keyEntry) return; // No key available this tick; try next alarm.

    const yCodex = this.yDoc.getMap('memoryCodex');
    const codexObj = yCodex.toJSON();
    const codexJson = JSON.stringify(codexObj, null, 2);

    // Pull last ~6 chat entries for context (what the party has been doing).
    const yChat = this.yDoc.getArray('chatLog');
    const recent = (yChat.toArray() || []).slice(-6);
    const recentChatJson = JSON.stringify(recent.map(e => ({
      author: e.author, text: e.text, type: e.type
    })), null, 2);

    const result = await this.callWithFallback(
      buildWorldEngineRequestBody(buildWorldEnginePrompt(codexJson, recentChatJson, codexObj.north_star)),
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
    const session = { ws, name: 'Wanderer', keyValue: null, id: `s-${Date.now()}-${Math.random().toString(36).slice(2,8)}` };
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
    // Phase 23: tell the new client whether the engine is currently paused
    // so the host controls reflect the actual server state on connect.
    // Phase 37: include next_tick_at so the client can render a countdown.
    this.sendEngineStatus(ws);

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
          // data: { text, author, whisper? }
          if (!data.text || typeof data.text !== 'string') return;
          const action = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            author: data.author || session.name || 'Wanderer',
            text: data.text.slice(0, 1000)  // hard cap
          };

          // Phase 10: whisper track. Routed to its own batch + flush path so
          // the resulting narration lands only on the whisperer's screen.
          if (data.whisper) {
            const sid = session.id;
            let batch = this.whisperBatches.get(sid);
            if (!batch) {
              batch = { ws: ws, name: action.author, actions: [], timer: null };
              this.whisperBatches.set(sid, batch);
            }
            batch.actions.push(action);
            ws.send(JSON.stringify({ type: "action-accepted", id: action.id, whisper: true }));
            if (!batch.timer) {
              batch.timer = setTimeout(() => {
                if (batch) batch.timer = null;
                this.flushWhisperBatch(sid).catch(err => {
                  console.error('flushWhisperBatch error:', err);
                });
              }, this.batchTimeoutMs);
            }
            return;
          }

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

        // ----- Genesis: world speaks first --------------------------------
        // Client fires this after their character is committed to the codex
        // AND the chat log is empty. Server double-checks emptiness + party
        // presence so the first finisher triggers it once for the whole table.
        if (data.type === "trigger-genesis") {
          if (this.genesisInFlight || this.genesisFired) return;
          const yChat = this.yDoc.getArray('chatLog');
          const yCodex = this.yDoc.getMap('memoryCodex');
          const party = yCodex.get('party') || {};
          if (yChat.length > 0 || Object.keys(party).length === 0) return;
          this.genesisInFlight = true;
          this.runGenesis().catch(err => {
            console.error('Genesis error:', err);
          }).finally(() => {
            this.genesisInFlight = false;
          });
          return;
        }

        // ----- Phase 23: World Engine host controls -----------------------
        // Pause/resume the alarm loop, force a tick now, or step the world
        // clock forward one bucket without invoking the model. All clients
        // see engine-status so they reflect pause state correctly.
        if (data.type === "engine-control") {
          const action = data.action;
          if (action === 'pause') {
            this.enginePaused = true;
            this.broadcastEngineStatus();
            return;
          }
          if (action === 'resume') {
            this.enginePaused = false;
            // Re-arm the alarm so resume takes effect within seconds, not 3min.
            this.ensureAlarm();
            this.broadcastEngineStatus();
            return;
          }
          if (action === 'tick-now') {
            // Don't bypass pause from this control surface — host can resume
            // first if they want a tick. But explicit force-tick while paused
            // is reasonable as a "step once" tool, so we honor it.
            this.runWorldEngine().then(() => this.broadcastEngineStatus()).catch(err => {
              console.error('forced runWorldEngine error:', err);
            });
            return;
          }
          if (action === 'step-time') {
            // Advance the world clock one tick without an LLM call. Useful
            // when the host wants to nudge time forward without spending a
            // key cycle or producing an ambient beat.
            try {
              const yCodex = this.yDoc.getMap('memoryCodex');
              const cur = yCodex.get('world_clock') || { turn: 0, day: 1, time_of_day: 'morning' };
              const next = tickWorldClock(cur);
              this.yDoc.transact(() => {
                yCodex.set('world_clock', next);
              });
              const merged = Y.encodeStateAsUpdate(this.yDoc);
              await this.state.storage.put("yDocState", merged);
              this.broadcastEngineStatus({ world_clock: next });
            } catch (e) {
              console.error('step-time error:', e);
            }
            return;
          }
        }
      } catch (e) {
        console.error("Socket message error:", e);
      }
    });

    const removeSession = () => {
      this.sessions = this.sessions.filter((s) => s.ws !== ws);
      if (session.keyValue) this.keyPool.remove(session.keyValue);
      // Phase 10: drain any pending whisper batch for this session so the
      // timer doesn't fire on a dead socket.
      const wb = this.whisperBatches.get(session.id);
      if (wb) {
        if (wb.timer) clearTimeout(wb.timer);
        this.whisperBatches.delete(session.id);
      }
      sendPresence();
    };
    ws.addEventListener("close", removeSession);
    ws.addEventListener("error", removeSession);
  }

  // -------------------------------------------------------------------------
  // Genesis: the world speaks first. Fires once per world when the chat log
  // is empty and a party has assembled. Writes a scene_set beat to the chat
  // log and seeds the starting location + scene tags. Does NOT advance the
  // world clock (the world hasn't started ticking yet — that happens on the
  // first player action).
  // -------------------------------------------------------------------------
  async runGenesis() {
    const yChat = this.yDoc.getArray('chatLog');
    const yCodex = this.yDoc.getMap('memoryCodex');
    if (yChat.length > 0 || this.genesisFired) {
      this.genesisInFlight = false;
      return;
    }
    const party = yCodex.get('party') || {};
    const partyList = Object.entries(party).map(([name, p]) => ({ name, ...(p || {}) }));
    if (partyList.length === 0) {
      this.genesisInFlight = false;
      return;
    }

    const keyEntry = this.keyPool.next();
    if (!keyEntry) {
      // No key available right now — re-arm and let the next session retry.
      this.genesisInFlight = false;
      return;
    }

    this.broadcast({ type: 'turn-start', actionIds: ['genesis'] });
    this.broadcast({ type: 'turn-stage', stage: 'genesis', label: 'The world awakens…' });

    const codexObj = yCodex.toJSON();
    const codexJson = JSON.stringify(codexObj, null, 2);
    const northStar = codexObj.north_star || null;

    const result = await this.callWithFallback(
      buildRequestBody(buildGenesisPrompt(partyList, codexJson, northStar)),
      keyEntry
    );

    if (!result.ok) {
      this.genesisInFlight = false;
      this.broadcast({ type: 'turn-error', kind: 'genesis-failed', message: 'The world hesitates at the threshold. Try sending an action to begin.' });
      return;
    }

    const text = extractText(result.data);
    const parsed = parseJsonLoose(text);
    if (!parsed?.narration) {
      this.genesisInFlight = false;
      return;
    }

    this.yDoc.transact(() => {
      yChat.push([{
        author: 'World',
        text: String(parsed.narration).slice(0, 1200),
        type: 'dm',
        timestamp: Date.now(),
        audit: { lint_retried: false, critic_passed: null, critic_retried: false },
        beat_profile: 'scene_set',
        is_scene_set: true,
        beat_types: ['scene_set'],
        ruling_summary: null,
        is_genesis: true
      }]);
      if (parsed.starting_location && typeof parsed.starting_location === 'string') {
        yCodex.set('location', parsed.starting_location.slice(0, 120));
        // Seed the locations map with this starting place so travel works.
        const locs = { ...(yCodex.get('locations') || {}) };
        const locName = parsed.starting_location.slice(0, 120);
        if (!locs[locName]) {
          locs[locName] = {
            description: String(parsed.narration || '').slice(0, 400),
            exits: [],
            biome: parsed.starting_scene_tags?.biome || '',
            visited_turn: 0
          };
          yCodex.set('locations', locs);
        }
      }
      if (parsed.starting_scene_tags && typeof parsed.starting_scene_tags === 'object') {
        const cur = yCodex.get('scene_tags') || {};
        yCodex.set('scene_tags', {
          biome: parsed.starting_scene_tags.biome || cur.biome || 'crossroads',
          weather: parsed.starting_scene_tags.weather || cur.weather || 'clear',
          mood: parsed.starting_scene_tags.mood || cur.mood || 'unsettled'
        });
      }
    });

    this.genesisFired = true;
    this.genesisInFlight = false;

    this.broadcast({
      type: 'turn-result',
      narration: parsed.narration,
      scene_tags: parsed.starting_scene_tags || null,
      ui_update: null,
      world_clock: yCodex.get('world_clock'),
      pipeline: 'genesis',
      is_scene_set: true,
      beat_profile: 'scene_set',
      beat_types: ['scene_set'],
      is_genesis: true
    });

    const merged = Y.encodeStateAsUpdate(this.yDoc);
    await this.state.storage.put("yDocState", merged);
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

    const codexObj = this.yDoc.getMap('memoryCodex').toJSON();
    const codexJson = JSON.stringify(codexObj, null, 2);
    const northStar = codexObj.north_star || null;

    // --- Phase 1: Director → DM → lint, with one retry on lint failure -----
    this.broadcast({ type: 'turn-stage', stage: 'director', label: 'Reading the table…' });
    const directorResult = await this.callWithFallback(
      buildDirectorRequestBody(buildDirectorPrompt(actions, codexJson, northStar)),
      keyEntry
    );

    let turn;
    if (directorResult.ok) {
      const directorText = extractText(directorResult.data);
      const ruling = parseJsonLoose(directorText);
      if (ruling) {
        // Safety net: if Director omitted is_scene_set, derive from codex_writes.location
        // (party actually moves) — that's the canonical signal for scene-setting.
        if (ruling.is_scene_set === undefined) {
          ruling.is_scene_set = !!(ruling.codex_writes && ruling.codex_writes.location);
        }
        // Beat-aware lint profile — scene_set / action / social / world_ambient.
        const lintProfile = deriveLintProfile(ruling);

        // DM call: render the ruling as prose.
        this.broadcast({ type: 'turn-stage', stage: 'dm', label: 'Composing the scene…' });
        const dmResult = await this.callWithFallback(
          buildRequestBody(buildDmPrompt(ruling, codexJson, northStar)),
          keyEntry
        );
        if (dmResult.ok) {
          const dmText = extractText(dmResult.data);
          const dmParsed = parseJsonLoose(dmText) || { narration: dmText };

          // Lint pass 1 — uses beat profile.
          let lint = lintProse(dmParsed.narration, lintProfile);
          let finalNarration = dmParsed.narration;
          let retried = false;

          // Lint retry: rewrite once with feedback
          if (!lint.passes) {
            retried = true;
            const retryResult = await this.callWithFallback(
              buildRequestBody(buildDmPrompt(ruling, codexJson, northStar, lint.feedback)),
              keyEntry
            );
            if (retryResult.ok) {
              const retryText = extractText(retryResult.data);
              const retryParsed = parseJsonLoose(retryText) || { narration: retryText };
              const lint2 = lintProse(retryParsed.narration, lintProfile);
              // Only adopt the retry if it actually improved
              if (lint2.passes || (!lint.passes && retryParsed.narration?.length > finalNarration.length)) {
                finalNarration = retryParsed.narration;
              }
            }
          }

          // Phase 12: LLM Critic pass. Cost-guarded — only runs when a spare
          // key is available so the table's main turn never stalls waiting on
          // a Critic call. Catches structural failures the cheap lint can't
          // (ruling fidelity, codex contradictions, option listing, etc.).
          // One retry with the Critic's feedback on failure, same shape as the
          // lint retry.
          let criticPassed = null;
          let criticRetried = false;
          const criticKey = this.keyPool.next();
          if (criticKey && criticKey.value !== keyEntry.value) {
            this.broadcast({ type: 'turn-stage', stage: 'critic', label: 'Checking the rendering…' });
            const criticResult = await this.callWithFallback(
              buildCriticRequestBody(buildCriticPrompt(ruling, finalNarration, codexJson)),
              criticKey
            );
            if (criticResult.ok) {
              const criticText = extractText(criticResult.data);
              const criticParsed = parseJsonLoose(criticText) || { passes: true, feedback: '' };
              criticPassed = !!criticParsed.passes;
              if (!criticPassed && criticParsed.feedback) {
                criticRetried = true;
                const criticRetry = await this.callWithFallback(
                  buildRequestBody(buildDmPrompt(ruling, codexJson, northStar, criticParsed.feedback)),
                  keyEntry
                );
                if (criticRetry.ok) {
                  const crtText = extractText(criticRetry.data);
                  const crtParsed = parseJsonLoose(crtText) || { narration: crtText };
                  // Cheap-lint the retry too; adopt only if it lints clean or
                  // the Critic would prefer it (we can't re-run the Critic here
                  // without risking a third call).
                  const crtLint = lintProse(crtParsed.narration, lintProfile);
                  if (crtLint.passes) {
                    finalNarration = crtParsed.narration;
                    criticPassed = true;
                  }
                }
              }
            }
          }

          turn = {
            narration: finalNarration,
            scene_tags: ruling.scene_tags_change || null,
            ui_update: ruling.qte ? { qte: ruling.qte } : null,
            new_codex: ruling.codex_writes || {},
            npc_changes: ruling.npc_changes || null,
            new_npcs: ruling.new_npcs || null,
            faction_changes: ruling.faction_changes || null,
            thread_changes: ruling.thread_changes || null,
            location_changes: ruling.location_changes || null,
            new_locations: ruling.new_locations || null,
            xp_awards: ruling.xp_awards || null,
            lint_passed: lint.passes,
            lint_retried: retried,
            critic_passed: criticPassed,
            critic_retried: criticRetried,
            // Beat-type telemetry — frontend uses these to pick the rendering style.
            beat_profile: lintProfile,
            is_scene_set: !!ruling.is_scene_set,
            beat_types: (ruling.rulings || []).map(r => r?.beat_type || 'action'),
            // Phase 27: slim summary of the Director's structured ruling so
            // the chronicle can surface what was decided (not just rendered).
            // Keep it small — only the keys, not the values, for codex writes.
            ruling_summary: buildRulingSummary(ruling),
            pipeline: 'director-dm'
          };
        }
      }
    }

    // Fallback: Phase 0 single-call path (Director call failed or produced
    // nothing usable). Same prompt + codex shape Calvin shipped in Phase 0.
    if (!turn) {
      const fallbackResult = await this.callWithFallback(
        buildRequestBody(buildBatchPrompt(actions, codexJson, northStar)),
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
      // Phase 22: embed pipeline telemetry on the beat so the host can later
      // see which narrations were retried (lint or critic) or critic-flagged.
      // Older clients ignore the extra fields; nothing to migrate.
      yChat.push([{
        author: 'Dungeon Master',
        text: turn.narration,
        type: 'dm',
        timestamp: Date.now(),
        audit: {
          lint_retried: !!turn.lint_retried,
          critic_passed: turn.critic_passed ?? null,
          critic_retried: !!turn.critic_retried
        },
        beat_profile: turn.beat_profile || 'action',
        is_scene_set: !!turn.is_scene_set,
        beat_types: Array.isArray(turn.beat_types) ? turn.beat_types : [],
        ruling_summary: turn.ruling_summary || null
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
        } else if (key === 'npcs' || key === 'factions' || key === 'threads') {
          // Director should use npc_changes/new_npcs/etc., not raw overwrites.
          // Ignore raw overwrites here to prevent wiping accumulated state.
        } else {
          yCodex.set(key, writes[key]);
        }
      }

      // Phase 1 structured NPC/faction/thread writes from the Director.
      // Merge by name/id so we accumulate state across turns instead of
      // each Director call inventing throwaway NPCs the World Engine can
      // never advance.
      const npcChanges = turn.npc_changes;
      const newNpcs = turn.new_npcs;
      if (npcChanges || newNpcs) {
        const npcs = { ...(yCodex.get('npcs') || {}) };
        for (const name in (npcChanges || {})) {
          npcs[name] = { ...(npcs[name] || {}), ...npcChanges[name] };
        }
        for (const name in (newNpcs || {})) {
          npcs[name] = { ...(npcs[name] || {}), ...newNpcs[name] };
        }
        yCodex.set('npcs', npcs);
      }
      if (turn.faction_changes) {
        const facs = { ...(yCodex.get('factions') || {}) };
        for (const name in turn.faction_changes) {
          facs[name] = { ...(facs[name] || {}), ...turn.faction_changes[name] };
        }
        yCodex.set('factions', facs);
      }
      if (turn.thread_changes) {
        const threads = (yCodex.get('threads') || []).slice();
        for (const change of turn.thread_changes) {
          if (!change?.id) continue;
          const idx = threads.findIndex(t => t?.id === change.id);
          if (idx >= 0) {
            threads[idx] = { ...threads[idx], ...change };
          } else {
            threads.push(change);
          }
        }
        yCodex.set('threads', threads);
      }
      // Phase 45: Travel — merge discovered/updated locations. Both
      // location_changes (partial merge, e.g. new exits come into view) and
      // new_locations (first discovery) flow through the same accumulator
      // so the map only ever grows richer. Mark visited_turn on any
      // location that matches the current location name post-write.
      if (turn.location_changes || turn.new_locations) {
        const locs = { ...(yCodex.get('locations') || {}) };
        for (const name in (turn.location_changes || {})) {
          locs[name] = { ...(locs[name] || {}), ...turn.location_changes[name] };
        }
        for (const name in (turn.new_locations || {})) {
          locs[name] = { ...(locs[name] || {}), ...turn.new_locations[name] };
        }
        yCodex.set('locations', locs);
      }
      // Phase 46: XP awards — Director says "Kaelen: +3". We accumulate into
      // party[name].xp and recompute level from XP (every 10 XP = 1 level).
      // Each level past 1 grants +1 max_hp from base. On level-up we bump
      // hp by the same delta so the new capacity isn't empty. base_max_hp
      // preserves the original forge value so the bonus stays recomputable.
      if (turn.xp_awards && typeof turn.xp_awards === 'object') {
        const party = { ...(yCodex.get('party') || {}) };
        for (const name in turn.xp_awards) {
          const award = Math.max(0, Math.floor(Number(turn.xp_awards[name]) || 0));
          if (award === 0) continue;
          const cur = party[name] || {};
          const prevXp = typeof cur.xp === 'number' ? cur.xp : 0;
          const newXp = prevXp + award;
          const prevLevel = typeof cur.level === 'number' ? cur.level : 1;
          const newLevel = Math.floor(newXp / 10) + 1;
          const base = typeof cur.base_max_hp === 'number'
            ? cur.base_max_hp
            : (typeof cur.max_hp === 'number' ? cur.max_hp : 15);
          const updated = {
            ...cur,
            xp: newXp,
            level: newLevel,
            base_max_hp: base,
            max_hp: base + (newLevel - 1),
          };
          // Level-up: add the gained HP capacity to current HP (so the
          // expanded capacity isn't empty). Clamp to new max.
          if (newLevel > prevLevel) {
            const gained = newLevel - prevLevel;
            const prevHp = typeof cur.hp === 'number' ? cur.hp : updated.max_hp;
            updated.hp = Math.min(prevHp + gained, updated.max_hp);
          }
          party[name] = updated;
        }
        yCodex.set('party', party);
      }
    });

    // Broadcast turn-result with the parsed payload (UI uses this for QTE,
    // scene_tags, etc.). The chat/codex already arrived via Yjs sync.
    this.broadcast({
      type: 'turn-result',
      narration: turn.narration,
      scene_tags: turn.scene_tags || null,
      ui_update: turn.ui_update || null,
      world_clock: newClock,
      pipeline: turn.pipeline || null,
      lint_passed: turn.lint_passed,
      lint_retried: turn.lint_retried,
      critic_passed: turn.critic_passed ?? null,
      critic_retried: turn.critic_retried ?? false,
      beat_profile: turn.beat_profile || 'action',
      is_scene_set: !!turn.is_scene_set,
      beat_types: Array.isArray(turn.beat_types) ? turn.beat_types : []
    });

    // Persist updated doc
    const merged = Y.encodeStateAsUpdate(this.yDoc);
    await this.state.storage.put("yDocState", merged);
  }

  // Phase 10: Whisper pipeline. Same Director → DM → lint flow as flushBatch,
  // but the resulting narration is unicast to the whisperer only (no shared
  // chat push). Codex changes still land on the shared doc — only prose
  // visibility is gated. World clock does NOT advance (a private action is
  // not a table turn).
  async flushWhisperBatch(sessionId) {
    const batch = this.whisperBatches.get(sessionId);
    if (!batch) return;
    const actions = batch.actions.slice();
    batch.actions = [];
    if (actions.length === 0) {
      this.whisperBatches.delete(sessionId);
      return;
    }
    const target = batch.ws;

    const keyEntry = this.keyPool.next();
    if (!keyEntry) {
      const waitMs = Math.max(1000, this.keyPool.earliestThawMs());
      // Re-queue and retry. Keep batch entry alive so timer re-arm sees it.
      batch.actions = actions;
      setTimeout(() => this.flushWhisperBatch(sessionId).catch(() => {}), waitMs + 200);
      this.sendTo(target, {
        type: 'whisper-status',
        message: `The DM mulls it over… ${Math.ceil(waitMs / 1000)}s`
      });
      return;
    }

    const codexObj = this.yDoc.getMap('memoryCodex').toJSON();
    const codexJson = JSON.stringify(codexObj, null, 2);
    const northStar = codexObj.north_star || null;

    const directorResult = await this.callWithFallback(
      buildDirectorRequestBody(buildDirectorPrompt(actions, codexJson, northStar)),
      keyEntry
    );

    let turn;
    if (directorResult.ok) {
      const directorText = extractText(directorResult.data);
      const ruling = parseJsonLoose(directorText);
      if (ruling) {
        // Whisper safety net: derive is_scene_set if missing (matches flushBatch).
        if (ruling.is_scene_set === undefined) {
          ruling.is_scene_set = !!(ruling.codex_writes && ruling.codex_writes.location);
        }
        const lintProfile = deriveLintProfile(ruling);
        const dmResult = await this.callWithFallback(
          buildRequestBody(buildDmPrompt(ruling, codexJson, northStar)),
          keyEntry
        );
        if (dmResult.ok) {
          const dmText = extractText(dmResult.data);
          const dmParsed = parseJsonLoose(dmText) || { narration: dmText };
          let lint = lintProse(dmParsed.narration, lintProfile);
          let finalNarration = dmParsed.narration;
          let retried = false;
          if (!lint.passes) {
            retried = true;
            const retryResult = await this.callWithFallback(
              buildRequestBody(buildDmPrompt(ruling, codexJson, northStar, lint.feedback)),
              keyEntry
            );
            if (retryResult.ok) {
              const retryText = extractText(retryResult.data);
              const retryParsed = parseJsonLoose(retryText) || { narration: retryText };
              const lint2 = lintProse(retryParsed.narration, lintProfile);
              if (lint2.passes || (!lint.passes && retryParsed.narration?.length > finalNarration.length)) {
                finalNarration = retryParsed.narration;
              }
            }
          }
          turn = {
            narration: finalNarration,
            scene_tags: null,        // whisper doesn't change the shared scene
            ui_update: ruling.qte ? { qte: ruling.qte } : null,
            new_codex: ruling.codex_writes || {},
            npc_changes: ruling.npc_changes || null,
            new_npcs: ruling.new_npcs || null,
            faction_changes: ruling.faction_changes || null,
            thread_changes: ruling.thread_changes || null,
            location_changes: ruling.location_changes || null,
            new_locations: ruling.new_locations || null,
            lint_passed: lint.passes,
            lint_retried: retried,
            beat_profile: lintProfile,
            is_scene_set: !!ruling.is_scene_set,
            beat_types: (ruling.rulings || []).map(r => r?.beat_type || 'action'),
            pipeline: 'director-dm'
          };
        }
      }
    }

    if (!turn) {
      const fallbackResult = await this.callWithFallback(
        buildRequestBody(buildBatchPrompt(actions, codexJson, northStar)),
        keyEntry
      );
      if (!fallbackResult.ok) {
        this.sendTo(target, {
          type: 'whisper-error',
          message: 'The DM did not hear you. Try again in a moment.'
        });
        return;
      }
      const fbText = extractText(fallbackResult.data);
      const fbParsed = parseJsonLoose(fbText) || { narration: fbText };
      turn = {
        narration: fbParsed.narration,
        scene_tags: null,
        ui_update: null,
        new_codex: fbParsed.new_codex || {},
        lint_passed: null,
        lint_retried: false,
        pipeline: 'phase0-fallback'
      };
    }

    await this.commitWhisperTurn(turn, target);
  }

  // Apply codex writes from a whispered turn without touching the shared chat
  // log, then unicast the narration to the whisperer.
  async commitWhisperTurn(turn, targetWs) {
    if (!turn?.narration) {
      this.sendTo(targetWs, {
        type: 'whisper-error',
        message: 'The threads blur — try a different approach.'
      });
      return;
    }
    this.yDoc.transact(() => {
      const yCodex = this.yDoc.getMap('memoryCodex');
      const writes = turn.new_codex || {};
      for (const key in writes) {
        if (key === 'party' && typeof writes[key] === 'object') {
          const current = yCodex.get('party') || {};
          const updated = { ...current };
          for (const name in writes.party) {
            updated[name] = { ...(updated[name] || {}), ...writes.party[name] };
          }
          yCodex.set('party', updated);
        } else if (key === 'scene_tags' || key === 'world_clock') {
          // Whispers don't change the shared scene or advance the clock.
        } else if (key === 'npcs' || key === 'factions' || key === 'threads') {
          // Director should use structured writes, not raw overwrites.
        } else {
          yCodex.set(key, writes[key]);
        }
      }
      const npcChanges = turn.npc_changes;
      const newNpcs = turn.new_npcs;
      if (npcChanges || newNpcs) {
        const npcs = { ...(yCodex.get('npcs') || {}) };
        for (const name in (npcChanges || {})) {
          npcs[name] = { ...(npcs[name] || {}), ...npcChanges[name] };
        }
        for (const name in (newNpcs || {})) {
          npcs[name] = { ...(npcs[name] || {}), ...newNpcs[name] };
        }
        yCodex.set('npcs', npcs);
      }
      if (turn.faction_changes) {
        const facs = { ...(yCodex.get('factions') || {}) };
        for (const name in turn.faction_changes) {
          facs[name] = { ...(facs[name] || {}), ...turn.faction_changes[name] };
        }
        yCodex.set('factions', facs);
      }
      if (turn.thread_changes) {
        const threads = (yCodex.get('threads') || []).slice();
        for (const change of turn.thread_changes) {
          if (!change?.id) continue;
          const idx = threads.findIndex(t => t?.id === change.id);
          if (idx >= 0) threads[idx] = { ...threads[idx], ...change };
          else threads.push(change);
        }
        yCodex.set('threads', threads);
      }
      // Phase 45: Travel — same merge path as the main turn. Lets a whisper
      // (e.g. "I scout ahead and listen") discover or update locations.
      if (turn.location_changes || turn.new_locations) {
        const locs = { ...(yCodex.get('locations') || {}) };
        for (const name in (turn.location_changes || {})) {
          locs[name] = { ...(locs[name] || {}), ...turn.location_changes[name] };
        }
        for (const name in (turn.new_locations || {})) {
          locs[name] = { ...(locs[name] || {}), ...turn.new_locations[name] };
        }
        yCodex.set('locations', locs);
      }
    });

    this.sendTo(targetWs, {
      type: 'whisper-result',
      narration: turn.narration,
      ui_update: turn.ui_update || null,
      pipeline: turn.pipeline || null,
      lint_passed: turn.lint_passed,
      lint_retried: turn.lint_retried
    });

    const merged = Y.encodeStateAsUpdate(this.yDoc);
    await this.state.storage.put("yDocState", merged);
  }

  sendTo(ws, msg) {
    if (!ws) return;
    try { ws.send(JSON.stringify(msg)); } catch {}
  }

  broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const sess of this.sessions) {
      try { sess.ws.send(s); } catch {}
    }
  }
}

// Phase 27: slim summary of the Director's ruling for chronicle display.
// Keep payload small and stable — only what a host/curious player would
// want to see to verify what the Director decided (not the full codex writes).
function buildRulingSummary(ruling) {
  if (!ruling || typeof ruling !== 'object') return null;
  try {
    const summary = {};
    if (ruling.verdict) summary.verdict = String(ruling.verdict).slice(0, 240);
    if (ruling.verdicts) summary.verdicts = String(ruling.verdicts).slice(0, 240);
    if (Array.isArray(ruling.consequences)) {
      summary.consequences = ruling.consequences
        .filter(c => typeof c === 'string')
        .slice(0, 6)
        .map(c => c.slice(0, 180));
    }
    if (ruling.qte) summary.qte = true;
    if (ruling.codex_writes && typeof ruling.codex_writes === 'object') {
      summary.codex_write_keys = Object.keys(ruling.codex_writes).slice(0, 12);
    }
    if (ruling.npc_changes) summary.npc_change_keys = Object.keys(ruling.npc_changes).slice(0, 8);
    if (ruling.new_npcs) summary.new_npc_keys = Object.keys(ruling.new_npcs).slice(0, 8);
    if (ruling.faction_changes) summary.faction_change_keys = Object.keys(ruling.faction_changes).slice(0, 6);
    if (ruling.thread_changes) summary.thread_change_ids = ruling.thread_changes.map(t => t?.id).filter(Boolean).slice(0, 6);
    if (ruling.scene_tags_change) summary.scene_tags_change = ruling.scene_tags_change;
    // Beat-type telemetry — frontend reads these to pick the chronicle rendering style.
    summary.is_scene_set = !!ruling.is_scene_set;
    if (Array.isArray(ruling.rulings)) {
      summary.beat_types = ruling.rulings.map(r => r?.beat_type || 'action').slice(0, 6);
      summary.verdicts_by_id = ruling.rulings
        .filter(r => r?.id && r?.verdict)
        .slice(0, 8)
        .map(r => ({ id: String(r.id).slice(0, 32), verdict: String(r.verdict).slice(0, 32), beat_type: r.beat_type || 'action' }));
    }
    return summary;
  } catch {
    return null;
  }
}

