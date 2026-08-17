import { dataFolder } from '../../config.js';

// vsWorldGrid is defined by worldExtent.js, loaded as a classic global script.
export const vsWorld = new ol.layer.Tile({
    name: 'World',
    source: new ol.source.XYZ({
        interpolate: false,
        wrapx: false,
        tileGrid: vsWorldGrid,
        url: dataFolder + '/world/{z}/{x}_{y}.png',
    })
});
