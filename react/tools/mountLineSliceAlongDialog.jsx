import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { LineSliceAlongDialog } from './LineSliceAlongDialog.jsx';

export function mountLineSliceAlongDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountLineSliceAlongDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, LineSliceAlongDialog, props);
    return { unmount };
}
