import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { BezierSplineDialog } from './BezierSplineDialog.jsx';

export function mountBezierSplineDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountBezierSplineDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, BezierSplineDialog, props);
    return { unmount };
}
