/*
 * Shared translocator-graph routing, used by both the route planner
 * (features/routePlanner.js) and the nearest-trader finder
 * (features/traderFinder.js). Wraps the pure, dependency-free RoutePlanner
 * core (route.js) with map-layer-aware graph building and the shared
 * "riding an elk" toggle.
 */
import { vsTranslocators, tlColorFor } from '../map/layers/translocators.js';
import { translocatorsExported, RUN_BLOCKS_PER_SEC, TL_HOP_SECONDS, TL_HOP_DEEP_SECONDS, TL_DEEP_Y } from '../config.js';

// The ol.Map instance, needed only to drive the Translocators source's own
// url-loader in ensureTranslocatorsLoaded(). Set once by main.js.
let map = null;
export function initRouting(mapInstance) {
    map = mapInstance;
}

// Block-cost of entering a translocator whose entrance sits at world height `y`.
function tlHopCost(y) {
    let secs = (typeof y === 'number' && y < TL_DEEP_Y) ? TL_HOP_DEEP_SECONDS : TL_HOP_SECONDS;
    return secs * RUN_BLOCKS_PER_SEC;
}

// "Riding an elk" mode, shared by the route planner and the nearest-traders
// finder. When on, only Elk traversable translocators (<AM:TLE>) may be used
// for routing. Elk speed is assumed constant, so it scales every leg uniformly
// and never changes which path is shortest -- hence no extra distance math.
let useElk = false;
const elkChangeListeners = [];

export function isUseElk() {
    return useElk;
}

// Register a callback invoked with the new useElk value whenever it changes.
export function onElkChange(cb) {
    elkChangeListeners.push(cb);
}

export function toggleUseElk() {
    useElk = !useElk;
    for (let cb of elkChangeListeners) cb(useElk);
}

// Keep an "Elk" toggle button in sync with the shared useElk state.
export function syncElkButton(bt) {
    if (!bt) return;
    bt.innerText = useElk ? 'Elk: on' : 'Elk: off';
    bt.title = useElk
        ? 'Routing uses only Elk traversable translocators — click to use all translocators'
        : 'Routing uses all translocators — click to use only Elk traversable ones';
    bt.classList.toggle('selected', useElk);
}

// Build a graph of all translocator endpoints from the loaded layer.
// When elkOnly is true, only Elk-traversable translocators (<AM:TLE>) are
// included, so routing reflects what an elk can actually use.
//
// Returns {pts, pairs, jumpCost, meta} where meta[k] describes the k-th
// translocator (segment) - its display color and the depths (Y) of each end -
// and jumpCost[i] is the block-cost of entering endpoint i (depth-aware).
function buildTlGraph(elkOnly) {
    let meta = [];
    let segments = [];
    let feats = vsTranslocators.getSource().getFeatures();
    for (let f of feats) {
        if (elkOnly && !f.get('elkTrav')) continue;
        let g = f.getGeometry();
        if (!g) continue;
        let c = g.getCoordinates(); // LineString: [[x0,y0],[x1,y1]]
        if (!c || c.length < 2) continue;
        segments.push(c);
        meta.push({
            color: tlColorFor(f),
            depth1: f.get('depth1'), // world Y of endpoint c[0]
            depth2: f.get('depth2'), // world Y of endpoint c[1]
        });
    }
    let graph = RoutePlanner.buildGraphFromSegments(segments);
    // Per-endpoint entry penalty. Endpoint 2k is c[0] (depth1), 2k+1 is c[1].
    let jumpCost = [];
    for (let i = 0; i < graph.pts.length; i++) {
        let m = meta[Math.floor(i / 2)];
        let entranceY = (i % 2 === 0) ? m.depth1 : m.depth2;
        jumpCost[i] = tlHopCost(entranceY);
    }
    return {pts: graph.pts, pairs: graph.pairs, jumpCost: jumpCost, meta: meta};
}

// Make sure the (default-hidden) Translocators layer source has actually
// fetched its features before we run routing math against it. A url-based
// vector source only loads when its layer first renders, so while the layer is
// hidden by default the data would otherwise never arrive and routing would
// silently fail until the layer was shown.
export function ensureTranslocatorsLoaded(cb) {
    // No translocator data to load - let callers fall back to straight-line.
    if (!translocatorsExported) {
        cb();
        return;
    }
    let src = vsTranslocators.getSource();
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

// Dijkstra over {translocator endpoints + start + end}.
// Walking between any two nodes costs Euclidean distance; a translocator
// jump between paired endpoints costs the depth-aware entry penalty.
export function computeRoute(start, end) {
    let {pts, pairs, jumpCost, meta} = buildTlGraph(useElk);
    let result = RoutePlanner.computeRouteCore(pts, pairs, start, end, jumpCost);
    if (result) result.meta = meta;
    return result;
}

// Build the translocator-graph payload the trader-search Web Worker needs
// (plain, structured-cloneable data only).
export function buildTlGraphPayload() {
    let {pts, pairs, jumpCost} = buildTlGraph(useElk);
    return {pts, pairs, jumpCost};
}

// Format a map coordinate as in-game "X, Z" (in-game Z = -mapY).
export function fmtGameCoord(p) {
    return RoutePlanner.fmtGameCoord(p);
}
