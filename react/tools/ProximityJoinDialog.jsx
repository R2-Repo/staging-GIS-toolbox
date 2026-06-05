import { useMemo, useRef, useState } from 'react';

function formatValue(value) {
    if (value == null) return '-';
    if (typeof value === 'number') {
        if (Math.abs(value) < 100) return value.toFixed(2);
        return Math.round(value).toLocaleString();
    }
    return String(value);
}

export function ProximityJoinDialog({
    layers = [],
    unitOptions = [],
    onCancel,
    onPreview,
    onRun
}) {
    const [sourceLayerId, setSourceLayerId] = useState('');
    const [targetLayerId, setTargetLayerId] = useState('');
    const [selectionOnly, setSelectionOnly] = useState(false);
    const [units, setUnits] = useState(unitOptions[0]?.value || 'feet');
    const [maxRadius, setMaxRadius] = useState('');
    const [writeDistance, setWriteDistance] = useState(true);
    const [writeMatchId, setWriteMatchId] = useState(false);
    const [matchIdField, setMatchIdField] = useState('');
    const [writeMatchLayer, setWriteMatchLayer] = useState(false);
    const [fieldMappings, setFieldMappings] = useState([]);
    const [preview, setPreview] = useState(null);
    const [results, setResults] = useState(null);
    const [status, setStatus] = useState('');
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');
    const cancelRef = useRef(false);

    const sourceLayer = useMemo(
        () => layers.find((layer) => layer.id === sourceLayerId) || null,
        [layers, sourceLayerId]
    );
    const targetLayer = useMemo(
        () => layers.find((layer) => layer.id === targetLayerId) || null,
        [layers, targetLayerId]
    );

    const canRun = Boolean(
        sourceLayerId &&
        targetLayerId &&
        sourceLayerId !== targetLayerId &&
        fieldMappings.some((mapping) => mapping.targetField && mapping.newFieldName)
    );

    const onLayerChange = (nextSourceId, nextTargetId) => {
        setSourceLayerId(nextSourceId);
        setTargetLayerId(nextTargetId);
        setFieldMappings([]);
        setPreview(null);
        setResults(null);
        setError('');
        setSelectionOnly(false);
        setMatchIdField('');
    };

    const updateMapping = (idx, patch) => {
        setFieldMappings((current) => current.map((entry, i) => (
            i === idx ? { ...entry, ...patch } : entry
        )));
    };

    const removeMapping = (idx) => {
        setFieldMappings((current) => current.filter((_, i) => i !== idx));
    };

    const buildConfig = () => ({
        sourceLayerId,
        targetLayerId,
        selectionOnly,
        units,
        maxRadius,
        writeDistance,
        writeMatchId,
        matchIdField,
        writeMatchLayer,
        fieldMappings
    });

    const runPreview = async () => {
        try {
            setError('');
            setResults(null);
            const data = await onPreview?.(buildConfig());
            setPreview(data || { columns: [], rows: [] });
        } catch (err) {
            setPreview(null);
            setError(err?.message || 'Unable to build preview.');
        }
    };

    const runJoin = async () => {
        cancelRef.current = false;
        setRunning(true);
        setStatus('Initializing...');
        setError('');
        setPreview(null);
        try {
            const output = await onRun?.(buildConfig(), {
                onProgress: (nextStatus) => setStatus(nextStatus || ''),
                isCancelled: () => cancelRef.current
            });
            if (output?.cancelled) {
                setStatus('Cancelled.');
                return;
            }
            setResults(output || null);
            setStatus('');
        } catch (err) {
            setError(err?.message || 'Proximity join failed.');
            setStatus('');
        } finally {
            setRunning(false);
        }
    };

    if (running) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '30px 12px' }}>
                <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>{status || 'Working...'}</div>
                <button className="btn btn-secondary btn-sm" onClick={() => { cancelRef.current = true; setStatus('Cancelling...'); }}>
                    Cancel
                </button>
            </div>
        );
    }

    return (
        <div>
            {error ? (
                <div className="info-box text-xs mb-8" style={{ color: 'var(--danger)' }}>{error}</div>
            ) : null}

            {results ? (
                <div>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Results</div>
                    <div style={{ fontSize: 12, marginBottom: 8 }}>
                        <div><strong>{results.total?.toLocaleString?.() || results.total || 0}</strong> features processed</div>
                        <div><strong>{results.matched?.toLocaleString?.() || results.matched || 0}</strong> matched</div>
                        <div><strong>{results.unmatched?.toLocaleString?.() || results.unmatched || 0}</strong> unmatched</div>
                    </div>
                    {results.warnings?.length ? (
                        <div className="info-box text-xs mb-8">
                            {results.warnings.map((warning) => (
                                <div key={warning}>- {warning}</div>
                            ))}
                        </div>
                    ) : null}
                    <div className="modal-footer">
                        <button className="btn btn-secondary cancel-btn" onClick={() => onCancel?.()}>Close</button>
                    </div>
                </div>
            ) : (
                <div>
                    <div className="form-group">
                        <label>Source layer</label>
                        <select value={sourceLayerId} onChange={(e) => onLayerChange(e.target.value, targetLayerId)}>
                            <option value="">- select source layer -</option>
                            {layers.map((layer) => (
                                <option key={layer.id} value={layer.id}>
                                    {layer.name} ({layer.featureCount})
                                </option>
                            ))}
                        </select>
                        {sourceLayer ? (
                            <label className="checkbox-row" style={{ marginTop: 6 }}>
                                <input
                                    type="checkbox"
                                    checked={selectionOnly}
                                    disabled={!sourceLayer.selectedCount}
                                    onChange={(e) => setSelectionOnly(e.target.checked)}
                                /> Use selected features only ({sourceLayer.selectedCount || 0} selected)
                            </label>
                        ) : null}
                    </div>

                    <div className="form-group">
                        <label>Target layer</label>
                        <select value={targetLayerId} onChange={(e) => onLayerChange(sourceLayerId, e.target.value)}>
                            <option value="">- select target layer -</option>
                            {layers.map((layer) => (
                                <option key={layer.id} value={layer.id}>
                                    {layer.name} ({layer.featureCount})
                                </option>
                            ))}
                        </select>
                    </div>

                    {targetLayer ? (
                        <div className="form-group">
                            <label>Field mappings (target field -&gt; new source field)</label>
                            {fieldMappings.length === 0 ? (
                                <div className="text-xs text-muted">No mappings yet.</div>
                            ) : null}
                            {fieldMappings.map((mapping, idx) => (
                                <div key={`map-${idx}`} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                                    <select
                                        value={mapping.targetField}
                                        onChange={(e) => {
                                            const nextValue = e.target.value;
                                            updateMapping(idx, {
                                                targetField: nextValue,
                                                newFieldName: mapping.newFieldName || (nextValue ? `nearest_${nextValue}` : '')
                                            });
                                        }}
                                    >
                                        <option value="">- target field -</option>
                                        {targetLayer.fields.map((field) => (
                                            <option key={field} value={field}>{field}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="text"
                                        value={mapping.newFieldName}
                                        placeholder="new field name"
                                        onChange={(e) => updateMapping(idx, { newFieldName: e.target.value })}
                                    />
                                    <button className="btn btn-secondary btn-sm" onClick={() => removeMapping(idx)}>X</button>
                                </div>
                            ))}
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setFieldMappings((current) => [...current, { targetField: '', newFieldName: '' }])}
                            >
                                + Add Field
                            </button>
                        </div>
                    ) : null}

                    {sourceLayer && targetLayer ? (
                        <div className="form-group">
                            <label>Settings</label>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                                <select value={units} onChange={(e) => setUnits(e.target.value)}>
                                    {unitOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={maxRadius}
                                    placeholder="Max radius (optional)"
                                    onChange={(e) => setMaxRadius(e.target.value)}
                                />
                            </div>
                            <label className="checkbox-row">
                                <input type="checkbox" checked={writeDistance} onChange={(e) => setWriteDistance(e.target.checked)} /> Add nearest distance field
                            </label>
                            <label className="checkbox-row">
                                <input
                                    type="checkbox"
                                    checked={writeMatchId}
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        setWriteMatchId(checked);
                                        if (!checked) setMatchIdField('');
                                    }}
                                /> Add matched target id field
                            </label>
                            {writeMatchId ? (
                                <select value={matchIdField} onChange={(e) => setMatchIdField(e.target.value)}>
                                    <option value="">- choose id field -</option>
                                    {targetLayer.fields.map((field) => (
                                        <option key={`id-${field}`} value={field}>{field}</option>
                                    ))}
                                </select>
                            ) : null}
                            <label className="checkbox-row" style={{ marginTop: 6 }}>
                                <input type="checkbox" checked={writeMatchLayer} onChange={(e) => setWriteMatchLayer(e.target.checked)} /> Add matched target layer field
                            </label>
                        </div>
                    ) : null}

                    {preview?.rows?.length ? (
                        <div className="form-group">
                            <label>Preview (first {preview.rows.length})</label>
                            <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 6 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            {preview.columns.map((col) => (
                                                <th key={col} style={{ textAlign: 'left', fontSize: 11, padding: 4 }}>{col}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.rows.map((row, idx) => (
                                            <tr key={`row-${idx}`}>
                                                {preview.columns.map((col) => (
                                                    <td key={`${idx}-${col}`} style={{ fontSize: 11, padding: 4 }}>{formatValue(row[col])}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : null}

                    <div className="modal-footer">
                        <button className="btn btn-secondary cancel-btn" onClick={() => onCancel?.()}>Cancel</button>
                        <button className="btn btn-secondary apply-btn" onClick={runPreview} disabled={!canRun}>Preview</button>
                        <button className="btn btn-primary apply-btn" onClick={runJoin} disabled={!canRun}>Run Proximity Join</button>
                    </div>
                </div>
            )}
        </div>
    );
}
