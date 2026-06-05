import { useMemo, useState } from 'react';

export function DissolveDialog({ fields = [], selectionCount = 0, onCancel, onDissolve }) {
    const options = useMemo(() => fields.filter((field) => field && field.name), [fields]);
    const [field, setField] = useState('');

    return (
        <div>
            <p>Merge polygons that share the same field value, or merge everything into one polygon.</p>
            <div className="form-group">
                <label>Dissolve field</label>
                <select value={field} onChange={(e) => setField(e.target.value)}>
                    <option value="">— Merge all polygons (no grouping field) —</option>
                    {options.map((opt) => (
                        <option key={opt.name} value={opt.name}>
                            {opt.name}
                        </option>
                    ))}
                </select>
            </div>
            {selectionCount > 0 ? (
                <div className="info-box text-xs">
                    Dissolving <strong>{selectionCount}</strong> selected features.
                </div>
            ) : null}
            <div className="modal-footer">
                <button className="btn btn-secondary cancel-btn" onClick={() => onCancel?.()}>Cancel</button>
                <button className="btn btn-primary apply-btn" onClick={() => onDissolve?.({ field })}>Dissolve</button>
            </div>
        </div>
    );
}
