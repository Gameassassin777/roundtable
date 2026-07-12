export type ChatEntry = {
    author: string;
    text: string;
    type: 'player' | 'dm' | 'world' | 'whisper';
    timestamp?: number;
    audit?: any;
    ruling_summary?: any;
    beat_profile?: 'scene_set' | 'action' | 'social' | 'world_ambient';
    is_scene_set?: boolean;
    beat_types?: string[];
};
