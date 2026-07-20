<script lang="ts">
    import { version } from '$app/environment';
    import { playHover, playClick } from '$lib/audio/ambient';
    import * as sfx from '$lib/audio/sfx';
    import Icon from '$lib/components/Icon.svelte';

    type SavedSlot = {
        name: string;
        archetype: string;
        class_title: string;
        portrait_url: string;
        saved_at: number;
    };

    type Props = {
        roomId: string;
        apiKey: string;
        keySharePolicy: 'table' | 'solo' | 'host';
        audioMuted: boolean;
        audioVolume: number;
        characterName: string;
        savedCharacters: SavedSlot[];
        recentWorlds: string[];
        hasChronicle: boolean;
        northStarPremise: string;
        onRoomIdChange: (v: string) => void;
        onApiKeyChange: (v: string) => void;
        onPolicyChange: (v: 'table' | 'solo' | 'host') => void;
        onAudioChange: (muted: boolean, volume: number) => void;
        onSwitchRoom: () => void;
        onNewWorld: () => void;
        onJoinWorld: (code: string) => void;
        onSaveCurrentCharacter: () => void;
        onDeleteSavedCharacter: (name: string) => void;
        onExportWeave: () => void;
        onOpenReader: () => void;
        onOpenNorthStar: () => void;
        onSaveSettings: () => void;
    };

    let {
        roomId, apiKey, keySharePolicy, audioMuted, audioVolume,
        characterName, savedCharacters, recentWorlds, hasChronicle, northStarPremise,
        onRoomIdChange, onApiKeyChange, onPolicyChange, onAudioChange,
        onSwitchRoom, onNewWorld, onJoinWorld,
        onSaveCurrentCharacter, onDeleteSavedCharacter,
        onExportWeave, onOpenReader, onOpenNorthStar, onSaveSettings,
    }: Props = $props();

    const POLICIES: Array<['table' | 'solo' | 'host', string, string]> = [
        ['table', 'Table', 'Pool with the table — round-robins across all contributed keys.'],
        ['solo', 'Solo', 'Only used for your own turns. Never pooled.'],
        ['host', 'Host', 'Pooled, but only the host contributes.']
    ];

    // One-tap invite: mobile text selection in a user-select:none app is
    // fiddly; the clipboard API is one tap. Label flips as confirmation.
    let copied = $state(false);
    function copyInvite() {
        const code = roomId?.trim();
        if (!code) return;
        try {
            navigator.clipboard?.writeText(code);
        } catch { /* clipboard unavailable (insecure context) — the input still shows the code */ }
        copied = true;
        setTimeout(() => { copied = false; }, 1400);
    }

    function toggleMute(e: Event) {
        const checked = (e.currentTarget as HTMLInputElement).checked;
        const next = !checked;
        onAudioChange(next, audioVolume);
        playClick();
        if (!next) sfx.play('turn-result');
    }
    function changeVolume(e: Event) {
        const v = parseFloat((e.currentTarget as HTMLInputElement).value);
        onAudioChange(audioMuted, v);
        // The slider fires `input` continuously while dragging — chime at most
        // a few times a second, not sixty.
        const t = Date.now();
        if (t - lastVolChime > 350) { lastVolChime = t; sfx.play('turn-result'); }
    }
    let lastVolChime = 0;

    let forceRefreshing = $state(false);
    async function forceRefresh() {
        if (forceRefreshing) return;
        forceRefreshing = true;
        playClick();
        try {
            if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
            }
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
            }
        } catch { /* noop */ }
        location.reload();
    }
</script>

