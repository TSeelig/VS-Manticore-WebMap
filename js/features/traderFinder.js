/*
 * Nearest-trader finder: click a point to find the closest trader of each
 * type, either straight-line or (when translocators are exported) via the
 * translocator network, offloaded to a Web Worker so a heavy search never
 * blocks the map.
 */
import { el, setChildren } from '../core/dom.js';
import { vsTraders } from '../map/layers/traders.js';
import {
    computeRoute, ensureTranslocatorsLoaded, buildTlGraphPayload,
    isUseElk, onElkChange, toggleUseElk, syncElkButton, fmtGameCoord
} from './routing.js';
import { planRoute as routePlannerPlanRoute } from './routePlanner.js';
import { icons, colorsRef, translocatorsExported, TRADER_LIST_MAX_HEIGHT } from '../config.js';
import { goToCoords } from '../app.js';

// The ol.Map instance, needed only to drive the Traders source's own
// url-loader in ensureTradersLoaded(). Set once by main.js.
let map = null;
export function initTraderFinder(mapInstance) {
    map = mapInstance;
}

let traderMode = false;
let traderOrigin = undefined;
let traderListCollapsed = false;
let traderListWide = false;
// Use translocator-aware distances by default, but only when that data exists.
let traderUseTL = translocatorsExported;
let traderListText = '';
// Web Worker that runs the nearest-trader search off the main thread, plus a
// monotonic request id so stale results (origin moved, mode toggled) are
// dropped. Created lazily on first use; falls back to a synchronous search if
// Workers are unavailable.
let traderWorker = null;
let traderWorkerBroken = false;
let traderSearchReqId = 0;

export const vsTraderFind = new ol.layer.Vector({
    name: 'TraderFind',
    source: new ol.source.Vector(),
    zIndex: 9998,
    style: function (feature) {
        if (feature.get('marker') === 'origin') {
            return new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 7,
                    fill: new ol.style.Fill({color: '#2ecc40'}),
                    stroke: new ol.style.Stroke({color: '#ffffff', width: 2}),
                }),
                text: new ol.style.Text({
                    font: 'bold 12px "arial narrow", "sans serif"',
                    text: 'Start',
                    offsetY: -14,
                    fill: new ol.style.Fill({color: [0, 0, 0]}),
                    stroke: new ol.style.Stroke({color: [255, 255, 255], width: 3}),
                }),
            });
        }
        if (feature.get('marker') === 'trader') {
            let col = colorsRef['Traders'][feature.get('wares')] || [128, 128, 128];
            return new ol.style.Style({
                image: new ol.style.Icon({
                    color: col.map(function (val) { return Math.min(Math.max(val * 1.5, 64), 255); }),
                    src: icons['Traders'],
                }),
            });
        }
        // Straight-line link (used when translocators are disabled).
        if (feature.get('segType') === 'traderLink') {
            return new ol.style.Style({
                stroke: new ol.style.Stroke({color: '#ff8c00', width: 3, lineDash: [8, 6]}),
            });
        }
        // Translocator jump segment of an actual route.
        if (feature.get('segType') === 'traderTl') {
            return new ol.style.Style({
                stroke: new ol.style.Stroke({color: '#00e5ff', width: 4}),
            });
        }
        // Walking segment of an actual route.
        if (feature.get('segType') === 'traderWalk') {
            return new ol.style.Style({
                stroke: new ol.style.Stroke({color: '#ff8c00', width: 3, lineDash: [8, 6]}),
            });
        }
        // Highlight glow drawn underneath a hovered trader's route.
        if (feature.get('segType') === 'traderHi') {
            return new ol.style.Style({
                stroke: new ol.style.Stroke({color: 'rgba(255, 255, 0, 0.55)', width: 9}),
            });
        }
        return null;
    }
});

// Make sure the (default-hidden) Traders layer source has actually fetched
// its features before we run proximity math against it.
function ensureTradersLoaded(cb) {
    let src = vsTraders.getSource();
    if (src.getFeatures().length > 0) {
        cb();
        return;
    }
    let done = false;
    let finish = function () {
        if (done) return;
        done = true;
        cb();
    };
    src.once('featuresloadend', finish);
    src.once('featuresloaderror', finish);
    // Trigger the source's own url-loader (strategy 'all' loads everything and
    // records the extent as loaded, so the layer won't double-load later).
    src.loadFeatures(
        [-Infinity, -Infinity, Infinity, Infinity],
        map.getView().getResolution(),
        map.getView().getProjection()
    );
}

