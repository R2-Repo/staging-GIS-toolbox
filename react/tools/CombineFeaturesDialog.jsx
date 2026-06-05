export function CombineFeaturesDialog({ selectionCount = 0, onCancel, onCombine }) {
    return (
        <div>
            <p>Merge all features of the same geometry type into a single Multi-geometry feature (e.g., multiple Points -&gt; one MultiPoint).</p>
            {selectionCount > 0 ? (
                <p className="info-box text-xs">
                    Combining <strong>{selectionCount}</strong> selected features.
                </p>
            ) : null}
            <div className="modal-footer">
                <button className="btn btn-secondary cancel-btn" onClick={() => onCancel?.()}>Cancel</button>
                <button className="btn btn-primary apply-btn" onClick={() => onCombine?.()}>Combine</button>
            </div>
        </div>
    );
}