<div class="settings-layout">
    <!-- SECTION 1: SOUND & ATMOSPHERE -->
    <fieldset class="setting-section">
        <legend class="section-legend eyebrow">Sound & Atmosphere</legend>
        
        <div class="field toggle-field">
            <span class="field-label">Ambient Audio</span>
            <label class="switch-row" title="Toggle game audio on or off">
                <input type="checkbox" checked={!audioMuted} onchange={toggleMute} />
                <span class="slider-switch"></span>
                <span class="switch-status">{audioMuted ? 'Muted' : 'Sound on'}</span>
            </label>
        </div>

        {#if !audioMuted}
            <div class="field">
                <label class="volume-row">
                    <span class="field-label">Master Volume</span>
                    <div class="slider-wrap">
                        <span class="volume-glyph" aria-hidden="true">Off</span>
                        <input type="range" min="0" max="1" step="0.05" value={audioVolume} oninput={changeVolume} aria-label="Volume slider" />
                        <span class="volume-glyph" aria-hidden="true">Max</span>
                    </div>
                </label>
            </div>
        {/if}
    </fieldset>

    <!-- SECTION 2: COGNITIVE REALMS -->
    <fieldset class="setting-section">
        <legend class="section-legend eyebrow">Aether Connection</legend>
        
        <div class="field">
            <span class="field-label">Table Realm Code</span>
            <div class="row">
                <input
                    type="text"
                    value={roomId}
                    oninput={(e) => onRoomIdChange((e.currentTarget as HTMLInputElement).value)}
                    placeholder="realm code"
                    aria-label="Table code"
                />
                <button
                    class="btn-ghost copy-btn"
                    onclick={() => { playClick(); copyInvite(); }}
                    onmouseenter={() => playHover()}
                    aria-label="Copy invite code"
                    title="Copy invite code"
                >
                    {#if copied}Copied{:else}<Icon name="copy" size={14} />{/if}
                </button>
                <button class="btn-ghost" onclick={() => { playClick(); onSwitchRoom(); }} onmouseenter={() => playHover()}>Join</button>
            </div>
            <span class="field-help">Share this code so friends join your world in real time.</span>
        </div>

        <button class="btn-ghost wide text-center" onclick={() => { playClick(); onNewWorld(); }} onmouseenter={() => playHover()}>
            Create New World
        </button>

        {#if recentWorlds.length > 0}
            <div class="field">
                <span class="field-label-sub">Recent Realms</span>
                <div class="recent-worlds">
                    {#each recentWorlds as w}
                        <button 
                            class="chip {w === roomId ? 'current' : ''}" 
                            onclick={() => { playClick(); onJoinWorld(w); }}
                            onmouseenter={() => playHover()}
                        >
                            {w}
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
    </fieldset>

    <!-- SECTION 3: API KEY ATTUNEMENT -->
    <fieldset class="setting-section">
        <legend class="section-legend eyebrow">Gemini Key & Sharing</legend>
        
        <label class="field">
            <span class="field-label">Google AI Studio key</span>
            <input 
                type="password" 
                value={apiKey} 
                oninput={(e) => onApiKeyChange((e.currentTarget as HTMLInputElement).value)} 
                placeholder="AIza…" 
            />
            <span class="field-help">Stored locally in your browser. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a free key →</a></span>
        </label>

        <div class="field">
            <span class="field-label">Key Sharing Rules</span>
            <div class="share-policy-row">
                {#each POLICIES as [val, label, title]}
                    <button 
                        type="button" 
                        class="chip" 
                        class:selected={keySharePolicy === val} 
                        onclick={() => { playClick(); onPolicyChange(val); }} 
                        onmouseenter={() => playHover()}
                        {title}
                    >
                        {label}
                    </button>
                {/each}
            </div>
        </div>
    </fieldset>

    <!-- SECTION 4: HERO ROSTER -->
    <fieldset class="setting-section">
        <legend class="section-legend eyebrow">Character & Roster</legend>
        
        <button class="btn-ghost wide text-center" onclick={() => { playClick(); onSaveCurrentCharacter(); }} onmouseenter={() => playHover()}>
            Save "{characterName}" to Roster
        </button>

        {#if savedCharacters.length > 0}
            <div class="saved-roster">
                {#each savedCharacters as slot}
                    <div class="saved-slot" class:is-current={slot.name === characterName}>
                        <div class="saved-info">
                            <span class="saved-name">{slot.name}</span>
                            <span class="saved-class muted">{slot.class_title}</span>
                        </div>
                        <button
                            type="button"
                            class="saved-delete"
                            onclick={() => { playClick(); onDeleteSavedCharacter(slot.name); }}
                            onmouseenter={() => playHover()}
                            aria-label="Remove from roster"
                            title="Remove"
                        >
                            <Icon name="close" size={12} />
                        </button>
                    </div>
                {/each}
            </div>
        {/if}
    </fieldset>

    <!-- SECTION 5: SCROLLS & ARCHIVES -->
    <fieldset class="setting-section">
        <legend class="section-legend eyebrow">Archives & Premise</legend>
        
        <div class="field">
            <span class="field-label">World Premise (North Star)</span>
            <button class="btn-ghost wide" onclick={() => { playClick(); onOpenNorthStar(); }} onmouseenter={() => playHover()}>
                {northStarPremise ? 'Edit North Star Settings' : 'Set North Star Premise'}
            </button>
            <span class="field-help">{northStarPremise ? 'Active Premise is set — DM and World Engine will honor it.' : 'Define the world\'s premise, tone, and opening hook.'}</span>
        </div>

        <div class="field">
            <span class="field-label">Export / Import Weave</span>
            <div class="row">
                <button class="btn-ghost wide" onclick={() => { playClick(); onExportWeave(); }} onmouseenter={() => hasChronicle && playHover()} disabled={!hasChronicle}>Download .weave</button>
                <button class="btn-ghost wide" onclick={() => { playClick(); onOpenReader(); }} onmouseenter={() => playHover()}>Read .weave</button>
            </div>
        </div>
    </fieldset>

    <!-- SAVE & ACTION SECTION -->
    <div class="action-footer">
        <button class="btn-primary wide save-btn" onclick={() => { playClick(); onSaveSettings(); }} onmouseenter={() => playHover()}>
            Save Options
        </button>
    </div>

    <!-- TROUBLESHOOTING & FOOTER -->
    <fieldset class="setting-section troubleshoot">
        <legend class="section-legend eyebrow">Maintenance</legend>
        <div class="field">
            <button class="btn-ghost wide text-center warning-btn" onclick={forceRefresh} disabled={forceRefreshing} onmouseenter={() => playHover()}>
                {forceRefreshing ? 'Clearing Cache…' : 'Force Refresh (Clear Cache)'}
            </button>
            <span class="field-help">Unregisters stuck service workers and clears build cache. Does not affect game saves.</span>
        </div>
    </fieldset>

    <div class="build-info muted" aria-label="Build version">
        <span class="build-label">Build Version</span>
        <span class="build-version">v{version}</span>
    </div>
</div>

<style>
    .settings-layout {
        display: flex;
        flex-direction: column;
        gap: 1.1rem;
        padding: 0.2rem 0;
    }

    .setting-section {
        border: 1px solid var(--line-soft);
        border-radius: var(--radius);
        background: rgba(252, 248, 237, 0.35);
        padding: 0.9rem 1rem 1rem;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
    }

    .setting-section.troubleshoot {
        background: rgba(160, 70, 64, 0.02);
        border-color: rgba(160, 70, 64, 0.15);
    }

    .section-legend {
        padding: 0 0.4rem;
        font-size: 10px !important;
        letter-spacing: 0.18em;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }

    .field-label {
        font-family: var(--font-display);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--gold);
    }

    .field-label-sub {
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-xs);
        color: var(--ink-soft);
    }

    .field-help {
        font-size: var(--t-xs);
        color: var(--ink-soft);
        line-height: 1.5;
        font-family: var(--font-prose);
        font-style: italic;
    }
    .field-help a {
        color: var(--accent);
        text-decoration: underline;
    }

    .row {
        display: flex;
        gap: 0.4rem;
    }
    .row input { flex: 1; }
    .row .btn-ghost { min-height: 44px; }
    .copy-btn { min-width: 52px; display: inline-flex; align-items: center; justify-content: center; font-size: var(--t-xs); }

    .btn-ghost.wide {
        min-height: 44px;
        text-align: left;
        padding: 0.55rem 0.85rem;
    }
    .text-center {
        text-align: center !important;
    }

    .share-policy-row, .recent-worlds {
        display: flex;
        gap: 0.35rem;
        flex-wrap: wrap;
    }
    .share-policy-row .chip {
        min-height: 36px;
        display: inline-flex;
        align-items: center;
        cursor: pointer;
    }
    
    .chip.current {
        background: var(--gold-soft);
        border-color: var(--gold);
        color: var(--gold);
    }
    .chip.selected {
        background: var(--accent);
        color: #fdf6ec;
        border-color: var(--accent);
    }

    /* CUSTOM TOGGLE SWITCH */
    .toggle-field {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        min-height: 44px;
    }
    .switch-row {
        display: inline-flex;
        align-items: center;
        gap: 0.65rem;
        cursor: pointer;
        position: relative;
    }
    .switch-row input {
        position: absolute;
        opacity: 0;
        width: 0; height: 0;
    }
    .slider-switch {
        width: 44px;
        height: 22px;
        background-color: var(--line);
        border-radius: 22px;
        position: relative;
        transition: background-color 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
        box-shadow: inset 0 1px 3px rgba(60, 40, 20, 0.08);
    }
    .slider-switch::after {
        content: '';
        position: absolute;
        width: 18px;
        height: 18px;
        left: 2px;
        bottom: 2px;
        background-color: var(--card);
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(60, 40, 20, 0.2);
        transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .switch-row input:checked + .slider-switch {
        background-color: var(--gold);
    }
    .switch-row input:checked + .slider-switch::after {
        transform: translateX(22px);
    }
    .switch-status {
        font-family: var(--font-prose);
        font-style: italic;
        font-size: var(--t-sm);
        color: var(--ink-soft);
    }

    /* CUSTOM VOLUME SLIDER */
    .volume-row {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: 100%;
    }
    .slider-wrap {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        width: 100%;
        min-height: 44px;
    }
    .volume-glyph {
        font-size: 0.9rem;
        opacity: 0.7;
    }
    input[type="range"] {
        -webkit-appearance: none;
        appearance: none;
        flex: 1;
        height: 6px;
        background: var(--line-soft);
        border-radius: 99px;
        outline: none;
        box-shadow: inset 0 1px 2px rgba(60, 40, 20, 0.05);
    }
    input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--gold);
        border: 1px solid var(--accent-deep);
        box-shadow: 0 1px 3px rgba(60, 40, 20, 0.2);
        cursor: pointer;
        transition: transform 0.18s ease, background-color 0.18s ease;
    }
    input[type="range"]::-webkit-slider-thumb:hover {
        transform: scale(1.15);
        background: var(--accent);
    }
    input[type="range"]::-moz-range-thumb {
        width: 18px;
        height: 18px;
        border: 1px solid var(--accent-deep);
        border-radius: 50%;
        background: var(--gold);
        box-shadow: 0 1px 3px rgba(60, 40, 20, 0.2);
        cursor: pointer;
        transition: transform 0.18s ease, background-color 0.18s ease;
    }
    input[type="range"]::-moz-range-thumb:hover {
        transform: scale(1.15);
        background: var(--accent);
    }

    /* ROSTER SLOTS */
    .saved-roster {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }
    .saved-slot {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 0.7rem;
        background: var(--inset);
        border: 1px solid var(--line-soft);
        border-radius: var(--radius-sm);
        min-height: 44px;
        transition: border-color 0.2s ease;
    }
    .saved-slot.is-current {
        border-left: 3px solid var(--gold);
        background: rgba(169, 126, 60, 0.03);
    }
    .saved-info {
        display: flex;
        flex-direction: column;
    }
    .saved-name {
        color: var(--ink);
        font-weight: 600;
        font-family: var(--font-ui);
        font-size: var(--t-sm);
    }
    .saved-class {
        font-size: var(--t-xs);
        color: var(--muted);
        font-family: var(--font-prose);
        font-style: italic;
    }
    .saved-delete {
        background: transparent;
        border: none;
        color: var(--muted);
        cursor: pointer;
        font-size: var(--t-sm);
        width: 36px;
        height: 36px;
        min-height: 36px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: color 0.18s ease, transform 0.18s ease;
    }
    .saved-delete:hover {
        color: var(--hp);
        transform: scale(1.12);
    }

    /* FOOTER */
    .action-footer {
        margin-top: 0.4rem;
    }
    .save-btn {
        min-height: 48px;
        font-size: var(--t-sm) !important;
    }
    .warning-btn:hover {
        color: var(--hp) !important;
        border-color: var(--hp) !important;
    }

    .build-info {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-top: 0.5rem;
        padding-top: 0.7rem;
        border-top: 1px solid var(--gold-soft);
        font-size: var(--t-xs);
    }
    .build-label {
        font-family: var(--font-display);
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--muted);
    }
    .build-version {
        font-family: var(--font-ui);
        color: var(--gold);
        font-variant-numeric: tabular-nums;
    }
</style>
