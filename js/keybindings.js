import { poper } from './ui/popupManager.js';
import { goToCoords } from './app.js';
import { tradersExported, translocatorsExported } from './config.js';

// deps: { onRoute, onFindTrader, onTlProximity } - the same mutual-exclusion
// wrapped callbacks used by the toolbar buttons (ui/tools.js), so a hotkey
// behaves identically to clicking its tool.
export function initKeybindings(deps) {
    window.onkeyup = function (kp) {
        let actions = {
            /*  G  */ 71: function () {
                poper.createPopup('gps');
            },
            /*  H  */ 72: function () {
                goToCoords('0,0');
            },
            /*  L  */ 76: function () {
                poper.createPopup('landmarks');
            },
            /*  R  */ 82: function () {
                deps.onRoute();
            },
            /*  T  */ 84: function () {
                if (tradersExported) deps.onFindTrader();
            },
            /*  P  */ 80: function () {
                if (translocatorsExported) deps.onTlProximity();
            },
            /* ESC */ 27: function () {
                poper.destroyPopup(Object.keys(poper.popups).pop());
            }
        };
        // Act on keypress if no popups are open
        if (Object.keys(poper.popups).length == 0 && kp.keyCode in actions) {
            actions[kp.keyCode]();
        }
        // Exception to allow closing popups with ESC
        else if (Object.keys(poper.popups).length > 0 && kp.keyCode in actions && kp.keyCode == 27) {
            actions[kp.keyCode]();
        }
    };
}
