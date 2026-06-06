/**
 * Modal + Bottom Sheet helpers
 */

const _modalSubscribers = new Set();
const _modalResolvers = new Map();
const _progressCancelHandlers = new Map();
let _nextModalId = 1;
let _nextProgressId = 1;

function _emitModalEvent(event) {
    _modalSubscribers.forEach((listener) => {
        try {
            listener(event);
        } catch {
            // Keep modal delivery resilient if a subscriber errors.
        }
    });
}

export function subscribeModalEvents(listener) {
    if (typeof listener !== 'function') {
        throw new Error('subscribeModalEvents requires a listener function');
    }
    _modalSubscribers.add(listener);
    return () => _modalSubscribers.delete(listener);
}

export function dismissModal(id, result = null) {
    const resolve = _modalResolvers.get(id);
    if (resolve) {
        _modalResolvers.delete(id);
        resolve(result);
    }
    _emitModalEvent({ type: 'removeModal', id });
}

export function triggerProgressCancel(id) {
    const fn = _progressCancelHandlers.get(id);
    if (typeof fn === 'function') {
        fn();
    }
}

export function dismissProgressModal(id) {
    _progressCancelHandlers.delete(id);
    _emitModalEvent({ type: 'removeProgress', id });
}

export function showModal(title, contentHtml, options = {}) {
    const id = _nextModalId++;
    return new Promise((resolve) => {
        _modalResolvers.set(id, resolve);
        _emitModalEvent({
            type: 'showModal',
            modal: { id, title, contentHtml, options }
        });
    });
}

/**
 * Simple confirm dialog
 */
export function confirm(title, message) {
    return showModal(title, `<p>${message}</p>`, {
        footer: `<button class="btn btn-secondary cancel-btn">Cancel</button>
                 <button class="btn btn-primary confirm-btn">Confirm</button>`,
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn').onclick = () => close(false);
            overlay.querySelector('.confirm-btn').onclick = () => close(true);
        }
    });
}

/**
 * Show progress modal for long operations
 */
export function showProgressModal(title) {
    const id = _nextProgressId++;
    _emitModalEvent({
        type: 'showProgress',
        progress: { id, title, percent: 0, step: 'Starting...' }
    });
    return {
        update(percent, step) {
            _emitModalEvent({
                type: 'updateProgress',
                id,
                percent,
                step: step || 'Starting...'
            });
        },
        onCancel(fn) {
            _progressCancelHandlers.set(id, fn);
        },
        close() {
            dismissProgressModal(id);
        },
        element: null
    };
}

export default { showModal, confirm, showProgressModal };
