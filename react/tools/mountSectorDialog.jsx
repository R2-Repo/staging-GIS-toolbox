import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { SectorDialog } from './SectorDialog.jsx';

export function mountSectorDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountSectorDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, SectorDialog, props);
    return { unmount };
}
