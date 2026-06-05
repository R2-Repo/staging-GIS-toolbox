import { mountIsland } from '../mountIsland.jsx';
import { HeaderBar } from './HeaderBar.jsx';

export function mountHeaderBar(element, props = {}) {
    if (!element) {
        throw new Error('mountHeaderBar: target element is required');
    }

    const unmount = mountIsland(element, HeaderBar, props);
    return { unmount };
}
