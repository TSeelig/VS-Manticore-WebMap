import { dataFolder, icons, colorsRef, showSubLayerItems } from '../../config.js';

export const vsTraders = new ol.layer.Vector({
    name: 'Traders',
    minZoom: 3,
    source: new ol.source.Vector({
        url: dataFolder + '/geojson/traders.geojson',
        format: new ol.format.GeoJSON(),
    }),
    style: function (feature) {
        let isOn = showSubLayerItems['Traders'][feature.get('wares')];
        return new ol.style.Style({
            image: new ol.style.Icon({
                color: colorsRef['Traders'][feature.get('wares')],
                opacity: isOn,
                src: icons['Traders'],
            }),
        });
    }
});

// Highlight style used when hovering a trader marker.
export function highlightStyleTrader(feature) {
    return new ol.style.Style({
        image: new ol.style.Icon({
            color: colorsRef['Traders'][feature.get('wares')].map((val) => Math.min(Math.max(val * 1.5, 64), 255)),
            src: icons['Traders'],
        })
    });
}
