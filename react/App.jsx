import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import logger from '../js/core/logger.js';
import mapService from '../js/map/map-service.js';
import { setExportMapManager } from '../js/export/exporter.js';
import sessionStore from '../js/core/session-store.js';
import { getState, setUIState } from '../js/core/state.js';
import { installDualScreenMapServiceDecorator } from '../js/dual-screen/dual-screen-map-service.js';
import dualScreenCoordinator from '../js/dual-screen/coordinator.js';
import {
    restoreSessionIfAvailable,
    setupAppWiring,
    setupDragDrop,
    setupLogsPanel,
    getWorkflowOverlay,
    openImportFlow,
    startImportFence,
    openPhotoMapper,
    openArcGISImporter,
    createDrawLayer,
    handleUndo,
    handleRedo,
    handleMergeLayers,
    applyBasemapHeaderSelection,
    applyDimensionHeaderSelection,
    toggleLogs,
    showToolInfo,
    setActiveLayerAndRefresh,
    moveLayerUp,
    moveLayerDown,
    toggleLayerVisibilityAndRender,
    zoomToLayer,
    removeLayerWithConfirm,
    toggleField,
    selectAllFields,
    addField,
    renameLayer,
    renameField,
    openFilterBuilder,
    doExport,
    fixAGOL,
    showDataTable,
    selectAllFeatures,
    invertSelection,
    deleteSelectedFeatures,
    clearSelection,
    getRightPanelSnapshot,
    handleLayerStyleChange,
    buildMapContextMenuItems,
    setPanelCollapsed
} from '../js/tools/tool-handlers.js';
import { getActiveLayer } from '../js/core/state.js';
import { AppStoreProvider, createAppStore, useAppStore } from './providers/AppStore.jsx';
import { MobileGate } from './shell/MobileGate.jsx';
import { HeaderBar } from './header/HeaderBar.jsx';
import { MapView } from './map/MapView.jsx';
import { MapContextMenu } from './map/MapContextMenu.jsx';
import { LayerListPanel, FieldListPanel, DataPrepToolsPanel } from './panels/LeftPanel.jsx';
import { GisToolsPanel } from './panels/GisToolsPanel.jsx';
import { RightPanel } from './panels/RightPanel.jsx';
import { mountModalHost } from './ui/mountModalHost.jsx';
import { mountToastHost } from './ui/mountToastHost.jsx';

function SaveIndicator() {
    const [status, setStatus] = useState(null);

    useEffect(() => {
        return sessionStore.onSaveStatus((next) => {
            setStatus(next);
            if (next === 'saved') {
                setTimeout(() => setStatus(null), 1500);
            } else if (next === 'error') {
                setTimeout(() => setStatus(null), 2500);
            }
        });
    }, []);

    const text = status === 'saving' ? 'Saving…'
        : status === 'saved' ? 'Session saved'
            : status === 'error' ? 'Save failed'
                : '';

    return (
        <div className={`save-indicator${status ? ' visible' : ''}`} id="save-indicator">
            {text}
        </div>
    );
}

function usePanelCollapse(side) {
    const [collapsed, setCollapsed] = useState(false);

    const toggle = useCallback(() => {
        setCollapsed((prev) => {
            const next = !prev;
            setPanelCollapsed(side, next);
            return next;
        });
    }, [side]);

    const expand = useCallback(() => {
        setCollapsed(false);
        setPanelCollapsed(side, false);
    }, [side]);

    return { collapsed, toggle, expand };
}

