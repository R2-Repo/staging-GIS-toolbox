import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { NearestNeighborAnalysisDialog } from './NearestNeighborAnalysisDialog.jsx';

export function mountNearestNeighborAnalysisDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountNearestNeighborAnalysisDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, NearestNeighborAnalysisDialog, props);
    return { unmount };
}
