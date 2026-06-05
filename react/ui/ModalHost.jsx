import { useEffect, useMemo, useRef } from 'react';
import { dismissModal, triggerProgressCancel } from '../../js/ui/modals.js';

function BasicModal({ modal }) {
    const overlayRef = useRef(null);
    const mouseDownTargetRef = useRef(null);
    const mountedRef = useRef(false);

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const width = isMobile ? '96vw' : (modal.options?.width || '600px');

    const close = (result = null) => dismissModal(modal.id, result);

    useEffect(() => {
        if (mountedRef.current) return;
        const overlay = overlayRef.current;
        if (!overlay) return;
        mountedRef.current = true;
        overlay._close = close;
        overlay._resolve = () => {};
        modal.options?.onMount?.(overlay, close);
    }, [modal.id]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div
            ref={overlayRef}
            className="modal-overlay"
            onMouseDown={(e) => { mouseDownTargetRef.current = e.target; }}
            onClick={(e) => {
                if (e.target === overlayRef.current && mouseDownTargetRef.current === overlayRef.current) {
                    close(null);
                }
            }}
        >
            <div className="modal" style={{ width }}>
                <div className="modal-header">
                    <span>{modal.title}</span>
                    <button className="btn-icon close-modal" aria-label="Close" onClick={() => close(null)}>✕</button>
                </div>
                <div className="modal-body" dangerouslySetInnerHTML={{ __html: modal.contentHtml || '' }} />
                {modal.options?.footer ? (
                    <div className="modal-footer" dangerouslySetInnerHTML={{ __html: modal.options.footer }} />
                ) : null}
            </div>
        </div>
    );
}

function ProgressModal({ progress }) {
    const percent = useMemo(() => Math.max(0, Math.min(100, Number(progress.percent) || 0)), [progress.percent]);
    return (
        <div className="modal-overlay">
            <div className="modal" style={{ width: '400px' }}>
                <div className="modal-header">
                    <span>{progress.title}</span>
                </div>
                <div className="modal-body" style={{ textAlign: 'center', padding: '24px' }}>
                    <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
                    <div className="progress-step" style={{ marginBottom: '12px', color: 'var(--text-muted)' }}>{progress.step || 'Starting...'}</div>
                    <div className="progress-bar-container">
                        <div className="progress-bar-fill" style={{ width: `${percent}%` }}></div>
                        <div className="progress-bar-text">{Math.round(percent)}%</div>
                    </div>
                    <button
                        className="btn btn-secondary btn-sm cancel-task-btn"
                        style={{ marginTop: '12px' }}
                        onClick={() => triggerProgressCancel(progress.id)}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

export function ModalHost({ modals = [], progresses = [] }) {
    return (
        <>
            {modals.map((modal) => (
                <BasicModal key={`modal-${modal.id}`} modal={modal} />
            ))}
            {progresses.map((progress) => (
                <ProgressModal key={`progress-${progress.id}`} progress={progress} />
            ))}
        </>
    );
}
