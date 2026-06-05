import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { AlongToolDialog } from './AlongToolDialog.jsx';

export function mountAlongToolDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountAlongToolDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, AlongToolDialog, props);
    return { unmount };
}
