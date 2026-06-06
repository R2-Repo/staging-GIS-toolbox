export function RunPreviewFooter({
    onCancel,
    onRun,
    runLabel = 'Run',
    cancelLabel = 'Cancel',
    running = false,
    disabled = false
}) {
    return (
        <div className="modal-footer">
            <button className="btn btn-secondary cancel-btn" onClick={() => onCancel?.()}>
                {cancelLabel}
            </button>
            <button
                className="btn btn-primary apply-btn"
                onClick={() => onRun?.()}
                disabled={disabled || running}
            >
                {running ? 'Running...' : runLabel}
            </button>
        </div>
    );
}
