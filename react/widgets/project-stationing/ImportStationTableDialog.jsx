import { useMemo, useState } from 'react';
import { WidgetPanelShell } from '../shared/WidgetPanelShell.jsx';
import { CrsPicker } from '../shared/CrsPicker.jsx';
import { ERROR_CODES } from '../../../js/widgets/project-stationing/table-import/station-table-parse.js';

function FieldPicker({ label, value, fields, onChange, hint }) {
    return (
        <label className="text-xs">
            <span className="text-muted">{label}</span>
            <select value={value || ''} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                <option value="">Not mapped</option>
                {fields.map((field) => (
                    <option key={field} value={field}>{field}</option>
                ))}
            </select>
            {hint ? <div className="text-muted mt-4">{hint}</div> : null}
        </label>
    );
}

function DetectionLine({ label, item, fallback }) {
    let content = fallback;
    if (item?.field && (item.confidence ?? 0) >= 50) {
        content = `${item.field} (${item.confidence}%)`;
    }
    return (
        <div className="text-xs">
            <strong>{label}:</strong>{' '}
            {content}
        </div>
    );
}

function SideDetectionLine({ sideDetection, offsetEmbeddedSide }) {
    if (sideDetection?.field && (sideDetection.confidence ?? 0) >= 50) {
        return <DetectionLine label="Side (RT/LT)" item={sideDetection} />;
    }
    if (offsetEmbeddedSide?.includesSide) {
        const fieldLabel = offsetEmbeddedSide.offsetField || 'Offset';
        return (
            <div className="text-xs">
                <strong>Side (RT/LT):</strong>{' '}
                read from Offset column ({fieldLabel}, {offsetEmbeddedSide.pct}% of values)
            </div>
        );
    }
    return (
        <div className="text-xs text-muted">
            <strong>Side (RT/LT):</strong>{' '}
            optional — include in Offset (e.g. 91.29 RT) or map a separate Side column below
        </div>
    );
}

