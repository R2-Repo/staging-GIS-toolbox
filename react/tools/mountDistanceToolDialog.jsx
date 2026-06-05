import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { DistanceToolDialog } from './DistanceToolDialog.jsx';

export function mountDistanceToolDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountDistanceToolDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, DistanceToolDialog, props);
    return { unmount };
}
