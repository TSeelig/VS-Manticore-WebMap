import { el } from '../core/dom.js';
import { goToCoords, zoomBy } from '../app.js';
import { poper } from './popupManager.js';
import { tradersExported, translocatorsExported } from '../config.js';

function buildToolsRef(deps) {
    return {
        'zoomIn': {
            'id': 'zoomIn', 'icon': '+', 'title': 'Zoom in',
            'callback': () => zoomBy(1)
        },
        'zoomOut': {
            'id': 'zoomOut', 'icon': '−', 'title': 'Zoom out',
            'callback': () => zoomBy(-1)
        },
        'origin': {
            'id': 'origin', 'icon': '🧭', 'title': 'Move and zoom to the server spawn (H)',
            'callback': () => goToCoords('0,0')
        },
        'goToCoords': {
            'id': 'goToCoords', 'icon': '🔍', 'title': 'Move and zoom to coordinates (G)',
            'callback': () => poper.createPopup('gps')
        },
        'goToLandmark': {
            'id': 'goToLandmarks', 'icon': '🏛', 'title': 'Move and zoom to selected landmark (L)',
            'callback': () => poper.createPopup('landmarks')
        },
        'route': {
            'id': 'route', 'icon': '🛣',
            'title': 'Translocator route planner: place 2 points to find the shortest path (R)',
            'callback': deps.onRoute
        },
        'findTrader': {
            'id': 'findTrader', 'icon': '🛒',
            'title': 'Nearest trader finder: click a point to find the closest trader of each type (T)',
            'callback': deps.onFindTrader
        },
        'tlProximity': {
            'id': 'tlProximity', 'icon': '🌀',
            'title': 'Translocator proximity filter: only show translocators near the cursor for better performance. Click the map to pin/unpin the area (P)',
            'callback': deps.onTlProximity
        },
        'settings': {
            'id': 'settings', 'icon': '🔧', 'title': 'Customize the Web Map',
            'callback': () => poper.createPopup('settings')
        }
    };
}

/* ######################### Tools ######################### */
export class Tools {
    // deps: { onRoute, onFindTrader, onTlProximity } - cross-feature toggle
    // callbacks, wired centrally by main.js so this module stays decoupled
    // from the route/trader/proximity feature internals.
    addTools(deps) {
        let toolsBlock = document.getElementById('tools');
        let toolsRef = buildToolsRef(deps);
        for (let key in toolsRef) {
            let e = toolsRef[key];
            // Hide tools whose underlying data was not exported.
            if (e['id'] === 'findTrader' && !tradersExported) continue;
            if (e['id'] === 'tlProximity' && !translocatorsExported) continue;
            if (e['id'] === 'route' && !translocatorsExported) continue;
            toolsBlock.append(el('button', {id: e['id'], title: e['title'], onclick: e['callback']}, e['icon']));
        }
    }
}
