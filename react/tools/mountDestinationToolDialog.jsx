import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { DestinationToolDialog } from './DestinationToolDialog.jsx';

export function mountDestinationToolDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountDestinationToolDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, DestinationToolDialog, props);
    return { unmount };
}
