import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { BboxClipDialog } from './BboxClipDialog.jsx';

export function mountBboxClipDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountBboxClipDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, BboxClipDialog, props);
    return { unmount };
}
