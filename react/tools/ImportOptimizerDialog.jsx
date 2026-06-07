import { useEffect, useMemo, useRef, useState } from 'react';
import { scanFilesForImport } from '../../js/import/import-scan.js';
import { mergeScanFieldNames } from '../../js/import/import-field-filter.js';
import {
    buildOptimizerReductionNotice,
    buildImportProgressReductionNotice
} from '../../js/import/import-size-notices.js';
import { ImportFieldSelector } from './ImportFieldSelector.jsx';
import { ImportProgressPanel } from './ImportProgressPanel.jsx';
import { ImportReductionNotice } from './ImportReductionNotice.jsx';

export function ImportOptimizerDialog({ files = [], onCancel, onConfirm }) {
    const cancelImportRef = useRef(null);
    const [scans, setScans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [importMode, setImportMode] = useState('gis');
    const [error, setError] = useState('');
    const [selectedFields, setSelectedFields] = useState([]);
    const [importProgress, setImportProgress] = useState({ percent: 0, step: 'Starting import…' });

    const fieldNames = useMemo(() => mergeScanFieldNames(scans), [scans]);
    const reductionNotice = useMemo(() => buildOptimizerReductionNotice(scans), [scans]);
    const progressNotice = buildImportProgressReductionNotice();

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const results = await scanFilesForImport(files);
                if (!cancelled) {
                    setScans(results);
                    const names = mergeScanFieldNames(results);
                    setSelectedFields(names);
                    const kmlFamily = results.some((s) => s.recommendedImportMode === 'gis');
                    setImportMode(kmlFamily ? 'gis' : 'direct');
                }
            } catch (e) {
                if (!cancelled) setError(e?.message || 'Scan failed');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [files]);

    const hasKml = scans.some((s) => s.format === 'kml' || s.format === 'kmz' || s.format === 'xml');

    const handleConfirm = async () => {
        if (fieldNames.length > 0 && selectedFields.length === 0) {
            setError('Select at least one field to import.');
            return;
        }
        setError('');
        setImporting(true);
        setImportProgress({ percent: 0, step: 'Starting optimized import…' });

        try {
            await onConfirm?.({
                importMode,
                useWorkspace: true,
                selectedFields: fieldNames.length ? selectedFields : null
            }, {
                onProgress: (p) => setImportProgress(p),
                onCancelReady: (fn) => { cancelImportRef.current = fn; },
                close: () => onCancel?.(),
                onAborted: () => setImporting(false)
            });
        } catch (e) {
            setImporting(false);
            setError(e?.message || 'Import failed.');
        }
    };

    if (importing) {
        return (
            <div>
                <ImportProgressPanel
                    step={importProgress.step}
                    percent={importProgress.percent}
                    fileName={importProgress.fileName}
                    notice={progressNotice}
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

            {loading ? (
                <>
                    <ImportReductionNotice {...reductionNotice} />
                    <ImportProgressPanel step="Scanning files…" percent={0} />
                </>
            ) : (
                <>
                    <ImportReductionNotice {...reductionNotice} />
                    <ul className="text-xs text-muted mb-8" style={{ margin: 0, paddingLeft: 18 }}>
                        {scans.map((s) => (
                            <li key={s.fileName}>
                                <strong>{s.fileName}</strong> ({s.sizeLabel})
                                {s.featureEstimate != null ? ` · ~${s.featureEstimate.toLocaleString()} features est.` : ''}
                                {s.fields?.length ? ` · ${s.fields.length} fields detected` : ''}
                            </li>
                        ))}
                    </ul>

                    {hasKml ? (
                        <div className="mb-8">
                            <div className="text-xs mb-4"><strong>KML/KMZ import mode</strong> <span className="text-muted">(reduces file size)</span></div>
                            <label className="text-xs" style={{ display: 'block', marginBottom: 6 }}>
                                <input
                                    type="radio"
                                    name="importMode"
                                    checked={importMode === 'gis'}
                                    onChange={() => setImportMode('gis')}
                                />
                                {' '}Import as simplified GIS layer (recommended — strips styling, icons, long descriptions)
                            </label>
                            <label className="text-xs" style={{ display: 'block' }}>
                                <input
                                    type="radio"
                                    name="importMode"
                                    checked={importMode === 'preserve'}
                                    onChange={() => setImportMode('preserve')}
                                />
                                {' '}Preserve styling and embedded assets (uses much more memory — not recommended for large files)
                            </label>
                        </div>
                    ) : null}

                    <div className="mb-8">
                        <div className="text-xs mb-4"><strong>Attributes to import</strong></div>
                        <ImportFieldSelector
                            fields={fieldNames}
                            selected={selectedFields}
                            onChange={setSelectedFields}
                            hint="Uncheck fields you do not need — only selected attributes are stored (part of the size reduction plan)."
                        />
                    </div>
                </>
            )}

            <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => onCancel?.()} disabled={loading}>Cancel</button>
                <button
                    className="btn btn-primary"
                    disabled={loading}
                    onClick={() => void handleConfirm()}
                >
                    Import with reduced settings
                </button>
            </div>
        </div>
    );
}
