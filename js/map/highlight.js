/*
 * Hover highlighting + the coordinate/feature inspector text at the bottom
 * of the map. Feature text (trader name, translocator/landmark label) is
 * rendered as real DOM text nodes via core/dom.js, never HTML strings - both
 * so it can't be parsed as markup, and so an actual line break (a real <br>
 * element) separates the two lines instead of a literal "<br>" that plain
 * innerText would show verbatim.
 */
import { el, setChildren } from '../core/dom.js';
import { highlightStyleTranslocator } from './layers/translocators.js';
import { highlightStyleTrader } from './layers/traders.js';
import { isTlProximityModeActive, onCursorMove } from '../features/tlProximity.js';

const inspector = document.getElementById('status');

let selectedTL = undefined;
let selectedTrader = undefined;

export function initHighlight(map) {
    map.on('pointermove', function (e) {
        // Keep the proximity filter following the cursor.
        if (isTlProximityModeActive()) {
            onCursorMove(e.coordinate);
        }

        if (selectedTL != undefined) {
            selectedTL.setStyle(undefined);
            selectedTL = undefined;
        }
        if (selectedTrader != undefined) {
            selectedTrader.setStyle(undefined);
            selectedTrader = undefined;
        }

        // At most one feature is ever inspected per move: every branch below
        // returns true, which stops forEachFeatureAtPixel at the first (i.e.
        // topmost) hit.
        let content = null;
        map.forEachFeatureAtPixel(e.pixel, function (f, l) {
            if (l.get('name') == 'Traders') {
                selectedTrader = f;
                content = ['Trader name: ' + f.get('name'), el('br'), 'Wares: ' + f.get('wares')];
                f.setStyle(highlightStyleTrader);
                return true;
            } else if (l.get('name') == 'Translocators') {
                selectedTL = f;
                let label = f.get('label');
                content = label ? ['Translocator: ' + label] : null;
                f.setStyle(highlightStyleTranslocator);
                return true;
            } else if (l.get('name') == 'Landmarks') {
                content = [f.get('label')];
                return true;
            } else if (l.get('name') == 'Explored Chunks') {
                content = [f.get('version')];
                return true;
            }
        });

        if (content) {
            setChildren(inspector, content);
            inspector.style.display = 'block';
        } else {
            inspector.style.display = 'none';
        }
    });
}