// Collect all loaded trader markers as plain {x, y, wares, name} records.
function buildTraderList() {
    let traders = [];
    let feats = vsTraders.getSource().getFeatures();
    for (let f of feats) {
        let g = f.getGeometry();
        if (!g) continue;
        let c = g.getCoordinates();
        if (!c) continue;
        traders.push({x: c[0], y: c[1], wares: f.get('wares'), name: f.get('name')});
    }
    return traders;
}

function setTraderOrigin(coord) {
    let src = vsTraderFind.getSource();
    src.getFeatures().forEach(function (f) {
        if (f.get('marker') === 'origin') src.removeFeature(f);
    });
    let m = new ol.Feature(new ol.geom.Point(coord));
    m.set('marker', 'origin');
    src.addFeature(m);
}

// Draw the route legs from `origin` to a single trader `r` into `src`.
// In TL mode this is the actual shortest walk + translocator-jump path;
// otherwise it is a single straight link.
function drawTraderRouteSegs(src, origin, r) {
    if (traderUseTL) {
        let route = computeRoute(origin, [r.x, r.y]);
        if (route) {
            for (let i = 1; i < route.path.length; i++) {
                let a = route.allPts[route.path[i - 1]];
                let b = route.allPts[route.path[i]];
                let seg = new ol.Feature(new ol.geom.LineString([[a.x, a.y], [b.x, b.y]]));
                seg.set('segType', route.types[i - 1] === 'tl' ? 'traderTl' : 'traderWalk');
                src.addFeature(seg);
            }
            return;
        }
    }
    // Straight link (TL off, or no route found).
    let line = new ol.Feature(new ol.geom.LineString([[origin[0], origin[1]], [r.x, r.y]]));
    line.set('segType', 'traderLink');
    src.addFeature(line);
}

// Render one route per nearest trader on the map.
function drawTraderLinks(origin, results) {
    let src = vsTraderFind.getSource();
    // Remove everything except the origin marker.
    src.getFeatures().forEach(function (f) {
        if (f.get('marker') !== 'origin') src.removeFeature(f);
    });
    for (let r of results) {
        drawTraderRouteSegs(src, origin, r);
        let tm = new ol.Feature(new ol.geom.Point([r.x, r.y]));
        tm.set('marker', 'trader');
        tm.set('wares', r.wares);
        src.addFeature(tm);
    }
}

// Draw a glowing highlight along the route from the origin to trader `r`,
// emphasising it when its list row is hovered. Only meaningful in TL mode,
// where a real multi-leg route exists.
function highlightTraderRoute(r) {
    if (!traderUseTL || traderOrigin === undefined) return;
    clearTraderHighlight();
    let src = vsTraderFind.getSource();
    let route = computeRoute([traderOrigin[0], traderOrigin[1]], [r.x, r.y]);
    if (!route) return;
    for (let i = 1; i < route.path.length; i++) {
        let a = route.allPts[route.path[i - 1]];
        let b = route.allPts[route.path[i]];
        let seg = new ol.Feature(new ol.geom.LineString([[a.x, a.y], [b.x, b.y]]));
        seg.set('segType', 'traderHi');
        src.addFeature(seg);
    }
}

// Remove any hover highlight glow features.
function clearTraderHighlight() {
    let src = vsTraderFind.getSource();
    src.getFeatures().forEach(function (f) {
        if (f.get('segType') === 'traderHi') src.removeFeature(f);
    });
}

// Open the full route planner for the trip from `origin` to trader `r`:
// switch into route mode (turning trader mode off first), drop point A at
// the origin and point B at the trader, then compute and render the route.
function planRouteToTrader(origin, r) {
    let start = [origin[0], origin[1]];
    let end = [r.x, r.y];
    // Entering route mode turns off trader mode; do that first so
    // routePlanner.planRoute() doesn't have to know anything about us.
    deactivateTraderMode();
    routePlannerPlanRoute(start, end);
    goToCoords(r.x + ',' + (-r.y));
}

function clearTraderFind() {
    vsTraderFind.getSource().clear();
    traderOrigin = undefined;
    updateTraderList(null);
}

function handleTraderClick(coord) {
    clearTraderFind();
    traderOrigin = coord;
    setTraderOrigin(coord);
    runTraderSearch(coord);
}

