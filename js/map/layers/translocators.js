import { dataFolder, icons, colorsRef, showSubLayerItems } from '../../config.js';

// Resolve the legend category (and thus color) of a translocator feature.
// Elk-traversable (<AM:TLE>) takes precedence so they stand out, then the
// tag-based specials, then labeled (named) translocators, otherwise it's a
// plain Translocator. Named translocators route identically to plain ones;
// the distinction is purely visual.
export function tlTypeName(feature) {
    if (feature.get('elkTrav')) return 'Elk Translocator';
    let tag = feature.get('tag');
    if (tag == 'SPAWN') return 'Spawn Translocator';
    if (tag == 'TP') return 'Teleporter';
    let label = feature.get('label');
    if (label != undefined && label.length > 0) return 'Named Translocator';
    return 'Translocator';
}

export function tlColorFor(feature) {
    return colorsRef['Translocators'][tlTypeName(feature)];
}

// The translocator proximity filter (features/tlProximity.js) wants to cull
// features out of this layer's render without this module having to import
// that feature module (which would create a two-way dependency between "the
// layer" and "the tool that filters it"). Instead the filter tool calls
// setProximityFilter() once at startup with its own predicate.
let proximityFilter = null;
export function setProximityFilter(fn) {
    proximityFilter = fn;
}

export const vsTranslocators = new ol.layer.Vector({
    name: 'Translocators',
    minZoom: 2,
    source: new ol.source.Vector({
        url: dataFolder + '/geojson/translocators.geojson',
        format: new ol.format.GeoJSON(),
    }),
    style: function (feature) {
        // Proximity culling: skip translocators far from the cursor entirely.
        if (proximityFilter && !proximityFilter(feature)) {
            return null;
        }
        let type = tlTypeName(feature);
        let tlCol = colorsRef['Translocators'][type];
        let isOn = showSubLayerItems['Translocators'][type];
        let opacity = isOn ? 1 : 0;
        return [
            new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: tlCol.concat(opacity),
                    width: 2,
                })
            }),
            new ol.style.Style({
                image: new ol.style.Icon({
                    color: tlCol,
                    opacity: opacity,
                    src: icons['Translocators']
                }),
                geometry: function (feature) {
                    let coordinates = feature.getGeometry().getCoordinates();
                    return new ol.geom.MultiPoint(coordinates);
                }
            })
        ];
    }
});

// Highlight style used when hovering a translocator line.
export const highlightStyleTranslocator = [
    new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: '#ddaaff',
            width: 3,
        }),
    }),
    new ol.style.Style({
        image: new ol.style.Icon({
            color: [255, 192, 255],
            opacity: 1,
            src: icons['Translocators']
        }),
        geometry: function (feature) {
            let coordinates = feature.getGeometry().getCoordinates();
            return new ol.geom.MultiPoint(coordinates);
        }
    })
];
