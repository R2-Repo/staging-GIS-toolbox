import { useState } from 'react';

const ICONS = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌'
};

function ToastItem({ toast, onDismiss }) {
    const [showDetails, setShowDetails] = useState(false);

    return (
        <div className={`toast toast-${toast.type}`}>
            <span>{ICONS[toast.type] || ''}</span>
            <div className="toast-content">
                <div dangerouslySetInnerHTML={{ __html: String(toast.message || '') }} />
                {toast.details ? (
                    <>
                        <div
                            className="toast-details"
                            onClick={() => setShowDetails((prev) => !prev)}
                        >
                            Show details
                        </div>
                        <div
                            className={`toast-details-body ${showDetails ? '' : 'hidden'}`}
                            dangerouslySetInnerHTML={{ __html: String(toast.details || '') }}
                        />
                    </>
                ) : null}
            </div>
            <span
                className="toast-close"
                onClick={() => onDismiss(toast.id)}
            >
                ✕
            </span>
        </div>
    );
}

export function ToastHost({ toasts = [], onDismiss }) {
    return (
        <>
            {toasts.map((toast) => (
                <ToastItem
                    key={toast.id}
                    toast={toast}
                    onDismiss={onDismiss}
                />
            ))}
        </>
    );
}