function AppShell() {
    const layers = useAppStore((s) => s.layers);
    const activeLayer = useAppStore((s) => s.activeLayer);
    const toolbar = useAppStore((s) => s.toolbar);
    const refreshTick = useAppStore((s) => s.refreshTick);
    const toggleAgolCompat = useAppStore((s) => s.toggleAgolCompat);

    const [basemap, setBasemap] = useState('voyager');
    const [dimension, setDimension] = useState('2d');
    const leftPanel = usePanelCollapse('left');
    const rightPanel = usePanelCollapse('right');

    const panelActions = useMemo(() => ({
        setActiveLayer: setActiveLayerAndRefresh,
        renameLayer: (id) => renameLayer(id),
        renameLayerInline: (id, el) => renameLayer(id, el),
        moveLayerUp,
        moveLayerDown,
        toggleVisibility: toggleLayerVisibilityAndRender,
        zoomToLayer,
        removeLayer: removeLayerWithConfirm,
        openFilterBuilder: (id) => openFilterBuilder(id),
        toggleField,
        selectAllFields,
        addField,
        renameField: (name) => renameField(name),
        renameFieldInline: (name, el) => renameField(name, el)
    }), []);

    const rightSnapshot = useMemo(() => getRightPanelSnapshot(), [refreshTick, activeLayer?.id]);
    const fields = activeLayer?.schema?.fields || [];

    const onBasemapChange = useCallback((value) => {
        setBasemap(value);
        applyBasemapHeaderSelection(value);
    }, []);

    const onDimensionChange = useCallback((value) => {
        setDimension(value);
        applyDimensionHeaderSelection(value);
    }, []);

    const onToggleAgol = useCallback(() => {
        toggleAgolCompat();
    }, [toggleAgolCompat]);

    const onSectionHeaderClick = useCallback((event) => {
        const header = event.target.closest('.panel-section-header[data-collapsible="true"]');
        if (!header) return;
        header.classList.toggle('collapsed');
        const body = header.nextElementSibling;
        if (body) body.classList.toggle('hidden');
        const arrow = header.querySelector('.arrow');
        if (arrow) arrow.textContent = header.classList.contains('collapsed') ? '▶' : '▼';
    }, []);

    return (
        <>
            <MobileGate />
            <header className="header">
                <HeaderBar
                    onImport={openImportFlow}
                    onFence={startImportFence}
                    onPhotoMapper={openPhotoMapper}
                    onArcGIS={openArcGISImporter}
                    onDrawLayer={createDrawLayer}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onMergeLayers={handleMergeLayers}
                    onWorkflow={() => getWorkflowOverlay()?.toggle()}
                    onBasemapChange={onBasemapChange}
                    onDimensionChange={onDimensionChange}
                    onLogs={toggleLogs}
                    onInfo={showToolInfo}
                    canUndo={toolbar.canUndo}
                    canRedo={toolbar.canRedo}
                    showMerge={toolbar.showMerge}
                    basemap={basemap}
                    dimension={dimension}
                />
            </header>

            <SaveIndicator />

            <div className="app-layout" onClick={onSectionHeaderClick}>
                <aside className={`panel panel-left${leftPanel.collapsed ? ' collapsed' : ''}`}>
                    <div className="panel-header">
                        <span>Layers & Fields</span>
                        <button
                            type="button"
                            className="btn-icon"
                            id="toggle-left-panel"
                            title="Collapse"
                            onClick={leftPanel.toggle}
                        >
                            {leftPanel.collapsed ? '▶' : '◀'}
                        </button>
                    </div>
                    <div className="panel-body">
                        <div className="panel-section">
                            <div className="panel-section-header" data-collapsible="true">
                                Layers <span className="arrow">▼</span>
                            </div>
                            <div className="panel-section-body" id="layer-list">
                                <LayerListPanel
                                    layers={layers}
                                    activeLayerId={activeLayer?.id || null}
                                    actions={panelActions}
                                />
                            </div>
                        </div>
                        <div className="panel-section">
                            <div className="panel-section-header" data-collapsible="true">
                                Fields <span className="arrow">▼</span>
                            </div>
                            <div className="panel-section-body" id="field-list">
                                <FieldListPanel
                                    activeLayer={activeLayer}
                                    fields={fields}
                                    actions={panelActions}
                                />
                            </div>
                        </div>
                        <div id="dataprep-tools">
                            <DataPrepToolsPanel
                                activeLayer={activeLayer}
                                gisTools={(
                                    <GisToolsPanel
                                        getActiveLayer={getActiveLayer}
                                        getSelectionCount={(layerId) => mapService.getSelectionCount(layerId)}
                                        selectionActions={{
                                            onSelectAll: selectAllFeatures,
                                            onInvertSelection: invertSelection,
                                            onDeleteSelected: deleteSelectedFeatures,
                                            onClearSelection: clearSelection
                                        }}
                                    />
                                )}
                            />
                        </div>
                    </div>
                </aside>

                <main className="panel-center">
                    <div id="map-container">
                        <MapView
                            mapService={mapService}
                            onReady={() => {
                                setExportMapManager(mapService);
                                setTimeout(() => mapService.resize(), 100);
                            }}
                        />
                        <div className="map-overlay" id="map-drop-overlay">
                            <div>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 48, height: 48 }}>
                                    <path d="M12 16v-4m0-4h.01M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7l3-7z" />
                                </svg>
                                <p style={{ marginTop: 12, fontSize: 18, fontWeight: 600 }}>Drop files here to import</p>
                                <p className="text-sm text-muted">GeoJSON, CSV, Excel, KML, KMZ, Shapefile (ZIP)</p>
                            </div>
                        </div>
                    </div>
                </main>

                <aside className={`panel panel-right${rightPanel.collapsed ? ' collapsed' : ''}`}>
                    <div className="panel-header">
                        <button
                            type="button"
                            className="btn-icon"
                            id="toggle-right-panel"
                            title="Collapse"
                            onClick={rightPanel.toggle}
                        >
                            {rightPanel.collapsed ? '◀' : '▶'}
                        </button>
                        <span>Output & Export</span>
                    </div>
                    <div className="panel-body" id="output-panel-content">
                        <RightPanel
                            snapshot={rightSnapshot}
                            onToggleAgol={onToggleAgol}
                            onExport={doExport}
                            onFixAgol={fixAGOL}
                            onShowDataTable={showDataTable}
                            onStyleChange={handleLayerStyleChange}
                        />
                    </div>
                </aside>
            </div>

            <button
                type="button"
                className={`panel-expand-tab panel-expand-left${leftPanel.collapsed ? '' : ' hidden'}`}
                id="expand-left-panel"
                title="Expand Layers"
                onClick={leftPanel.expand}
            >
                ▶
            </button>
            <button
                type="button"
                className={`panel-expand-tab panel-expand-right${rightPanel.collapsed ? '' : ' hidden'}`}
                id="expand-right-panel"
                title="Expand Export"
                onClick={rightPanel.expand}
            >
                ◀
            </button>

            <div id="logs-panel" className="logs-panel hidden">
                <div className="logs-header">
                    <h3>Logs</h3>
                    <div className="logs-toolbar">
                        <input type="search" id="logs-search" placeholder="Search logs..." className="input-sm" />
                        <select id="logs-level" className="input-sm">
                            <option value="">All Levels</option>
                            <option value="ERROR">Errors</option>
                            <option value="WARN">Warnings</option>
                            <option value="INFO">Info</option>
                            <option value="DEBUG">Debug</option>
                        </select>
                        <button type="button" className="btn btn-ghost btn-sm" id="logs-copy" title="Copy logs">📋</button>
                        <button type="button" className="btn btn-ghost btn-sm" id="logs-download" title="Download logs">💾</button>
                        <button type="button" className="btn btn-ghost btn-sm" id="logs-clear" title="Clear">🗑️</button>
                        <button type="button" className="btn btn-ghost btn-sm" id="logs-close" title="Close logs">✕</button>
                    </div>
                </div>
                <div className="logs-body" id="logs-body" />
            </div>

            <MapContextMenu buildItems={buildMapContextMenuItems} />
        </>
    );
}

