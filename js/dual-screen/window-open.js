/**
 * Dual Screen — window.open result checks.
 * Do not pass `noopener` to window.open for the map window: browsers return null
 * even when the popup opens, which breaks activation and shows a false "blocked" toast.
 */

/**
 * @param {Window | null} win
 * @returns {boolean}
 */
export function isSecondaryMapWindowOpen(win) {
    return !!(win && !win.closed);
}

/** Same-origin map popup — keep a Window reference for focus/close/poll. */
export const MAP_WINDOW_OPEN_FEATURES = 'noreferrer';
