import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { ClipExtentDialog } from './ClipExtentDialog.jsx';

export function mountClipExtentDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountClipExtentDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, ClipExtentDialog, props);
    return { unmount };
}
