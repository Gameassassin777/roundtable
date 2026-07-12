# Roundtable File Map & Architecture

This document provides a map of the `gameassassin777/roundtable` codebase to help navigate its architecture.

## Overview
Roundtable is a multiplayer SvelteKit application focusing on real-time collaborative roleplaying and worldbuilding. It uses Yjs for real-time state synchronization via WebRTC/IndexedDB and integrates AI components for dynamic character and scene generation.

## File Map

### `/src` - Frontend Application
The core of the SvelteKit application lives here.

- `app.html` / `app.css`: The root HTML template and global styles.
- `routes/+page.svelte`: The primary application interface. This massive file (~6,000 lines) contains the chat chronicle, codex sidebar, action inputs, and Yjs data-binding logic.

### `/src/lib` - Core Logic and Components
- `stores/gameStore.ts`: Initializes the Yjs document, manages the `y-webrtc` provider, and exposes Svelte stores for chat logs, active peers, and the World Engine state.
- `ai/`: Contains AI integration logic (e.g., Soul Forge).
  - `soulForge.ts`: Handles AI generation of character traits and backstories.
  - `promptBuilder.ts`: Constructs prompts for the AI DM based on the live codex.
  - `dmEngine.ts`: The core "World Engine" that orchestrates AI responses.
- `audio/sfx.ts`: Manages sound effects via Web Audio API.
- `adventureSeeds.ts`: Pre-defined starting scenarios for the host to choose from.
- `actionTemplates.ts`: Quick-action templates for players.
- `components/`: UI Components (currently contains `CinematicDiorama.svelte` for 3D backgrounds and `QTE_Overlay.svelte` for quick-time events).

### `/server` - Backend Infrastructure (Cloudflare Workers)
- Handles authoritative tasks, AI API proxying, or durable object state synchronization (if used beyond WebRTC).

### `/static` - Static Assets
- Publicly served assets (images, audio files, icons).

## Key Systems
1. **State Synchronization**: Driven by Yjs (`ydoc.getMap('memoryCodex')`). Changes made by any client (like the host or the DM Engine) immediately propagate to all peers.
2. **The Codex**: The central source of truth for the game world. Contains factions, NPCs, threads, the party roster, and location data.
3. **The World Engine**: An AI-driven system that observes the Codex and Chat Chronicle to generate narrative beats, update NPC dispositions, and advance active threads.
