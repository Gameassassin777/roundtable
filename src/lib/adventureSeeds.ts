// Phase 7: Adventure seed library — curated, internally coherent premises
// the host can apply with one click from the North Star modal. Each seed is
// short, open-ended, and points at NPCs/factions/threads the World Engine
// can advance. They exist to lower the cold-start barrier for hosts who
// don't want to write a premise from scratch.

export type AdventureSeed = {
    id: string;
    title: string;
    tone: string;
    premise: string;
    opening_hook: string;
    starting_location?: string;
    starting_scene_tags?: { biome: string; weather: string; mood: string };
};

export const ADVENTURE_SEEDS: AdventureSeed[] = [
    {
        id: 'borderland-festival',
        title: 'The Festival at Edgemark',
        tone: 'Heroic',
        premise:
            'The borderland town of Edgemark holds its annual harvest festival three days before the first frost. Three rival factions — the merchant council, the garrison, and the old forestwardens — have all asked the party for help with a different problem that will come to a head on festival night.',
        opening_hook:
            'The party arrives at Edgemark the morning before the festival. The innkeeper has heard all three requests and will not say which is most urgent.',
        starting_location: 'the market square at Edgemark, morning of the festival',
        starting_scene_tags: { biome: 'market town', weather: 'crisp autumn', mood: 'festive but watchful' },
    },
    {
        id: 'returning-tide',
        title: 'The Returning Tide',
        tone: 'Mythic',
        premise:
            'Once a generation the sea retreats past the old harbor breakwater for a single tide, exposing a flooded district that drowned two centuries ago. Locals call it the Quiet City. Something underneath has been waiting for the next returning tide to wake.',
        opening_hook:
            'The party stands on the breakwater as the water finishes pulling back. The drowned bell tower is visible for the first time in twenty years, and something is ringing it.',
        starting_location: 'the old breakwater at low tide',
        starting_scene_tags: { biome: 'drowned coast', weather: 'salt mist', mood: 'reverent dread' },
    },
    {
        id: 'road-without-end',
        title: 'The Road Without End',
        tone: 'Picaresque',
        premise:
            'A weeks-long trade convoy through contested grassland. The party has been hired as guards for a merchant whose competitors would rather see the cargo scattered than delivered. The road itself has a bad reputation: waystations vanish, guides go missing, and the cargo is not what the merchant claimed.',
        opening_hook:
            'The party is three days out from the last waystation. The cargo wagon\'s axle has started making a sound that is not mechanical.',
        starting_location: 'the trade road, three days from civilization',
        starting_scene_tags: { biome: 'open grassland', weather: 'hot and still', mood: 'weary' },
    },
    {
        id: 'glasswork',
        title: 'The Glasswork',
        tone: 'Grim',
        premise:
            'The old Glasswork district was sealed after the factory fire seventy years ago. The new owner has bought the deeds, hired the party to clear whatever is inside before demolition, and quietly emphasized that no one is to ask about the basement level.',
        opening_hook:
            'The demolition crew unlocked the gates at dawn and refused to step inside. The party is now alone in the courtyard, watching the sun move across the cracked glass facade.',
        starting_location: 'the Glasswork courtyard, mid-morning',
        starting_scene_tags: { biome: 'ruined industrial', weather: 'overcast', mood: 'sour ash' },
    },
    {
        id: 'errant-pilgrimage',
        title: 'The Errant Pilgrimage',
        tone: 'Mythic',
        premise:
            'A pilgrimage of forty faithful is walking to a shrine that may or may not exist. The party has been hired by the pilgrim-master as outriders. The pilgrims are not in danger from bandits or weather; they are in danger from something that has been walking alongside them since the second day and is now inside the column.',
        opening_hook:
            'The pilgrimage has stopped for the noon meal. The pilgrim-master has asked the party to count heads. The number is wrong.',
        starting_location: 'the pilgrimage camp at noon',
        starting_scene_tags: { biome: 'dusty road', weather: 'bright sun', mood: 'quiet devotion' },
    },
    {
        id: 'cartographer-commission',
        title: 'The Cartographer\'s Commission',
        tone: 'Bright',
        premise:
            'A society cartographer has hired the party to escort her into a region the maps label simply "inferred." She is delighted by everything they encounter, takes extensive notes, and is much less concerned about the party\'s safety than about getting her samples back to the society intact.',
        opening_hook:
            'The cartographer has spotted something on the far ridge that is not on any of her references. She is already unpacking her sketchbook.',
        starting_location: 'an unmapped ridge at midday',
        starting_scene_tags: { biome: 'rolling upland', weather: 'high clouds', mood: 'curious' },
    },
];
