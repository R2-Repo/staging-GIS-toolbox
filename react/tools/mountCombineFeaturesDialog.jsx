import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { CombineFeaturesDialog } from './CombineFeaturesDialog.jsx';

export function mountCombineFeaturesDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountCombineFeaturesDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, CombineFeaturesDialog, props);
    return { unmount };
}
