/*
 * Translocator proximity filter: when enabled, only translocators whose
 * endpoints fall within tlProximityRadius (in blocks) of the cursor are
 * drawn. Rendering every translocator at once is expensive on dense maps, so
 * culling to the area around the cursor keeps panning and zooming responsive.
 */
import { vsTranslocators, setProximityFilter } from '../map/layers/translocators.js';
import { switcher } from '../ui/layerSwitcher.js';
import { el, setChildren } from '../core/dom.js';
import { TL_PROXIMITY_MIN_EXP, TL_PROXIMITY_MAX_EXP, TL_PROXIMITY_DEFAULT_EXP } from '../config.js';

if (localStorage.tlProximityRadius === undefined) {
    localStorage.tlProximityRadius = Math.pow(2, TL_PROXIMITY_DEFAULT_EXP);
}

// Round an arbitrary radius down to the nearest valid power-of-two exponent.
function tlRadiusToExp(radius) {
    let exp = Math.round(Math.log2(radius));
    return Math.min(TL_PROXIMITY_MAX_EXP, Math.max(TL_PROXIMITY_MIN_EXP, exp));
}

let tlProximityMode = false;
let tlProximityRadius = Math.pow(2, tlRadiusToExp(Number(localStorage.tlProximityRadius)));
let tlCursorCoord = undefined;
let tlProximityRafPending = false;
// While pinned, the proximity area stops following the cursor and stays where
// it was last clicked. Clicking the map again unpins it and resumes tracking.
let tlProximityPinned = false;

export function isTlProximityModeActive() {
    return tlProximityMode;
}

// A translucent circle drawn around the cursor to visualise the active range.
export const vsTlProximityRange = new ol.layer.Vector({
    name: 'TlProximityRange',
    source: new ol.source.Vector(),
    zIndex: 9997,
    style: function (feature) {
        // A small dot marks the anchor point while the area is pinned.
        if (feature.get('tlPinCenter')) {
            return new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 4,
                    fill: new ol.style.Fill({color: 'rgba(221, 170, 255, 0.95)'}),
                    stroke: new ol.style.Stroke({color: 'rgba(120, 0, 160, 0.95)', width: 1}),
                }),
            });
        }
        // The pinned circle is drawn more prominently than the tracking one.
        if (tlProximityPinned) {
            return new ol.style.Style({
                stroke: new ol.style.Stroke({color: 'rgba(221, 170, 255, 1)', width: 3}),
                fill: new ol.style.Fill({color: 'rgba(192, 0, 192, 0.12)'}),
            });
        }
        return new ol.style.Style({
            stroke: new ol.style.Stroke({color: 'rgba(221, 170, 255, 0.9)', width: 2}),
            fill: new ol.style.Fill({color: 'rgba(192, 0, 192, 0.08)'}),
        });
    }
});

// Reposition the range circle on the cursor (or clear it when there is none).
function updateTlProximityRange() {
    let src = vsTlProximityRange.getSource();
    src.clear();
    if (tlProximityMode && tlCursorCoord) {
        src.addFeature(new ol.Feature(new ol.geom.Circle(tlCursorCoord, tlProximityRadius)));
        // Mark the fixed anchor so it is obvious the area is pinned.
        if (tlProximityPinned) {
            let center = new ol.Feature(new ol.geom.Point(tlCursorCoord));
            center.set('tlPinCenter', true);
            src.addFeature(center);
        }
    }
}

// True when the feature has at least one endpoint within the proximity radius of
// the cursor. Uses squared distances to avoid a sqrt per endpoint.
function tlNearCursor(feature) {
    if (!tlCursorCoord) {
        return false;
    }
    let coords = feature.getGeometry().flatCoordinates;
    let r2 = tlProximityRadius * tlProximityRadius;
    for (let i = 0; i + 1 < coords.length; i += 2) {
        let dx = coords[i] - tlCursorCoord[0];
        let dy = coords[i + 1] - tlCursorCoord[1];
        if (dx * dx + dy * dy <= r2) {
            return true;
        }
    }
    return false;
}

// Predicate handed to the Translocators layer (map/layers/translocators.js)
// so it can cull its own rendering without importing this module back.
export function isTlVisible(feature) {
    return !tlProximityMode || tlNearCursor(feature);
}

