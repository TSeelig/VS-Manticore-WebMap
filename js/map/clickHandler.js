/*
 * Map singleclick dispatch: route/trader-finder/proximity modes take
 * priority, otherwise a click on a translocator or trader opens an info
 * popup with copy-pasteable in-game waypoint commands.
 *
 * Every value interpolated into those command strings (trader name,
 * translocator coordinates) ends up passed to PopupManager's 'p' element
 * type, which renders content as plain text (see ui/popupManager.js) - so a
 * trader/translocator name can contain any characters without ever being
 * parsed as markup.
 */
import { goToCoords } from '../app.js';
import { colorsRef } from '../config.js';
import { poper } from '../ui/popupManager.js';
import { isRouteModeActive, onMapClick as onRouteClick } from '../features/routePlanner.js';
import { isTraderModeActive, onMapClick as onTraderClick } from '../features/traderFinder.js';
import { isTlProximityModeActive, toggleTlProximityPin } from '../features/tlProximity.js';

function openTranslocatorPopup(f, coordsString, coordsString2) {
    let elements = {
        'description1': {
            'type': 'p',
            'content': 'To add this translocator pair to your in game map, copy paste these two lines into the game chat. The translocator that is the closest to where you clicked on the line is first in the list.'
        },
        'description2': {
            'type': 'p',
            'content': `/waypoint addati spiral ${coordsString} false purple TL to ${coordsString2.replace(' 110 ', ', ')}`
        },
        'description3': {
            'type': 'p',
            'content': `/waypoint addati spiral ${coordsString2} false purple TL to ${coordsString.replace(' 110 ', ', ')}`
        }
    };
    if (f.get('elkTrav')) {
        elements['elk'] = {
            'type': 'p',
            'content': '🦌 This translocator is tagged Elk traversable (<AM:TLE>).'
        };
    }
    poper.createPopup('translocator', true, {elements});
}

function openTraderPopup(f, coords) {
    let color = '#' + colorsRef['Traders'][f.get('wares')].map((i) => i.toString(16).padStart(2, '0')).join('');
    let elements = {
        'description1': {
            'type': 'p',
            'content': 'To add this trader to your in game map, copy paste these the lines below into the game chat.'
        },
        'description2': {
            'type': 'p',
            'content': `/waypoint addati trader ${coords[0]} 110 ${-coords[1]} false ${color.toUpperCase()} ${f.get('name')} the ${f.get('wares').toLowerCase()} trader`
        }
    };
    poper.createPopup('trader', true, {elements});
}

function handleFeatureClick(map, e) {
    map.forEachFeatureAtPixel(e.pixel, function (f, l) {
        if (l.get('name') == 'Translocators') {
            let coords = f.getGeometry().flatCoordinates;
            let dst1 = Math.abs(coords[0] - e.coordinate[0] + coords[1] - e.coordinate[1]);
            let dst2 = Math.abs(coords[2] - e.coordinate[0] + coords[3] - e.coordinate[1]);
            let coordsDst1 = (coords[0]) + ' 110 ' + (-coords[1]);
            let coordsDst2 = (coords[2]) + ' 110 ' + (-coords[3]);
            let coordsString, coordsString2;
            if (dst1 < dst2) {
                coordsString = coordsDst1;
                coordsString2 = coordsDst2;
            } else {
                coordsString = coordsDst2;
                coordsString2 = coordsDst1;
            }
            // Was the user holding shift?
            if (e.originalEvent.shiftKey) {
                // Zoom to the other end
                goToCoords(coordsString2.replace(/ 110 /, ','));
            } else {
                openTranslocatorPopup(f, coordsString, coordsString2);
            }
            return true;
        } else if (l.get('name') == 'Traders') {
            openTraderPopup(f, f.getGeometry().flatCoordinates);
            return true;
        }
    });
}

export function initClickHandler(map) {
    map.on('singleclick', function (e) {
        if (isRouteModeActive()) {
            onRouteClick(e.coordinate);
            return;
        }
        if (isTraderModeActive()) {
            onTraderClick(e.coordinate);
            return;
        }
        // While the proximity filter is active, a click pins/unpins its area.
        if (isTlProximityModeActive()) {
            toggleTlProximityPin(e.coordinate);
            return;
        }
        handleFeatureClick(map, e);
    });
}
