import { useMemo, useState } from 'react';
import { WidgetPanelShell } from '../shared/WidgetPanelShell.jsx';

function FieldPicker({ label, value, fields, onChange }) {
    return (
        <label className="text-xs">
            <span className="text-muted">{label}</span>
            <select value={value || ''} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                <option value="">Not mapped</option>
                {fields.map((field) => (
                    <option key={field} value={field}>{field}</option>
                ))}
            </select>
        </label>
    );
}

function DetectionLine({ label, item }) {
    return (
        <div className="text-xs">
            <strong>{label}:</strong>{' '}
            {item?.field ? `${item.field} (${item.confidence}%)` : 'not detected'}
        </div>
    );
}

export function ImportStationTableDialog({
    routeProfile,
    onCancel,
    onFileLoad,
    onAnalyzeMapping,
    onPlot
}) {
    const [loading, setLoading] = useState(false);
    const [plotting, setPlotting] = useState(false);
    const [error, setError] = useState('');
    const [loaded, setLoaded] = useState(null);
    const [mapping, setMapping] = useState({});
    const [includeQaLines, setIncludeQaLines] = useState(false);

    const fields = loaded?.fields || [];
    const reviewedIssues = useMemo(
        () => (loaded?.reviewedRows || []).filter((row) => row.status !== 'Ready').slice(0, 20),
        [loaded]
    );

    const loadFile = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setLoading(true);
        setError('');
        try {
            const result = await onFileLoad?.(file);
            setLoaded(result);
            setMapping(result?.mapping || {});
        } catch (err) {
            setLoaded(null);
            setError(err?.message || 'Unable to load table.');
        } finally {
            setLoading(false);
        }
    };

    const updateMapping = async (key, value) => {
        const next = { ...mapping, [key]: value };
        setMapping(next);
        if (!loaded) return;
        try {
            const result = await onAnalyzeMapping?.(next);
            setLoaded((current) => ({ ...current, ...result }));
        } catch (err) {
            setError(err?.message || 'Unable to analyze mapping.');
        }
    };

    const plotRows = async () => {
        setPlotting(true);
        setError('');
        try {
            await onPlot?.(mapping, { includeQaLines });
        } catch (err) {
            setError(err?.message || 'Unable to plot station table.');
            setPlotting(false);
        }
    };

    const summary = loaded?.summary || {};

    return (
        <WidgetPanelShell
            className="project-stationing-import-widget"
            status={error || (loading ? 'Loading table…' : '')}
            statusTone={error ? 'danger' : 'muted'}
            onCancel={onCancel}
            onRun={plotRows}
            runLabel="Plot Ready Rows"
            running={plotting}
            disabled={!loaded || plotting || loading}
        >
            <div className="info-box mb-8">
                <strong>{routeProfile?.route_name || 'Stationed Route'}</strong>
                <div className="text-xs mt-4">
                    Station range: {routeProfile?.start_station_label} → {routeProfile?.end_station_label}
                </div>
            </div>

            <div className="form-group mb-8">
                <label className="text-xs text-muted" htmlFor="station-table-file">Station table</label>
                <input
                    id="station-table-file"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={loadFile}
                    disabled={loading || plotting}
                />
            </div>

            {loaded ? (
                <>
                    <div className="mb-8">
                        <div className="text-xs text-muted mb-4">
                            Loaded {loaded.rowCount} rows from {loaded.datasetName || 'table'}.
                        </div>
                        <DetectionLine label="Station" item={loaded.detection?.station} />
                        <DetectionLine label="Offset" item={loaded.detection?.offset} />
                        <DetectionLine label="Side" item={loaded.detection?.side} />
                        <DetectionLine label="Latitude" item={loaded.detection?.latitude} />
                        <DetectionLine label="Longitude" item={loaded.detection?.longitude} />
                    </div>

                    <div className="mb-8" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <FieldPicker label="Station column" value={mapping.station} fields={fields} onChange={(v) => updateMapping('station', v)} />
                        <FieldPicker label="Offset column" value={mapping.offset} fields={fields} onChange={(v) => updateMapping('offset', v)} />
                        <FieldPicker label="Side column" value={mapping.side} fields={fields} onChange={(v) => updateMapping('side', v)} />
                        <FieldPicker label="Label column" value={mapping.label} fields={fields} onChange={(v) => updateMapping('label', v)} />
                        <FieldPicker label="Latitude column" value={mapping.latitude} fields={fields} onChange={(v) => updateMapping('latitude', v)} />
                        <FieldPicker label="Longitude column" value={mapping.longitude} fields={fields} onChange={(v) => updateMapping('longitude', v)} />
                    </div>

                    <div className="route-mp-widget__summary text-xs mb-8">
                        Ready: {summary.ready || 0}
                        {' · '}Warnings: {summary.warnings || 0}
                        {' · '}Outside: {summary.outsideRoute || 0}
                        {' · '}Conflicts: {summary.coordinateConflicts || 0}
                        {' · '}Unplotted: {summary.unplotted || 0}
                    </div>

                    <label className="text-xs mb-8" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                            type="checkbox"
                            checked={includeQaLines}
                            onChange={(e) => setIncludeQaLines(e.target.checked)}
                        />
                        Include coordinate QA lines in final output
                    </label>

                    {reviewedIssues.length > 0 ? (
                        <div className="mb-8">
                            <div className="text-xs text-muted mb-4">Rows needing attention (first 20)</div>
                            <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                                {reviewedIssues.map((row) => (
                                    <div key={row.rowNumber} className="text-xs p-4" style={{ borderBottom: '1px solid var(--border)' }}>
                                        <strong>Row {row.rowNumber}</strong>: {row.status}
                                        {row.station ? ` · ${row.station}` : ''}
                                        {row.issue ? <div className="text-muted">{row.issue}</div> : null}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </>
            ) : null}
        </WidgetPanelShell>
    );
}
