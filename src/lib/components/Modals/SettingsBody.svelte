<script lang="ts">
    import { version } from '$app/environment';
    import * as sfx from '$lib/audio/sfx';

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
        onExportWeave, onOpenReader, onOpenNorthStar, onSaveSettings
    }: Props = $props();

    const POLICIES: Array<['table' | 'solo' | 'host', string, string]> = [
        ['table', 'Table', 'Pool with the table — round-robins across all contributed keys.'],
        ['solo', 'Solo', 'Only used for your own turns. Never pooled.'],
        ['host', 'Host', 'Pooled, but only the host contributes.']
    ];

    function toggleMute(e: Event) {
        const checked = (e.currentTarget as HTMLInputElement).checked;
        const next = !checked;
        onAudioChange(next, audioVolume);
        if (!next) sfx.play('turn-result');
    }
    function changeVolume(e: Event) {
        const v = parseFloat((e.currentTarget as HTMLInputElement).value);
        onAudioChange(audioMuted, v);
        sfx.play('turn-result');
    }
</script>

<div class="settings-grid">
    <div class="field">
        <span class="field-label">World</span>
        <div class="row">
            <input type="text" value={roomId} oninput={(e) => onRoomIdChange((e.currentTarget as HTMLInputElement).value)} placeholder="realm code" />
            <button class="btn-ghost" onclick={onSwitchRoom}>Join</button>
        </div>
        <span class="field-help">Share this code so friends join your world in real time.</span>
        <button class="btn-ghost wide" onclick={onNewWorld}>+ New World</button>
        {#if recentWorlds.length > 0}
            <div class="recent-worlds">
                {#each recentWorlds as w}
                    <button class="chip {w === roomId ? 'current' : ''}" onclick={() => onJoinWorld(w)}>{w}</button>
                {/each}
            </div>
        {/if}
    </div>

    <label class="field">
        <span class="field-label">Google AI Studio key</span>
        <input type="password" value={apiKey} oninput={(e) => onApiKeyChange((e.currentTarget as HTMLInputElement).value)} placeholder="AIza…" />
        <span class="field-help">Stored only in this browser.</span>
    </label>

    <div class="field">
        <span class="field-label">Key sharing</span>
        <div class="share-policy-row">
            {#each POLICIES as [val, label, title]}
                <button type="button" class="chip" class:selected={keySharePolicy === val} onclick={() => onPolicyChange(val)} {title}>{label}</button>
            {/each}
        </div>
    </div>

    <div class="field">
        <span class="field-label">Sound</span>
        <label class="toggle-row">
            <input type="checkbox" checked={!audioMuted} onchange={toggleMute} />
            <span>{audioMuted ? 'Muted' : 'Sound on'}</span>
        </label>
        {#if !audioMuted}
            <label class="volume-row">
                <span class="volume-label">Volume</span>
                <input type="range" min="0" max="1" step="0.05" value={audioVolume} onchange={changeVolume} />
            </label>
        {/if}
    </div>

    <div class="field">
        <span class="field-label">Character</span>
        <button class="btn-ghost wide" onclick={onSaveCurrentCharacter}>Save "{characterName}" to roster</button>
        {#if savedCharacters.length > 0}
            <div class="saved-roster">
                {#each savedCharacters as slot}
                    <div class="saved-slot" class:is-current={slot.name === characterName}>
                        <span class="saved-name">{slot.name}</span>
                        <span class="saved-class muted">{slot.class_title}</span>
                        <button type="button" class="saved-delete" onclick={() => onDeleteSavedCharacter(slot.name)} aria-label="Remove" title="Remove">✕</button>
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <div class="field">
        <span class="field-label">Export</span>
        <button class="btn-ghost wide" onclick={onExportWeave} disabled={!hasChronicle}>Download .weave</button>
        <button class="btn-ghost wide" onclick={onOpenReader}>Read a .weave file</button>
    </div>

    <div class="field">
        <span class="field-label">World premise</span>
        <button class="btn-ghost wide" onclick={onOpenNorthStar}>
            {northStarPremise ? 'Edit North Star' : 'Set North Star'}
        </button>
        <span class="field-help">{northStarPremise ? 'Premise is set — Director, DM, and World Engine all honor it.' : 'Define the world\'s premise, tone, and opening hook.'}</span>
    </div>

    <button class="btn-primary wide" onclick={onSaveSettings}>Save</button>

    <div class="build-info muted" aria-label="Build version">
        <span class="build-label">Build</span>
        <span class="build-version">{version}</span>
    </div>
</div>

<style>
    .settings-grid {
        display: flex;
        flex-direction: column;
        gap: 0.95rem;
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
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--gold);
    }
    .field-help {
        font-size: var(--t-xs);
        color: var(--ink-soft);
        line-height: 1.5;
        font-family: var(--font-prose);
        font-style: italic;
    }
    .row {
        display: flex;
        gap: 0.4rem;
    }
    .row input { flex: 1; }
    .row .btn-ghost { min-height: 44px; }

    .btn-ghost.wide {
        min-height: 44px;
        text-align: left;
        padding: 0.55rem 0.85rem;
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
    .toggle-row {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        font-size: var(--t-sm);
        min-height: 44px;
        cursor: pointer;
    }
    .volume-row {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        font-size: var(--t-sm);
        margin-top: 0.35rem;
        min-height: 44px;
    }
    .volume-label {
        color: var(--muted);
        font-family: var(--font-prose);
        font-style: italic;
    }

    .saved-roster {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        margin-top: 0.45rem;
    }
    .saved-slot {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 0.6rem;
        align-items: center;
        padding: 0.4rem 0.55rem;
        background: var(--inset);
        border-radius: var(--radius-sm);
        font-size: var(--t-sm);
        min-height: 44px;
    }
    .saved-slot.is-current {
        border-left: 2px solid var(--gold);
    }
    .saved-name {
        color: var(--ink);
        font-weight: 500;
        font-family: var(--font-ui);
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
        width: 44px;
        height: 44px;
        min-height: 44px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: color 0.18s ease, transform 0.18s ease;
    }
    .saved-delete:hover {
        color: var(--hp);
        transform: scale(1.08);
    }

    .build-info {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-top: 0.6rem;
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