function SamplePreview({ rows = [], fields = [] }) {
    if (!rows.length || !fields.length) return null;
    const previewFields = fields.slice(0, 6);
    return (
        <div className="mb-8">
            <div className="text-xs text-muted mb-4">Sample rows (first {rows.length})</div>
            <div style={{ maxHeight: 140, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                <table className="text-xs" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            {previewFields.map((field) => (
                                <th key={field} className="p-4 text-left" style={{ borderBottom: '1px solid var(--border)' }}>{field}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={index}>
                                {previewFields.map((field) => (
                                    <td key={field} className="p-4" style={{ borderBottom: '1px solid var(--border)' }}>{row[field] ?? ''}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
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
    const [showOptionalColumns, setShowOptionalColumns] = useState(false);
    const [includeQaLines, setIncludeQaLines] = useState(false);
    const [coordinateCrs, setCoordinateCrs] = useState('EPSG:6337');

    const fields = loaded?.fields || [];
    const offsetEmbeddedSide = loaded?.offsetEmbeddedSide || loaded?.detection?.offsetEmbeddedSide;
    const sideFromOffset = Boolean(offsetEmbeddedSide?.includesSide && !mapping.side);
    const needsCoordinateCrs = useMemo(
        () => (loaded?.reviewedRows || []).some((row) =>
            String(row.issue || '').includes(ERROR_CODES.PROJECTED_COORDINATES_NEED_CRS)),
        [loaded]
    );
    const reviewedIssues = useMemo(
        () => (loaded?.reviewedRows || []).filter((row) => row.status !== 'Ready').slice(0, 20),
        [loaded]
    );

    const loadFile = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setLoading(true);
        setError('');
        setShowOptionalColumns(false);
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
            await onPlot?.(mapping, { includeQaLines, coordinateCrs: needsCoordinateCrs ? coordinateCrs : undefined });
        } catch (err) {
            setError(err?.message || 'Unable to plot station table.');
            setPlotting(false);
        }
    };

    const summary = loaded?.summary || {};
    const columnGridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };

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
                <label className="text-xs text-muted" htmlFor="station-table-file">Station table (CSV or Excel)</label>
                <input
                    id="station-table-file"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={loadFile}
                    disabled={loading || plotting}
                />
                <div className="text-xs text-muted mt-4">
                    Map Station and Offset. Side (RT/LT) can live in the Offset values (e.g. 91.29 RT) — a separate Side column is optional.
                </div>
            </div>

            {loaded ? (
                <>
                    <div className="mb-8">
                        <div className="text-xs text-muted mb-4">
                            Loaded {loaded.rowCount} rows from {loaded.datasetName || 'table'}.
                        </div>
                        <DetectionLine label="Station" item={loaded.detection?.station} fallback="not detected" />
                        <DetectionLine
                            label="Offset (RT/LT OK in values)"
                            item={loaded.detection?.offset}
                            fallback="not detected"
                        />
                        <SideDetectionLine
                            sideDetection={loaded.detection?.side}
                            offsetEmbeddedSide={offsetEmbeddedSide}
                        />
                        <DetectionLine label="Label" item={loaded.detection?.label} fallback="not detected" />
                        <DetectionLine label="Latitude" item={loaded.detection?.latitude} fallback="not detected" />
                        <DetectionLine label="Longitude" item={loaded.detection?.longitude} fallback="not detected" />
                    </div>

                    <SamplePreview rows={loaded.previewRows} fields={fields} />

                    <div className="mb-4 text-xs">
                        <strong>Required columns</strong>
                    </div>
                    <div className="mb-8" style={columnGridStyle}>
                        <FieldPicker
                            label="Station column"
                            value={mapping.station}
                            fields={fields}
                            onChange={(v) => updateMapping('station', v)}
                        />
                        <FieldPicker
                            label="Offset column (RT/LT in values OK)"
                            value={mapping.offset}
                            fields={fields}
                            onChange={(v) => updateMapping('offset', v)}
                            hint={sideFromOffset ? 'Side (RT/LT) will be read from this column.' : undefined}
                        />
                    </div>

                    {sideFromOffset ? (
                        <div className="info-box text-xs mb-8">
                            Side (RT/LT) is included in your Offset values. Leave Side unmapped unless your table has a separate Side column.
                        </div>
                    ) : null}

                    <button
                        type="button"
                        className="btn btn-ghost text-xs mb-8"
                        onClick={() => setShowOptionalColumns((open) => !open)}
                    >
                        {showOptionalColumns ? 'Hide optional columns' : 'Show optional columns (Side, Label, coordinates)'}
                    </button>

                    {showOptionalColumns ? (
                        <>
                            <div className="mb-4 text-xs text-muted">
                                Optional — only when Side (RT/LT), Label, or coordinates are in separate columns
                            </div>
                            <div className="mb-8" style={columnGridStyle}>
                                <FieldPicker
                                    label="Side column (RT/LT) — optional"
                                    value={mapping.side}
                                    fields={fields}
                                    onChange={(v) => updateMapping('side', v)}
                                    hint="Skip if RT/LT is already in Offset (e.g. 55.00 LT)."
                                />
                                <FieldPicker
                                    label="Label column — optional"
                                    value={mapping.label}
                                    fields={fields}
                                    onChange={(v) => updateMapping('label', v)}
                                />
                                <FieldPicker
                                    label="Latitude column — optional"
                                    value={mapping.latitude}
                                    fields={fields}
                                    onChange={(v) => updateMapping('latitude', v)}
                                />
                                <FieldPicker
                                    label="Longitude column — optional"
                                    value={mapping.longitude}
                                    fields={fields}
                                    onChange={(v) => updateMapping('longitude', v)}
                                />
                            </div>
                        </>
                    ) : null}

                    <div className="route-mp-widget__summary text-xs mb-8">
                        Ready: {summary.ready || 0}
                        {' · '}Warnings: {summary.warnings || 0}
                        {' · '}Outside: {summary.outsideRoute || 0}
                        {' · '}Conflicts: {summary.coordinateConflicts || 0}
                        {' · '}Unplotted: {summary.unplotted || 0}
                        {(summary.ready || 0) === 0 && loaded.rowCount > 0 ? (
                            <div className="text-muted mt-4">
                                No rows are ready to plot. Check that table stations overlap the route range above.
                            </div>
                        ) : null}
                    </div>

                    <label className="text-xs mb-8" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                            type="checkbox"
                            checked={includeQaLines}
                            onChange={(e) => setIncludeQaLines(e.target.checked)}
                        />
                        Include coordinate QA lines in final output
                    </label>

                    {needsCoordinateCrs ? (
                        <div className="mb-8">
                            <CrsPicker
                                label="Coordinate system for table X/Y values"
                                value={coordinateCrs}
                                onChange={setCoordinateCrs}
                            />
                        </div>
                    ) : null}

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
