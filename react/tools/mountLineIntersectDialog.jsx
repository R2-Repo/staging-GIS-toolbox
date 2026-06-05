import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { LineIntersectDialog } from './LineIntersectDialog.jsx';

export function mountLineIntersectDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountLineIntersectDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, LineIntersectDialog, props);
    return { unmount };
}
