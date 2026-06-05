import { createRoot } from 'react-dom/client';
import { dismissToast, subscribeToasts } from '../../js/ui/toast.js';
import { ToastHost } from './ToastHost.jsx';

export function mountToastHost(element) {
    if (!element) {
        throw new Error('mountToastHost: target element is required');
    }


    const root = createRoot(element);
    let toasts = [];

    const removeLocalToast = (id) => {
        toasts = toasts.filter((toast) => toast.id !== id);
        render();
    };

    const render = () => {
        root.render(
            <ToastHost
                toasts={toasts}
                onDismiss={(id) => dismissToast(id)}
            />
        );
    };

    const unsubscribe = subscribeToasts((event) => {
        if (event?.type === 'add' && event.toast) {
            toasts = [...toasts, event.toast];
            render();
            return;
        }
        if (event?.type === 'remove' && event.id != null) {
            removeLocalToast(event.id);
        }
    });

    render();

    return {
        unmount: () => {
            unsubscribe();
            root.unmount();
        }
    };
}
