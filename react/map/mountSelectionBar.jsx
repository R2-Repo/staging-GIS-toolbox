import { mountIsland } from '../mountIsland.jsx';
import { SelectionBar } from './SelectionBar.jsx';

export function mountSelectionBar(element, props = {}) {
    if (!element) {
        throw new Error('mountSelectionBar: target element is required');
    }

    const unmount = mountIsland(element, SelectionBar, props);
    return { unmount };
}
