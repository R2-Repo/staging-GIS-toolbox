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
    // #region agent log
    fetch('http://127.0.0.1:7495/ingest/cb18b7af-0a6b-4209-9942-6947b4257285',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'81f010'},body:JSON.stringify({sessionId:'81f010',location:'modals.js:dismissModal',message:'dismissModal',data:{id,result},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7495/ingest/cb18b7af-0a6b-4209-9942-6947b4257285',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'81f010'},body:JSON.stringify({sessionId:'81f010',location:'modals.js:showModal',message:'showModal called',data:{id,title,subscriberCount:_modalSubscribers.size,hasOnMount:typeof options.onMount==='function',hasFooter:!!options.footer},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
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
            const cancelBtn = overlay.querySelector('.cancel-btn');
            const confirmBtn = overlay.querySelector('.confirm-btn');
            // #region agent log
            fetch('http://127.0.0.1:7495/ingest/cb18b7af-0a6b-4209-9942-6947b4257285',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'81f010'},body:JSON.stringify({sessionId:'81f010',location:'modals.js:confirm:onMount',message:'confirm onMount wiring',data:{cancelFound:!!cancelBtn,confirmFound:!!confirmBtn,overlayModalCount:document.querySelectorAll('.modal-overlay').length},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
            // #endregion
            if (cancelBtn) cancelBtn.onclick = () => close(false);
            if (confirmBtn) confirmBtn.onclick = () => close(true);
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
        update(percent, step, meta = {}) {
            _emitModalEvent({
                type: 'updateProgress',
                id,
                percent,
                step: step || 'Starting...',
                ...meta
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
