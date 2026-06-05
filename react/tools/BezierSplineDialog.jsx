import { useState } from 'react';

export function BezierSplineDialog({ selectionCount = 0, onCancel, onApply }) {
    const [resolution, setResolution] = useState('10000');
    const [sharpness, setSharpness] = useState('0.85');

    return (
        <div>
            <p>Smooth line features into curved bezier splines.</p>
            <div className="form-group">
                <label>Resolution (higher = smoother, default 10000)</label>
                <input
                    type="number"
                    value={resolution}
                    min="100"
                    step="500"
                    onChange={(e) => setResolution(e.target.value)}
                />
            </div>
            <div className="form-group">
                <label>Sharpness (0-1, higher = sharper curves)</label>
                <input
                    type="number"
                    value={sharpness}
                    min="0"
                    max="1"
                    step="0.05"
                    onChange={(e) => setSharpness(e.target.value)}
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
                    onClick={() => onApply?.({
                        res: parseInt(resolution, 10),
                        sharp: parseFloat(sharpness)
                    })}
                >
                    Apply
                </button>
            </div>
        </div>
    );
}
