import { useRef, useState } from 'react';
import {
    preflightFiles,
    formatBytes,
    PREFLIGHT_LEVEL
} from '../../js/import/import-preflight.js';

export function ImportFlowDialog({
    onCancel,
    onImportFiles,
    onOpenArcGIS,
    onOpenPhotoMapper,
    onOpenFence,
    onConfirmStrongImport
}) {
    const fileInputRef = useRef(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [error, setError] = useState('');
    const [pendingFiles, setPendingFiles] = useState([]);
    const [preflight, setPreflight] = useState(null);

    const runPreflight = (fileList) => {
        const files = Array.from(fileList || []);
        setPendingFiles(files);
        setPreflight(files.length ? preflightFiles(files) : null);
        return files;
    };

    const startImport = async (files) => {
        if (!files?.length) return;
        const check = preflightFiles(files);
        if (check.reject) {
            setError(check.messages.join(' '));
            return;
        }
        if (check.level === PREFLIGHT_LEVEL.STRONG && onConfirmStrongImport) {
            const ok = await onConfirmStrongImport(check.messages.join('\n'));
            if (!ok) return;
        }
        try {
            setError('');
            await onImportFiles?.(files);
        } catch (err) {
            setError(err?.message || 'Unable to start import.');
        }
    };

    const handleFiles = async (fileList) => {
        const files = runPreflight(fileList);
        if (files.length === 0) return;
        const check = preflightFiles(files);
        if (check.level === PREFLIGHT_LEVEL.OK || check.level === PREFLIGHT_LEVEL.SOFT) {
            await startImport(files);
        }
    };

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

            <p className="text-xs text-muted mb-8">
                Supported: GeoJSON, JSON, CSV/TSV, Excel, KML, KMZ, Shapefile ZIP (.shp inside),
                and KML-style XML. ZIP files are auto-detected as shapefile or KMZ.
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

            {preflight?.level === PREFLIGHT_LEVEL.STRONG && pendingFiles.length > 0 ? (
                <div style={{ marginBottom: '10px' }}>
                    <button className="btn btn-warning btn-sm" onClick={() => void startImport(pendingFiles)}>
                        Continue with large file(s)
                    </button>
                </div>
            ) : null}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => onOpenArcGIS?.()}>🌐 ArcGIS REST</button>
                <button className="btn btn-secondary btn-sm" onClick={() => onOpenPhotoMapper?.()}>📷 Photo Mapper</button>
                <button className="btn btn-secondary btn-sm" onClick={() => onOpenFence?.()}>⛶ Import Fence</button>
            </div>

            <div className="modal-footer">
                <button className="btn btn-secondary cancel-btn" onClick={() => onCancel?.()}>Cancel</button>
            </div>
        </div>
    );
}
