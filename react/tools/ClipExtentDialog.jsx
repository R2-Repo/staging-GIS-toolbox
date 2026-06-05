export function ClipExtentDialog({ selectionCount = 0, onCancel, onApply }) {
    return (
        <div>
            <p>This will clip features to the current visible map area.</p>
            {selectionCount > 0 ? (
                <p className="info-box text-xs">
                    Operating on <strong>{selectionCount}</strong> selected features.
                </p>
            ) : null}
            <div className="modal-footer">
                <button className="btn btn-secondary cancel-btn" onClick={() => onCancel?.()}>Cancel</button>
                <button className="btn btn-primary apply-btn" onClick={() => onApply?.()}>Clip</button>
            </div>
        </div>
    );
}
