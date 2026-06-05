import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { BufferToolDialog } from './BufferToolDialog.jsx';

export function mountBufferToolDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountBufferToolDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, BufferToolDialog, props);
    return { unmount };
}