// Pin or unpin the proximity area at `coord`. Pinning freezes the circle in
// place (it no longer tracks the cursor); unpinning lets it follow again.
export function toggleTlProximityPin(coord) {
    tlProximityPinned = !tlProximityPinned;
    tlCursorCoord = coord;
    updateTlProximityRange();
    vsTranslocators.changed();
}

// Called on every map pointermove. No-ops unless the filter is active and
// unpinned. Re-rendering is throttled to one redraw per animation frame so
// fast mouse movement stays smooth.
export function onCursorMove(coord) {
    if (!tlProximityMode || tlProximityPinned) return;
    tlCursorCoord = coord;
    updateTlProximityRange();
    if (!tlProximityRafPending) {
        tlProximityRafPending = true;
        requestAnimationFrame(function () {
            tlProximityRafPending = false;
            vsTranslocators.changed();
        });
    }
}

/* ######################### Panel UI ######################### */
// Anchor the proximity panel directly under the legend, matching the route /
// trader panels.
function positionTlProximityPanel(panel) {
    let layers = document.getElementById('layers');
    if (!layers) return;
    let r = layers.getBoundingClientRect();
    panel.style.left = r.left + 'px';
    panel.style.top = (r.bottom + 6) + 'px';
    panel.style.width = r.width + 'px';
    panel.style.boxSizing = 'border-box';
}

let panelEl = null;
let valueEl = null;

// Lazily build the radius slider the first time the filter is enabled.
function ensureTlProximityPanel() {
    if (panelEl) return panelEl;

    valueEl = el('div', {id: 'tlProximityValue', style: {marginTop: '4pt', textAlign: 'center'}},
        tlProximityRadius + ' blocks');

    // The slider operates on the power-of-two exponent so every step doubles or
    // halves the radius.
    let slider = el('input', {
        type: 'range',
        id: 'tlProximityRange',
        min: TL_PROXIMITY_MIN_EXP,
        max: TL_PROXIMITY_MAX_EXP,
        step: 1,
        value: tlRadiusToExp(tlProximityRadius),
        oninput: function () {
            tlProximityRadius = Math.pow(2, Number(slider.value));
            localStorage.tlProximityRadius = tlProximityRadius;
            setChildren(valueEl, tlProximityRadius + ' blocks');
            updateTlProximityRange();
            vsTranslocators.changed();
        }
    });

    panelEl = el('div', {id: 'tlProximityPanel', class: 'c', style: {position: 'absolute', zIndex: '1000', padding: '4pt 6pt', display: 'none'}},
        el('div', {class: 'layerSwitcherTitle', style: {fontWeight: 'bold', paddingBottom: '2pt', borderBottom: '1px solid var(--layerSwitcherTitleSeparator)'}}, 'Translocator range'),
        valueEl,
        slider
    );
    document.body.append(panelEl);
    return panelEl;
}

export function toggleTlProximityMode() {
    tlProximityMode = !tlProximityMode;
    let btn = document.getElementById('tlProximity');
    let panel = ensureTlProximityPanel();
    if (tlProximityMode) {
        if (btn) btn.classList.add('selected');
        // The filter is useless if the Translocators layer is hidden, so make
        // sure it is visible when the tool is selected.
        if (!vsTranslocators.get('visible')) {
            switcher.toggleVis(vsTranslocators.get('name'));
        }
        panel.style.display = 'block';
        positionTlProximityPanel(panel);
        vsTranslocators.setMinZoom(1);
    } else {
        if (btn) btn.classList.remove('selected');
        panel.style.display = 'none';
        // Reset so the filter starts in tracking mode next time it is enabled.
        tlProximityPinned = false;
        vsTranslocators.setMinZoom(2);
    }
    updateTlProximityRange();
    vsTranslocators.changed();
}

// Re-anchor the panel (called by main.js when the legend's height changes).
export function repositionPanel() {
    if (panelEl && panelEl.style.display !== 'none') positionTlProximityPanel(panelEl);
}

// Wire the layer's proximity culling to this module's predicate. Called once
// by main.js after both modules are loaded.
setProximityFilter(isTlVisible);
