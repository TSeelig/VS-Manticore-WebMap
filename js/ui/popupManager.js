/*
 * Generic popup builder. Every text value here - including e['content'] for
 * the 'p' element type - is rendered through core/dom.js as a text node, so
 * it is never parsed as HTML. That matters because map/clickHandler.js
 * builds 'translocator'/'trader' popup content by interpolating strings that
 * come straight from the game save (trader name, translocator label) - those
 * must never be able to inject markup, no matter what characters a player
 * put in them.
 *
 * The one exception is the 'extSource' element type, used solely by the
 * Contribution Guide popup to inline contribute-fragment.html - a same-origin
 * file authored by the site maintainer, not game data. That is the only
 * trustedHtml() call in this file; nothing else should ever need one.
 */
import { el, trustedHtml } from '../core/dom.js';
import { goToCoords, applyStyle } from '../app.js';
import { vsLandmarks } from '../map/layers/landmarks.js';

/* ######################### Popups Manager ######################### */
export class PopupManager {
    constructor() {
        this.popups = {};
    }

    createPopup(which, show = true, params = false) {
        if (which in this.popups || !(which in popupsRef)) {
            console.log(`Can't create popup '${which}' because it already exists or its definition doesn't exist.`);
            return;
        }
        let def = popupsRef[which];
        let focus = false;
        let popupBlock = el('div', {id: 'popup_' + which, class: 'popup ' + def['css'].join(' ')},
            el('div', {class: 'title'}, def['title'])
        );
        this.popups[which] = popupBlock;

        let ref = def['elements'] == 'params' ? params['elements'] : def['elements'];
        for (let key in ref) {
            let e = ref[key];
            switch (e['type']) {
                // Paragraph - always rendered as plain text, see file header.
                case 'p': {
                    popupBlock.append(el('p', {}, e['content']));
                    break;
                }
                // Input box
                case 'input': {
                    if (e['label']) {
                        popupBlock.append(el('label', {for: e['name']}, e['label']));
                    }
                    let input = el('input', {
                        type: e['input-type'],
                        name: e['name'],
                        id: e['id'],
                    });
                    if (input.type == 'number') {
                        input.min = e['min'];
                        input.max = e['max'];
                        input.value = typeof e['default'] === 'function' ? e['default']() : e['default'];
                    }
                    if (e['onkeypress']) {
                        input.addEventListener('keypress', e['onkeypress']);
                    }
                    popupBlock.append(input);
                    if (e['focus']) {
                        focus = e['id'];
                    }
                    break;
                }
                // Select box
                case 'select': {
                    if (e['label']) {
                        popupBlock.append(el('label', {for: e['name']}, e['label']));
                    }
                    let input = el('select', {name: e['name'], id: e['id']});
                    if (typeof (e['source']) === 'object') {
                        for (let option in e['source']) {
                            let src = e['source'][option];
                            let op = el('option', {value: src.val}, src.op);
                            input.append(op);
                            if (src.val == localStorage.theme) {
                                input.selectedIndex = option;
                            }
                        }
                    } else if (e['source'] === 'Landmarks') {
                        vsLandmarks.getSource().forEachFeature((feature) => {
                            let coords = feature.getGeometry().getCoordinates();
                            coords = [coords[0], -coords[1]];
                            let op = el('option', {value: coords.toString()}, feature.get('label'));
                            input.append(op);
                        });
                        let options = Array.from(input.options).sort((a, b) => a.text.localeCompare(b.text));
                        input.replaceChildren(...options);
                        input.selectedIndex = 0;
                    } else {
                        console.log('Error: parameter must be a dict with {op, val}.');
                    }
                    if (e['onkeypress']) {
                        input.addEventListener('keypress', e['onkeypress']);
                    }
                    if (e['searchable']) {
                        // Turn the dropdown into a filterable listbox: a text
                        // box narrows the visible options live while the
                        // <select> still holds the real value, so the Ok /
                        // Enter handlers keep working unchanged.
                        input.size = Math.min(8, Math.max(2, input.options.length));
                        let search = el('input', {
                            type: 'text',
                            id: e['id'] + '_search',
                            placeholder: 'Type to filter…',
                            autocomplete: 'off',
                            style: {marginBottom: '4px'},
                        });
                        let filterOptions = function () {
                            let q = search.value.trim().toLowerCase();
                            let firstVisible = null;
                            for (let op of Array.from(input.options)) {
                                let match = op.text.toLowerCase().indexOf(q) !== -1;
                                op.hidden = !match;
                                op.disabled = !match;
                                if (match && !firstVisible) firstVisible = op;
                            }
                            // Keep a valid selection so Ok / Enter navigate to a
                            // visible result instead of a filtered-out one.
                            let cur = input.selectedOptions[0];
                            if (firstVisible) {
                                if (!cur || cur.hidden) firstVisible.selected = true;
                            } else {
                                input.selectedIndex = -1;
                            }
                        };
                        search.addEventListener('input', filterOptions);
                        // Arrow-down jumps from the filter box into the list.
                        search.addEventListener('keydown', function (ev) {
                            if (ev.key === 'ArrowDown') {
                                ev.preventDefault();
                                input.focus();
                            }
                        });
                        if (e['onkeypress']) {
                            search.addEventListener('keypress', e['onkeypress']);
                        }
                        popupBlock.append(search);
                    }
                    popupBlock.append(input);
                    if (e['focus']) {
                        focus = e['searchable'] ? (e['id'] + '_search') : e['id'];
                    }
                    break;
                }
                // Trusted, same-origin, developer-authored fragment. See file header.
                case 'extSource': {
                    let div = el('div', {}, el('p', {}, 'Loading… ⌛'));
                    fetch(e['content']).then((r) => r.text()).then((html) => trustedHtml(div, html));
                    popupBlock.append(div);
                    break;
                }
            }
        }

        let controls = el('div', {class: 'controls'});
        for (let key in def['controls']) {
            let e = def['controls'][key];
            controls.append(el('button', {
                class: 'c' + (e['default'] ? ' default' : ''),
                title: e['title'],
                id: 'popup_' + which + '_' + e['title'],
                onclick: e['callback'],
            }, e['title']));
        }
        popupBlock.append(controls);

        if (show) {
            this.showPopup(which, focus);
        }
    }

