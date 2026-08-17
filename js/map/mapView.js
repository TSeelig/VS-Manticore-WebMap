import { adr, title, setView, zm } from '../app.js';
import { vsWorld } from './layers/world.js';
import { vsGenChunks } from './layers/chunks.js';
import { vsTraders } from './layers/traders.js';
import { vsTranslocators } from './layers/translocators.js';
import { vsLandmarks } from './layers/landmarks.js';
import { vsRoute } from '../features/routePlanner.js';
import { vsTraderFind } from '../features/traderFinder.js';
import { vsTlProximityRange } from '../features/tlProximity.js';

/* ######################### Controllers ######################### */
export const mousePos = new ol.control.MousePosition({
    coordinateFormat: function (coordinate) {
        return ol.coordinate.toStringXY([coordinate[0], -coordinate[1]], 0);
    },
    className: 'coords',
    target: document.getElementById('mousePos'),
    undefinedHTML: document.getElementById('mousePos').innerText
});

/* ######################### Map definition ######################### */
export const view = new ol.View({
    center: [0, 0],
    constrainResolution: true,
    zoom: zm,
    resolutions: [256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25, 0.125],
});

export const map = new ol.Map({
    target: 'map',
    controls: [mousePos],
    layers: [
        vsWorld,
        vsGenChunks,
        vsTraders,
        vsTranslocators,
        vsLandmarks,
        vsRoute,
        vsTraderFind,
        vsTlProximityRange
    ],
    view: view
});

setView(view);

map.on('moveend', function () {
    let center = view.getCenter();
    let newHref = adr + '?x=' + Math.round(center[0]) + '&y=' + (-1 * Math.round(center[1])) + '&zoom=' + view.getZoom();
    window.history.pushState('pos', title, newHref);
});
