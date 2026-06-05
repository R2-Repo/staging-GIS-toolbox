import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { NearestPointOnLineDialog } from './NearestPointOnLineDialog.jsx';

export function mountNearestPointOnLineDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountNearestPointOnLineDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, NearestPointOnLineDialog, props);
    return { unmount };
}
