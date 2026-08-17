/*
 * Web Worker that runs the nearest-trader search off the main thread.
 *
 * The proximity/routing math lives in the dependency-free route.js and
 * traders.js modules, which load here as globals (RoutePlanner / TraderFinder)
 * via importScripts. The main thread (js/features/traderFinder.js) posts a plain-data payload
 * and gets the ranked results back, so even a heavy translocator search never
 * blocks rendering or input.
 */
/* global importScripts, RoutePlanner, TraderFinder */
importScripts('route.js', 'traders.js');

self.onmessage = function (e) {
    var msg = e.data || {};
    var reqId = msg.reqId;
    try {
        var results = TraderFinder.searchNearestTraders(msg, RoutePlanner);
        self.postMessage({reqId: reqId, results: results});
    } catch (err) {
        self.postMessage({reqId: reqId, error: String(err && err.message || err)});
    }
};
