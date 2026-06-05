import { useState } from 'react';

export function SimplifyToolDialog({ selectionCount = 0, onCancel, onApply }) {
    const [tolerance, setTolerance] = useState('0.001');

    return (
        <div>
            <div className="form-group">
                <label>Tolerance (degrees, e.g., 0.001)</label>
                <input
                    type="number"
                    value={tolerance}
                    min="0.00001"
                    step="0.0001"
                    onChange={(e) => setTolerance(e.target.value)}
                />
            </div>
            {selectionCount > 0 ? (
                <div className="info-box text-xs">
                    Operating on <strong>{selectionCount}</strong> selected features.
                </div>
            ) : null}
            <div className="modal-footer">
                <button className="btn btn-secondary cancel-btn" onClick={() => onCancel?.()}>Cancel</button>
                <button
                    className="btn btn-primary apply-btn"
                    onClick={() => onApply?.({ tol: parseFloat(tolerance) })}
                >
                    Simplify
                </button>
            </div>
        </div>
    );
}
