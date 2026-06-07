import { useEffect, useMemo, useRef, useState } from 'react';
import {
    preflightFiles,
    formatBytes,
    preflightFile,
    PREFLIGHT_LEVEL
} from '../../js/import/import-preflight.js';
import { scanFilesForImport } from '../../js/import/import-scan.js';
import { mergeScanFieldNames } from '../../js/import/import-field-filter.js';
import { detectFormat } from '../../js/import/importer.js';
import { assessImportRoute, assessImportRouteFromScans } from '../../js/import/import-routing.js';
import {
    buildNoticeForRoute,
    buildImportProgressReductionNotice,
    shouldShowImportProgressNotice
} from '../../js/import/import-size-notices.js';
import { ImportFieldSelector } from './ImportFieldSelector.jsx';
import { ImportProgressPanel } from './ImportProgressPanel.jsx';
import { ImportReductionNotice } from './ImportReductionNotice.jsx';

export function ImportFlowDialog({
    onCancel,
    onImportFiles,
    onOpenArcGIS,
    onOpenPhotoMapper,
    onOpenFence,
    onOptimizeImport,
    initialFiles = null,
    initialScans = null,
    startAtFieldPick = false
}) {
    const fileInputRef = useRef(null);
    const cancelImportRef = useRef(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [error, setError] = useState('');
    const [pendingFiles, setPendingFiles] = useState([]);
    const [preflight, setPreflight] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [fieldNames, setFieldNames] = useState([]);
    const [selectedFields, setSelectedFields] = useState([]);
    const [importScans, setImportScans] = useState([]);
    const [routeAssessment, setRouteAssessment] = useState(null);
    const [readyToImport, setReadyToImport] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({ percent: 0, step: 'Starting import…' });

    const resetImportStep = () => {
        setReadyToImport(false);
        setFieldNames([]);
        setSelectedFields([]);
        setImportScans([]);
        setRouteAssessment(null);
        setScanning(false);
        setImporting(false);
        setImportProgress({ percent: 0, step: 'Starting import…' });
        cancelImportRef.current = null;
    };

    const runPreflight = (fileList) => {
        const files = Array.from(fileList || []);
        setPendingFiles(files);
        setPreflight(files.length ? preflightFiles(files) : null);
        resetImportStep();
        return files;
    };

    const applyScans = (files, scans) => {
        setImportScans(scans);
        const names = mergeScanFieldNames(scans);
        setFieldNames(names);
        setSelectedFields(names);
        setRouteAssessment(assessImportRouteFromScans(scans));
        setReadyToImport(true);
        setPreflight(preflightFiles(files));
    };

    const startImport = async (files, importOptions = {}, uiFromParent = null) => {
        if (!files?.length) return;
        const check = preflightFiles(files);
        if (check.reject) {
            setError(check.messages.join(' '));
            return;
        }
        const fields = importOptions.selectedFields ?? selectedFields;
        if (fieldNames.length > 0 && (!fields || fields.length === 0)) {
            setError('Select at least one field to import.');
            return;
        }

        setError('');
        setImporting(true);
        setImportProgress({ percent: 0, step: 'Starting import…' });

        const ui = uiFromParent || {
            onProgress: (p) => setImportProgress(p),
            onCancelReady: (fn) => { cancelImportRef.current = fn; },
            close: () => onCancel?.(),
            onAborted: () => setImporting(false)
        };

        try {
            await onImportFiles?.(files, {
                preflightConfirmed: true,
                selectedFields: fieldNames.length ? fields : null,
                useWorkspace: importOptions.useWorkspace ?? routeAssessment?.useWorkspace,
                ...importOptions
            }, {
                ...ui,
                onAborted: ui.onAborted || (() => setImporting(false))
            });
        } catch (err) {
            setImporting(false);
            setError(err?.message || 'Unable to start import.');
        }
    };

    const prepareImportOptions = async (files, existingScans = null) => {
        setScanning(true);
        setError('');
        try {
            const scans = existingScans ?? await scanFilesForImport(files);
            applyScans(files, scans);
        } catch (err) {
            setError(err?.message || 'Could not scan files.');
            setReadyToImport(true);
        } finally {
            setScanning(false);
        }
    };

    const handleFiles = async (fileList) => {
        const files = runPreflight(fileList);
        if (files.length === 0) return;
        const check = preflightFiles(files);
        if (check.reject) {
            setError(check.messages.join(' '));
            return;
        }

        const shouldPreScan = files.some((f) => {
            const pf = preflightFile(f);
            const fmt = detectFormat(f);
            return pf.level === PREFLIGHT_LEVEL.SOFT || fmt === 'zip' || fmt === 'kmz';
        });

        let scans = [];
        if (shouldPreScan) {
            setScanning(true);
            try {
                scans = await scanFilesForImport(files);
            } catch (err) {
                setScanning(false);
                setError(err?.message || 'Could not scan files.');
                return;
            }
            setScanning(false);
        }

        const assessment = await assessImportRoute(files, { scans });
        if (assessment.route === 'optimizer' && onOptimizeImport) {
            onOptimizeImport(files);
            return;
        }

        if (scans.length) {
            applyScans(files, scans);
        } else {
            await prepareImportOptions(files);
        }
    };

    useEffect(() => {
        if (!startAtFieldPick || !initialFiles?.length) return;
        const files = Array.from(initialFiles);
        setPendingFiles(files);
        setPreflight(preflightFiles(files));
        if (initialScans?.length) {
            applyScans(files, initialScans);
        } else {
            void prepareImportOptions(files);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
    }, []);

    const reductionNotice = useMemo(() => {
        if (!routeAssessment || routeAssessment.route !== 'optimizer') return null;
        return buildNoticeForRoute({ ...routeAssessment, scans: importScans });
    }, [routeAssessment, importScans]);

    const showProgressNotice = shouldShowImportProgressNotice(routeAssessment);

    if (importing) {
        return (
            <div>
                <ImportProgressPanel
                    step={importProgress.step}
                    percent={importProgress.percent}
                    fileName={importProgress.fileName}
                    notice={showProgressNotice ? buildImportProgressReductionNotice() : null}
                    onCancel={cancelImportRef.current ? () => cancelImportRef.current?.() : null}
                />
            </div>
        );
    }

    return (
        <div>
            {error ? (
                <div className="info-box text-xs mb-8" style={{ color: 'var(--danger)' }}>{error}</div>
            ) : null}

            {preflight?.messages?.length ? (
                <div
                    className="info-box text-xs mb-8"
                    style={{ color: preflight.reject ? 'var(--danger)' : 'var(--warning, orange)' }}
                >
                    {preflight.messages.map((msg) => (
                        <div key={msg}>{msg}</div>
                    ))}
                </div>
            ) : null}

            {pendingFiles.length > 0 ? (
                <ul className="text-xs text-muted mb-8" style={{ margin: '0 0 8px', paddingLeft: '18px' }}>
                    {pendingFiles.map((f) => (
                        <li key={`${f.name}-${f.size}`}>{f.name} ({formatBytes(f.size)})</li>
                    ))}
                </ul>
            ) : null}

            {scanning ? (
                <ImportProgressPanel step="Scanning attributes…" percent={0} />
            ) : null}

            {readyToImport && !scanning ? (
                <div className="mb-8">
                    {reductionNotice ? (
                        <ImportReductionNotice {...reductionNotice} />
                    ) : null}
                    <div className="text-xs mb-4"><strong>Attributes to import</strong></div>
                    <ImportFieldSelector
                        fields={fieldNames}
                        selected={selectedFields}
                        onChange={setSelectedFields}
                        hint={reductionNotice
                            ? 'Uncheck fields you do not need — only selected attributes are stored (part of the size reduction plan).'
                            : 'Uncheck fields you do not need — deselected attributes are not stored.'}
                    />
                    <button
                        className="btn btn-primary btn-sm mt-8"
                        onClick={() => void startImport(pendingFiles, { selectedFields })}
                    >
                        Import selected
                    </button>
                </div>
            ) : null}

            {!readyToImport && !startAtFieldPick ? (
                <>
                    <p className="text-xs text-muted mb-8">
                        Supported: GeoJSON, JSON, CSV/TSV, Excel, KML, KMZ, Shapefile ZIP (.shp inside),
                        and KML-style XML. Choose attributes before import when field names can be previewed.
                    </p>

                    <div
                        style={{
                            border: `1px dashed ${isDragOver ? 'var(--primary)' : 'var(--border)'}`,
                            borderRadius: '8px',
                            padding: '20px',
                            textAlign: 'center',
                            marginBottom: '10px',
                            background: isDragOver ? 'rgba(219,172,63,0.08)' : 'transparent'
                        }}
                        onDragEnter={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDragOver(true);
                        }}
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDragOver(true);
                        }}
                        onDragLeave={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDragOver(false);
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDragOver(false);
                            void handleFiles(e.dataTransfer?.files);
                        }}
                    >
                        <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                        <div style={{ marginBottom: 8 }}>Drop files here</div>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            Choose Files
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".geojson,.json,.csv,.tsv,.txt,.xlsx,.xls,.kml,.kmz,.zip,.xml"
                            style={{ display: 'none' }}
                            onChange={(e) => void handleFiles(e.target.files)}
                        />
                    </div>
                </>
            ) : null}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => onOpenArcGIS?.()}>🌐 ArcGIS REST</button>
                <button className="btn btn-secondary btn-sm" onClick={() => onOpenPhotoMapper?.()}>📷 Photo Mapper</button>
                <button className="btn btn-secondary btn-sm" onClick={() => onOpenFence?.()}>⛶ Import Fence</button>
            </div>

            <div className="modal-footer">
                <button className="btn btn-secondary cancel-btn" onClick={() => onCancel?.()}>Close</button>
            </div>
        </div>
    );
}
