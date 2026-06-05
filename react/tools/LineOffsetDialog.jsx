import { useState } from 'react';

const UNIT_OPTIONS = ['feet', 'meters', 'miles', 'kilometers'];

export function LineOffsetDialog({ selectionCount = 0, onCancel, onApply }) {
    const [distance, setDistance] = useState('10');
    const [units, setUnits] = useState('feet');

    return (
        <div>
            <p>Create a parallel copy of line features, offset by the specified distance. Positive = right side, negative = left side.</p>
            <div className="form-group">
                <label>Offset distance</label>
                <input
                    type="number"
                    value={distance}
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
            {selectionCount > 0 ? (
                <div className="info-box text-xs">
                    Operating on <strong>{selectionCount}</strong> selected features.
                </div>
            ) : null}
            <div className="modal-footer">
                <button className="btn btn-secondary cancel-btn" onClick={() => onCancel?.()}>Cancel</button>
                <button
                    className="btn btn-primary apply-btn"
                    onClick={() => onApply?.({ dist: parseFloat(distance), units })}
                >
                    Offset
                </button>
            </div>
        </div>
    );
}
