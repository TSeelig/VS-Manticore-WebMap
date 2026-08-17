import { dataFolder, icons, colorsRef, showSubLayerItems } from '../../config.js';

// Resolution at zoom 0 in the view's resolutions ladder (map/mapView.js),
// which halves every zoom step. Converting the style function's own
// `resolution` argument to an equivalent zoom level here avoids this module
// needing to import the ol.Map instance just to read its current zoom.
const BASE_RESOLUTION = 256;

function resolutionToZoom(resolution) {
    return Math.round(Math.log2(BASE_RESOLUTION / resolution));
}

export const vsLandmarks = new ol.layer.Vector({
    name: 'Landmarks',
    minZoom: 2,
    source: new ol.source.Vector({
        url: dataFolder + '/geojson/landmarks.geojson',
        format: new ol.format.GeoJSON(),
    }),
    style: function (feature, resolution) {
        if (feature.get('type') == 'Misc' && resolutionToZoom(resolution) < 9) {
            return new ol.style.Style({
                image: new ol.style.Icon({
                    opacity: 0,
                    src: icons['Landmarks'][feature.get('type')]
                })
            });
            // TODO : find a way to return nothing instead of an invisible icon, it would probably be more efficient
        } else {
            let isOn = showSubLayerItems['Landmarks'][feature.get('type')];
            let image = null, text = null;
            if (isOn) {
                image = new ol.style.Icon({
                    color: colorsRef['Landmarks'][feature.get('type')],
                    opacity: isOn,
                    src: icons['Landmarks'][feature.get('type')],
                });
                text = new ol.style.Text({
                    font: 'bold ' + String(localStorage.labelSize) + 'px "arial narrow", "sans serif"',
                    text: feature.get('label'),
                    textAlign: 'left',
                    textBaseline: 'bottom',
                    offsetX: 10,
                    fill: new ol.style.Fill({color: [0, 0, 0]}),
                    stroke: new ol.style.Stroke({color: [255, 255, 255], width: 3}),
                });
            }
            return new ol.style.Style({
                zIndex: ((feature.get('type') == 'Server') ? 1000 : undefined),
                image, text
            });
        }
    }
});
