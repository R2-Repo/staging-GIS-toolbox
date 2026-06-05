import { useState } from 'react';

const UNIT_OPTIONS = ['feet', 'meters', 'miles', 'kilometers'];

export function BufferToolDialog({
    selectionCount = 0,
    totalCount = 0,
    showLargeDatasetWarning = false,
    onCancel,
    onApply
}) {
    const [distance, setDistance] = useState('100');
    const [units, setUnits] = useState('feet');

    return (
        <div>
            <div className="form-group">
                <label>Buffer distance</label>
                <input
                    type="number"
                    value={distance}
                    min="0.001"
                    step="1"
                    onChange={(e) => setDistance(e.target.value)}
                />
            </div>
            <div className="form-group">
                <label>Units</label>
                <select value={units} onChange={(e) => setUnits(e.target.value)}>
                    {UNIT_OPTIONS.map((unit) => (
                        <option key={unit} value={unit}>
                            {unit.charAt(0).toUpperCase() + unit.slice(1)}
                        </option>
                    ))}
                </select>
            </div>
            {showLargeDatasetWarning ? (
                <div className="warning-box">Large dataset — this may be slow.</div>
            ) : null}
            {selectionCount > 0 ? (
                <div className="info-box text-xs">
                    Operating on <strong>{selectionCount}</strong> selected features (of {totalCount}).
                </div>
            ) : null}
            <div className="modal-footer">
                <button className="btn btn-secondary cancel-btn" onClick={() => onCancel?.()}>Cancel</button>
                <button
                    className="btn btn-primary apply-btn"
                    onClick={() => onApply?.({ dist: parseFloat(distance), units })}
                >
                    Buffer
                </button>
            </div>
        </div>
    );
}
