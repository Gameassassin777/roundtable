<script lang="ts">
    import { onDestroy } from 'svelte';
    import CinematicDiorama from '$lib/components/CinematicDiorama.svelte';
    import QTE_Overlay from '$lib/components/QTE_Overlay.svelte';
    import { createGameState } from '$lib/stores/gameStore';
    import { callAI } from '$lib/ai/dmEngine';
    import { buildBatchPrompt } from '$lib/ai/promptBuilder';

    let roomId = "crypt-99";
    let { chatStore, addChatEntry, ydoc, provider, yPendingActions, actionLock, reportKeyExhausted } = createGameState(roomId);

    let apiKey = localStorage.getItem('rt_api_key') || '';
    let isReady = !!apiKey;
    let chatInput = '';
    let isLoading = false;
    let showQTE = false;
    let qteConfig = { time_limit_ms: 1000, start_time: 0 };
    let currentSceneTags = { biome: "crypt", weather: "none", mood: "oppressive" };

    // Watch Codex for AI-driven scene changes
    const yCodex = ydoc.getMap('memoryCodex');
    yCodex.observe(() => {
        const codex = yCodex.toJSON();
        if (codex?.scene_tags) currentSceneTags = codex.scene_tags;
    });

    function saveKey() {
        if (apiKey) { localStorage.setItem('rt_api_key', apiKey); isReady = true; }
    }

    async function submitAction() {
        if (!chatInput.trim() || isLoading) return;
        const userAction = chatInput.trim();
        yPendingActions.push([{ text: userAction }]);
        chatInput = '';
        isLoading = true;

        let isProcessor = false;
        ydoc.transact(() => {
            if (!actionLock.get('locked')) {
                actionLock.set('locked', true);
                actionLock.set('processor', ydoc.clientID);
                isProcessor = true;
            }
        });

        if (isProcessor) {
            await new Promise(r => setTimeout(r, 5000)); // 5s batch window
            const actionsToProcess = yPendingActions.toArray();
            yPendingActions.delete(0, yPendingActions.length);
            
            const prompt = buildBatchPrompt(actionsToProcess, ydoc);
            try {
                const response = await callAI(prompt, apiKey, ydoc, ydoc.clientID);
                addChatEntry({ author: 'DM', text: response.narration, type: 'dm' });
                
                if (response.ui_update?.qte) {
                    qteConfig = { ...response.ui_update.qte, start_time: Date.now() + 1500 };
                    showQTE = true;
                }
            } catch (e) {
                addChatEntry({ author: 'System', text: 'Action failed. API Key exhausted or network error.', type: 'dm' });
            }
            
            actionLock.set('locked', false);
            actionLock.set('processor', null);
            isLoading = false;
        }
    }

    function handleQTEResult(event: CustomEvent) {
        showQTE = false;
        const success = event.detail.success;
        addChatEntry({ author: 'DM', text: success ? "You dive to the side, barely avoiding the trap." : "The trap strikes you. You take damage.", type: 'dm' });
        if (navigator.vibrate) navigator.vibrate(success ? [50, 50, 50] : 500);
    }

    onDestroy(() => provider.destroy());
</script>

<main>
    <CinematicDiorama sceneTags={currentSceneTags} />

    <div class="ui-layer">
        <header>
            <h1>Round Table</h1>
            <span class="room-id">ROOM: {roomId}</span>
        </header>

        {#if !isReady}
            <div class="panel join-panel">
                <h2>Enter the Grimdark</h2>
                <p>Save your Google AI Studio API key locally. It never leaves your device.</p>
                <input type="password" bind:value={apiKey} placeholder="AIza..." />
                <button on:click={saveKey}>SAVE & ENTER</button>
            </div>
        {:else}
            <div class="panel chat-log">
                {#each $chatStore as entry}
                    <div class="chat-entry {entry.type}">
                        <span class="author">{entry.author}:</span>
                        <p>{entry.text}</p>
                    </div>
                {/each}
            </div>

            <div class="actions">
                <input type="text" bind:value={chatInput} on:keydown={(e) => e.key === 'Enter' && submitAction()} placeholder={isLoading ? 'Resolving...' : 'What do you do?'} disabled={isLoading} />
                <button on:click={submitAction} disabled={isLoading}>{isLoading ? '...' : 'ACT'}</button>
            </div>
        {/if}
    </div>

    {#if showQTE}
        <QTE_Overlay timeLimit={qteConfig.time_limit_ms} startTime={qteConfig.start_time} on:result={handleQTEResult} />
    {/if}
</main>

<style>
    main { width: 100vw; height: 100vh; position: relative; }
    .ui-layer { position: absolute; inset: 0; z-index: 10; display: flex; flex-direction: column; justify-content: space-between; padding: 2rem; padding-bottom: 3rem; background: linear-gradient(to bottom, rgba(0,0,0,0.6), transparent 25%, transparent 75%, rgba(0,0,0,0.9)); pointer-events: none; }
    header { display: flex; justify-content: space-between; align-items: center; pointer-events: auto; }
    h1 { color: var(--blood-red); text-shadow: 0 0 20px var(--blood-red-glow); font-family: var(--font-serif); font-size: 1.5rem; letter-spacing: 3px; }
    .room-id { font-size: 0.75rem; opacity: 0.6; border: 1px solid #333; padding: 0.3rem 0.8rem; border-radius: 6px; font-family: monospace; background: rgba(0,0,0,0.5); }
    .join-panel { width: 100%; max-width: 420px; margin: auto; padding: 2.5rem; text-align: center; pointer-events: auto; }
    .join-panel h2 { font-family: var(--font-serif); font-size: 2rem; margin-bottom: 0.5rem; color: #fff; }
    .subtitle { font-size: 0.9rem; opacity: 0.7; margin-bottom: 2rem; }
    .chat-log { flex-grow: 1; margin-bottom: 1rem; overflow-y: auto; max-height: 60vh; padding: 1.5rem; pointer-events: auto; }
    .chat-entry { margin-bottom: 1rem; }
    .chat-entry.dm { color: #ccc; font-family: serif; border-left: 2px solid var(--blood-red); padding-left: 1rem; }
    .chat-entry.player { color: #fff; text-align: right; }
    .chat-entry .author { font-size: 0.8rem; opacity: 0.6; text-transform: uppercase; }
    .actions { display: flex; gap: 10px; pointer-events: auto; }
    .actions input { margin-bottom: 0; flex-grow: 1; }
    .actions button { width: auto; padding: 0 2rem; }
</style>