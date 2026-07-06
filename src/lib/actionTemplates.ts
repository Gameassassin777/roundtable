// Phase 11: Action templates — a small palette of common adventurous verbs
// the player can tap to pre-fill the action field. Purely a UX shortcut to
// lower the cold-start friction; no AI hint, no semantic change. Each verb
// produces a short sentence-stem the player completes.
//
// Tapping a template drops the stem into the input and focuses the field,
// with the cursor positioned at the end. The player still has to commit
// with Enter / the Act button — no behavior change beyond the seed text.

export type ActionTemplate = {
    id: string;
    label: string;
    stem: string;       // text dropped into the field — ends with a space
    cursor_at_end: boolean;
};

export const ACTION_TEMPLATES: ActionTemplate[] = [
    { id: 'examine', label: 'Examine',  stem: 'Examine ',  cursor_at_end: true },
    { id: 'listen',  label: 'Listen',   stem: 'Listen for ', cursor_at_end: true },
    { id: 'approach', label: 'Approach', stem: 'Approach ', cursor_at_end: true },
    { id: 'retreat', label: 'Retreat',  stem: 'Pull back toward ', cursor_at_end: true },
    { id: 'ask',     label: 'Ask',      stem: 'Ask ',      cursor_at_end: true },
    { id: 'persuade', label: 'Persuade', stem: 'Persuade ', cursor_at_end: true },
    { id: 'search',  label: 'Search',   stem: 'Search ',   cursor_at_end: true },
    { id: 'hide',    label: 'Hide',     stem: 'Hide ',     cursor_at_end: true },
    { id: 'use',     label: 'Use',      stem: 'Use ',      cursor_at_end: true }
];
