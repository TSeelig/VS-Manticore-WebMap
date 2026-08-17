/*
 * App bootstrap: page title/credits text, URL param + localStorage defaults,
 * theme switching, and goToCoords (the shared "move the view" helper used by
 * popups, tools and keybindings).
 */

// Get the data we need for the URL copy/paste handling
export const title = document.title = settings.title;
export const adr = document.location.href.replace(/\?.*/, "");

export const args = new URLSearchParams(document.location.href.replace(/.*\?/, ''));

export let cx = args.has('x') ? args.get('x') : 0;
export let cy = args.has('y') ? args.get('y') : 0;
export let zm = args.has('zoom') ? args.get('zoom') : 6;

if (localStorage.labelSize === undefined) {
    localStorage.labelSize = 10;
}
if (localStorage.theme === undefined) {
    localStorage.theme = 'css/classicblue.css';
}

export function applyStyle() {
    for (let ss = 0; ss < document.styleSheets.length; ss++) {
        if (document.styleSheets[ss].title == 'color') {
            if (!localStorage.theme.startsWith("css")) {
                localStorage.theme = "css/" + localStorage.theme;
            }
            document.styleSheets[ss].ownerNode.href = localStorage.theme;
            break;
        }
    }
}

applyStyle();

// The map view is created after this module loads (see map/mapView.js); tool
// callbacks, popups and keybindings only call goToCoords() after that has
// happened, so storing it via a setter keeps this module free of a direct
// dependency on map creation order.
let view = null;
export function setView(v) {
    view = v;
}

export function zoomBy(delta) {
    view.animate({zoom: view.getConstrainedZoom(view.getZoom() + delta), duration: 100});
}

/* ######################### View movement function ######################### */
export function goToCoords(where) {
    where = where.replace(/[\s \t]/g, '');
    if (where.match(/,/g) && where.match(/,/g).length > 0) {
        where = where.replace(/[^\d,-]/g, '');
        let xy = where.split(/,/);
        xy[1] = -xy[1];
        if (xy.length == 2) {
            view.animate({'center': [xy[0], xy[1]], 'duration': 200});
        } else {
            view.animate({'center': [xy[0], xy[2]], 'duration': 200});
        }
        return true;
    } else if (where.match(/=/g) && where.match(/=/g).length == 3) {
        where = where.replace(/[^\d=-]/g, '').replace(/=/, '');
        let xyz = where.split(/=/);
        xyz[2] = -xyz[2];
        view.animate({'center': [xyz[0], xyz[2]], 'duration': 200});
        return true;
    }
    return false;
}

// Bootstrap the static page chrome (title bar, credits, version text) that
// used to sit at the top of automap.js.
export function initBootstrap() {
    let serverWebsite = document.getElementById("serverWebsite");
    let serverWebsite2 = document.getElementById("serverWebsite2");
    serverWebsite.innerText = settings.title;
    serverWebsite.href = settings.siteUrl;
    serverWebsite2.innerText = settings.titleBarCommunity;
    serverWebsite2.href = settings.siteUrl;
    let lastUpdated = document.getElementById("lastUpdated");
    lastUpdated.innerText = settings.updateText + settings.lastUpdated;

    // Webmap build version, shown in the Credits foldout. This tracks the frontend
    // (this fork), independently of the data's "last updated" timestamp above.
    // version.js is overwritten by the build (Cake Package task) with the current
    // git commit date and hash; the constants below are the fallback when no
    // version.js is present.
    const WEBMAP_VERSION = (typeof webmapVersionInfo !== "undefined" && webmapVersionInfo.version) || "0.0.1";
    const WEBMAP_VERSION_DATE = (typeof webmapVersionInfo !== "undefined" && webmapVersionInfo.date) || "2026-06-03";
    const WEBMAP_VERSION_COMMIT = (typeof webmapVersionInfo !== "undefined" && webmapVersionInfo.commit) || "";
    let webmapVersion = document.getElementById("webmapVersion");
    if (webmapVersion) {
        let vText = "Webmap v" + WEBMAP_VERSION + " (" + WEBMAP_VERSION_DATE + ")";
        if (WEBMAP_VERSION_COMMIT) {
            vText += " · " + WEBMAP_VERSION_COMMIT;
        }
        webmapVersion.innerText = vText;
    }
    let titleName = document.getElementById("titleName");
    titleName.innerText = settings.titleBarName;
}