    showPopup(which, focus = false) {
        this.popups[which].classList.add('vis');
        let popupBG = el('div', {id: 'popupBG'});
        document.body.appendChild(popupBG);
        document.body.appendChild(this.popups[which]);
        if (focus) {
            document.getElementById(focus).focus();
        }
    }

    destroyPopup(which) {
        this.popups[which].remove();
        delete this.popups[which];
        document.getElementById('popupBG').remove();
    }
}

// Single shared instance, matching the previous global `poper`.
export const poper = new PopupManager();

const popupsRef = {
    'gps': {
        'title': 'Move to coordinates',
        'css': ['c', 'gps'],
        'elements': {
            'description': {
                'type': 'p',
                'content': 'Enter the coordinates you want to reach in either of these two formats:'
            },
            'description2': {
                'type': 'p',
                'content': 'X,Z in game coordinates: 2050,6900'
            },
            'description3': {
                'type': 'p',
                'content': 'Campaign cartographer: X = -1170, Y = 113, Z = -3800'
            },
            'input': {
                'type': 'input',
                'input-type': 'text',
                'id': 'input_data',
                'name': 'input_data',
                'label': 'Coordinates:',
                'focus': true,
                'onkeypress': (event) => {
                    if (event.keyCode == 13) {
                        if (goToCoords(document.getElementById('input_data').value.trim())) {
                            poper.destroyPopup('gps');
                        }
                    }
                }
            }
        },
        'controls': {
            'Ok': {
                'title': 'Go to coordinates',
                'default': true,
                'callback': () => {
                    if (goToCoords(document.getElementById('input_data').value.trim())) {
                        poper.destroyPopup('gps');
                    }
                }
            },
            'Cancel': {
                'title': 'Cancel',
                'callback': () => poper.destroyPopup('gps')
            }
        }
    },
    'landmarks': {
        'title': 'Go to landmark',
        'css': ['c', 'gps'],
        'elements': {
            'description': {
                'type': 'p',
                'content': 'Type to filter, then pick a landmark from the list.'
            },
            'input': {
                'type': 'select',
                'id': 'select_data',
                'name': 'select_data',
                'label': 'Landmarks from the "Landmarks" layer:',
                'focus': true,
                'searchable': true,
                'source': 'Landmarks',
                'onkeypress': (event) => {
                    if (event.keyCode == 13) {
                        if (goToCoords(document.getElementById('select_data').value.trim())) {
                            poper.destroyPopup('landmarks');
                        }
                    }
                }
            }
        },
        'controls': {
            'Ok': {
                'title': 'Go to landmark',
                'default': true,
                'callback': () => {
                    if (goToCoords(document.getElementById('select_data').value.trim())) {
                        poper.destroyPopup('landmarks');
                    }
                }
            },
            'Cancel': {
                'title': 'Cancel',
                'callback': () => poper.destroyPopup('landmarks')
            }
        }
    },
    'translocator': {
        'title': 'Translocators pair information',
        'css': ['c', 'gps'],
        'elements': 'params',
        'controls': {
            'Close': {
                'title': 'Close',
                'callback': () => poper.destroyPopup('translocator')
            }
        }
    },
    'trader': {
        'title': 'Trader information',
        'css': ['c', 'gps'],
        'elements': 'params',
        'controls': {
            'Close': {
                'title': 'Close',
                'callback': () => poper.destroyPopup('trader')
            }
        }
    },
    'contribute': {
        'title': 'Web Map Contribution Guide',
        'css': ['c', 'guide'],
        'elements': {
            'description': {
                'type': 'extSource',
                'content': 'contribute-fragment.html'
            }
        },
        'controls': {
            'Close': {
                'title': 'Close',
                'callback': () => poper.destroyPopup('contribute')
            }
        }
    },
    'settings': {
        'title': 'Map Settings',
        'css': ['c', 'gps'],
        'elements': {
            'description': {
                'type': 'p',
                'content': 'Customize the Web Map to your liking.'
            },
            'input1': {
                'type': 'select',
                'id': 'theme_data',
                'name': 'theme_data',
                'label': 'Legend and Tools Style:',
                'focus': true,
                'source': [{op: 'Classic Blue', val: 'css/classicblue.css'},
                    {op: 'Charcoal Gray', val: 'css/charcoalgray.css'}]
            },
            'input2': {
                'type': 'input',
                'input-type': 'number',
                'min': 8,
                'max': 144,
                'default': () => localStorage.labelSize,
                'id': 'label_size_data',
                'name': 'label_size_data',
                'label': 'Label Size (px):',
                'focus': false,
            }
        },
        'controls': {
            'Ok': {
                'title': 'Apply changes',
                'default': true,
                'callback': () => {
                    localStorage.labelSize = document.getElementById('label_size_data').value;
                    localStorage.theme = document.getElementById('theme_data').value;
                    applyStyle();
                    vsLandmarks.getSource().refresh();
                    poper.destroyPopup('settings');
                }
            },
            'Cancel': {
                'title': 'Cancel',
                'callback': () => poper.destroyPopup('settings')
            }
        }
    }
};