// Lazily create the search worker. Returns null (and latches "broken") if the
// environment can't construct one, so callers fall back to a synchronous run.
function getTraderWorker() {
    if (traderWorkerBroken) return null;
    if (traderWorker) return traderWorker;
    try {
        traderWorker = new Worker('traderWorker.js');
    } catch (e) {
        traderWorkerBroken = true;
        traderWorker = null;
    }
    return traderWorker;
}

// Run a nearest-trader search, preferring the off-thread worker and invoking
// cb(results) when done. Stale responses are filtered by reqId; if the worker
// is unavailable or errors, the identical search runs synchronously instead.
function dispatchTraderSearch(payload, reqId, cb) {
    let runSync = function () {
        cb(TraderFinder.searchNearestTraders(payload, RoutePlanner));
    };
    let worker = getTraderWorker();
    if (!worker) { runSync(); return; }

    let onMessage, onError;
    let cleanup = function () {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
    };
    onMessage = function (e) {
        let data = e.data || {};
        if (data.reqId !== reqId) return; // response for a different search
        cleanup();
        if (data.error) { runSync(); return; }
        cb(data.results);
    };
    onError = function () {
        cleanup();
        // The worker is unusable (e.g. blocked origin); stop using it entirely.
        traderWorkerBroken = true;
        traderWorker = null;
        runSync();
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    payload.reqId = reqId;
    worker.postMessage(payload);
}

// Draw and list the results of a nearest-trader search from `coord`.
function renderTraderResults(coord, results) {
    if (!results || !results.length) {
        updateTraderList(null);
        updateTraderInfo('No traders found yet. They may not be discovered on this map.');
        return;
    }
    drawTraderLinks(coord, results);
    updateTraderList(results);
    updateTraderInfo([
        'Nearest of ' + results.length + ' trader type(s), ' +
        (traderUseTL ? (isUseElk() ? 'via Elk translocators' : 'via translocators') : 'straight-line') + '.',
        el('br'),
        el('span', {style: {opacity: '.8'}}, 'Click a list entry to plan a route there, or click the map for a new point.')
    ]);
}

// Compute and render the nearest trader of each type from `coord`, honouring
// the current "use translocators" toggle. Safe to re-run (e.g. when the toggle
// flips) as long as `traderOrigin` still matches.
function runTraderSearch(coord) {
    updateTraderInfo('Searching for the nearest traders…');
    ensureTradersLoaded(function () {
        // The user may have left trader mode or clicked again meanwhile.
        if (!traderMode || traderOrigin !== coord) return;
        let proceed = function () {
            // Re-check: loading the translocator network is async too.
            if (!traderMode || traderOrigin !== coord) return;
            let payload = {useTL: traderUseTL, traders: buildTraderList(), coord: coord};
            if (traderUseTL) {
                // The graph must be built on the main thread (it reads the
                // OpenLayers feature source); the heavy search over it then runs
                // in the worker. Pass only plain, structured-cloneable data.
                let {pts, pairs, jumpCost} = buildTlGraphPayload();
                payload.pts = pts;
                payload.pairs = pairs;
                payload.jumpCost = jumpCost;
            }
            let reqId = ++traderSearchReqId;
            dispatchTraderSearch(payload, reqId, function (results) {
                // Drop stale results: a newer search started or the context
                // changed while the worker was busy.
                if (reqId !== traderSearchReqId || !traderMode || traderOrigin !== coord) return;
                renderTraderResults(coord, results);
            });
        };
        // The TL-aware search walks the translocator network, whose layer is
        // hidden by default - make sure its source is loaded first.
        if (traderUseTL) {
            ensureTranslocatorsLoaded(proceed);
        } else {
            proceed();
        }
    });
}

onElkChange(() => {
    syncElkButton(document.getElementById('traderUseElkBt'));
    if (traderMode && traderOrigin !== undefined) runTraderSearch(traderOrigin);
});

/* ######################### Trader list panel ######################### */
// Anchor the trader-list panel directly under the legend and size it to the
// remaining viewport height so its body can scroll.
function positionTraderList(panel) {
    let layers = document.getElementById('layers');
    if (!layers) return;
    let r = layers.getBoundingClientRect();
    panel.style.left = r.left + 'px';
    panel.style.top = (r.bottom + 6) + 'px';
    panel.style.width = (r.width * ((traderListWide && !traderListCollapsed) ? 2 : 1)) + 'px';
    panel.style.boxSizing = 'border-box';
    let body = document.getElementById('traderListBody');
    if (body) {
        let avail = window.innerHeight - r.bottom - 28;
        body.style.maxHeight = Math.max(60, Math.min(TRADER_LIST_MAX_HEIGHT, avail)) + 'px';
    }
}

function toggleTraderListCollapsed() {
    traderListCollapsed = !traderListCollapsed;
    let body = document.getElementById('traderListBody');
    let bt = document.getElementById('traderListCollapseBt');
    let toolbar = document.getElementById('traderListToolbar');
    if (body) body.style.display = traderListCollapsed ? 'none' : 'block';
    if (bt) bt.innerText = traderListCollapsed ? '△' : '▽';
    if (toolbar) toolbar.style.display = traderListCollapsed ? 'none' : 'flex';
    let panel = document.getElementById('traderList');
    if (panel) positionTraderList(panel);
}

function toggleTraderListWide() {
    traderListWide = !traderListWide;
    let bt = document.getElementById('traderListWideBt');
    if (bt) {
        bt.innerText = traderListWide ? 'Compact' : 'Wide';
        bt.title = traderListWide ? 'Switch to compact width' : 'Switch to double width';
    }
    let panel = document.getElementById('traderList');
    if (panel && panel.style.display !== 'none') positionTraderList(panel);
}

// Toggle whether trader proximity is measured straight-line or via the
// translocator network, then recompute the current search if one is active.
function toggleTraderUseTL() {
    traderUseTL = !traderUseTL;
    let bt = document.getElementById('traderUseTLBt');
    if (bt) {
        bt.innerText = traderUseTL ? 'TL: on' : 'TL: off';
        bt.title = traderUseTL
            ? 'Distances use translocators — click to switch to straight-line'
            : 'Distances are straight-line — click to use translocators';
        bt.classList.toggle('selected', traderUseTL);
    }
    if (traderOrigin !== undefined) runTraderSearch(traderOrigin);
}

function copyTraderList() {
    if (!traderListText) return;
    let bt = document.getElementById('traderListCopyBt');
    let done = function () {
        if (!bt) return;
        let prev = bt.innerText;
        bt.innerText = 'Copied';
        setTimeout(function () { bt.innerText = prev; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(traderListText).then(done, function () { });
    } else {
        let ta = document.createElement('textarea');
        ta.value = traderListText;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { }
        document.body.removeChild(ta);
    }
}

function buildTraderListPanel() {
    let copyBt = el('button', {
        id: 'traderListCopyBt', class: 'panelBtn', title: 'Copy trader list as text',
        style: {cursor: 'pointer', marginLeft: 'auto'}, onclick: copyTraderList
    }, 'Copy');

    let collapseBt = el('button', {
        id: 'traderListCollapseBt', class: 'panelBtn', title: 'Collapse / expand', style: {cursor: 'pointer'},
        onclick: toggleTraderListCollapsed
    }, traderListCollapsed ? '△' : '▽');

    let header = el('div', {
        class: 'layerSwitcherTitle',
        style: {fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4pt', paddingBottom: '2pt', borderBottom: '1px solid var(--layerSwitcherTitleSeparator)'}
    },
        el('span', {style: {flex: '1 1 auto', whiteSpace: 'nowrap'}}, 'Nearest traders'),
        copyBt, collapseBt
    );

    let wideBt = el('button', {
        id: 'traderListWideBt', class: 'panelBtn', style: {cursor: 'pointer'},
        title: traderListWide ? 'Switch to compact width' : 'Switch to double width',
        onclick: toggleTraderListWide
    }, traderListWide ? 'Compact' : 'Wide');

    // Translocator options only make sense when translocator data exists.
    let tlBt = null, elkBt = null;
    if (translocatorsExported) {
        tlBt = el('button', {
            id: 'traderUseTLBt', class: 'panelBtn' + (traderUseTL ? ' selected' : ''), style: {cursor: 'pointer'},
            title: traderUseTL
                ? 'Distances use translocators — click to switch to straight-line'
                : 'Distances are straight-line — click to use translocators',
            onclick: toggleTraderUseTL
        }, traderUseTL ? 'TL: on' : 'TL: off');
        elkBt = el('button', {id: 'traderUseElkBt', class: 'panelBtn', style: {cursor: 'pointer'}, onclick: toggleUseElk});
    }

    let toolbar = el('div', {
        id: 'traderListToolbar',
        style: {display: traderListCollapsed ? 'none' : 'flex', flexWrap: 'wrap', gap: '4pt', marginTop: '4pt', paddingBottom: '4pt', borderBottom: '1px solid var(--layerSwitcherTitleSeparator)'}
    }, tlBt, elkBt, wideBt);

    let body = el('div', {id: 'traderListBody', style: {overflowY: 'auto', marginTop: '4pt'}});

    let panel = el('div', {id: 'traderList', class: 'c', style: {position: 'absolute', zIndex: '1000', padding: '4pt 6pt'}}, header, toolbar, body);
    document.body.appendChild(panel);
    syncElkButton(document.getElementById('traderUseElkBt'));
    return panel;
}

// Render the list of nearest traders, one clickable row per wares type.
function updateTraderList(results) {
    let panel = document.getElementById('traderList') || buildTraderListPanel();
    let body = document.getElementById('traderListBody');
    if (!results) {
        traderListText = '';
        panel.style.display = 'none';
        if (body) setChildren(body);
        return;
    }
    let rows = [];
    let text = 'Nearest traders from ' + fmtGameCoord({x: traderOrigin[0], y: traderOrigin[1]}) + ':\n';
    for (let r of results) {
        let dist = Math.round(r.dist);
        let coordStr = fmtGameCoord({x: r.x, y: r.y});
        let col = colorsRef['Traders'][r.wares] || [128, 128, 128];

        let swatch = el('span', {
            style: {
                display: 'inline-block', width: '10px', height: '10px', marginRight: '5px',
                border: '1px solid #000', verticalAlign: 'middle',
                background: '#' + col.map((i) => i.toString(16).padStart(2, '0')).join('')
            }
        });

        let labelText = (r.wares || 'Trader') + ' — ' + dist + ' blocks (' + coordStr + ')';
        let row = el('div', {
            class: 'traderRow', style: {cursor: 'pointer', padding: '2px 4px'},
            title: 'Trader: ' + (r.name || '?') + (traderUseTL ? ' — click to plan a route here' : ' — click to go here'),
            onclick: () => {
                if (traderUseTL) {
                    planRouteToTrader([traderOrigin[0], traderOrigin[1]], r);
                } else {
                    goToCoords(r.x + ',' + (-r.y));
                }
            },
            onmouseenter: () => highlightTraderRoute(r),
            onmouseleave: clearTraderHighlight,
        }, swatch, labelText);
        rows.push(row);

        text += (r.wares || 'Trader') + ': ' + dist + ' blocks (' + coordStr + ')' +
            (r.name ? ' - ' + r.name : '') + '\n';
    }
    traderListText = text;
    setChildren(body, rows);
    body.style.display = traderListCollapsed ? 'none' : 'block';
    let bt = document.getElementById('traderListCollapseBt');
    if (bt) bt.innerText = traderListCollapsed ? '△' : '▽';
    let toolbar = document.getElementById('traderListToolbar');
    if (toolbar) toolbar.style.display = traderListCollapsed ? 'none' : 'flex';
    panel.style.display = 'block';
    positionTraderList(panel);
}

// Re-anchor the panel (called by main.js when the legend's height changes).
export function repositionPanel() {
    let panel = document.getElementById('traderList');
    if (panel && panel.style.display !== 'none') positionTraderList(panel);
}

function updateTraderInfo(content) {
    let box = document.getElementById('traderInfo');
    if (!box) {
        box = el('div', {
            id: 'traderInfo', class: 'c',
            style: {position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', padding: '6px 12px', zIndex: '1000', textAlign: 'center', maxWidth: '90%'}
        });
        document.body.appendChild(box);
    }
    if (!traderMode) {
        box.style.display = 'none';
        return;
    }
    box.style.display = 'block';
    setChildren(box, content || 'Trader finder: click on the map to find the closest trader of each type.');
}

export function isTraderModeActive() {
    return traderMode;
}

export function deactivateTraderMode() {
    if (traderMode) toggleTraderMode();
}

export function toggleTraderMode() {
    traderMode = !traderMode;
    let btn = document.getElementById('findTrader');
    if (traderMode) {
        if (btn) btn.classList.add('selected');
        document.getElementById('map').style.cursor = 'crosshair';
        ensureTradersLoaded(function () { });
        updateTraderInfo();
    } else {
        if (btn) btn.classList.remove('selected');
        document.getElementById('map').style.cursor = '';
        clearTraderFind();
        let box = document.getElementById('traderInfo');
        if (box) box.style.display = 'none';
        let list = document.getElementById('traderList');
        if (list) list.style.display = 'none';
    }
}

// Called from map/clickHandler.js on every map singleclick while trader mode
// is active.
export function onMapClick(coord) {
    handleTraderClick(coord);
}
