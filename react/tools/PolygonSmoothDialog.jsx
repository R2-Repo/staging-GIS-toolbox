import { useState } from 'react';

export function PolygonSmoothDialog({ selectionCount = 0, onCancel, onApply }) {
    const [iterations, setIterations] = useState('1');

    return (
        <div>
            <p>Smooth jagged polygon edges by averaging corner positions.</p>
            <div className="form-group">
                <label>Iterations (higher = smoother, default 1)</label>
                <input
                    type="number"
                    value={iterations}
                    min="1"
                    max="10"
                    step="1"
                    onChange={(e) => setIterations(e.target.value)}
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
                    onClick={() => onApply?.({ iter: parseInt(iterations, 10) })}
                >
                    Smooth
                </button>
            </div>
        </div>
    );
}
