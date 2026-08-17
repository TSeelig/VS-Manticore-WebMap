/*
 * Static configuration: icon paths, legend colors, per-item visibility state,
 * feature flags derived from settings.js, and the routing constants shared by
 * the route planner / trader finder / TL proximity filter.
 */

export const dataFolder = 'data';

// Path for all the icons, layers with multiple icons use a dict
export const icons = {
    'Traders': 'assets/icons/waypoints/trader.svg',
    'Translocators': 'assets/icons/waypoints/spiral.svg',
    'Landmarks': {
        'Base': 'assets/icons/waypoints/home.svg',
        'Misc': 'assets/icons/waypoints/star1.svg',
        'Server': 'assets/icons/temporal_gear.png'
    },
    'Explored Chunks': 'assets/icons/default/square.png'
};

// Icons color references table by icon type
export const colorsRef = {
    'Traders': {
        'Artisan trader': [0, 240, 240],
        'Building materials trader': [255, 0, 0],
        'Clothing trader': [0, 128, 0],
        'Commodities trader': [128, 128, 128],
        'Agriculture trader': [200, 192, 128],
        'Furniture trader': [255, 128, 0],
        'Luxuries trader': [0, 0, 255],
        'Survival goods trader': [255, 255, 0],
        'Treasure hunter trader': [160, 0, 160],
        'unknown': [48, 48, 48]
    },
    'Translocators': {
        'Translocator': [192, 0, 192],
        'Named Translocator': [71, 45, 255],
        'Elk Translocator': [110, 180, 70],
        'Spawn Translocator': [0, 192, 192],
        'Teleporter': [229, 57, 53]
    },
    'Landmarks': {
        'Server': undefined, // This one uses a PNG, we don't want to color it
        'Base': [192, 192, 192],
        'Misc': [224, 224, 224]
    }
};

// Per sub-item visibility toggles, mutated at runtime by the layer switcher.
export const showSubLayerItems = {
    'Traders': {
        'Artisan trader': true,
        'Building materials trader': true,
        'Clothing trader': true,
        'Commodities trader': true,
        'Agriculture trader': true,
        'Furniture trader': true,
        'Luxuries trader': true,
        'Survival goods trader': true,
        'Treasure hunter trader': true,
        'unknown': true,
    },
    'Translocators': {
        'Translocator': true,
        'Named Translocator': true,
        'Elk Translocator': true,
        'Spawn Translocator': true,
        'Teleporter': true,
    },
    'Landmarks': {
        'Server': true,
        'Base': true,
        'Misc': true,
    },
};

// Feature availability derived from settings.js. Default to enabled when a flag
// is absent so older settings.js files (which persist across updates) keep every
// feature working. When disabled, the matching tool and any translocator-based
// options inside other tools are hidden entirely rather than shown broken.
export const tradersExported = typeof settings === 'undefined' || settings.tradersExported !== false;
export const translocatorsExported = typeof settings === 'undefined' || settings.translocatorsExported !== false;
export const chunksExported = typeof settings === 'undefined' || settings.chunksExported === true;

/* ######################### Translocator route planner constants ######################### */
// Translocator jumps aren't instant: there's an activation/teleport delay. We
// model it as a one-time cost paid when ENTERING a translocator (not when
// exiting), expressed in walking-blocks so it lives in the same units as the
// rest of the route. Running ~1 second covers ~8 blocks (ignoring elevation),
// so: 25 s normal hop, 40 s if the entrance is deep (Y below 64).
export const RUN_BLOCKS_PER_SEC = 8;
export const TL_HOP_SECONDS = 25;
export const TL_HOP_DEEP_SECONDS = 40;
export const TL_DEEP_Y = 64; // entrances below this Y count as "deep"

// Maximum height (px) of the route steps list / trader list before scrolling.
export const ROUTE_STEPS_MAX_HEIGHT = 320;
export const TRADER_LIST_MAX_HEIGHT = 320;

/* ######################### Translocator proximity filter constants ######################### */
// The radius is restricted to powers of two. These exponents bound the slider:
// 2^6 = 64 blocks up to 2^16 = 65536 blocks.
export const TL_PROXIMITY_MIN_EXP = 6;
export const TL_PROXIMITY_MAX_EXP = 16;
export const TL_PROXIMITY_DEFAULT_EXP = 11; // 2^11 = 2048 blocks
