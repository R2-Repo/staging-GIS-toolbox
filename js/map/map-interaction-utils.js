/**
 * Shared helpers for ephemeral map interactions (sketch rectangles, polygons, picks).
 */

/** Matches box-select epsilon in map-manager `_setupRectangleSelect` (screen px, bbox diagonal). */
export const RECT_DRAG_MIN_DIAGONAL_PX = 10;

/**
 * Prevent feature popups / global map click clears while a transient interaction consumes the gesture.
 * @param {maplibregl.MapMouseEvent | maplibregl.MapTouchEvent} e MapLibre event
 */
export function markMapInteractionHandled(e) {
    if (!e) return;
    try {
        e._drawHandled = true;
        if (e.originalEvent && typeof e.originalEvent === 'object') {
            e.originalEvent._drawHandled = true;
        }
    } catch (_) { /* noop */ }
}

/**
 * @param {number} west
 * @param {number} south
 * @param {number} east
 * @param {number} north
 * @param {(lngLatTuple: number[]) => { x: number, y: number }} project Same contract as MapLibre `map.project`.
 * @param {number} [minPx]
 * @returns {boolean}
 */
export function bboxDiagonalMeetsMinDragPx(west, south, east, north, project, minPx = RECT_DRAG_MIN_DIAGONAL_PX) {
    const p1 = project([west, south]);
    const p2 = project([east, north]);
    const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    return d >= minPx;
}
