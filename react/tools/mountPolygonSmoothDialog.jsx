import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { PolygonSmoothDialog } from './PolygonSmoothDialog.jsx';

export function mountPolygonSmoothDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountPolygonSmoothDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, PolygonSmoothDialog, props);
    return { unmount };
}
