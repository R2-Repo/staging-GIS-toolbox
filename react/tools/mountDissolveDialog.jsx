import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { DissolveDialog } from './DissolveDialog.jsx';

export function mountDissolveDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountDissolveDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, DissolveDialog, props);
    return { unmount };
}
