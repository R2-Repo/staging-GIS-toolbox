import { useEffect, useMemo, useRef, useState } from 'react';
import { WidgetPanelShell } from './shared/WidgetPanelShell.jsx';

const PREVIEW_DEBOUNCE_MS = 500;

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
    const [previewing, setPreviewing] = useState(false);
    const [error, setError] = useState('');
    const cancelRef = useRef(false);
    const previewTimer = useRef(null);
    const previewRequestId = useRef(0);

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

    useEffect(() => {
        if (!canRun || results || running) {
            if (previewTimer.current) clearTimeout(previewTimer.current);
            if (!canRun) setPreview(null);
            return undefined;
        }

        if (previewTimer.current) clearTimeout(previewTimer.current);
        previewTimer.current = setTimeout(async () => {
            const requestId = ++previewRequestId.current;
            setPreviewing(true);
            setError('');
            try {
                const data = await onPreview?.(buildConfig());
                if (requestId !== previewRequestId.current) return;
                setPreview(data?.rows?.length ? data : null);
            } catch (err) {
                if (requestId !== previewRequestId.current) return;
                setPreview(null);
                setError(err?.message || 'Unable to build preview.');
            } finally {
                if (requestId === previewRequestId.current) {
                    setPreviewing(false);
                }
            }
        }, PREVIEW_DEBOUNCE_MS);

        return () => {
            if (previewTimer.current) clearTimeout(previewTimer.current);
        };
    }, [
        canRun,
        sourceLayerId,
        targetLayerId,
        selectionOnly,
        units,
        maxRadius,
        writeDistance,
        writeMatchId,
        matchIdField,
        writeMatchLayer,
        fieldMappings,
        results,
        running,
        onPreview
    ]);

    const runJoin = async () => {
        cancelRef.current = false;
        setRunning(true);
        setStatus('Initializing...');
        setError('');
        setPreview(null);
        previewRequestId.current += 1;
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
            <WidgetPanelShell
                status={status || 'Working...'}
                footer={(
                    <div className="modal-footer">
                        <button
                            className="btn btn-secondary cancel-btn"
                            onClick={() => { cancelRef.current = true; setStatus('Cancelling...'); }}
                        >
                            Cancel
                        </button>
                    </div>
                )}
            >
                <div className="gis-widget__running">
                    <div className="gis-widget__spinner" />
                </div>
            </WidgetPanelShell>
        );
    }

    if (results) {
        return (
            <WidgetPanelShell
                onCancel={onCancel}
                cancelLabel="Done"
                showRun={false}
            >
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Results</div>
                <div style={{ fontSize: 12, marginBottom: 8 }}>
                    <div><strong>{results.total?.toLocaleString?.() || results.total || 0}</strong> features processed</div>
                    <div><strong>{results.matched?.toLocaleString?.() || results.matched || 0}</strong> matched</div>
                    <div><strong>{results.unmatched?.toLocaleString?.() || results.unmatched || 0}</strong> unmatched</div>
                </div>
                {results.warnings?.length ? (
                    <ul className="text-xs text-muted" style={{ paddingLeft: 16, margin: 0 }}>
                        {results.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                        ))}
                    </ul>
                ) : null}
            </WidgetPanelShell>
        );
    }

    const statusText = error || (previewing ? 'Updating preview…' : '');

    return (
        <WidgetPanelShell
            status={statusText}
            statusTone={error ? 'danger' : 'muted'}
            onCancel={onCancel}
            onRun={runJoin}
            runLabel="Run Proximity Join"
            running={running}
            disabled={!canRun || previewing}
        >
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
                        <div key={`map-${idx}`} className="gis-widget__row">
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
                            <button className="btn btn-secondary btn-sm" onClick={() => removeMapping(idx)}>Remove</button>
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
                    <div className="gis-widget__btn-row">
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
                    <div className="gis-widget__preview-table">
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
        </WidgetPanelShell>
    );
}
