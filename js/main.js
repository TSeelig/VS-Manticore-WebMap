/*
 * Entry point: bootstraps the page chrome, assembles the map, and wires the
 * cross-feature interactions (route/trader-finder mutual exclusivity, the
 * legend-resize panel repositioning) that would otherwise force the
 * individual feature modules to import each other.
 */
import { initBootstrap, goToCoords, cx, cy } from './app.js';
import { tradersExported, translocatorsExported, chunksExported } from './config.js';

import { map } from './map/mapView.js';
import { vsTranslocators } from './map/layers/translocators.js';
import { vsTraders } from './map/layers/traders.js';
import { vsLandmarks } from './map/layers/landmarks.js';
import { vsGenChunks } from './map/layers/chunks.js';
import { initHighlight } from './map/highlight.js';
import { initClickHandler } from './map/clickHandler.js';

import { switcher } from './ui/layerSwitcher.js';
import { poper } from './ui/popupManager.js';
import { Tools } from './ui/tools.js';
import { Credits } from './ui/credits.js';

import { initRouting } from './features/routing.js';
import * as routePlanner from './features/routePlanner.js';
import * as traderFinder from './features/traderFinder.js';
import { toggleTlProximityMode, repositionPanel as repositionTlProximityPanel } from './features/tlProximity.js';

import { initKeybindings } from './keybindings.js';

initBootstrap();

// Give the routing/trader-search helpers the map instance they need to
// drive their layer sources' url-loaders.
initRouting(map);
traderFinder.initTraderFinder(map);

initHighlight(map);
initClickHandler(map);

/* ######################### Build the legend (must come after the map definition) ######################### */
if (translocatorsExported) switcher.buildLegend(vsTranslocators);
if (tradersExported) switcher.buildLegend(vsTraders);
switcher.buildLegend(vsLandmarks);
if (chunksExported) switcher.buildLegend(vsGenChunks);

/* ######################### Cross-feature mode coordination ######################### */
// Route mode and trader-finder mode are mutually exclusive; each feature
// module only knows about itself, so the "turn the other one off first" glue
// lives here instead of as a static import cycle between the two.
function onRouteToolClick() {
    if (traderFinder.isTraderModeActive()) traderFinder.deactivateTraderMode();
    routePlanner.toggleRouteMode();
}

function onFindTraderToolClick() {
    if (routePlanner.isRouteModeActive()) routePlanner.deactivateRouteMode();
    traderFinder.toggleTraderMode();
}

const toolDeps = {
    onRoute: onRouteToolClick,
    onFindTrader: onFindTraderToolClick,
    onTlProximity: toggleTlProximityMode,
};

/* ######################### Start the popups and tools managers ######################### */
let tools = new Tools();
tools.addTools(toolDeps);
let credits = new Credits('contributors');
document.getElementById('contribute').addEventListener('click', () => {
    poper.createPopup('contribute');
});

initKeybindings(toolDeps);

// The legend can be folded in or out, which changes its height. Observe it so
// the docked panels (route steps / trader list / TL proximity) stay anchored
// just below it, and also react to plain window resizes.
function repositionLegendPanels() {
    routePlanner.repositionPanel();
    traderFinder.repositionPanel();
    repositionTlProximityPanel();
}

window.addEventListener('resize', repositionLegendPanels);
(function () {
    let layers = document.getElementById('layers');
    if (layers && typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(repositionLegendPanels).observe(layers);
    }
})();

// Collapse the Translocators/Traders/Chunks legends by default while leaving
// the layers themselves visible; Landmarks starts collapsed too.
if (translocatorsExported) switcher.toggleVis(vsTranslocators.get('name'));
if (tradersExported) switcher.toggleVis(vsTraders.get('name'));
if (chunksExported) switcher.toggleVis(vsGenChunks.get('name'));
switcher.toggleLegendVis(vsLandmarks.get('name'));

goToCoords(cx + ',' + cy);
