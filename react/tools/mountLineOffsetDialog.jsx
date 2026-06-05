import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { LineOffsetDialog } from './LineOffsetDialog.jsx';

export function mountLineOffsetDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountLineOffsetDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, LineOffsetDialog, props);
    return { unmount };
}
