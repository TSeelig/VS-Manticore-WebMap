/*
 * Translocator route planner: click two points on the map, get the shortest
 * walk + translocator-jump path between them plus a turn-by-turn steps list.
 */
import { el, setChildren } from '../core/dom.js';
import { computeRoute, ensureTranslocatorsLoaded, isUseElk, onElkChange, toggleUseElk, syncElkButton, fmtGameCoord } from './routing.js';
import { translocatorsExported, ROUTE_STEPS_MAX_HEIGHT } from '../config.js';

let routeMode = false;
let routeStart = undefined;
let routeEnd = undefined;
let routeStepsCollapsed = false;
let routeStepsWide = false;
let routeStepsText = '';

// Index of the route segment currently highlighted (e.g. by hovering its step
// in the route steps list). -1 means nothing is highlighted.
let highlightedSeg = -1;

export const vsRoute = new ol.layer.Vector({
    name: 'Route',
    source: new ol.source.Vector(),
    zIndex: 9999,
    style: function (feature) {
        if (feature.get('marker') === 'start' || feature.get('marker') === 'end') {
            let isStart = feature.get('marker') === 'start';
            return new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 7,
                    fill: new ol.style.Fill({color: isStart ? '#2ecc40' : '#ff4136'}),
                    stroke: new ol.style.Stroke({color: '#ffffff', width: 2}),
                }),
                text: new ol.style.Text({
                    font: 'bold 12px "arial narrow", "sans serif"',
                    text: isStart ? 'Start' : 'Destination',
                    offsetY: -14,
                    fill: new ol.style.Fill({color: [0, 0, 0]}),
                    stroke: new ol.style.Stroke({color: [255, 255, 255], width: 3}),
                }),
            });
        }
        let hl = feature.get('segIdx') !== undefined && feature.get('segIdx') === highlightedSeg;
        if (feature.get('segType') === 'tl') {
            // The route runs on top of the translocator lines, which share the
            // same per-type color. Draw the jump in its type color over a white
            // casing so it stays tied to the type yet stands out against its own
            // line. Hovering thickens the casing for extra emphasis.
            let col = feature.get('tlColor') || [0, 229, 255];
            return [
                new ol.style.Style({stroke: new ol.style.Stroke({color: '#ffffff', width: hl ? 9 : 7})}),
                new ol.style.Style({stroke: new ol.style.Stroke({color: col, width: 5})}),
            ];
        }
        // walking segment
        let base = new ol.style.Style({
            stroke: new ol.style.Stroke({color: '#ffd000', width: 4, lineDash: [10, 8]}),
        });
        if (!hl) return base;
        return [
            new ol.style.Style({stroke: new ol.style.Stroke({color: '#ffffff', width: 8})}),
            base,
        ];
    }
});

// Highlight (or clear, with seg = -1) a single route segment on the map.
function setRouteHighlight(seg) {
    if (highlightedSeg === seg) return;
    highlightedSeg = seg;
    vsRoute.changed();
}

function drawRoute(result) {
    let src = vsRoute.getSource();
    // Remove only the line segments, keep markers
    src.getFeatures().forEach(function (f) {
        if (f.get('segType')) src.removeFeature(f);
    });
    for (let i = 1; i < result.path.length; i++) {
        let a = result.allPts[result.path[i - 1]];
        let b = result.allPts[result.path[i]];
        let line = new ol.Feature(new ol.geom.LineString([[a.x, a.y], [b.x, b.y]]));
        line.set('segType', result.types[i - 1]);
        line.set('segIdx', i);
        if (result.types[i - 1] === 'tl' && result.meta) {
            // Color the jump by the translocator's own type (entry endpoint < n).
            let m = result.meta[Math.floor(result.path[i - 1] / 2)];
            if (m) line.set('tlColor', m.color);
        }
        src.addFeature(line);
    }
}

function setRouteMarker(which, coord) {
    let src = vsRoute.getSource();
    src.getFeatures().forEach(function (f) {
        if (f.get('marker') === which) src.removeFeature(f);
    });
    let m = new ol.Feature(new ol.geom.Point(coord));
    m.set('marker', which);
    src.addFeature(m);
}

