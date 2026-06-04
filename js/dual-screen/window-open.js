/**
 * Dual Screen — open the secondary map window with a usable Window reference.
 *
 * `noopener` and `noreferrer` both cause window.open() to return null while the
 * popup may still open — activation then fails and primary keeps its map.
 */

export const MAP_WINDOW_NAME = 'gis-toolbox-map';
export const MAP_WINDOW_PATH = 'map-window.html';

/**
 * @param {Window | null} win
 * @returns {boolean}
 */
export function isSecondaryMapWindowOpen(win) {
    return !!(win && !win.closed);
}

/**
 * Open (or reuse) the named map window. No windowFeatures — noreferrer implies noopener.
 * @returns {Window | null}
 */
export function openSecondaryMapWindow() {
    const win = window.open(MAP_WINDOW_PATH, MAP_WINDOW_NAME);
    if (win) {
        try {
            win.opener = null;
        } catch (_) { /* ignore */ }
    }
    return win;
}
