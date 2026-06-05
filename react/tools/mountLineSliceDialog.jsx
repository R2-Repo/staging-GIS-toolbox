import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { LineSliceDialog } from './LineSliceDialog.jsx';

export function mountLineSliceDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountLineSliceDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, LineSliceDialog, props);
    return { unmount };
}
