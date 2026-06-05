import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { NearestPointToLineDialog } from './NearestPointToLineDialog.jsx';

export function mountNearestPointToLineDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountNearestPointToLineDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, NearestPointToLineDialog, props);
    return { unmount };
}
