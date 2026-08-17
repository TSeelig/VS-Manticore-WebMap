/*
 * Safe DOM-building primitive used everywhere in the webmap UI.
 *
 * `el()` never accepts an HTML string: attributes are set as DOM
 * properties/attributes and every child is either a Node or becomes a text
 * node (never parsed as markup). This means data that ultimately comes from
 * the game save (trader names, translocator/landmark labels) can never be
 * interpreted as HTML no matter what characters a player put in them.
 *
 * `trustedHtml()` is the one deliberate, loudly-named exception: it is used
 * only for the Contribution Guide popup, which injects a same-origin file
 * shipped by the site maintainer (contribute-fragment.html), never game data.
 * Nothing else in js/ should call it - grep for `trustedHtml` to audit.
 */

// el(tag, attrs?, ...children)
// - attrs: plain object of DOM properties/attributes/event handlers. Omit or
//   pass a child in its place.
// - children: strings (-> text node), Nodes, arrays of either (flattened),
//   or null/undefined/false (skipped).
export function el(tag, attrs, ...children) {
    if (attrs instanceof Node || typeof attrs === 'string' || typeof attrs === 'number' || Array.isArray(attrs)) {
        children = [attrs, ...children];
        attrs = null;
    }
    let node = document.createElement(tag);
    for (let key in attrs) {
        let value = attrs[key];
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class' || key === 'className') {
            node.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(node.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            node[key] = value;
        } else if (key in node) {
            node[key] = value;
        } else {
            node.setAttribute(key, value);
        }
    }
    appendChildren(node, children);
    return node;
}

function appendChildren(node, children) {
    for (let child of children) {
        if (child === null || child === undefined || child === false) continue;
        if (Array.isArray(child)) {
            appendChildren(node, child);
        } else if (child instanceof Node) {
            node.appendChild(child);
        } else {
            node.appendChild(document.createTextNode(String(child)));
        }
    }
}

// Append (never replace) plain-text content as a text node.
export function text(str) {
    return document.createTextNode(String(str));
}

// Remove all children of `node`.
export function clear(node) {
    node.textContent = '';
}

// Replace the contents of `node` with `children` (same rules as el()'s
// children: strings/Nodes/arrays).
export function setChildren(node, ...children) {
    clear(node);
    appendChildren(node, children);
    return node;
}

// The one intentional innerHTML escape hatch - see file header. `htmlString`
// must be trusted, same-origin, developer-authored content, never data that
// includes anything derived from the game save or user input.
export function trustedHtml(node, htmlString) {
    node.innerHTML = htmlString;
    return node;
}
