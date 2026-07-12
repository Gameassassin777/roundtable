// UI-only state — modal open/close, mobile sheet visibility, sidebar collapse.
// Lives separate from gameStore (which holds Yjs-backed state) so UI toggles
// don't fire Yjs observations. Svelte 5 runes class pattern.

type ModalId =
    | 'settings'
    | 'northstar'
    | 'weave'
    | 'audit'
    | 'shortcuts'
    | 'map'
    | null;

export class UIStore {
    openModal: ModalId = $state(null);
    codexSheetOpen: boolean = $state(false);   // mobile bottom-sheet for codex
    sidebarPinned: boolean = $state(true);     // desktop right rail visibility

    isModal(): boolean {
        return this.openModal !== null;
    }

    showModal(id: Exclude<ModalId, null>): void {
        this.openModal = id;
    }

    closeModal(): void {
        this.openModal = null;
    }

    toggleCodexSheet(): void {
        this.codexSheetOpen = !this.codexSheetOpen;
    }

    toggleSidebar(): void {
        this.sidebarPinned = !this.sidebarPinned;
    }
}

export const ui = new UIStore();
