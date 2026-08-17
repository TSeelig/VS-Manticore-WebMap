import { el } from '../core/dom.js';
import { icons, colorsRef, showSubLayerItems } from '../config.js';

const visibleIcon = () => el('i', {class: 'fa-solid fa-eye'});
const invisibleIcon = () => el('i', {class: 'fa-solid fa-eye-slash'});

/* ######################### LayerSwitcher ######################### */
export class LayerSwitcher {
    constructor(elementId) {
        this.el = document.getElementById(elementId);
        this.layers = {}; // name -> legend DOM block
        this.olLayers = {}; // name -> ol.layer, populated by buildLegend()
    }

    toggleVis(layerName) {
        let layer = this.olLayers[layerName];
        if (!layer) return;
        let hideBt = document.getElementById('layerSwitcherBtHide' + layerName);
        if (layer.get('visible')) {
            layer.setVisible(false);
            if (hideBt) hideBt.replaceChildren(invisibleIcon());
            this.toggleLegendVis(layerName, true);
        } else {
            layer.setVisible(true);
            if (hideBt) hideBt.replaceChildren(visibleIcon());
        }
    }

    toggleLegendVis(legendName, hideOnly) {
        let legend = document.getElementById('legend' + legendName);
        let bt = document.getElementById('layerSwitcherBtLegend' + legendName);
        if (legend.showLegend == true) {
            legend.showLegend = false;
            legend.style.display = 'none';
            if (bt) bt.innerText = '▽';
        } else if (!hideOnly) {
            legend.showLegend = true;
            legend.style.display = '';
            if (bt) bt.innerText = '△';
        }
    }

    buildLegend(layer) {
        this.olLayers[layer.get('name')] = layer;

        let btLegend = el('button', {
            class: 'c',
            id: 'layerSwitcherBtLegend' + layer.get('name'),
            title: 'Toggle the legend visibility for the ' + layer.get('name') + ' layer.',
            onclick: () => this.toggleLegendVis(layer.get('name'), false),
        }, '△');

        let btHide = el('button', {
            class: 'c',
            id: 'layerSwitcherBtHide' + layer.get('name'),
            title: 'Toggle the visibility for the ' + layer.get('name') + ' layer.',
            onclick: () => this.toggleVis(layer.get('name')),
        }, visibleIcon());

        let title = el('div', {class: 'layerSwitcherTitle'}, layer.get('name'), btLegend, btHide);

        let itemsList = el('ul', {id: 'legend' + layer.get('name')});
        itemsList.showLegend = true;

        for (let i in colorsRef[layer.get('name')]) {
            itemsList.append(this.buildLegendRow(layer, i));
        }

        let layerBlock = el('div', {id: 'ls' + layer.get('name'), class: 'layerBlock'}, title);
        this.el.append(layerBlock);
        this.el.append(itemsList);
        this.layers[layer.get('name')] = layerBlock;
    }

    buildLegendRow(layer, itemName) {
        let layerName = layer.get('name');
        let symbol = el('object', {id: 'icon' + layerName + itemName.replace(/ /, '')});
        if (typeof (icons[layerName]) == 'object') {
            symbol.data = icons[layerName][itemName];
            if (symbol.data.endsWith('png')) {
                symbol.style.cssText = 'vertical-align: middle; margin-right: 4pt; margin-bottom: 4pt;';
                symbol.type = 'image/png';
            } else {
                symbol.style.cssText = 'width: 5mm; height: auto; vertical-align: middle; margin-right: 4pt; margin-bottom: 4pt;';
                symbol.type = 'image/svg+xml';
            }
        } else {
            symbol.data = icons[layerName];
            symbol.style.cssText = 'width: 5mm; height: auto; vertical-align: middle; margin-right: 4pt; margin-bottom: 4pt;';
            symbol.type = 'image/svg+xml';
        }
        if (symbol.data.endsWith('svg')) {
            let color = colorsRef[layerName][itemName];
            symbol.addEventListener('load', function (e) {
                let iconEl = e.target.contentDocument.getElementById('icon');
                iconEl.setAttribute('style', iconEl.getAttribute('style').replace(/#ffffff/, 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')'));
            });
        }

        let btHide = el('button', {
            class: 'c',
            id: 'layerSwitcherBtHideI' + itemName,
            title: 'Toggle the visibility for the Item: ' + itemName + ' layer.',
            onclick: () => {
                let isOn = showSubLayerItems[layerName][itemName];
                showSubLayerItems[layerName][itemName] = !isOn;
                document.getElementById('layerSwitcherBtHideI' + itemName).replaceChildren(isOn ? invisibleIcon() : visibleIcon());
                layer.changed();
            }
        }, visibleIcon());

        return el('li', {}, symbol, itemName, btHide);
    }
}

// Single shared instance, matching the previous global `switcher`.
export const switcher = new LayerSwitcher('layerSwitcher');
