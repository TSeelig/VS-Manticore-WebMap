/*
 * Nearest-trader finder core logic.
 *
 * Pure, dependency-free proximity math shared by the browser map
 * (js/features/traderFinder.js) and the Node test-suite. Loads as a global
 * (window.TraderFinder) in the browser and as a CommonJS module
 * (require('./traders.js')) under Node.
 */
(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.TraderFinder = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    // Find the single closest trader of each distinct "wares" type to a point.
    //
    //   traders : [{x, y, wares, name}, ...]  all trader markers
    //   from    : [x, y]                      the point clicked on the map
    //
    // Returns one entry per wares type present, sorted by ascending distance:
    //   [{wares, name, x, y, dist}, ...]
    function findNearestTraders(traders, from) {
        let fx = from[0], fy = from[1];
        let best = {}; // wares -> nearest entry of that type

        for (let t of traders) {
            if (!t) continue;
            if (typeof t.x !== 'number' || typeof t.y !== 'number') continue;
            let key = (t.wares === undefined || t.wares === null) ? '' : t.wares;
            let dx = t.x - fx, dy = t.y - fy;
            let dist = Math.sqrt(dx * dx + dy * dy);
            let cur = best[key];
            if (cur === undefined || dist < cur.dist) {
                best[key] = {wares: key, name: t.name, x: t.x, y: t.y, dist: dist};
            }
        }

        let result = Object.keys(best).map(function (k) { return best[k]; });
        result.sort(function (a, b) { return a.dist - b.dist; });
        return result;
    }

    // Find the single closest trader of each distinct "wares" type by travel
    // distance over the translocator network.
    //
    //   traders    : [{x, y, wares, name}, ...]  all trader markers
    //   sourceDist : {nodes, dist}               from RoutePlanner.computeSourceDistances
    //
    // The travel cost to a trader is the cheapest "reach a graph node, then walk
    // the rest": min over i of dist[i] + euclidean(nodes[i], trader). Since the
    // start point itself is included as a node, this is never worse than the
    // straight-line distance, and is shorter whenever a translocator helps.
    //
    // Returns one entry per wares type present, sorted by ascending distance:
    //   [{wares, name, x, y, dist}, ...]
    function findNearestTradersTravel(traders, sourceDist) {
        let nodes = sourceDist.nodes, dist = sourceDist.dist;
        let best = {}; // wares -> nearest entry of that type

        // Only nodes with a finite travel cost can contribute. When the source
        // distances were computed with a budget most nodes stay Infinity, so
        // pre-filtering keeps the per-trader scan proportional to the reachable
        // neighbourhood instead of the entire translocator network.
        let reach = [];
        for (let i = 0; i < nodes.length; i++) {
            if (dist[i] !== Infinity) reach.push(i);
        }

        for (let t of traders) {
            if (!t) continue;
            if (typeof t.x !== 'number' || typeof t.y !== 'number') continue;
            let key = (t.wares === undefined || t.wares === null) ? '' : t.wares;

            let travel = Infinity;
            for (let j = 0; j < reach.length; j++) {
                let nd = nodes[reach[j]];
                let dx = nd.x - t.x, dy = nd.y - t.y;
                let d = dist[reach[j]] + Math.sqrt(dx * dx + dy * dy);
                if (d < travel) travel = d;
            }

            let cur = best[key];
            if (cur === undefined || travel < cur.dist) {
                best[key] = {wares: key, name: t.name, x: t.x, y: t.y, dist: travel};
            }
        }

        let result = Object.keys(best).map(function (k) { return best[k]; });
        result.sort(function (a, b) { return a.dist - b.dist; });
        return result;
    }

    // High-level nearest-trader search, shared by the main thread and the Web
    // Worker so both run identical logic.
    //
    //   payload : {traders, coord, useTL, pts, pairs, jumpCost}
    //   planner : the RoutePlanner module (computeSourceDistances). Required
    //             only when payload.useTL is true.
    //
    // In translocator mode this first finds the straight-line nearest trader of
    // each type and uses the farthest of those as the travel budget: a
    // translocator route can only win if it is shorter than walking straight,
    // so bounding the (potentially huge) network search by that distance keeps
    // it cheap while staying exact. Returns the same shape as the finders above.
    function searchNearestTraders(payload, planner) {
        let traders = payload.traders, coord = payload.coord;
        if (!payload.useTL) {
            return findNearestTraders(traders, coord);
        }
        let straight = findNearestTraders(traders, coord);
        if (!straight.length) return [];
        let maxDist = 0;
        for (let i = 0; i < straight.length; i++) {
            if (straight[i].dist > maxDist) maxDist = straight[i].dist;
        }
        let sd = planner.computeSourceDistances(
            payload.pts, payload.pairs, coord, payload.jumpCost, {maxDist: maxDist});
        return findNearestTradersTravel(traders, sd);
    }

    return {
        findNearestTraders: findNearestTraders,
        findNearestTradersTravel: findNearestTradersTravel,
        searchNearestTraders: searchNearestTraders
    };
});
