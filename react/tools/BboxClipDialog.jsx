export function BboxClipDialog({ selectionCount = 0, onCancel, onDraw }) {
    return (
        <div>
            <p>Draw a rectangle on the map to clip features to that area.</p>
            {selectionCount > 0 ? (
                <p className="info-box text-xs">
                    Operating on <strong>{selectionCount}</strong> selected features.
                </p>
            ) : null}
            <div className="modal-footer">
                <button className="btn btn-secondary cancel-btn" onClick={() => onCancel?.()}>Cancel</button>
                <button className="btn btn-primary apply-btn" onClick={() => onDraw?.()}>Draw Rectangle on Map</button>
            </div>
        </div>
    );
}