export function App() {
    const store = useMemo(() => createAppStore(), []);
    const modalHostRef = useRef(null);
    const toastHostRef = useRef(null);

    useEffect(() => {
        installDualScreenMapServiceDecorator(mapService, dualScreenCoordinator);
        logger.info('App', 'Initializing GIS Toolbox');

        setupAppWiring();
        setupDragDrop();
        setupLogsPanel();

        const syncMobileClass = () => {
            const isMobile = window.innerWidth < 768;
            const state = getState();
            if (isMobile !== state.ui.isMobile) {
                setUIState('isMobile', isMobile);
            }
        };
        syncMobileClass();
        window.addEventListener('resize', syncMobileClass);

        void restoreSessionIfAvailable();

        if (window.innerWidth >= 768) {
            setTimeout(() => showToolInfo(), 300);
        }

        logger.info('App', 'App ready');

        return () => {
            window.removeEventListener('resize', syncMobileClass);
        };
    }, []);

    useEffect(() => {
        if (!modalHostRef.current) return undefined;
        const mounted = mountModalHost(modalHostRef.current);
        return () => mounted.unmount();
    }, []);

    useEffect(() => {
        if (!toastHostRef.current) return undefined;
        const mounted = mountToastHost(toastHostRef.current);
        return () => mounted.unmount();
    }, []);

    return (
        <AppStoreProvider store={store}>
            <AppShell />
            <div id="modal-host" ref={modalHostRef} />
            <div id="toast-container" className="toast-container" ref={toastHostRef} />
        </AppStoreProvider>
    );
}
