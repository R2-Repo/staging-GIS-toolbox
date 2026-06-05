export function HeaderBar({
    onImport,
    onFence,
    onPhotoMapper,
    onArcGIS,
    onDrawLayer,
    onUndo,
    onRedo,
    onMergeLayers,
    onWorkflow,
    onBasemapChange,
    onDimensionChange,
    onLogs,
    onInfo
}) {
    return (
        <>
            <div className="header-left">
                <span className="header-logo">
                    <img src="icons/favicon.png" alt="GIS-Toolbox.com" width="36" height="36" />
                </span>
                <h1 className="header-title">GIS-Toolbox<span className="title-com">.com</span></h1>
            </div>
            <div className="header-center">
                <button className="btn btn-secondary btn-sm" id="btn-import" onClick={() => onImport?.()}>
                    <span className="btn-icon-text">📂</span><span>Import</span>
                </button>
                <button className="btn btn-secondary btn-sm" id="btn-fence" title="Draw a fence on the map — all imports will be filtered to this area" onClick={() => onFence?.()}>
                    <span className="btn-icon-text">⛶</span><span>Import Fence</span>
                </button>
                <button className="btn btn-secondary btn-sm" id="btn-photo-mapper" onClick={() => onPhotoMapper?.()}>
                    <span className="btn-icon-text">📷</span><span>Photos</span>
                </button>
                <button className="btn btn-secondary btn-sm" id="btn-arcgis" onClick={() => onArcGIS?.()}>
                    <span className="btn-icon-text">🌐</span><span>ArcGIS</span>
                </button>
                <button className="btn btn-secondary btn-sm" id="btn-draw-layer" onClick={() => onDrawLayer?.()}>
                    <span className="btn-icon-text">✏️</span><span>Draw</span>
                </button>
                <div className="header-sep"></div>
                <button className="btn btn-ghost btn-sm" id="btn-undo" disabled title="Undo" onClick={() => onUndo?.()}>↩</button>
                <button className="btn btn-ghost btn-sm" id="btn-redo" disabled title="Redo" onClick={() => onRedo?.()}>↪</button>
                <button className="btn btn-secondary btn-sm hidden" id="btn-merge" onClick={() => onMergeLayers?.()}>Merge Layers</button>
                <div className="header-sep"></div>
                <button className="btn btn-secondary btn-sm dual-screen-desktop-only" id="btn-dual-screen" title="Open map in a second window (Dual Screen)">
                    <span className="btn-icon-text">🖥️</span><span className="btn-label">Dual Screen</span>
                </button>
                <button className="btn btn-secondary btn-sm" id="btn-workflow" title="Data Pipeline Editor" onClick={() => onWorkflow?.()}>
                    <span className="btn-icon-text">🧩</span><span>Data Pipeline Editor</span>
                </button>
            </div>
            <div className="header-right">
                <button className="btn btn-ghost btn-sm mobile-menu-btn" id="btn-mobile-menu" title="Menu">☰</button>
                <div className="header-toggle" id="basemap-toggle">
                    <button className="header-toggle-option active" data-value="voyager" onClick={() => onBasemapChange?.('voyager')}>🗺️ Map</button>
                    <button className="header-toggle-option" data-value="satellite" onClick={() => onBasemapChange?.('satellite')}>🛰️ Satellite</button>
                </div>
                <div className="header-toggle" id="dimension-toggle">
                    <button className="header-toggle-option active" data-value="2d" onClick={() => onDimensionChange?.('2d')}>2D</button>
                    <button className="header-toggle-option" data-value="3d" onClick={() => onDimensionChange?.('3d')}>3D</button>
                </div>
                <button className="btn btn-ghost btn-sm" id="btn-logs" title="Logs" onClick={() => onLogs?.()}>📋</button>
                <button
                    className="btn btn-ghost"
                    id="btn-info"
                    title="Tool Guide"
                    style={{ fontSize: '22px', padding: '2px 6px', lineHeight: 1 }}
                    onClick={() => onInfo?.()}
                >
                    ℹ️
                </button>
            </div>
        </>
    );
}
