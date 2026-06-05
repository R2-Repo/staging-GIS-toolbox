import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { UnionPolygonsDialog } from './UnionPolygonsDialog.jsx';

export function mountUnionPolygonsDialog(element, props = {}) {
    if (!element) {
        throw new Error('mountUnionPolygonsDialog: target element is required');
    }

    void initLegacyBridge();
    const unmount = mountIsland(element, UnionPolygonsDialog, props);
    return { unmount };
}