function clearRoute() {
    vsRoute.getSource().clear();
    routeStart = undefined;
    routeEnd = undefined;
    updateRouteInfo();
    updateRouteSteps(null);
}

function showRouteSummary(result, start, end) {
    let straight = Math.hypot(start[0] - end[0], start[1] - end[1]);
    updateRouteInfo([
        'Walking: ' + Math.round(result.walkDist) + ' blocks · ' +
        'Jumps: ' + result.jumps + ' · ' +
        'Direct: ' + Math.round(straight) + ' blocks',
        el('br'),
        el('span', {style: {opacity: '.8'}}, 'Click to plan a new route.')
    ]);
}

// Compute and draw the route between `start` and `end`, switching into route
// mode first if needed. Used both by direct map clicks and by the trader
// finder's "plan a route to this trader" action.
export function planRoute(start, end) {
    if (!routeMode) activateRouteMode();
    clearRoute();
    routeStart = start;
    setRouteMarker('start', start);
    routeEnd = end;
    setRouteMarker('end', end);
    let result = computeRoute(start, end);
    if (result === null) {
        updateRouteInfo('No route could be computed.');
        return;
    }
    drawRoute(result);
    updateRouteSteps(result);
    showRouteSummary(result, start, end);
}

function handleRouteClick(coord) {
    if (routeStart === undefined || routeEnd !== undefined) {
        // Start a fresh route
        clearRoute();
        routeStart = coord;
        setRouteMarker('start', coord);
        updateRouteInfo('Start placed. Click to place the Destination.');
    } else {
        routeEnd = coord;
        setRouteMarker('end', coord);
        let start = routeStart, end = routeEnd;
        updateRouteInfo('Computing route…');
        // Translocators are hidden by default, so their source may not be loaded
        // yet; wait for it before routing (runs synchronously once loaded).
        ensureTranslocatorsLoaded(function () {
            // Abort if the route was cleared or restarted while data loaded.
            if (routeStart !== start || routeEnd !== end) return;
            let result = computeRoute(start, end);
            if (result === null) {
                updateRouteInfo('No route could be computed.');
                return;
            }
            drawRoute(result);
            updateRouteSteps(result);
            showRouteSummary(result, start, end);
        });
    }
}

// Recompute and redraw the current route in place (e.g. after the elk toggle
// flips) without disturbing the placed A/B markers.
function replanRoute() {
    if (routeStart === undefined || routeEnd === undefined) return;
    let result = computeRoute(routeStart, routeEnd);
    if (result === null) {
        updateRouteInfo('No route could be computed.');
        return;
    }
    drawRoute(result);
    updateRouteSteps(result);
    showRouteSummary(result, routeStart, routeEnd);
}

onElkChange(() => {
    syncElkButton(document.getElementById('routeUseElkBt'));
    if (routeMode) replanRoute();
});

/* ######################### Route steps panel ######################### */
// Anchor the route panel directly under the legend and size it to the
// remaining viewport height so its body can scroll.
function positionRouteSteps(panel) {
    let layers = document.getElementById('layers');
    if (!layers) return;
    let r = layers.getBoundingClientRect();
    panel.style.left = r.left + 'px';
    panel.style.top = (r.bottom + 6) + 'px';
    panel.style.width = (r.width * ((routeStepsWide && !routeStepsCollapsed) ? 2 : 1)) + 'px';
    panel.style.boxSizing = 'border-box';
    let body = document.getElementById('routeStepsBody');
    if (body) {
        // Cap at a fixed height, but never exceed the space left above the
        // bottom of the viewport (so the body scrolls instead of overflowing).
        let avail = window.innerHeight - r.bottom - 28;
        body.style.maxHeight = Math.max(60, Math.min(ROUTE_STEPS_MAX_HEIGHT, avail)) + 'px';
    }
}

