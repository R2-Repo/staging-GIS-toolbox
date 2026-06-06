/**
 * Toast notification system
 */

const TOAST_DURATION = 5000;
const _subscribers = new Set();
let _nextToastId = 1;

function _emitToastEvent(event) {
    _subscribers.forEach((listener) => {
        try {
            listener(event);
        } catch {
            // Keep toast delivery resilient if a subscriber errors.
        }
    });
}

function _buildToastPayload(message, type, options = {}) {
    return {
        id: _nextToastId++,
        message,
        type,
        details: options.details || null,
        duration: options.duration ?? TOAST_DURATION
    };
}

export function subscribeToasts(listener) {
    if (typeof listener !== 'function') {
        throw new Error('subscribeToasts requires a listener function');
    }
    _subscribers.add(listener);
    return () => _subscribers.delete(listener);
}

export function dismissToast(id) {
    if (id == null) return;
    _emitToastEvent({ type: 'remove', id });
}

export function showToast(message, type = 'info', options = {}) {
    const payload = _buildToastPayload(message, type, options);

    _emitToastEvent({ type: 'add', toast: payload });
    let removed = false;
    const remove = () => {
        if (removed) return;
        removed = true;
        dismissToast(payload.id);
    };
    if (payload.duration > 0) {
        setTimeout(remove, payload.duration);
    }
    return { id: payload.id, remove };
}

/**
 * Show a user-friendly error with guidance
 */
export function showErrorToast(errorInfo) {
    const msg = `<strong>${errorInfo.title || 'Error'}</strong><br>${errorInfo.message}`;
    const details = [errorInfo.guidance, errorInfo.technical].filter(Boolean).join('<br><br>');
    return showToast(msg, 'error', { details, duration: 8000 });
}

export default { showToast, showErrorToast };
