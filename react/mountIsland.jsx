import { createRoot } from 'react-dom/client';

const REACT_ROOTS = new WeakMap();

/**
 * Mount a React island into an existing DOM element.
 * Returns an unmount callback for caller-managed teardown paths.
 */
export function mountIsland(element, Component, props = {}) {
  if (!element) {
    throw new Error('mountIsland: target element is required');
  }

  let root = REACT_ROOTS.get(element);
  if (!root) {
    root = createRoot(element);
    REACT_ROOTS.set(element, root);
  }

  root.render(<Component {...props} />);

  return () => {
    root.unmount();
    REACT_ROOTS.delete(element);
  };
}
