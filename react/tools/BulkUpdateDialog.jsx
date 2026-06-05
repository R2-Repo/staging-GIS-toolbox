import { useEffect, useMemo, useState } from 'react';

export function BulkUpdateDialog({
    layers = [],
    onCancel,
    onStartSelection,
    onStopSelection,
    onSelectAll,
    onInvertSelection,
    onClearSelection,
    onGetSelectionCount,
    onApply
}) {
    const [layerId, setLayerId] = useState('');
    const [updates, setUpdates] = useState([]);
    const [selectionCount, setSelectionCount] = useState(0);
    const [selectionMode, setSelectionMode] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const selectedLayer = useMemo(
        () => layers.find((layer) => layer.id === layerId) || null,
        [layers, layerId]
    );

    useEffect(() => {
        if (!layerId) {
            setSelectionCount(0);
            return;
        }
        const refreshCount = () => {
            const count = onGetSelectionCount?.(layerId) ?? 0;
            setSelectionCount(count);
        };
        refreshCount();
        const timer = setInterval(refreshCount, 500);
        return () => clearInterval(timer);
    }, [layerId, onGetSelectionCount]);

    const addUpdateRow = () => {
        if (!selectedLayer?.fields?.length) return;
        setUpdates((current) => [...current, { field: selectedLayer.fields[0], value: '' }]);
    };

    const removeUpdateRow = (idx) => {
        setUpdates((current) => current.filter((_, i) => i !== idx));
    };

    const patchUpdateRow = (idx, patch) => {
        setUpdates((current) => current.map((entry, i) => (
            i === idx ? { ...entry, ...patch } : entry
        )));
    };

    const startSelection = () => {
        setError('');
        onStartSelection?.(layerId);
        setSelectionMode(true);
        setMessage('Selection mode enabled. Click features on the map to select/deselect.');
    };

    const stopSelection = () => {
        onStopSelection?.();
        setSelectionMode(false);
        setMessage('Selection mode disabled.');
    };

    const applyBulkUpdate = async () => {
        setError('');
        setMessage('');
        try {
            const validUpdates = updates.filter((entry) => entry.field);
            if (!layerId) throw new Error('Choose a target layer.');
            if (validUpdates.length === 0) throw new Error('Add at least one field update.');
            const result = await onApply?.({ layerId, updates: validUpdates });
            if (!result) return;
            setMessage(
                `Updated ${result.fieldCount} field${result.fieldCount === 1 ? '' : 's'} on ${result.updatedCount} feature${result.updatedCount === 1 ? '' : 's'}.`
            );
        } catch (err) {
            setError(err?.message || 'Bulk update failed.');
        }
    };

    return (
        <div>
            {error ? (
                <div className="info-box text-xs mb-8" style={{ color: 'var(--danger)' }}>{error}</div>
            ) : null}
            {message ? (
                <div className="info-box text-xs mb-8">{message}</div>
            ) : null}

            <div className="form-group">
                <label>Target layer</label>
                <select
                    value={layerId}
                    onChange={(e) => {
                        setLayerId(e.target.value);
                        setUpdates([]);
                        setSelectionMode(false);
                        setError('');
                        setMessage('');
                    }}
                >
                    <option value="">- select layer -</option>
                    {layers.map((layer) => (
                        <option key={layer.id} value={layer.id}>
                            {layer.name} ({layer.featureCount})
                        </option>
                    ))}
                </select>
            </div>

            {selectedLayer ? (
                <div className="form-group">
                    <label>Selection controls</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        <button className="btn btn-secondary btn-sm" onClick={startSelection}>
                            {selectionMode ? 'Selection On' : 'Start Selection'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={stopSelection}>
                            Stop Selection
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => onSelectAll?.(layerId)}>
                            Select All
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => onInvertSelection?.(layerId)}>
                            Invert
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => onClearSelection?.(layerId)}>
                            Clear
                        </button>
                    </div>
                    <div className="text-xs text-muted">
                        {selectionCount} selected of {selectedLayer.featureCount}
                    </div>
                </div>
            ) : null}

            {selectedLayer ? (
                <div className="form-group">
                    <label>Field updates</label>
                    {updates.length === 0 ? (
                        <div className="text-xs text-muted mb-8">No fields added yet.</div>
                    ) : null}
                    {updates.map((entry, idx) => (
                        <div key={`update-${idx}`} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                            <select value={entry.field} onChange={(e) => patchUpdateRow(idx, { field: e.target.value })}>
                                {selectedLayer.fields.map((field) => (
                                    <option key={`${idx}-${field}`} value={field}>{field}</option>
                                ))}
                            </select>
                            <input
                                type="text"
                                value={entry.value}
                                placeholder="new value"
                                onChange={(e) => patchUpdateRow(idx, { value: e.target.value })}
                            />
                            <button className="btn btn-secondary btn-sm" onClick={() => removeUpdateRow(idx)}>X</button>
                        </div>
                    ))}
                    <button className="btn btn-secondary btn-sm" onClick={addUpdateRow}>+ Add Field</button>
                </div>
            ) : null}

            <div className="modal-footer">
                <button className="btn btn-secondary cancel-btn" onClick={() => onCancel?.()}>Cancel</button>
                <button
                    className="btn btn-primary apply-btn"
                    onClick={applyBulkUpdate}
                    disabled={!selectedLayer || updates.length === 0 || selectionCount === 0}
                >
                    Apply Bulk Update
                </button>
            </div>
        </div>
    );
}
