import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { SimplifyToolDialog } from './SimplifyToolDialog.jsx';

export function mountSimplifyToolDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountSimplifyToolDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, SimplifyToolDialog, props);
    return { unmount };
}
