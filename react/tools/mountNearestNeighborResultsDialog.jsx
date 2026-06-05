import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { NearestNeighborResultsDialog } from './NearestNeighborResultsDialog.jsx';

export function mountNearestNeighborResultsDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountNearestNeighborResultsDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, NearestNeighborResultsDialog, props);
    return { unmount };
}
