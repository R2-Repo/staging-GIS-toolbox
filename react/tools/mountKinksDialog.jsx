import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { KinksDialog } from './KinksDialog.jsx';

export function mountKinksDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountKinksDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, KinksDialog, props);
    return { unmount };
}
