import { useRef, useState } from 'react';

export function ImportFlowDialog({
    onCancel,
    onImportFiles,
    onOpenArcGIS,
    onOpenPhotoMapper,
    onOpenFence
}) {
    const fileInputRef = useRef(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [error, setError] = useState('');

    const handleFiles = async (fileList) => {
        const files = Array.from(fileList || []);
        if (files.length === 0) return;

        try {
            setError('');
            await onImportFiles?.(files);
        } catch (err) {
            setError(err?.message || 'Unable to start import.');
        }
    };

    return (
        <div>
            {error ? (
                <div className="info-box text-xs mb-8" style={{ color: 'var(--danger)' }}>{error}</div>
            ) : null}

            <p className="text-xs text-muted mb-8">
                Import GeoJSON, CSV, Excel, KML/KMZ, Shapefile ZIP and related formats.
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

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => onOpenArcGIS?.()}>
                    🌐 ArcGIS REST
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => onOpenPhotoMapper?.()}>
                    📷 Photo Mapper
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => onOpenFence?.()}>
                    ⛶ Import Fence
                </button>
            </div>

            <div className="modal-footer">
                <button className="btn btn-secondary cancel-btn" onClick={() => onCancel?.()}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
