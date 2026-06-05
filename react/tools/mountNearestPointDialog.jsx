import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { NearestPointDialog } from './NearestPointDialog.jsx';

export function mountNearestPointDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountNearestPointDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, NearestPointDialog, props);
    return { unmount };
}