function toggleRouteStepsCollapsed() {
    routeStepsCollapsed = !routeStepsCollapsed;
    let body = document.getElementById('routeStepsBody');
    let bt = document.getElementById('routeStepsCollapseBt');
    let wideBt = document.getElementById('routeStepsWideBt');
    if (body) body.style.display = routeStepsCollapsed ? 'none' : 'block';
    if (bt) bt.innerText = routeStepsCollapsed ? '△' : '▽';
    if (wideBt) wideBt.style.display = routeStepsCollapsed ? 'none' : '';
    let panel = document.getElementById('routeSteps');
    if (panel) positionRouteSteps(panel);
}

function toggleRouteStepsWide() {
    routeStepsWide = !routeStepsWide;
    let bt = document.getElementById('routeStepsWideBt');
    if (bt) {
        bt.innerText = routeStepsWide ? 'Compact' : 'Wide';
        bt.title = routeStepsWide ? 'Switch to compact width' : 'Switch to double width';
    }
    let panel = document.getElementById('routeSteps');
    if (panel && panel.style.display !== 'none') positionRouteSteps(panel);
}

function copyRouteSteps() {
    if (!routeStepsText) return;
    let bt = document.getElementById('routeStepsCopyBt');
    let done = function () {
        if (!bt) return;
        let prev = bt.innerText;
        bt.innerText = 'Copied';
        setTimeout(function () { bt.innerText = prev; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(routeStepsText).then(done, function () { });
    } else {
        let ta = document.createElement('textarea');
        ta.value = routeStepsText;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { }
        document.body.removeChild(ta);
    }
}

function buildRouteStepsPanel() {
    let copyBt = el('button', {
        id: 'routeStepsCopyBt', class: 'panelBtn', title: 'Copy route as text', style: {cursor: 'pointer'},
        onclick: copyRouteSteps
    }, 'Copy');

    // The Elk-only filter is a translocator option; hide it when no
    // translocator data was exported.
    let elkBt = translocatorsExported ? el('button', {
        id: 'routeUseElkBt', class: 'panelBtn', style: {cursor: 'pointer'}, onclick: toggleUseElk
    }) : null;

    let collapseBt = el('button', {
        id: 'routeStepsCollapseBt', class: 'panelBtn', title: 'Collapse / expand', style: {cursor: 'pointer'},
        onclick: toggleRouteStepsCollapsed
    }, routeStepsCollapsed ? '△' : '▽');

    let wideBt = el('button', {
        id: 'routeStepsWideBt', class: 'panelBtn', style: {cursor: 'pointer', marginLeft: 'auto', display: routeStepsCollapsed ? 'none' : ''},
        title: routeStepsWide ? 'Switch to compact width' : 'Switch to double width',
        onclick: toggleRouteStepsWide
    }, routeStepsWide ? 'Compact' : 'Wide');

    let header = el('div', {
        class: 'layerSwitcherTitle',
        style: {fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4pt', paddingBottom: '2pt', borderBottom: '1px solid var(--layerSwitcherTitleSeparator)'}
    },
        el('span', {style: {flex: '1 1 auto', whiteSpace: 'nowrap'}}, 'Route'),
        wideBt, elkBt, copyBt, collapseBt
    );

    let body = el('div', {id: 'routeStepsBody', style: {overflowY: 'auto', marginTop: '4pt'}});

    let panel = el('div', {id: 'routeSteps', class: 'c', style: {position: 'absolute', zIndex: '1000', padding: '4pt 6pt'}}, header, body);
    document.body.appendChild(panel);
    syncElkButton(document.getElementById('routeUseElkBt'));
    return panel;
}

// Render a step-by-step textual description of the computed route.
function updateRouteSteps(result) {
    let panel = document.getElementById('routeSteps') || buildRouteStepsPanel();
    let body = document.getElementById('routeStepsBody');
    if (!result) {
        routeStepsText = '';
        panel.style.display = 'none';
        if (body) setChildren(body);
        return;
    }
    let n = result.allPts.length - 2;
    let S = n, E = n + 1;
    let text = '';
    setRouteHighlight(-1);
    // Coordinates shown in parentheses for readability, matching the trader list.
    let coord = function (p) { return '(' + fmtGameCoord(p) + ')'; };

    let rows = [el('div', {}, '🏁 Start: ' + coord(result.allPts[result.path[0]]))];
    text += 'Start: ' + coord(result.allPts[result.path[0]]) + '\n';

    for (let i = 1; i < result.path.length; i++) {
        let from = result.allPts[result.path[i - 1]];
        let to = result.allPts[result.path[i]];
        let toIdx = result.path[i];
        let dest;
        if (toIdx === E) {
            dest = 'Destination';
        } else if (toIdx === S) {
            dest = 'Start';
        } else {
            dest = 'Translocator';
        }
        let rowText;
        if (result.types[i - 1] === 'tl') {
            rowText = '🌀 Take Translocator → ' + dest + ' ' + coord(to);
            text += 'Take Translocator -> ' + dest + ' ' + coord(to) + '\n';
        } else {
            let d = Math.round(Math.hypot(from.x - to.x, from.y - to.y));
            rowText = '🚶 Walk ' + d + ' Blocks → ' + dest + ' ' + coord(to);
            text += 'Walk ' + d + ' Blocks -> ' + dest + ' ' + coord(to) + '\n';
        }
        // Highlight the matching path segment on the map while this step is hovered.
        let row = el('div', {style: {cursor: 'default', borderRadius: '3px'}}, rowText);
        row.onmouseenter = (function (seg, r) {
            return function () { r.style.background = 'rgba(255,255,255,0.18)'; setRouteHighlight(seg); };
        })(i, row);
        row.onmouseleave = (function (r) {
            return function () { r.style.background = ''; setRouteHighlight(-1); };
        })(row);
        rows.push(row);
    }
    routeStepsText = text;
    setChildren(body, rows);
    body.style.display = routeStepsCollapsed ? 'none' : 'block';
    let bt = document.getElementById('routeStepsCollapseBt');
    if (bt) bt.innerText = routeStepsCollapsed ? '△' : '▽';
    let wideBt = document.getElementById('routeStepsWideBt');
    if (wideBt) wideBt.style.display = routeStepsCollapsed ? 'none' : '';
    panel.style.display = 'block';
    positionRouteSteps(panel);
}

// Re-anchor the panel (called by main.js when the legend's height changes).
export function repositionPanel() {
    let panel = document.getElementById('routeSteps');
    if (panel && panel.style.display !== 'none') positionRouteSteps(panel);
}

function updateRouteInfo(content) {
    let box = document.getElementById('routeInfo');
    if (!box) {
        box = el('div', {
            id: 'routeInfo', class: 'c',
            style: {position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', padding: '6px 12px', zIndex: '1000', textAlign: 'center', maxWidth: '90%'}
        });
        document.body.appendChild(box);
    }
    if (!routeMode) {
        box.style.display = 'none';
        return;
    }
    box.style.display = 'block';
    setChildren(box, content || 'Route mode: click on the map to place the Start.');
}

function activateRouteMode() {
    routeMode = true;
    let btn = document.getElementById('route');
    if (btn) btn.classList.add('selected');
    document.getElementById('map').style.cursor = 'crosshair';
    updateRouteInfo();
}

export function isRouteModeActive() {
    return routeMode;
}

export function deactivateRouteMode() {
    if (routeMode) toggleRouteMode();
}

export function toggleRouteMode() {
    routeMode = !routeMode;
    let btn = document.getElementById('route');
    if (routeMode) {
        if (btn) btn.classList.add('selected');
        document.getElementById('map').style.cursor = 'crosshair';
        updateRouteInfo();
    } else {
        if (btn) btn.classList.remove('selected');
        document.getElementById('map').style.cursor = '';
        clearRoute();
        let box = document.getElementById('routeInfo');
        if (box) box.style.display = 'none';
        let steps = document.getElementById('routeSteps');
        if (steps) steps.style.display = 'none';
    }
}

// Called from map/clickHandler.js on every map singleclick while route mode
// is active.
export function onMapClick(coord) {
    handleRouteClick(coord);
}
