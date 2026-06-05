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

function showModalLegacy(title, contentHtml, options = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const isMobile = window.innerWidth < 768;
        const width = isMobile ? '96vw' : (options.width || '600px');
        overlay.innerHTML = `
            <div class="modal" style="width:${width}">
                <div class="modal-header">
                    <span>${title}</span>
                    <button class="btn-icon close-modal" aria-label="Close">✕</button>
                </div>
                <div class="modal-body">${contentHtml}</div>
                ${options.footer ? `<div class="modal-footer">${options.footer}</div>` : ''}
            </div>`;

        document.body.appendChild(overlay);

        const close = (result) => {
            overlay.remove();
            resolve(result);
        };

        overlay.querySelector('.close-modal').onclick = () => close(null);

        let mouseDownTarget = null;
        overlay.addEventListener('mousedown', (e) => { mouseDownTarget = e.target; });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && mouseDownTarget === overlay) close(null);
        });

        overlay._close = close;
        overlay._resolve = resolve;

        if (options.onMount) options.onMount(overlay, close);
    });
}

export function showModal(title, contentHtml, options = {}) {
    if (_modalSubscribers.size > 0) {
        const id = _nextModalId++;
        return new Promise((resolve) => {
            _modalResolvers.set(id, resolve);
            _emitModalEvent({
                type: 'showModal',
                modal: { id, title, contentHtml, options }
            });
        });
    }

    return showModalLegacy(title, contentHtml, options);
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

function showProgressModalLegacy(title) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal" style="width:400px">
            <div class="modal-header">
                <span>${title}</span>
            </div>
            <div class="modal-body" style="text-align:center; padding:24px;">
                <div class="spinner" style="margin:0 auto 12px;"></div>
                <div class="progress-step" style="margin-bottom:12px; color:var(--text-muted);">Starting...</div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width:0%"></div>
                    <div class="progress-bar-text">0%</div>
                </div>
                <button class="btn btn-secondary btn-sm cancel-task-btn" style="margin-top:12px;">Cancel</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    return {
        update(percent, step) {
            const bar = overlay.querySelector('.progress-bar-fill');
            const text = overlay.querySelector('.progress-bar-text');
            const stepEl = overlay.querySelector('.progress-step');
            if (bar) bar.style.width = percent + '%';
            if (text) text.textContent = Math.round(percent) + '%';
            if (stepEl && step) stepEl.textContent = step;
        },
        onCancel(fn) {
            const btn = overlay.querySelector('.cancel-task-btn');
            if (btn) btn.onclick = fn;
        },
        close() {
            overlay.remove();
        },
        element: overlay
    };
}

/**
 * Show progress modal for long operations
 */
export function showProgressModal(title) {
    if (_modalSubscribers.size > 0) {
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

    return showProgressModalLegacy(title);
}

export default { showModal, confirm, showProgressModal };
