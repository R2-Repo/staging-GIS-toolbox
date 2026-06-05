export function KinksDialog({ selectionCount = 0, onCancel, onFind }) {
    return (
        <div>
            <p>Find all points where lines or polygon edges cross over themselves. Useful for detecting geometry errors.</p>
            {selectionCount > 0 ? (
                <p className="info-box text-xs">
                    Checking <strong>{selectionCount}</strong> selected features.
                </p>
            ) : null}
            <div className="modal-footer">
                <button className="btn btn-secondary cancel-btn" onClick={() => onCancel?.()}>Cancel</button>
                <button className="btn btn-primary apply-btn" onClick={() => onFind?.()}>Find Kinks</button>
            </div>
        </div>
    );
}
