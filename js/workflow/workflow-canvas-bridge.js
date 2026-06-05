/**
 * Bridge between the imperative workflow overlay and the React Flow canvas.
 * React registers screenToFlowPosition when mounted; overlay uses it for drops.
 */

let _screenToFlowPosition = null;

export function registerWorkflowScreenToFlow(fn) {
    _screenToFlowPosition = typeof fn === 'function' ? fn : null;
}

export function clientToFlowPosition(clientX, clientY, canvasEl) {
    if (_screenToFlowPosition) {
        try {
            const point = _screenToFlowPosition({ x: clientX, y: clientY });
            if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
                return point;
            }
        } catch {
            // Fall through to canvas-relative placement.
        }
    }

    if (!canvasEl) return { x: 100, y: 100 };
    const rect = canvasEl.getBoundingClientRect();
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}
