import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { BearingToolDialog } from './BearingToolDialog.jsx';

export function mountBearingToolDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountBearingToolDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, BearingToolDialog, props);
    return { unmount };
}
