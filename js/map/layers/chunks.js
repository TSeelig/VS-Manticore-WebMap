import { dataFolder } from '../../config.js';

export const vsGenChunks = new ol.layer.Vector({
    className: 'vsGenChunks',
    name: 'Explored Chunks',
    source: new ol.source.Vector({
        url: dataFolder + '/geojson/chunk.geojson',
        format: new ol.format.GeoJSON(),
    }),
    opacity: 0.5,
    style: function (feature) {
        return new ol.style.Style({
            fill: new ol.style.Fill({color: feature.get('color')}),
            stroke: new ol.style.Stroke({color: '#000000', width: 1}),
        });
    }
});
