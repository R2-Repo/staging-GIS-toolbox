/**
 * GIS Toolbox — Main Application Entry Point
 * Wires all modules together, builds UI, handles events
 */
import logger from './core/logger.js';
import bus from './core/event-bus.js';
import { handleError } from './core/error-handler.js';
import {
    getState, getLayers, getActiveLayer, addLayer, removeLayer, updateLayer,
    setActiveLayer, toggleLayerVisibility, reorderLayer, setUIState, toggleAGOLCompat
} from './core/state.js';
import { mergeDatasets, getSelectedFields, tableToSpatial, createSpatialDataset, createTableDataset, analyzeSchema, analyzeTableSchema, splitByGeometryType } from './core/data-model.js';
import { importFile, importFiles } from './import/importer.js';
import { getActiveTask } from './core/task-runner.js';
import { getAvailableFormats, exportDataset, exportMultiLayerKMZFile, exportMultiLayerKMLFile, setExportMapManager } from './export/exporter.js';
import mapService from './map/map-service.js';
import { isReactMapViewEnabled } from './map/map-feature-flags.js';
import { isReactLeftPanelEnabled } from './ui/left-panel-feature-flags.js';
import { isReactRightPanelEnabled } from './ui/right-panel-feature-flags.js';
import { isReactModalEnabled } from './ui/modal-feature-flags.js';
import { isReactToastEnabled } from './ui/toast-feature-flags.js';
import { isReactToolDialogsEnabled } from './ui/tool-dialog-feature-flags.js';
import { isReactHeaderEnabled } from './ui/header-feature-flags.js';
import dualScreenCoordinator from './dual-screen/coordinator.js';
import { installDualScreenMapServiceDecorator } from './dual-screen/dual-screen-map-service.js';
import { installDualScreenPrimaryHandlers } from './dual-screen/primary-handlers.js';
import {
    POPUP_BLOCKED_MESSAGE,
    RELOAD_REMINDER_MESSAGE,
    consumeDualScreenReloadReminder
} from './dual-screen/storage-hint.js';
import {
    applyDualScreenDocumentLayout,
    syncDualScreenHeaderButton
} from './dual-screen/layout.js';

installDualScreenMapServiceDecorator(mapService, dualScreenCoordinator);
import { showToast, showErrorToast } from './ui/toast.js';
import { showModal, confirm, showProgressModal } from './ui/modals.js';
import * as transforms from './dataprep/transforms.js';
import { applyTemplate, previewTemplate, getTemplateFields } from './dataprep/template-builder.js';
import { saveSnapshot, undo as undoHistory, redo as redoHistory, getHistoryState } from './dataprep/transform-history.js';
import { photoMapper } from './photo/photo-mapper.js';
import { arcgisImporter } from './arcgis/rest-importer.js';
import ARCGIS_ENDPOINTS from './arcgis/endpoints.js';
import { checkAGOLCompatibility, applyAGOLFixes } from './agol/compatibility.js';
import * as gisTools from './tools/gis-tools.js';
import { convertFeatureCoords } from './tools/coordinates.js';
import { findFirstLineStringFeature, listLineStringFeatures } from './tools/line-geojson.js';

import drawManager from './map/draw-manager.js';
import sessionStore from './core/session-store.js';
import { SpatialAnalyzerWidget } from './widgets/spatial-analyzer.js';
import { BulkUpdateWidget } from './widgets/bulk-update.js';
import { ProximityJoinWidget } from './widgets/proximity-join.js';
import { WorkflowOverlay } from './workflow/workflow-overlay.js';

// ============================
// Initialize app
// ============================
let _reactMapViewHost = null;
let _reactMapViewUnmount = null;
let _reactLeftPanelMount = null;
let _isReactLeftPanel = false;
let _reactRightPanelMount = null;
let _isReactRightPanel = false;
let _reactToastUnmount = null;
let _isReactToast = false;
let _reactModalUnmount = null;
let _isReactModal = false;
let _isReactToolDialogs = false;
let _reactHeaderUnmount = null;
let _isReactHeader = false;
let _importInputEl = null;
let _workflowOverlay = null;

async function boot() {
    logger.info('App', 'Initializing GIS Toolbox');
    _isReactToolDialogs = isReactToolDialogsEnabled();
    _isReactModal = isReactModalEnabled();
    _isReactToast = isReactToastEnabled();
    _isReactHeader = isReactHeaderEnabled();
    _isReactLeftPanel = isReactLeftPanelEnabled();
    _isReactRightPanel = isReactRightPanelEnabled();
    if (_isReactModal) {
        try {
            await _mountReactModalHost();
        } catch (error) {
            _isReactModal = false;
            logger.error('App', 'React modal host mount failed; falling back to legacy modals', { error: error.message });
        }
    }
    if (_isReactToast) {
        try {
            await _mountReactToastHost();
        } catch (error) {
            _isReactToast = false;
            logger.error('App', 'React toast host mount failed; falling back to legacy toasts', { error: error.message });
        }
    }
    await initMap();
    if (_isReactLeftPanel) {
        try {
            await _mountReactLeftPanel();
        } catch (error) {
            _isReactLeftPanel = false;
            logger.error('App', 'React left panel mount failed; falling back to legacy panel', { error: error.message });
            showToast('React left panel failed to initialize. Using legacy panel.', 'warning');
        }
    }
    if (_isReactRightPanel) {
        try {
            await _mountReactRightPanel();
        } catch (error) {
            _isReactRightPanel = false;
            logger.error('App', 'React right panel mount failed; falling back to legacy panel', { error: error.message });
            showToast('React right panel failed to initialize. Using legacy panel.', 'warning');
        }
    }
    if (_isReactHeader) {
        try {
            await _mountReactHeader();
        } catch (error) {
            _isReactHeader = false;
            logger.error('App', 'React header mount failed; falling back to legacy header', { error: error.message });
        }
    }
    setupEventListeners();
    setupDragDrop();
    checkMobile();
    window.addEventListener('resize', checkMobile);
    // Ensure map recalculates size after layout settles
    setTimeout(() => { mapService.resize(); }, 100);

    // Popup navigation for multi-feature cycling
    window._mapPopupNav = (dir) => {
        mapService.cyclePopup(dir);
    };

    // Edit feature from popup
    window._mapPopupEdit = () => {
        const hit = mapService.getActivePopupHit();
        if (!hit) return;
        mapService.closePopup();
        openFeatureEditor(hit.layerId, hit.featureIndex);
    };

    logger.info('App', 'App ready');

    // Auto-save status indicator
    sessionStore.onSaveStatus((status) => {
        const el = document.getElementById('save-indicator');
        if (!el) return;
        if (status === 'saving') {
            el.textContent = 'Saving…';
            el.classList.add('visible');
        } else if (status === 'saved') {
            el.textContent = 'Session saved';
            el.classList.add('visible');
            setTimeout(() => el.classList.remove('visible'), 1500);
        } else if (status === 'error') {
            el.textContent = 'Save failed';
            el.classList.add('visible');
            setTimeout(() => el.classList.remove('visible'), 2500);
        }
    });

    // Check for a saved session and offer to restore
    restoreSessionIfAvailable();

    // Show tool guide splash on every app open
    setTimeout(() => showToolInfo(), 300);
}
// Handle both: module loaded before or after DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

// ============================
// Session Restore
// ============================
async function restoreSessionIfAvailable() {
    try {
        const info = await sessionStore.hasSession();
        if (!info) return;

        const ago = _timeAgo(info.timestamp);
        const ok = await confirm(
            'Restore Previous Session?',
            `You have ${info.layerCount} layer${info.layerCount > 1 ? 's' : ''} saved from ${ago}. Would you like to restore them?`
        );

        if (ok) {
            const session = await sessionStore.loadSession();
            if (!session) { showToast('Could not read saved session.', 'warning'); return; }

            let restored = 0;
            for (const saved of session.layers) {
                try {
                    if (saved.type === 'spatial' && saved.geojson) {
                        const schema = analyzeSchema(saved.geojson);
                        const dataset = {
                            id: saved.id,
                            name: saved.name,
                            type: 'spatial',
                            geojson: saved.geojson,
                            schema,
                            source: saved.source || { file: saved.name, format: 'session' },
                            visible: saved.visible !== false,
                            active: false,
                            created: saved.created || new Date().toISOString()
                        };
                        addLayer(dataset);
                        mapService.addLayer(dataset, getLayers().indexOf(dataset), { fit: false });
                        restored++;
                    } else if (saved.type === 'table' && saved.rows) {
                        const fields = saved.rows.length > 0 ? Object.keys(saved.rows[0]) : [];
                        const schema = analyzeTableSchema(saved.rows, fields);
                        addLayer({
                            id: saved.id,
                            name: saved.name,
                            type: 'table',
                            rows: saved.rows,
                            schema,
                            source: saved.source || { file: saved.name, format: 'session' },
                            visible: saved.visible !== false,
                            active: false,
                            created: saved.created || new Date().toISOString()
                        });
                        restored++;
                    }
                } catch (err) {
                    logger.warn('Session', `Failed to restore layer "${saved.name}"`, { error: err.message });
                }
            }

            // Set active layer from saved meta
            if (session.meta?.activeLayerId) {
                setActiveLayer(session.meta.activeLayerId);
            }

            // Fit map to all restored spatial layers
            if (restored > 0) {
                mapService.fitToAll();
            }

            showToast(`Restored ${restored} layer${restored !== 1 ? 's' : ''} from previous session`, 'success');
            logger.info('Session', `Restored ${restored} layers`);
        } else {
            await sessionStore.clearSession();
            logger.info('Session', 'User discarded saved session');
        }
    } catch (err) {
        logger.error('Session', 'Restore failed', { error: err.message });
    }
}

function _timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins > 1 ? 's' : ''} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

function _getOrCreateModalHost() {
    let host = document.getElementById('modal-host');
    if (!host) {
        host = document.createElement('div');
        host.id = 'modal-host';
        document.body.appendChild(host);
    }
    return host;
}

function _getReactHeaderTarget() {
    const element = document.querySelector('.header');
    if (!element) {
        throw new Error('Header container ".header" not found');
    }
    return element;
}

async function _mountReactHeader() {
    if (_reactHeaderUnmount) return;
    const element = _getReactHeaderTarget();
    const { mountHeaderBar } = await import('../react/header/mountHeaderBar.jsx');
    const mounted = mountHeaderBar(element, {
        onImport: () => openImportFlow(),
        onFence: () => startImportFence(),
        onPhotoMapper: () => openPhotoMapper(),
        onArcGIS: () => openArcGISImporter(),
        onDrawLayer: () => createDrawLayer(),
        onUndo: () => handleUndo(),
        onRedo: () => handleRedo(),
        onMergeLayers: () => handleMergeLayers(),
        onWorkflow: () => _workflowOverlay?.toggle(),
        onBasemapChange: (value) => applyBasemapHeaderSelection(value),
        onDimensionChange: (value) => applyDimensionHeaderSelection(value),
        onLogs: () => toggleLogs(),
        onInfo: () => showToolInfo()
    });
    _reactHeaderUnmount = mounted.unmount;
}

async function _mountReactModalHost() {
    if (_reactModalUnmount) return;
    const host = _getOrCreateModalHost();
    const { mountModalHost } = await import('../react/ui/mountModalHost.jsx');
    const mounted = mountModalHost(host);
    _reactModalUnmount = mounted.unmount;
}

function _getOrCreateToastHost() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

async function _mountReactToastHost() {
    if (_reactToastUnmount) return;
    const host = _getOrCreateToastHost();
    const { mountToastHost } = await import('../react/ui/mountToastHost.jsx');
    const mounted = mountToastHost(host);
    _reactToastUnmount = mounted.unmount;
}

function _getOrCreateReactMapViewHost() {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) {
        throw new Error('Map container "#map-container" not found');
    }

    if (!_reactMapViewHost) {
        _reactMapViewHost = document.createElement('div');
        _reactMapViewHost.className = 'map-react-view-host';
        mapContainer.prepend(_reactMapViewHost);
    }

    return _reactMapViewHost;
}

function _getReactLeftPanelTargets() {
    const layerElement = document.getElementById('layer-list');
    const fieldElement = document.getElementById('field-list');
    const toolsElement = document.getElementById('dataprep-tools');
    if (!layerElement || !fieldElement || !toolsElement) {
        throw new Error('Left panel containers not found');
    }
    return { layerElement, fieldElement, toolsElement };
}

async function _mountReactLeftPanel() {
    if (_reactLeftPanelMount) return;

    const { layerElement, fieldElement, toolsElement } = _getReactLeftPanelTargets();
    const { mountLeftPanel } = await import('../react/panels/mountLeftPanel.jsx');
    _reactLeftPanelMount = mountLeftPanel({
        layerElement,
        fieldElement,
        toolsElement,
        getSnapshot: () => ({
            layers: getLayers(),
            activeLayer: getActiveLayer()
        }),
        actions: {
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
        },
        renderDataPrepTools
    });
    _reactLeftPanelMount.render();
}

function _renderReactLeftPanel() {
    if (!_isReactLeftPanel) return;
    _reactLeftPanelMount?.render();
}

function _getReactRightPanelTarget() {
    const element = document.getElementById('output-panel-content');
    if (!element) {
        throw new Error('Right panel container "#output-panel-content" not found');
    }
    return element;
}

function _getRightPanelSnapshot() {
    const layer = getActiveLayer();
    if (!layer) {
        return {
            layer: null,
            selectedFields: [],
            formats: [],
            agolMode: !!getState().agolCompatMode,
            agolCheck: null,
            stylePanelHtml: ''
        };
    }

    const agolMode = !!getState().agolCompatMode;
    return {
        layer,
        selectedFields: getSelectedFields(layer.schema),
        formats: getAvailableFormats(layer),
        agolMode,
        agolCheck: agolMode ? checkAGOLCompatibility(layer) : null,
        stylePanelHtml: layer.type === 'spatial' ? buildStylePanel(layer) : ''
    };
}

async function _mountReactRightPanel() {
    if (_reactRightPanelMount) return;

    const element = _getReactRightPanelTarget();
    const { mountRightPanel } = await import('../react/panels/mountRightPanel.jsx');
    _reactRightPanelMount = mountRightPanel({
        element,
        getSnapshot: _getRightPanelSnapshot,
        actions: {
            toggleAgol: () => {
                toggleAGOLCompat();
                renderOutputPanel();
            },
            doExport,
            fixAgol: fixAGOL,
            showDataTable
        },
        onStyleMounted: (layer) => {
            if (layer?.type === 'spatial') {
                bindStylePanel(layer, element);
            }
        }
    });
    _reactRightPanelMount.render();
}

function _renderReactRightPanel() {
    if (!_isReactRightPanel) return;
    _reactRightPanelMount?.render();
}

async function _mountReactMapView() {
    if (_reactMapViewUnmount) return;

    const host = _getOrCreateReactMapViewHost();
    const { mountMapView } = await import('../react/map/mountMapView.jsx');
    const mounted = mountMapView(host, { mapService });
    _reactMapViewUnmount = mounted.unmount;
    try {
        await mounted.ready;
    } catch (error) {
        _reactMapViewUnmount?.();
        _reactMapViewUnmount = null;
        throw error;
    }
}

function _suspendReactMapForDualScreen() {
    if (!_reactMapViewUnmount) return;
    _reactMapViewUnmount();
    _reactMapViewUnmount = null;
}

async function _restorePrimaryMapView({ lastViewport } = {}) {
    if (isReactMapViewEnabled()) {
        await _mountReactMapView();
    } else if (!mapService.getMap()) {
        mapService.init('map-container');
    }

    const layers = getLayers().filter((layer) => layer.type === 'spatial' && layer.geojson);
    layers.forEach((layer, index) => {
        mapService.addLayer(layer, index, { fit: false });
    });

    const map = mapService.getMap();
    if (lastViewport && map) {
        map.jumpTo({
            center: lastViewport.center,
            zoom: lastViewport.zoom,
            bearing: lastViewport.bearing,
            pitch: lastViewport.pitch
        });
    } else if (layers.length) {
        mapService.fitToAll();
    }

    scheduleMapResizeAfterLayout(mapService);
}

async function initMap() {
    try {
        if (isReactMapViewEnabled()) {
            await _mountReactMapView();
        } else {
            mapService.init('map-container');
        }
        setExportMapManager(mapService); // Wire map styles into KML/KMZ export
    } catch (e) {
        logger.error('App', 'Map init failed', { error: e.message });
        showToast('Map failed to initialize. Some features may be limited.', 'warning');
    }
}

function checkMobile() {
    const isMobile = window.innerWidth < 768;
    const state = getState();
    if (isMobile !== state.ui.isMobile) {
        setUIState('isMobile', isMobile);
        document.body.classList.toggle('is-mobile', isMobile);
    }
}

// ============================
// Drag & Drop file import (global — works anywhere in the app)
// ============================
function setupDragDrop() {
    let dragCounter = 0;

    // Create full-screen drop overlay
    const overlay = document.createElement('div');
    overlay.id = 'global-drop-overlay';
    overlay.innerHTML = '<div class="drop-overlay-content">📂<br>Drop files to import</div>';
    document.body.appendChild(overlay);

    // Prevent default browser behavior for all drag events on the document
    document.addEventListener('dragover', e => { e.preventDefault(); });
    document.addEventListener('dragenter', e => {
        e.preventDefault();
        // Suppress overlay when workflow editor is open
        if (document.querySelector('.wf-overlay.visible')) return;
        dragCounter++;
        overlay.classList.add('visible');
    });
    document.addEventListener('dragleave', e => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            overlay.classList.remove('visible');
        }
    });
    document.addEventListener('drop', async (e) => {
        e.preventDefault();
        dragCounter = 0;
        overlay.classList.remove('visible');

        // Don't handle file drops when workflow editor is open
        if (document.querySelector('.wf-overlay.visible')) return;

        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length === 0) return;

        // Separate image files from data files
        const imageFiles = files.filter(f =>
            f.type.startsWith('image/') ||
            /\.(jpe?g|png|heic|heif|tiff?|webp)$/i.test(f.name)
        );
        const dataFiles = files.filter(f => !imageFiles.includes(f));

        // Import data files (GIS formats)
        if (dataFiles.length > 0) {
            await handleFileImport(dataFiles);
        }
        // Import image files (photo mapper)
        if (imageFiles.length > 0) {
            const result = await photoMapper.processPhotos(imageFiles);
            if (result?.dataset) {
                addLayer(result.dataset);
                mapService.addLayer(result.dataset, getLayers().indexOf(result.dataset), { fit: true });
                refreshUI();
                showToast(`Mapped ${result.withGPS} photo(s) with GPS`, 'success');
            }
            if (result?.withoutGPS > 0) {
                showToast(`${result.withoutGPS} photo(s) have no GPS data`, 'warning');
            }
        }
    });
}

// ============================
// File import handler
// ============================
function throwIfTaskCancelled() {
    if (getActiveTask()?.cancelled) {
        const err = new Error('Operation cancelled');
        err.cancelled = true;
        throw err;
    }
}

/** Progress modal + cancel wired to the active TaskRunner (returns null if cancelled). */
async function runWithTaskProgress(title, operation) {
    const progress = showProgressModal(title);
    const onProgress = (data) => progress.update(data.percent, data.step);
    bus.on('task:progress', onProgress);
    let userCancelled = false;

    progress.onCancel(() => {
        userCancelled = true;
        getActiveTask()?.cancel();
        progress.close();
        bus.off('task:progress', onProgress);
        showToast('Operation cancelled', 'warning');
    });

    try {
        const result = await operation();
        if (!userCancelled) progress.close();
        bus.off('task:progress', onProgress);
        return userCancelled ? null : result;
    } catch (e) {
        if (!userCancelled) progress.close();
        bus.off('task:progress', onProgress);
        if (e?.cancelled || userCancelled) return null;
        throw e;
    }
}

async function handleFileImport(files, fenceBbox = null) {
    const progress = showProgressModal('Importing Files');
    const onProgress = (data) => progress.update(data.percent, data.step);
    bus.on('task:progress', onProgress);
    let userCancelled = false;

    progress.onCancel(() => {
        userCancelled = true;
        getActiveTask()?.cancel();
        progress.close();
        bus.off('task:progress', onProgress);
        showToast('Import cancelled', 'warning');
    });

    try {
        const { datasets, errors, cancelled } = await importFiles(files);
        if (!userCancelled) progress.close();
        bus.off('task:progress', onProgress);

        if (userCancelled || cancelled) return;

        throwIfTaskCancelled();

        // Auto-split mixed-geometry datasets into separate layers
        const expanded = [];
        for (const ds of datasets) {
            throwIfTaskCancelled();
            if (ds.type === 'spatial' && ds.schema?.geometryType === 'Mixed') {
                expanded.push(...splitByGeometryType(ds));
            } else {
                expanded.push(ds);
            }
        }

        let totalFiltered = 0;
        const importedLayerIds = [];
        for (const ds of expanded) {
            throwIfTaskCancelled();
            if (fenceBbox) {
                const before = ds.type === 'spatial' ? ds.geojson?.features?.length : 0;
                filterDatasetByFence(ds, fenceBbox);
                const after = ds.type === 'spatial' ? ds.geojson?.features?.length : 0;
                totalFiltered += (before - after);
            }
            // Apply KML-extracted style before first render
            if (ds._kmlStyle && !mapService.getLayerStyle(ds.id)) {
                mapService.setLayerStyle(ds.id, { ...ds._kmlStyle });
            }
            addLayer(ds);
            mapService.addLayer(ds, getLayers().indexOf(ds), { fit: false });
            importedLayerIds.push(ds.id);
        }

        if (importedLayerIds.length > 0) {
            mapService.fitToLayers(importedLayerIds);
        }

        if (expanded.length > 0) {
            const fenceNote = fenceBbox && totalFiltered > 0 ? ` (${totalFiltered} features outside fence excluded)` : '';
            showToast(`Imported ${expanded.length} layer(s)${fenceNote}`, 'success');
            refreshUI();
        }
        for (const ds of expanded) {
            if (ds._importWarning) {
                showToast(ds._importWarning, 'warning');
            }
        }
        for (const ds of expanded) {
            if (ds._networkLinkHrefs?.length) {
                await _promptNetworkLinkAfterImport(ds);
            }
        }
        if (errors.length > 0) {
            for (const err of errors) {
                const classified = handleError(err.error, 'Import', err.file);
                showErrorToast(classified);
            }
        }
    } catch (e) {
        progress.close();
        bus.off('task:progress', onProgress);
        if (e?.cancelled || userCancelled) return;
        const classified = handleError(e, 'Import', 'File import');
        showErrorToast(classified);
    }
}

function triggerLegacyImportInput() {
    if (!_importInputEl) return;
    _importInputEl.value = '';
    _importInputEl.click();
}

function openImportFlow() {
    if (_isReactToolDialogs) {
        const rootId = `import-flow-react-${Date.now()}`;
        showModal('Import Files', `<div id="${rootId}"></div>`, {
            width: '560px',
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountImportFlowDialog } = await import('../react/tools/mountImportFlowDialog.jsx');
                const mounted = mountImportFlowDialog(root, {
                    onCancel: () => close(),
                    onImportFiles: async (files) => {
                        close();
                        await handleFileImport(files, _fenceBbox);
                    },
                    onOpenArcGIS: () => {
                        close();
                        openArcGISImporter();
                    },
                    onOpenPhotoMapper: () => {
                        close();
                        openPhotoMapper();
                    },
                    onOpenFence: () => {
                        close();
                        startImportFence();
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    triggerLegacyImportInput();
}

function setBasemapToggleActive(value) {
    document.querySelectorAll('#basemap-toggle .header-toggle-option').forEach((button) => {
        button.classList.toggle('active', button.dataset.value === value);
    });
}

function setDimensionToggleActive(value) {
    document.querySelectorAll('#dimension-toggle .header-toggle-option').forEach((button) => {
        button.classList.toggle('active', button.dataset.value === value);
    });
}

function applyBasemapHeaderSelection(value) {
    if (!value) return;
    mapService.setBasemap(value);
    setBasemapToggleActive(value);
}

function applyDimensionHeaderSelection(value) {
    if (!value) return;
    if (value === '3d') mapService.enable3D();
    else mapService.disable3D();
    setDimensionToggleActive(value);
}

function togglePanelSectionHeader(header) {
    if (!header) return;
    header.classList.toggle('collapsed');
    const body = header.nextElementSibling;
    if (body) body.classList.toggle('hidden');
}

function setPanelCollapsed(side, collapsed) {
    const panel = document.querySelector(`.panel-${side}`);
    if (!panel) return;
    panel.classList.toggle('collapsed', !!collapsed);

    const expandId = side === 'left' ? 'expand-left-panel' : 'expand-right-panel';
    const toggleId = side === 'left' ? 'toggle-left-panel' : 'toggle-right-panel';
    const collapsedGlyph = side === 'left' ? '▶' : '◀';
    const expandedGlyph = side === 'left' ? '◀' : '▶';

    document.getElementById(expandId)?.classList.toggle('hidden', !collapsed);
    const toggleButton = document.getElementById(toggleId);
    if (toggleButton) {
        toggleButton.textContent = collapsed ? collapsedGlyph : expandedGlyph;
    }
    setTimeout(() => { mapService.resize(); }, 250);
}

function togglePanelCollapsed(side) {
    const panel = document.querySelector(`.panel-${side}`);
    if (!panel) return;
    const willCollapse = !panel.classList.contains('collapsed');
    setPanelCollapsed(side, willCollapse);
}

function invokeAppAction(action, arg) {
    if (!action) return;
    const fn = APP_ACTIONS[action];
    if (typeof fn !== 'function') return;
    if (arg == null) {
        fn();
        return;
    }
    if (arg === 'true') {
        fn(true);
        return;
    }
    if (arg === 'false') {
        fn(false);
        return;
    }
    fn(arg);
}

function closestFromEvent(event, selector) {
    const node = event.target instanceof Element ? event.target : event.target?.parentElement;
    return node?.closest(selector) ?? null;
}

// ============================
// Setup all event listeners
// ============================
function setupEventListeners() {
    // Import button — use a persistent hidden input (iOS-safe)
    _importInputEl = document.createElement('input');
    _importInputEl.type = 'file';
    _importInputEl.multiple = true;
    _importInputEl.accept = '.geojson,.json,.csv,.tsv,.txt,.xlsx,.xls,.kml,.kmz,.zip,.xml';
    _importInputEl.setAttribute('aria-label', 'Import files');
    _importInputEl.style.cssText = 'opacity:0;position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
    document.body.appendChild(_importInputEl);
    _importInputEl.addEventListener('change', () => {
        if (_importInputEl.files.length > 0) {
            const files = Array.from(_importInputEl.files);
            handleFileImport(files, _fenceBbox);
        }
    });
    if (!_isReactHeader) {
        document.getElementById('btn-import')?.addEventListener('click', openImportFlow);
    }

    // Mobile import
    document.getElementById('btn-import-mobile')?.addEventListener('click', openImportFlow);

    // Photo Mapper
    if (!_isReactHeader) {
        document.getElementById('btn-photo-mapper')?.addEventListener('click', openPhotoMapper);
    }
    document.getElementById('btn-photo-mapper-mobile')?.addEventListener('click', openPhotoMapper);

    // Import Fence
    if (!_isReactHeader) {
        document.getElementById('btn-fence')?.addEventListener('click', startImportFence);
    }

    // Workflow editor
    if (!_workflowOverlay) {
        _workflowOverlay = new WorkflowOverlay({
            getLayers: () => getLayers(),
            importFile: (file) => importFile(file),
            addToMap: (data, name, opts = {}) => {
                if (data.type !== 'spatial') {
                    // Tables: just add to state, no map layer
                    const dataset = createTableDataset(name, data.rows, null, { format: 'workflow' });
                    addLayer(dataset);
                    refreshUI();
                    showToast(`Table "${name}" added from workflow`, 'success');
                    return dataset.id;
                }
                // Check if a workflow layer with this name already exists → update in place
                const existing = getLayers().find(l => l.name === name && l.source?.format === 'workflow');
                if (existing) {
                    updateLayer(existing.id, { geojson: data.geojson });
                    mapService.removeLayer(existing.id);
                    mapService.addLayer(existing, getLayers().indexOf(existing), { fit: !opts.workflow });
                    refreshUI();
                    showToast(`Layer "${name}" updated`, 'success');
                    return existing.id;
                }
                // New layer
                const dataset = createSpatialDataset(name, data.geojson, { format: 'workflow' });
                addLayer(dataset);
                mapService.addLayer(dataset, getLayers().indexOf(dataset), { fit: !opts.workflow });
                refreshUI();
                if (!opts.workflow) showToast(`Layer "${name}" added from workflow`, 'success');
                return dataset.id;
            },
            updateMapLayer: (layerId, data) => {
                const layer = getLayers().find(l => l.id === layerId);
                if (!layer) return;
                updateLayer(layerId, { geojson: data.geojson });
                mapService.removeLayer(layerId);
                mapService.addLayer(layer, getLayers().indexOf(layer));
                refreshUI();
            },
            removeFromMap: (layerId) => {
                mapService.removeLayer(layerId);
                removeLayer(layerId);
                refreshUI();
            }
        });
    }
    if (!_isReactHeader) {
        document.getElementById('btn-workflow')?.addEventListener('click', () => _workflowOverlay.toggle());
    }

    setupDualScreenMode();

    // ArcGIS REST Import
    if (!_isReactHeader) {
        document.getElementById('btn-arcgis')?.addEventListener('click', openArcGISImporter);
    }
    document.getElementById('btn-arcgis-mobile')?.addEventListener('click', openArcGISImporter);

    // Draw Layer
    if (!_isReactHeader) {
        document.getElementById('btn-draw-layer')?.addEventListener('click', createDrawLayer);
    }

    // Handle drawn features
    bus.on('draw:featureCreated', ({ layerId, feature }) => {
        const layer = getLayers().find(l => l.id === layerId);
        if (!layer || layer.type !== 'spatial') return;
        saveSnapshot(layer.id, 'Draw feature', layer.geojson);
        layer.geojson.features.push(feature);
        layer.schema = analyzeSchema(layer.geojson);
        bus.emit('layer:updated', layer);
        bus.emit('layers:changed', getLayers());
        mapService.addLayer(layer, getLayers().indexOf(layer));
        refreshUI();
        showToast(`Added ${feature.geometry.type} to ${layer.name}`, 'success');
    });

    // Handle edited features (vertex dragging)
    bus.on('draw:featureEdited', ({ layerId, featureIndex }) => {
        const layer = getLayers().find(l => l.id === layerId);
        if (!layer || layer.type !== 'spatial') return;
        saveSnapshot(layer.id, 'Edit feature', layer.geojson);
        layer.schema = analyzeSchema(layer.geojson);
        bus.emit('layer:updated', layer);
        bus.emit('layers:changed', getLayers());
        refreshUI();
    });

    // Handle deleted features
    bus.on('draw:featureDeleted', ({ layerId, featureIndex }) => {
        const layer = getLayers().find(l => l.id === layerId);
        if (!layer || layer.type !== 'spatial') return;
        saveSnapshot(layer.id, 'Delete feature', layer.geojson);
        layer.geojson.features.splice(featureIndex, 1);
        layer.schema = analyzeSchema(layer.geojson);
        bus.emit('layer:updated', layer);
        bus.emit('layers:changed', getLayers());
        mapService.addLayer(layer, getLayers().indexOf(layer));
        refreshUI();
        showToast('Feature deleted', 'success');
    });

    // Logs
    if (!_isReactHeader) {
        document.getElementById('btn-logs')?.addEventListener('click', toggleLogs);
    }

    // Info / Tool Guide
    if (!_isReactHeader) {
        document.getElementById('btn-info')?.addEventListener('click', showToolInfo);
    }

    // Merge layers
    if (!_isReactHeader) {
        document.getElementById('btn-merge')?.addEventListener('click', handleMergeLayers);
    }

    // Mobile dropdown menu
    const mobileMenuBtn = document.getElementById('btn-mobile-menu');
    const mobileDropdown = document.getElementById('mobile-dropdown-menu');
    if (mobileMenuBtn && mobileDropdown) {
        const closeMobileMenu = () => {
            mobileDropdown.classList.add('hidden');
            const backdrop = document.getElementById('mobile-menu-backdrop');
            if (backdrop) backdrop.remove();
        };
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !mobileDropdown.classList.contains('hidden');
            if (isOpen) { closeMobileMenu(); return; }
            mobileDropdown.classList.remove('hidden');
            // Add backdrop to catch taps outside
            let backdrop = document.getElementById('mobile-menu-backdrop');
            if (!backdrop) {
                backdrop = document.createElement('div');
                backdrop.id = 'mobile-menu-backdrop';
                backdrop.className = 'mobile-dropdown-backdrop';
                document.body.appendChild(backdrop);
            }
            backdrop.addEventListener('click', closeMobileMenu, { once: true });
        });
        mobileDropdown.addEventListener('click', (e) => {
            const item = e.target.closest('.mobile-menu-item');
            if (!item) return;
            const action = item.dataset.action;
            closeMobileMenu();
            switch (action) {
                case 'import': openImportFlow(); break;
                case 'photos': openPhotoMapper(); break;
                case 'arcgis': openArcGISImporter(); break;

                case 'draw': createDrawLayer(); break;
                case 'logs': toggleLogs(); break;
                case 'info': showToolInfo(); break;
            }
        });
    }

    // Undo / Redo
    if (!_isReactHeader) {
        document.getElementById('btn-undo')?.addEventListener('click', handleUndo);
        document.getElementById('btn-redo')?.addEventListener('click', handleRedo);
    }

    // Mobile nav tabs
    document.querySelectorAll('.mobile-nav-item').forEach(el => {
        el.addEventListener('click', () => {
            const tab = el.dataset.tab;
            setUIState('activeTab', tab);
            document.querySelectorAll('.mobile-nav-item').forEach(n => n.classList.remove('active'));
            el.classList.add('active');
            showMobileContent(tab);
        });
    });

    // ============================
    // NEW MOBILE FLYOUT MENUS
    // ============================
    setupMobileFlyoutMenus();

    // App action delegation for HTML-rendered tool buttons (replaces inline onclick usage)
    document.addEventListener('click', (event) => {
        const actionButton = closestFromEvent(event, '[data-app-action]');
        if (!actionButton) return;
        const { appAction, appArg } = actionButton.dataset;
        if (!appAction) return;
        event.preventDefault();
        event.stopPropagation();
        invokeAppAction(appAction, appArg);
    });

    // Layer list activation (desktop + mobile legacy render paths)
    document.addEventListener('click', (event) => {
        const layerItem = closestFromEvent(event, '.layer-item[data-layer-id]');
        if (!layerItem) return;
        if (closestFromEvent(event, '[data-app-action]')) return;
        setActiveLayerAndRefresh(layerItem.dataset.layerId);
    });

    // Inline rename gestures
    document.addEventListener('dblclick', (event) => {
        const layerName = closestFromEvent(event, '.layer-name[data-layer-rename-id]');
        if (layerName) {
            event.preventDefault();
            event.stopPropagation();
            renameLayer(layerName.dataset.layerRenameId, layerName);
            return;
        }
        const fieldName = closestFromEvent(event, '.field-name[data-field-rename-id]');
        if (fieldName) {
            event.preventDefault();
            renameField(fieldName.dataset.fieldRenameId, fieldName);
        }
    });

    // Field list controls (desktop + mobile legacy render paths)
    document.addEventListener('input', (event) => {
        if (event.target.id === 'field-search') {
            filterFields(event.target.value);
        }
    });
    document.addEventListener('change', (event) => {
        const fieldToggle = closestFromEvent(event, 'input[data-field-toggle]');
        if (!fieldToggle) return;
        toggleField(fieldToggle.dataset.fieldToggle, fieldToggle.checked);
    });

    // Panel section collapse/expand (replaces inline onclick handlers)
    document.addEventListener('click', (event) => {
        const header = closestFromEvent(event, '.panel-section-header');
        if (!header) return;
        if (header.dataset.collapsible !== 'true') return;
        togglePanelSectionHeader(header);
    });

    // Panel collapse
    document.getElementById('toggle-left-panel')?.addEventListener('click', () => togglePanelCollapsed('left'));
    document.getElementById('expand-left-panel')?.addEventListener('click', () => setPanelCollapsed('left', false));
    document.getElementById('toggle-right-panel')?.addEventListener('click', () => togglePanelCollapsed('right'));
    document.getElementById('expand-right-panel')?.addEventListener('click', () => setPanelCollapsed('right', false));

    // Listen for layer changes to update UI
    bus.on('layers:changed', refreshUI);
    bus.on('layers:changed', () => sessionStore.scheduleSave(getLayers()));
    bus.on('layer:active', () => { refreshUI(); updateSelectionUI(); });
    bus.on('task:error', (data) => {
        showErrorToast(data.error);
    });

    // Listen for selection changes
    bus.on('selection:changed', () => updateSelectionUI());
    bus.on('selection:modeChanged', () => updateSelectionUI());

    // Right-click context menu
    bus.on('map:contextmenu', showMapContextMenu);
    bus.on('coord-search:add-new', _coordSearchAddNew);
    bus.on('coord-search:add-existing', _coordSearchAddToExisting);
    bus.on('coord-search:clear', _coordSearchClear);

    // Basemap toggle
    if (!_isReactHeader) {
        document.getElementById('basemap-toggle')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.header-toggle-option');
            if (!btn || btn.classList.contains('active')) return;
            applyBasemapHeaderSelection(btn.dataset.value);
        });
    }

    // 2D/3D toggle
    if (!_isReactHeader) {
        document.getElementById('dimension-toggle')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.header-toggle-option');
            if (!btn || btn.classList.contains('active')) return;
            applyDimensionHeaderSelection(btn.dataset.value);
        });
    }

    // AGOL compat toggle
    document.getElementById('agol-toggle')?.addEventListener('change', () => {
        toggleAGOLCompat();
        refreshUI();
    });
}

// ============================
// Dual Screen Mode
// ============================
function setupDualScreenMode() {
    const btn = document.getElementById('btn-dual-screen');
    if (!btn) return;

    installDualScreenPrimaryHandlers({
        restorePrimaryMap: (payload) => {
            _restorePrimaryMapView(payload).catch((error) => {
                logger.error('App', 'Primary map restore failed after dual-screen exit', { error: error.message });
                showToast('Map failed to restore in this window. Reload if the map stays missing.', 'warning');
            });
        },
        onDrawFeatureCreated: (layerId, feature) => {
            bus.emit('draw:featureCreated', { layerId, feature });
        },
        onDrawFeatureEdited: (layerId, featureIndex) => {
            bus.emit('draw:featureEdited', { layerId, featureIndex });
        },
        onDrawFeatureDeleted: (layerId, featureIndex) => {
            bus.emit('draw:featureDeleted', { layerId, featureIndex });
        },
        openFeatureEditor,
        handleFileImport: (files) => handleFileImport(files, _fenceBbox),
        handlePhotoImport: async (imageFiles) => {
            const result = await photoMapper.processPhotos(imageFiles);
            if (result?.dataset) {
                addLayer(result.dataset);
                mapService.addLayer(result.dataset, getLayers().indexOf(result.dataset), { fit: true });
                refreshUI();
                showToast(`Imported ${imageFiles.length} photo(s)`, 'success');
            }
        },
        setFenceBbox: (bbox) => {
            _fenceBbox = bbox;
            dualScreenCoordinator.setFenceBbox(bbox);
            updateFenceButton();
            showToast('Import fence placed — all imports will be filtered to this area', 'success');
        },
        clearFence: () => {
            _fenceBbox = null;
            dualScreenCoordinator.setFenceBbox(null);
            mapService.clearImportFence();
            updateFenceButton();
            if (dualScreenCoordinator.isActive) {
                dualScreenCoordinator.broadcastDrawCmd({ action: 'clearFence' });
            }
            showToast('Import fence removed', 'info');
        },
        toggleLayerVisibility: (layerId) => {
            toggleLayerVisibility(layerId);
            mapService.toggleLayer(layerId, getLayers().find(l => l.id === layerId)?.visible);
            renderLayerList();
        },
        zoomToLayer: (layerId) => {
            if (dualScreenCoordinator.isActive) {
                dualScreenCoordinator.broadcastFit('fitLayers', { layerIds: [layerId] });
                return;
            }
            const layer = mapService.getLayerRecord(layerId);
            if (layer?.geojson) {
                try {
                    const bb = turf.bbox(layer.geojson);
                    mapService.getMap()?.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 30 });
                } catch (_) { /* ignore */ }
            }
        },
        setActiveLayer: (id) => { setActiveLayer(id); refreshUI(); }
    });

    document.getElementById('map-container')?.addEventListener('click', (e) => {
        if (e.target.closest('#btn-return-map-primary')) toggleDualScreen();
    });

    dualScreenCoordinator.onStateChange((active) => {
        applyDualScreenLayout(active);
        if (active) {
            _suspendReactMapForDualScreen();
        }
        syncDualScreenHeaderButton(btn, active);
        document.querySelectorAll('[data-dual-screen-toggle]').forEach(el => {
            el.classList.toggle('active', active);
            if (el.id === 'wf-dual-screen') {
                el.textContent = active ? '🖥 Exit Dual Screen' : '🖥 Dual Screen';
            }
        });
        if (active && _fenceBbox) {
            dualScreenCoordinator.setFenceBbox(_fenceBbox);
            setTimeout(() => {
                dualScreenCoordinator.broadcastDrawCmd({ action: 'applyFence', bbox: _fenceBbox });
            }, 600);
        }
        if (!active) dualScreenCoordinator.setFenceBbox(_fenceBbox);
    });

    bus.on('layers:changed', () => {
        if (dualScreenCoordinator.isActive) dualScreenCoordinator.syncLayersChanged();
    });

    const toggleDualScreen = async () => {
        if (getState().ui.isMobile) return;
        if (dualScreenCoordinator.isActive) {
            dualScreenCoordinator.deactivate();
            return;
        }
        const ok = await dualScreenCoordinator.activate();
        if (!ok) {
            showToast(POPUP_BLOCKED_MESSAGE, 'error', { duration: 8000 });
        }
    };

    btn.addEventListener('click', toggleDualScreen);
    window._toggleDualScreen = toggleDualScreen;

    window.addEventListener('message', (e) => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type === 'gis-toolbox-dual-screen-exit' && dualScreenCoordinator.isActive) {
            dualScreenCoordinator.deactivate({ fromSecondaryBye: true });
        }
    });

    if (typeof sessionStorage !== 'undefined'
        && consumeDualScreenReloadReminder(sessionStorage, window._dualScreenReloadState ||= {})) {
        showToast(RELOAD_REMINDER_MESSAGE, 'info', { duration: 8000 });
    }
}

function applyDualScreenLayout(active) {
    applyDualScreenDocumentLayout(active);
}

// ============================
// UI Refresh — rebuilds panels
// ============================
const REFRESH_UI_DEBOUNCE_MS = 150;
let _refreshUITimer = null;

function refreshUINow() {
    if (_isReactLeftPanel) {
        _renderReactLeftPanel();
    } else {
        renderLayerList();
        renderFieldList();
    }
    renderOutputPanel();
    renderMobileContent();
    updateToolbarState();
}

/** Debounced panel refresh — coalesces bursts during import / multi-layer updates. */
function refreshUI() {
    clearTimeout(_refreshUITimer);
    _refreshUITimer = setTimeout(() => {
        _refreshUITimer = null;
        refreshUINow();
    }, REFRESH_UI_DEBOUNCE_MS);
}

function updateToolbarState() {
    const layers = getLayers();
    const hasLayers = layers.length > 0;
    document.getElementById('btn-merge')?.classList.toggle('hidden', layers.length < 2);

    const hs = getHistoryState();
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = !hs.canUndo;
    if (redoBtn) redoBtn.disabled = !hs.canRedo;
}

// ============================
// Layer List (left panel)
// ============================
function renderLayerList() {
    if (_isReactLeftPanel) {
        _renderReactLeftPanel();
        return;
    }
    const container = document.getElementById('layer-list');
    if (!container) return;
    const layers = getLayers();
    const active = getActiveLayer();

    if (layers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:48px;height:48px;margin:0 auto 12px;opacity:0.5;">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                </svg>
                <p>No layers loaded. Import or drag and drop a file to start.</p>
            </div>`;
        return;
    }

    container.innerHTML = layers.map((layer, idx) => {
        const isActive = layer.id === active?.id;
        const icon = layer.type === 'spatial' ? '🗺️' : '📊';
        const count = layer.type === 'spatial'
            ? `${layer.geojson?.features?.length || 0} features`
            : `${layer.rows?.length || 0} rows`;
        const geomBadge = layer.schema?.geometryType
            ? `<span class="badge badge-info">${layer.schema.geometryType}</span>` : '';
        const filterBadge = layer._activeFilter
            ? `<span class="layer-filter-badge" title="Filter active – click to edit" data-app-action="openFilterBuilder" data-app-arg="${layer.id}">FILTERED</span>`
            : '';

        return `
            <div class="layer-item ${isActive ? 'active' : ''}" data-id="${layer.id}" data-layer-id="${layer.id}">
                <span class="layer-icon">${icon}</span>
                <div class="layer-name-row">
                    <div class="layer-name" data-layer-rename-id="${layer.id}">${layer.name}</div>
                    ${filterBadge}
                    <div class="layer-order-btns">
                        <button title="Move up" ${idx === 0 ? 'disabled' : ''} data-app-action="moveLayerUp" data-app-arg="${layer.id}">▲</button>
                        <button title="Move down" ${idx === layers.length - 1 ? 'disabled' : ''} data-app-action="moveLayerDown" data-app-arg="${layer.id}">▼</button>
                    </div>
                </div>
                <div class="layer-bottom-row">
                    <div class="layer-meta">${count} · ${layer.schema?.fields?.length || 0} fields ${geomBadge}</div>
                    <div class="layer-actions">
                        <button class="btn-icon" title="Rename" data-app-action="renameLayer" data-app-arg="${layer.id}">✏️</button>
                        <button class="btn-icon" title="Toggle visibility" data-app-action="toggleVisibility" data-app-arg="${layer.id}">
                            ${layer.visible ? '👁️' : '👁️‍🗨️'}
                        </button>
                        <button class="btn-icon" title="Zoom to layer" data-app-action="zoomToLayer" data-app-arg="${layer.id}">🔍</button>
                        <button class="btn-icon" title="Remove" data-app-action="removeLayer" data-app-arg="${layer.id}">🗑️</button>
                    </div>
                </div>
            </div>`;
    }).join('');
}

function moveLayerUp(id) {
    reorderLayer(id, 'up');
    mapService.syncLayerOrder(getLayers().map(l => l.id));
    renderLayerList();
}

function moveLayerDown(id) {
    reorderLayer(id, 'down');
    mapService.syncLayerOrder(getLayers().map(l => l.id));
    renderLayerList();
}

function setActiveLayerAndRefresh(id) {
    setActiveLayer(id);
    refreshUI();
}

function toggleLayerVisibilityAndRender(id) {
    toggleLayerVisibility(id);
    mapService.toggleLayer(id, getLayers().find(l => l.id === id)?.visible);
    renderLayerList();
}

function zoomToLayer(id) {
    const layer = mapService.getLayerRecord(id);
    if (layer && layer.geojson) {
        try {
            const bb = turf.bbox(layer.geojson);
            mapService.getMap()?.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 30 });
        } catch (_) {}
    }
}

async function removeLayerWithConfirm(id) {
    const ok = await confirm('Remove Layer', 'Remove this layer?');
    if (ok) {
        removeLayer(id);
        mapService.removeLayer(id);
        refreshUI();
    }
}

// ============================
// Field List (left panel)
// ============================
function renderFieldList() {
    if (_isReactLeftPanel) {
        _renderReactLeftPanel();
        return;
    }
    const container = document.getElementById('field-list');
    if (!container) return;
    const layer = getActiveLayer();

    if (!layer) {
        container.innerHTML = '<div class="text-muted text-sm p-8">Select a layer to view fields</div>';
        return;
    }

    const fields = layer.schema?.fields || [];
    const searchHtml = `<div class="input-with-btn" style="margin-bottom:8px;">
        <input type="search" id="field-search" placeholder="Search fields...">
        <button class="btn btn-sm btn-secondary" data-app-action="selectAllFields" data-app-arg="true">All</button>
        <button class="btn btn-sm btn-secondary" data-app-action="selectAllFields" data-app-arg="false">None</button>
        <button class="btn btn-sm btn-primary" data-app-action="addField" title="Add new field">+ Field</button>
    </div>`;

    const fieldRows = fields.map(f => `
        <div class="field-item" data-field="${f.name}">
            <input type="checkbox" ${f.selected ? 'checked' : ''} data-field-toggle="${f.name}">
            <span class="field-name" data-field-rename-id="${f.name}" title="Double-click to rename">${f.outputName || f.name}</span>
            <span class="field-type">${f.type}</span>
            <button class="btn-icon" style="font-size:10px;padding:2px;" title="Rename field" data-app-action="renameField" data-app-arg="${f.name}">✏️</button>
        </div>
    `).join('');

    container.innerHTML = searchHtml + `<div class="field-list-items">${fieldRows}</div>`;
}

// ============================
// Output Panel (right panel)
// ============================
function renderOutputPanel() {
    if (_isReactRightPanel) {
        _renderReactRightPanel();
        return;
    }
    const container = document.getElementById('output-panel-content');
    if (!container) return;
    const layer = getActiveLayer();

    if (!layer) {
        container.innerHTML = '<div class="empty-state"><p>No layer selected</p></div>';
        return;
    }

    const selected = getSelectedFields(layer.schema);
    const formatsList = getAvailableFormats(layer);

    // AGOL compat check
    const agolMode = getState().agolCompatMode;
    let agolHtml = '';
    if (agolMode) {
        const check = checkAGOLCompatibility(layer);
        agolHtml = `<div class="panel-section">
            <div class="panel-section-header">AGOL Readiness</div>
            <div class="panel-section-body">
                ${check.issues.length === 0
                ? '<div class="success-box">✅ All checks passed</div>'
                : check.issues.map(i => `<div class="warning-box text-xs mb-8">${i.type}: ${i.field || ''} ${i.message || i.fixed ? '→ ' + i.fixed : ''}</div>`).join('')
            }
                ${check.issues.length > 0 ? '<button class="btn btn-sm btn-primary w-full mt-8" data-app-action="fixAGOL">Fix All</button>' : ''}
            </div>
        </div>`;
    }

    container.innerHTML = `
        <div class="panel-section">
            <div class="panel-section-header">Output Schema (${selected.length} fields)</div>
            <div class="panel-section-body">
                ${selected.map(f => `<div class="field-item">
                    <span class="field-name">${f.outputName}</span>
                    <span class="field-type">${f.type}</span>
                </div>`).join('')}
                ${selected.length === 0 ? '<div class="text-muted text-sm">No fields selected</div>' : ''}
            </div>
        </div>

        <div class="panel-section">
            <div class="panel-section-header">Export</div>
            <div class="panel-section-body">
                <label class="toggle mb-8">
                    <input type="checkbox" id="agol-toggle" ${agolMode ? 'checked' : ''}>
                    <span class="toggle-track"></span>
                    <span>AGOL Compatible</span>
                </label>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${formatsList.map(fmt =>
                        `<button class="btn btn-sm btn-primary" data-app-action="doExport" data-app-arg="${fmt.key}">${fmt.label}</button>`
                    ).join('')}
                </div>
            </div>
        </div>

        ${agolHtml}

        <div class="panel-section">
            <div class="panel-section-header">Data Preview</div>
            <div class="panel-section-body">
                <button class="btn btn-sm btn-secondary w-full" data-app-action="showDataTable">Show Data Table</button>
            </div>
        </div>

        ${layer.type === 'spatial' ? buildStylePanel(layer) : ''}`;

    // Re-bind AGOL toggle
    document.getElementById('agol-toggle')?.addEventListener('change', () => {
        toggleAGOLCompat();
        renderOutputPanel();
    });

    // Bind style panel controls
    if (layer.type === 'spatial') {
        bindStylePanel(layer);
    }
}

// ============================
// Layer Styling Panel
// ============================

function _detectGeomTypes(layer) {
    const types = new Set();
    for (const f of (layer.geojson?.features || [])) {
        if (f.geometry?.type) {
            const t = f.geometry.type;
            if (t === 'Point' || t === 'MultiPoint') types.add('point');
            else if (t === 'LineString' || t === 'MultiLineString') types.add('line');
            else if (t === 'Polygon' || t === 'MultiPolygon') types.add('polygon');
        }
    }
    return types;
}

function buildStylePanel(layer) {
    const sty = mapService.getLayerStyle(layer.id) || {
        strokeColor: '#2563eb', fillColor: '#2563eb',
        strokeWidth: 2, strokeOpacity: 0.8, fillOpacity: 0.3,
        pointSize: 6, pointSymbol: 'circle'
    };
    const geomTypes = _detectGeomTypes(layer);
    const isMixed = geomTypes.size > 1;
    const hasPoints = geomTypes.has('point');
    const hasFills = geomTypes.has('polygon') || geomTypes.has('point');
    const hasLines = geomTypes.has('line') || geomTypes.has('polygon');

    const symbolOptions = ['circle', 'square', 'triangle', 'diamond', 'star', 'pin'];
    const symbolLabels = { circle: '●', square: '■', triangle: '▲', diamond: '◆', star: '★', pin: '📍' };

    // Helper to build a style section (for single-type or per-type)
    function buildSection(prefix, s, opts) {
        const { showStroke = true, showFill = true, showWidth = true, showStrokeOp = true, showFillOp = true, showPoint = false } = opts;
        let html = '';
        if (showStroke) {
            html += `<div class="style-row"><label>Stroke Color</label><input type="color" id="${prefix}-stroke-color" value="${s.strokeColor}" class="style-color-input"></div>`;
        }
        if (showFill) {
            html += `<div class="style-row"><label>Fill Color</label><input type="color" id="${prefix}-fill-color" value="${s.fillColor || s.strokeColor}" class="style-color-input"></div>`;
        }
        if (showWidth) {
            html += `<div class="style-row"><label>Stroke Width</label><input type="range" id="${prefix}-stroke-width" min="0.5" max="8" step="0.5" value="${s.strokeWidth ?? 2}" class="style-range"><span class="style-value" id="${prefix}-stroke-width-val">${s.strokeWidth ?? 2}</span></div>`;
        }
        if (showStrokeOp) {
            html += `<div class="style-row"><label>Stroke Opacity</label><input type="range" id="${prefix}-stroke-opacity" min="0" max="1" step="0.05" value="${s.strokeOpacity ?? 0.8}" class="style-range"><span class="style-value" id="${prefix}-stroke-opacity-val">${Math.round((s.strokeOpacity ?? 0.8) * 100)}%</span></div>`;
        }
        if (showFillOp) {
            html += `<div class="style-row"><label>Fill Opacity</label><input type="range" id="${prefix}-fill-opacity" min="0" max="1" step="0.05" value="${s.fillOpacity ?? 0.3}" class="style-range"><span class="style-value" id="${prefix}-fill-opacity-val">${Math.round((s.fillOpacity ?? 0.3) * 100)}%</span></div>`;
        }
        if (showPoint) {
            html += `<div class="style-row"><label>Point Size</label><input type="range" id="${prefix}-point-size" min="3" max="20" step="1" value="${s.pointSize ?? 6}" class="style-range"><span class="style-value" id="${prefix}-point-size-val">${s.pointSize ?? 6}</span></div>`;
            html += `<div class="style-row style-row-symbols"><label>Symbol</label><div class="style-symbols" id="${prefix}-point-symbol">${symbolOptions.map(sym =>
                `<button class="style-symbol-btn ${(s.pointSymbol || 'circle') === sym ? 'active' : ''}" data-symbol="${sym}" title="${sym}">${symbolLabels[sym]}</button>`
            ).join('')}</div></div>`;
        }
        return html;
    }

    let body;
    if (isMixed) {
        // Per-geometry-type sections
        const ps = { ...sty, ...(sty.point || {}) };
        const ls = { ...sty, ...(sty.line || {}) };
        const gs = { ...sty, ...(sty.polygon || {}) };

        body = '';
        if (hasPoints) {
            body += `<div class="style-type-section"><h4 class="style-type-header">⬤ Points</h4>${buildSection('sty-pt', ps, { showFill: true, showWidth: true, showStrokeOp: true, showFillOp: true, showPoint: true })}</div>`;
        }
        if (hasLines) {
            body += `<div class="style-type-section"><h4 class="style-type-header">━ Lines</h4>${buildSection('sty-ln', ls, { showFill: false, showWidth: true, showStrokeOp: true, showFillOp: false, showPoint: false })}</div>`;
        }
        if (geomTypes.has('polygon')) {
            body += `<div class="style-type-section"><h4 class="style-type-header">⬠ Polygons</h4>${buildSection('sty-pg', gs, { showFill: true, showWidth: true, showStrokeOp: true, showFillOp: true, showPoint: false })}</div>`;
        }
    } else {
        // Single geometry type — flat panel (original layout)
        body = buildSection('sty', sty, {
            showStroke: true,
            showFill: hasFills,
            showWidth: hasLines || hasFills,
            showStrokeOp: true,
            showFillOp: hasFills,
            showPoint: hasPoints
        });
    }

    return `
        <div class="panel-section style-panel">
            <div class="panel-section-header" data-collapsible="true">
                Layer Style <span class="arrow">▼</span>
            </div>
            <div class="panel-section-body">
                ${body}
                <button class="btn btn-sm btn-primary w-full mt-8" id="sty-apply">Apply Style</button>
            </div>
        </div>`;
}

function bindStylePanel(layer, root = document) {
    const $ = (sel) => root.querySelector(sel);
    const $$ = (sel) => root.querySelectorAll(sel);
    const byId = (id) => root.getElementById ? root.getElementById(id) : root.querySelector(`#${id}`);

    const applyBtn = byId('sty-apply');
    if (!applyBtn) return;

    const geomTypes = _detectGeomTypes(layer);
    const isMixed = geomTypes.size > 1;

    // Wire live value previews for all range sliders in the style panel
    const wireRange = (inputId, valId, fmt) => {
        const input = byId(inputId);
        const valEl = byId(valId);
        if (input && valEl) {
            input.addEventListener('input', () => { valEl.textContent = fmt(input.value); });
        }
    };

    const pctFmt = v => Math.round(v * 100) + '%';
    const idFmt = v => v;

    if (isMixed) {
        // Per-type range sliders
        for (const prefix of ['sty-pt', 'sty-ln', 'sty-pg']) {
            wireRange(`${prefix}-stroke-width`, `${prefix}-stroke-width-val`, idFmt);
            wireRange(`${prefix}-stroke-opacity`, `${prefix}-stroke-opacity-val`, pctFmt);
            wireRange(`${prefix}-fill-opacity`, `${prefix}-fill-opacity-val`, pctFmt);
            wireRange(`${prefix}-point-size`, `${prefix}-point-size-val`, idFmt);

            // Symbol button selection
            $$(`#${prefix}-point-symbol .style-symbol-btn`).forEach(btn => {
                btn.addEventListener('click', () => {
                    $$(`#${prefix}-point-symbol .style-symbol-btn`).forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });
        }
    } else {
        wireRange('sty-stroke-width', 'sty-stroke-width-val', idFmt);
        wireRange('sty-stroke-opacity', 'sty-stroke-opacity-val', pctFmt);
        wireRange('sty-fill-opacity', 'sty-fill-opacity-val', pctFmt);
        wireRange('sty-point-size', 'sty-point-size-val', idFmt);

        // Symbol button selection
        $$('#sty-point-symbol .style-symbol-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('#sty-point-symbol .style-symbol-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    // Helper to read style values from a prefix group
    const readSection = (prefix) => {
        const v = (id, def) => byId(`${prefix}-${id}`)?.value ?? def;
        return {
            strokeColor: v('stroke-color', '#2563eb'),
            fillColor: v('fill-color', null) || v('stroke-color', '#2563eb'),
            strokeWidth: parseFloat(v('stroke-width', 2)),
            strokeOpacity: parseFloat(v('stroke-opacity', 0.8)),
            fillOpacity: parseFloat(v('fill-opacity', 0.3)),
            pointSize: parseInt(v('point-size', 6)),
            pointSymbol: $(`#${prefix}-point-symbol .style-symbol-btn.active`)?.dataset.symbol || 'circle'
        };
    };

    // Apply
    applyBtn.addEventListener('click', () => {
        let style;
        if (isMixed) {
            // Start with current base, add per-type overrides
            const cur = mapService.getLayerStyle(layer.id) || {};
            style = { ...cur };
            if (geomTypes.has('point')) style.point = readSection('sty-pt');
            if (geomTypes.has('line')) style.line = readSection('sty-ln');
            if (geomTypes.has('polygon')) style.polygon = readSection('sty-pg');
        } else {
            style = readSection('sty');
        }
        mapService.restyleLayer(layer.id, layer, style);
        showToast('Style applied', 'success');
    });
}

// ============================
// Layer Data Tools Panel (left panel section)
// ============================
function renderDataPrepTools() {
    const layer = getActiveLayer();
    const hasFilter = !!layer?._activeFilter;
    return `
        <div class="panel-section">
            <div class="panel-section-header" data-collapsible="true">
                Layer Data Tools <span class="arrow">▼</span>
            </div>
            <div class="panel-section-body">
                <div style="display:flex; flex-wrap:wrap; gap:4px;">
                    <button class="btn btn-sm btn-secondary" data-app-action="openSplitColumn">Split Column</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="openCombineColumns">Combine</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="openTemplateBuilder">Template</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="openReplaceClean">Replace/Clean</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="openTypeConvert">Type Convert</button>
                    <button class="btn btn-sm ${hasFilter ? 'btn-primary' : 'btn-secondary'}" data-app-action="openFilterBuilder">${hasFilter ? '⚙ Filter ✓' : 'Filter'}</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="openDeduplicate">Dedup</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="openJoinTool">Join</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="openValidation">Validate</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="addUID">Add UID</button>
                </div>
            </div>
        </div>

        <div class="panel-section">
            <div class="panel-section-header" data-collapsible="true">
                GIS Widgets <span class="arrow">▼</span>
            </div>
            <div class="panel-section-body">
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">Pre-built workflows for common GIS tasks.</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openSpatialAnalyzer">🔎 Find Features in Area</button><span class="geo-tip">Search for features from one layer that fall inside a drawn area or polygon layer.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openBulkUpdate">✏️ Bulk Update</button><span class="geo-tip">Select multiple features and update their attribute fields in bulk.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openProximityJoin">↔️ Proximity Join</button><span class="geo-tip">Copy attributes from the nearest feature in a target layer to each source feature.</span></span>
                </div>
            </div>
        </div>

        <div class="panel-section">
            <div class="panel-section-header" data-collapsible="true">
                GIS Tools <span class="arrow">▼</span>
            </div>
            <div class="panel-section-body">

                <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
                    <button id="btn-selection-toggle" class="btn-selection-toggle" data-app-action="toggleSelectionMode" title="Toggle feature selection mode — click features to select them">✦ Select</button>
                    <span style="font-size:10px;color:var(--text-muted);">Click features to select, or Shift+click to multi-select</span>
                </div>
                <div id="selection-bar" class="selection-bar hidden"></div>

                <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Coordinates</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;">
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openCoordConverter">🌐 Coord Convert</button><span class="geo-tip">Convert coordinates between formats: Decimal Degrees, DMS, Degrees Decimal Minutes, and UTM.</span></span>
                </div>

                <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Measurement</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;">
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openDistanceTool">📏 Distance</button><span class="geo-tip">Straight-line distance between two clicks (great-circle). For path length along several clicks, use the map ruler control (Measure).</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openBearingTool">🧭 Bearing</button><span class="geo-tip">Find the compass direction (in degrees) from one point to another on the map.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openDestinationTool">📌 Destination</button><span class="geo-tip">Given a start point, distance, and compass direction, find where you'd end up.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openAlongTool">📍 Along</button><span class="geo-tip">Find a point at a specific distance along a line — like finding the 5-mile mark on a road.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openPointToLineDistanceTool">↔ Pt→Line</button><span class="geo-tip">Measure how far a point is from the nearest spot on a line (shortest perpendicular distance).</span></span>
                </div>

                <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Transformation</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;">
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openBuffer">⭕ Buffer</button><span class="geo-tip">Draw a zone around features at a set distance — like showing "everything within 1 mile of a road."</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openBboxClip">✂️ BBox Clip</button><span class="geo-tip">Draw a rectangle on the map and cut away everything outside it.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openClip">🔲 Clip Extent</button><span class="geo-tip">Cut features to the current visible map area.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openSimplify">〰️ Simplify</button><span class="geo-tip">Reduce detail in shapes by removing extra points — makes files smaller and rendering faster.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openBezierSpline">🌊 Spline</button><span class="geo-tip">Smooth jagged lines into gentle, flowing curves (bezier splines).</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openPolygonSmooth">🔵 Smooth</button><span class="geo-tip">Round off rough polygon edges by averaging corner positions — makes shapes look more natural.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openLineOffset">↔ Offset</button><span class="geo-tip">Create a parallel copy of a line shifted left or right by a set distance.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openSector">🥧 Sector</button><span class="geo-tip">Create a pie-slice shaped area from a center point — useful for coverage areas or viewsheds.</span></span>
                </div>

                <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Line Operations</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;">
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openLineSliceAlong">✂ Slice Along</button><span class="geo-tip">Cut out a section of a line using start and end distances — like "give me the road from mile 2 to mile 5."</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openLineSlice">✂ Slice Pts</button><span class="geo-tip">Click two points on the map to cut out the section of line between them.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openLineIntersect">✖ Intersect</button><span class="geo-tip">Find all points where two sets of lines cross each other.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openKinks">⚠ Kinks</button><span class="geo-tip">Find self-intersections — spots where a line or polygon edge crosses over itself (geometry errors).</span></span>
                </div>

                <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Combine & Analyze</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openCombine">🔗 Combine</button><span class="geo-tip">Merge all features of the same type into one multi-feature (multiple Points → one MultiPoint).</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openUnion">🔶 Union</button><span class="geo-tip">Merge all polygons into a single shape. Overlapping areas are dissolved together.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openDissolve">🫧 Dissolve</button><span class="geo-tip">Merge polygons by a shared attribute, or merge all polygons into one when no field is chosen.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openPointsWithinPolygon">📍🔷 Pts in Poly</button><span class="geo-tip">Find which points fall inside which polygons — like counting how many stores are in each district.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openNearestPoint">🎯 Nearest Pt</button><span class="geo-tip">Click the map to find the closest feature in a point layer to that location.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openNearestPointOnLine">📍→ Snap</button><span class="geo-tip">Click near a line to find the closest point directly on that line (snaps to it).</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openNearestPointToLine">📍↔ Pt to Ln</button><span class="geo-tip">Find which point feature in a layer is closest to a given line.</span></span>
                    <span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="openNearestNeighborAnalysis">📊 NN Analysis</button><span class="geo-tip">Statistically test whether points are clustered together, spread apart, or randomly distributed.</span></span>
                </div>
            </div>
        </div>`;
}

// ============================
// Mobile Flyout Menus (new mobile UI)
// ============================
function setupMobileFlyoutMenus() {
    const fabNav = document.getElementById('mobile-fab-nav');
    const fabAdd = document.getElementById('mobile-fab-add');
    const flyoutNav = document.getElementById('mobile-flyout-nav');
    const flyoutAdd = document.getElementById('mobile-flyout-add');

    if (!fabNav || !fabAdd || !flyoutNav || !flyoutAdd) return;

    function closeFlyouts() {
        flyoutNav.classList.remove('open');
        flyoutAdd.classList.remove('open');
        fabNav.classList.remove('open');
        fabAdd.classList.remove('open');
        document.querySelector('.mobile-flyout-backdrop')?.remove();
    }

    function openFlyout(fab, flyout) {
        const wasOpen = flyout.classList.contains('open');
        closeFlyouts();
        if (wasOpen) return;

        flyout.classList.add('open');
        fab.classList.add('open');

        const backdrop = document.createElement('div');
        backdrop.className = 'mobile-flyout-backdrop';
        document.body.appendChild(backdrop);
        backdrop.addEventListener('click', closeFlyouts, { once: true });
    }

    fabNav.addEventListener('click', (e) => {
        e.stopPropagation();
        openFlyout(fabNav, flyoutNav);
    });

    fabAdd.addEventListener('click', (e) => {
        e.stopPropagation();
        openFlyout(fabAdd, flyoutAdd);
    });

    // Nav menu (gear — upper right) actions
    flyoutNav.addEventListener('click', (e) => {
        const item = e.target.closest('.mobile-flyout-item');
        if (!item) return;
        const action = item.dataset.action;
        closeFlyouts();
        switch (action) {
            case 'export': mobileShowExportModal(); break;
            case 'widgets': mobileShowWidgetsModal(); break;
            case 'tools': mobileShowToolsModal(); break;
            case 'layers': mobileShowLayersModal(); break;
            case 'fields': mobileShowFieldsModal(); break;
            case 'styling': mobileShowStylingModal(); break;
            case 'datatools': mobileShowDataToolsModal(); break;
            case 'basemap': mobileShowBasemapModal(); break;
            case 'guide': showToolInfo(); break;
        }
    });

    // Add menu (plus — lower right) actions
    flyoutAdd.addEventListener('click', (e) => {
        const item = e.target.closest('.mobile-flyout-item');
        if (!item) return;
        const action = item.dataset.action;
        closeFlyouts();
        switch (action) {
            case 'import': openImportFlow(); break;
            case 'arcgis': openArcGISImporter(); break;
            case 'photos': openPhotoMapper(); break;
            case 'draw': createDrawLayer(); break;
            case 'fence': startImportFence(); break;
            case 'location': mobileAddCurrentLocation(); break;
        }
    });
}

// ============================
// Mobile Modal Helpers
// ============================
function mobileShowExportModal() {
    const layer = getActiveLayer();
    if (!layer) {
        showToast('Import data first to export', 'warning');
        return;
    }
    const formats = getAvailableFormats(layer);
    const agolMode = getState().agolCompatMode;
    const html = `
        <label class="toggle mb-8">
            <input type="checkbox" id="agol-toggle-mob" ${agolMode ? 'checked' : ''}>
            <span class="toggle-track"></span>
            <span>AGOL Compatible</span>
        </label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
            ${formats.map(f =>
                `<button class="btn btn-primary btn-sm" style="flex:1 1 calc(50% - 4px);min-height:44px;" data-export="${f.key}">${f.label}</button>`
            ).join('')}
        </div>`;
    showModal('Export — ' + layer.name, html, {
        onMount: (overlay, close) => {
            overlay.querySelector('#agol-toggle-mob')?.addEventListener('change', () => {
                toggleAGOLCompat();
            });
            overlay.querySelectorAll('[data-export]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const fmt = btn.dataset.export;
                    close(null);
                    doExport(fmt);
                });
            });
        }
    });
}

function mobileShowWidgetsModal() {
    const items = [
        { label: '📊 Spatial Analyzer', action: 'openSpatialAnalyzer' },
        { label: '✏️ Bulk Update', action: 'openBulkUpdate' },
        { label: '📍 Proximity Join', action: 'openProximityJoin' },
    ];
    const html = `<div style="display:flex;flex-direction:column;gap:8px;">
        ${items.map(i => `<button class="btn btn-secondary" style="min-height:48px;justify-content:flex-start;gap:12px;" data-action="${i.action}">${i.label}</button>`).join('')}
    </div>`;
    showModal('GIS Widgets', html, {
        onMount: (overlay, close) => {
            overlay.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const fn = btn.dataset.action;
                    close(null);
                    invokeAppAction(fn);
                });
            });
        }
    });
}

function mobileShowToolsModal() {
    const layers = getLayers();
    const isSelMode = mapService.isSelectionMode();
    const selCount = mapService.getSelectedIndices?.(getActiveLayer()?.id)?.length || 0;
    const items = [
        ...(layers.length >= 2 ? [{ label: '🔗 Merge Layers', action: 'mergeLayers', full: true }] : []),
        { label: '📏 Distance', action: 'openDistanceTool' },
        { label: '🧭 Bearing', action: 'openBearingTool' },
        { label: '⭕ Buffer', action: 'openBuffer' },
        { label: '✂️ BBox Clip', action: 'openBboxClip' },
        { label: '🔲 Clip', action: 'openClip' },
        { label: '〰️ Simplify', action: 'openSimplify' },
        { label: '🌊 Spline', action: 'openBezierSpline' },
        { label: '🔵 Smooth', action: 'openPolygonSmooth' },
        { label: '🔶 Union', action: 'openUnion' },
        { label: '🫧 Dissolve', action: 'openDissolve' },
        { label: '🔗 Combine', action: 'openCombine' },
        { label: '⚠ Kinks', action: 'openKinks' },
        { label: '📊 NN Analysis', action: 'openNearestNeighborAnalysis' },
        { label: '🌐 Coord Convert', action: 'openCoordConverter' },
    ];
    const html = `
    <div style="margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <button class="btn btn-sm ${isSelMode ? 'btn-primary' : 'btn-secondary'}" data-action="toggleSelectionMode" style="min-height:38px;">✦ ${isSelMode ? 'Selection ON' : 'Select Features'}</button>
            ${selCount > 0 ? `<button class="btn btn-sm btn-secondary" data-action="clearSelection" style="min-height:38px;">Clear (${selCount})</button>` : ''}
        </div>
        <span style="font-size:10px;color:var(--text-muted);">Tap features on the map to select them for tools below</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${items.map(i => `<button class="btn ${i.full ? 'btn-primary' : 'btn-secondary'} btn-sm" style="flex:1 1 ${i.full ? '100%' : 'calc(50% - 3px)'};min-height:44px;" data-action="${i.action}">${i.label}</button>`).join('')}
    </div>`;
    showModal('GIS Tools', html, {
        onMount: (overlay, close) => {
            overlay.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const fn = btn.dataset.action;
                    close(null);
                    invokeAppAction(fn);
                });
            });
        }
    });
}

function mobileShowLayersModal() {
    const layers = getLayers();
    const active = getActiveLayer();
    if (layers.length === 0) {
        showToast('No layers loaded yet', 'info');
        return;
    }

    function buildLayerListHtml() {
        const currentLayers = getLayers();
        const currentActive = getActiveLayer();
        let h = `<div style="display:flex;flex-direction:column;gap:4px;">`;
        h += currentLayers.map((l, idx) => {
            const isActive = l.id === currentActive?.id;
            const icon = l.type === 'spatial' ? '🗺️' : '📊';
            const count = l.type === 'spatial'
                ? `${l.geojson?.features?.length || 0} features`
                : `${l.rows?.length || 0} rows`;
            return `
            <div class="layer-item ${isActive ? 'active' : ''}" style="border-radius:var(--radius-sm);border:1px solid var(--border);margin-bottom:2px;" data-layer-id="${l.id}" data-layer-action="select">
                <span class="layer-icon">${icon}</span>
                <div class="layer-name-row">
                    <div class="layer-name">${l.name}</div>
                    <div class="layer-order-btns">
                        <button title="Up" ${idx === 0 ? 'disabled' : ''} data-layer-id="${l.id}" data-layer-action="up">▲</button>
                        <button title="Down" ${idx === currentLayers.length - 1 ? 'disabled' : ''} data-layer-id="${l.id}" data-layer-action="down">▼</button>
                    </div>
                </div>
                <div class="layer-bottom-row">
                    <div class="layer-meta">${count} · ${l.schema?.fields?.length || 0} fields</div>
                    <div class="layer-actions">
                        <button class="btn-icon" title="Rename" data-layer-id="${l.id}" data-layer-action="rename">✏️</button>
                        <button class="btn-icon" title="Toggle" data-layer-id="${l.id}" data-layer-action="toggle">
                            ${l.visible !== false ? '👁️' : '👁️‍🗨️'}
                        </button>
                        <button class="btn-icon" title="Zoom" data-layer-id="${l.id}" data-layer-action="zoom">🔍</button>
                        <button class="btn-icon" title="Remove" data-layer-id="${l.id}" data-layer-action="remove">🗑️</button>
                    </div>
                </div>
            </div>`;
        }).join('');
        h += `</div>`;
        return h;
    }

    showModal('Layers', buildLayerListHtml(), {
        onMount: (overlay, close) => {
            const refreshModal = () => {
                const body = overlay.querySelector('.modal-body');
                if (body) body.innerHTML = buildLayerListHtml();
            };

            overlay.addEventListener('click', (e) => {
                const target = e.target.closest('[data-layer-action]');
                if (!target) return;
                e.stopPropagation();
                const id = target.dataset.layerId;
                const action = target.dataset.layerAction;

                switch (action) {
                    case 'select':
                        setActiveLayer(id);
                        refreshUI();
                        refreshModal();
                        break;
                    case 'up':
                        moveLayerUp(id);
                        refreshModal();
                        break;
                    case 'down':
                        moveLayerDown(id);
                        refreshModal();
                        break;
                    case 'rename': {
                        const layer = getLayers().find(l => l.id === id);
                        if (layer) {
                            const newName = prompt('Rename layer:', layer.name);
                            if (newName && newName.trim() && newName.trim() !== layer.name) {
                                layer.name = newName.trim();
                                renderLayerList();
                                renderOutputPanel();
                                showToast(`Renamed to "${layer.name}"`, 'success', { duration: 2000 });
                                refreshModal();
                            }
                        }
                        break;
                    }
                    case 'toggle':
                        toggleLayerVisibility(id);
                        mapService.toggleLayer(id, getLayers().find(l => l.id === id)?.visible);
                        renderLayerList();
                        refreshModal();
                        break;
                    case 'zoom': {
                        const mapLayer = mapService.getLayerRecord(id);
                        if (mapLayer && mapLayer.geojson) {
                            try { const bb = turf.bbox(mapLayer.geojson); mapService.getMap()?.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 30 }); } catch(_) {}
                        }
                        close(null);
                        break;
                    }
                    case 'remove':
                        confirm('Remove Layer', 'Remove this layer?').then(ok => {
                            if (ok) {
                                removeLayer(id);
                                mapService.removeLayer(id);
                                refreshUI();
                                if (getLayers().length === 0) {
                                    close(null);
                                    showToast('Layer removed', 'success');
                                } else {
                                    refreshModal();
                                    showToast('Layer removed', 'success');
                                }
                            }
                        });
                        break;
                }
            });
        }
    });
}

function mobileShowFieldsModal() {
    const layer = getActiveLayer();
    if (!layer) {
        showToast('Select a layer first', 'warning');
        return;
    }

    const fields = layer.schema?.fields || [];
    const fieldRows = fields.map(f => `
        <div class="field-item" data-field="${f.name}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--border);">
            <input type="checkbox" class="mob-field-chk" data-name="${f.name}" ${f.selected ? 'checked' : ''}>
            <span class="field-name" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.outputName || f.name}</span>
            <span class="field-type" style="font-size:10px;color:var(--text-muted);">${f.type}</span>
        </div>
    `).join('');

    const html = `
        <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
            <button class="btn btn-sm btn-secondary" id="mob-fields-all">Select All</button>
            <button class="btn btn-sm btn-secondary" id="mob-fields-none">Select None</button>
            <button class="btn btn-sm btn-primary" id="mob-fields-add">+ Add Field</button>
        </div>
        <div style="max-height:55vh;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
            ${fieldRows || '<div style="padding:12px;color:var(--text-muted);font-size:13px;">No fields in this layer.</div>'}
        </div>
    `;

    showModal('Fields — ' + layer.name, html, {
        width: '400px',
        onMount: (overlay, close) => {
            // Checkbox toggles
            overlay.querySelectorAll('.mob-field-chk').forEach(chk => {
                chk.addEventListener('change', () => {
                    toggleField(chk.dataset.name, chk.checked);
                });
            });
            // Select All / None
            overlay.querySelector('#mob-fields-all')?.addEventListener('click', () => {
                selectAllFields(true);
                overlay.querySelectorAll('.mob-field-chk').forEach(c => c.checked = true);
            });
            overlay.querySelector('#mob-fields-none')?.addEventListener('click', () => {
                selectAllFields(false);
                overlay.querySelectorAll('.mob-field-chk').forEach(c => c.checked = false);
            });
            // Add Field — close modal and open addField dialog
            overlay.querySelector('#mob-fields-add')?.addEventListener('click', () => {
                close();
                addField();
            });
        }
    });
}

function mobileShowStylingModal() {
    const layer = getActiveLayer();
    if (!layer) {
        showToast('Select a layer first', 'warning');
        return;
    }
    if (layer.type !== 'spatial') {
        showToast('Layer styling is only for spatial layers', 'info');
        return;
    }
    const styleHtml = buildStylePanel(layer);
    showModal('Layer Styling — ' + layer.name, styleHtml, {
        onMount: (overlay) => {
            bindStylePanel(layer, overlay);
        }
    });
}

function mobileShowDataToolsModal() {
    const layer = getActiveLayer();
    if (!layer) {
        showToast('Import data first', 'warning');
        return;
    }
    const items = [
        { label: 'Split Column', action: 'openSplitColumn' },
        { label: 'Combine', action: 'openCombineColumns' },
        { label: 'Template', action: 'openTemplateBuilder' },
        { label: 'Replace/Clean', action: 'openReplaceClean' },
        { label: 'Type Convert', action: 'openTypeConvert' },
        { label: 'Filter', action: 'openFilterBuilder' },
        { label: 'Dedup', action: 'openDeduplicate' },
        { label: 'Join', action: 'openJoinTool' },
        { label: 'Validate', action: 'openValidation' },
        { label: 'Add UID', action: 'addUID' },
    ];
    const html = `<div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${items.map(i => `<button class="btn btn-secondary" style="flex:1 1 calc(50% - 4px);min-height:48px;" data-action="${i.action}">${i.label}</button>`).join('')}
    </div>`;
    showModal('Data Tools — ' + layer.name, html, {
        onMount: (overlay, close) => {
            overlay.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const fn = btn.dataset.action;
                    close(null);
                    invokeAppAction(fn);
                });
            });
        }
    });
}

function mobileShowBasemapModal() {
    const basemapOptions = [
        { value: 'voyager', label: 'Map' },
        { value: 'satellite', label: 'Satellite' }
    ];
    const currentBasemap = mapService.getCurrentBasemap() || 'voyager';
    const html = `
        <div style="display:flex;flex-direction:column;gap:6px;">
            ${basemapOptions.map(o => `
                <button class="btn ${o.value === currentBasemap ? 'btn-primary' : 'btn-secondary'}"
                    style="min-height:48px;justify-content:flex-start;gap:12px;"
                    data-basemap="${o.value}">
                    ${o.value === 'voyager' ? '🗺️' : '🛰️'} ${o.label}
                </button>
            `).join('')}
        </div>`;
    showModal('Basemap', html, {
        onMount: (overlay, close) => {
            overlay.querySelectorAll('[data-basemap]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const val = btn.dataset.basemap;
                    mapService.setBasemap(val);
                    // Sync header toggle
                    document.querySelectorAll('#basemap-toggle .header-toggle-option').forEach(b => b.classList.toggle('active', b.dataset.value === val));
                    close(null);
                    showToast(`Basemap: ${btn.textContent.trim()}`, 'success', { duration: 1500 });
                });
            });
        }
    });
}

// ============================
// Coordinate Search — add point from search marker
// ============================
function _coordSearchAddNew() {
    const info = mapService.getSearchLatLng();
    if (!info) return showToast('No search marker active', 'warning');

    const feature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [info.lng, info.lat] },
        properties: {
            name: 'Search Point',
            latitude: info.lat.toFixed(6),
            longitude: info.lng.toFixed(6),
            source: info.inputText || ''
        }
    };

    const ds = createSpatialDataset('Search Point', { type: 'FeatureCollection', features: [feature] });
    addLayer(ds);
    setActiveLayer(ds.id);
    mapService.addLayer(ds, getLayers().indexOf(ds), { fit: false });
    refreshUI();
    mapService.clearSearchMarker();
    showToast('Created new layer with search point', 'success');
}

function _coordSearchAddToExisting() {
    const info = mapService.getSearchLatLng();
    if (!info) return showToast('No search marker active', 'warning');

    const layers = getLayers().filter(l => l.type === 'spatial');
    if (layers.length === 0) {
        // No layers — fall back to creating new
        _coordSearchAddNew();
        return;
    }

    // Show a picker if multiple layers, or use the single / active one
    const active = getActiveLayer();
    if (layers.length === 1) {
        _addSearchPointToLayer(layers[0], info);
        return;
    }

    // Build a picker modal
    const listHtml = layers.map(l => {
        const isActive = active && l.id === active.id;
        const count = l.geojson?.features?.length || 0;
        return `<button class="coord-layer-pick-btn" data-id="${l.id}" style="
            display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:1px solid var(--border);
            border-radius:6px;background:${isActive ? 'rgba(37,99,235,0.12)' : 'var(--bg-surface)'};cursor:pointer;
            color:var(--text);font-size:13px;text-align:left;
        ">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.name}</span>
            <span style="font-size:10px;color:var(--text-muted);">${count} features</span>
            ${isActive ? '<span style="font-size:9px;color:var(--primary);">active</span>' : ''}
        </button>`;
    }).join('');

    const html = `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
        Select a layer to add the search point to:
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;max-height:300px;overflow-y:auto;">${listHtml}</div>`;

    showModal('Add to Layer', html, {
        width: '360px',
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelectorAll('.coord-layer-pick-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const layer = getLayers().find(l => l.id === btn.dataset.id);
                    if (layer) _addSearchPointToLayer(layer, info);
                    close();
                });
            });
        }
    });
}

function _addSearchPointToLayer(layer, info) {
    const feature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [info.lng, info.lat] },
        properties: {
            name: `Search Point ${(layer.geojson?.features?.length || 0) + 1}`,
            latitude: info.lat.toFixed(6),
            longitude: info.lng.toFixed(6),
            source: info.inputText || ''
        }
    };

    saveSnapshot(layer.id, 'Add search point', layer.geojson);
    layer.geojson.features.push(feature);

    layer.schema = analyzeSchema(layer.geojson);
    bus.emit('layer:updated', layer);
    bus.emit('layers:changed', getLayers());
    mapService.addLayer(layer, getLayers().indexOf(layer));
    refreshUI();

    mapService.clearSearchMarker();
    showToast(`Point added to "${layer.name}"`, 'success');
}

function _coordSearchClear() {
    mapService.clearSearchMarker();
}

// ============================
// Mobile: Current Location
// ============================
let _mobileLocationLayerId = null;

function mobileAddCurrentLocation() {
    if (!navigator.geolocation) {
        showToast('Geolocation not supported on this device', 'error');
        return;
    }

    showToast('Getting location…', 'info', { duration: 3000 });

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            // Check if we have an existing location layer
            let layer = _mobileLocationLayerId ? getLayers().find(l => l.id === _mobileLocationLayerId) : null;

            if (!layer) {
                // Look for any existing draw layer
                const drawLayers = getLayers().filter(l => l._isDrawLayer);
                if (drawLayers.length > 0) {
                    // Use the first existing draw layer
                    layer = drawLayers[0];
                    _mobileLocationLayerId = layer.id;
                } else {
                    // Create a new draw layer
                    const newLayer = createSpatialDataset('My Locations', {
                        type: 'FeatureCollection',
                        features: []
                    });
                    newLayer._isDrawLayer = true;
                    addLayer(newLayer);
                    setActiveLayer(newLayer.id);
                    _mobileLocationLayerId = newLayer.id;
                    layer = newLayer;
                    mapService.addLayer(newLayer, 0);
                }
            }

            // Add point feature
            const timestamp = new Date().toISOString();
            const feature = {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [lng, lat]
                },
                properties: {
                    name: `Location ${(layer.geojson?.features?.length || 0) + 1}`,
                    timestamp: timestamp,
                    accuracy_m: Math.round(accuracy),
                    latitude: lat.toFixed(6),
                    longitude: lng.toFixed(6)
                }
            };

            saveSnapshot(layer.id, 'Add current location', layer.geojson);
            layer.geojson.features.push(feature);

            layer.schema = analyzeSchema(layer.geojson);
            bus.emit('layer:updated', layer);
            bus.emit('layers:changed', getLayers());
            mapService.addLayer(layer, getLayers().indexOf(layer));
            refreshUI();

            // Pan map to location (support both legacy setView and MapLibre flyTo APIs)
            const map = mapService.getMap();
            const zoom = Math.max(map?.getZoom?.() ?? 15, 15);
            if (typeof map?.setView === 'function') {
                map.setView([lat, lng], zoom);
            } else if (typeof map?.flyTo === 'function') {
                map.flyTo({ center: [lng, lat], zoom });
            }
            showToast(`📍 Location added (±${Math.round(accuracy)}m)`, 'success');
        },
        (error) => {
            let msg = 'Could not get location';
            if (error.code === 1) msg = 'Location permission denied';
            else if (error.code === 2) msg = 'Location unavailable';
            else if (error.code === 3) msg = 'Location request timed out';
            showToast(msg, 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
}

// ============================
// Mobile content switching
// ============================
function showMobileContent(tab) {
    document.querySelectorAll('.mobile-content').forEach(el => el.classList.add('hidden'));
    if (tab === 'map') {
        // All panels hidden — map is visible underneath
        // Recalculate map size in case container was obscured
        setTimeout(() => { mapService.resize(); }, 50);
        return;
    }
    const panel = document.getElementById(`mobile-${tab}`);
    if (panel) {
        panel.classList.remove('hidden');
        if (tab === 'data') renderMobileDataPanel();
        if (tab === 'prep') renderMobilePrepPanel();
        if (tab === 'tools') renderMobileToolsPanel();
        if (tab === 'export') renderMobileExportPanel();
    }
}

function renderMobileContent() {
    const tab = getState().ui.activeTab;
    if (getState().ui.isMobile) showMobileContent(tab);
}

function renderMobileDataPanel() {
    const el = document.getElementById('mobile-data');
    if (!el) return;
    const layers = getLayers();
    const layer = getActiveLayer();

    let html = `<h3>Layers</h3>`;
    if (layers.length === 0) {
        html += `<div class="empty-state"><p>No layers loaded</p>
            <button class="btn btn-primary btn-sm" id="btn-import-mobile">📂 Import Files</button></div>`;
    } else {
        html += `<div style="display:flex;flex-direction:column;gap:2px;">`;
        html += layers.map((l, idx) => {
            const isActive = l.id === layer?.id;
            const icon = l.type === 'spatial' ? '🗺️' : '📊';
            const count = l.type === 'spatial'
                ? `${l.geojson?.features?.length || 0} features`
                : `${l.rows?.length || 0} rows`;
            const geomBadge = l.schema?.geometryType
                ? `<span class="badge badge-info">${l.schema.geometryType}</span>` : '';
            const filterBadge = l._activeFilter
                ? `<span class="layer-filter-badge" title="Filter active" data-app-action="openFilterBuilder" data-app-arg="${l.id}">FILTERED</span>`
                : '';
            return `
                <div class="layer-item ${isActive ? 'active' : ''}" data-id="${l.id}" data-layer-id="${l.id}">
                    <span class="layer-icon">${icon}</span>
                    <div class="layer-name-row">
                        <div class="layer-name" data-layer-rename-id="${l.id}">${l.name}</div>
                        ${filterBadge}
                        <div class="layer-order-btns">
                            <button title="Move up" ${idx === 0 ? 'disabled' : ''} data-app-action="moveLayerUp" data-app-arg="${l.id}">▲</button>
                            <button title="Move down" ${idx === layers.length - 1 ? 'disabled' : ''} data-app-action="moveLayerDown" data-app-arg="${l.id}">▼</button>
                        </div>
                    </div>
                    <div class="layer-bottom-row">
                        <div class="layer-meta">${count} · ${l.schema?.fields?.length || 0} fields ${geomBadge}</div>
                        <div class="layer-actions">
                            <button class="btn-icon" title="Rename" data-app-action="renameLayer" data-app-arg="${l.id}">✏️</button>
                            <button class="btn-icon" title="Toggle visibility" data-app-action="toggleVisibility" data-app-arg="${l.id}">
                                ${l.visible !== false ? '👁️' : '👁️‍🗨️'}
                            </button>
                            <button class="btn-icon" title="Zoom to layer" data-app-action="zoomToLayer" data-app-arg="${l.id}">🔍</button>
                            <button class="btn-icon" title="Remove" data-app-action="removeLayer" data-app-arg="${l.id}">🗑️</button>
                        </div>
                    </div>
                </div>`;
        }).join('');
        html += `</div>`;
    }

    if (layer) {
        html += `<h3 style="margin-top:10px;">Fields</h3>`;
        html += `<div style="display:flex;flex-direction:column;gap:1px;">`;
        html += (layer.schema?.fields || []).map(f => `
            <div class="field-item">
                <input type="checkbox" ${f.selected ? 'checked' : ''} data-field-toggle="${f.name}">
                <span class="field-name">${f.name}</span>
                <span class="field-type">${f.type}</span>
            </div>
        `).join('');
        html += `</div>`;
    }

    el.innerHTML = html;
    el.querySelector('#btn-import-mobile')?.addEventListener('click', () => {
        document.getElementById('btn-import')?.click();
    });
}

function renderMobilePrepPanel() {
    const el = document.getElementById('mobile-prep');
    if (!el) return;
    const layer = getActiveLayer();
    if (!layer) {
        el.innerHTML = '<div class="empty-state"><p>Import data first</p></div>';
        return;
    }
    el.innerHTML = `
        <h3>Layer Data Tools</h3>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
            <button class="btn btn-secondary btn-sm" data-app-action="openSplitColumn">Split Column</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openCombineColumns">Combine</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openTemplateBuilder">Template</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openReplaceClean">Replace/Clean</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openTypeConvert">Type Convert</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openFilterBuilder">Filter</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openDeduplicate">Dedup</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openJoinTool">Join</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openValidation">Validate</button>
            <button class="btn btn-secondary btn-sm" data-app-action="addUID">Add UID</button>
        </div>`;
}

function renderMobileToolsPanel() {
    const el = document.getElementById('mobile-tools');
    if (!el) return;
    const basemapOptions = [
        { value: 'voyager', label: 'Map' },
        { value: 'satellite', label: 'Satellite' }
    ];
    const currentBasemap = mapService.getCurrentBasemap() || 'voyager';
    const layers = getLayers();
    el.innerHTML = `
        <h3>GIS Tools</h3>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <button class="btn-selection-toggle" data-app-action="toggleSelectionMode">✦ Select</button>
            <button class="btn btn-sm btn-secondary" data-app-action="clearSelection">Clear</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${layers.length >= 2 ? '<button class="btn btn-primary btn-sm" data-app-action="mergeLayers">🔗 Merge Layers</button>' : ''}
            <button class="btn btn-secondary btn-sm" data-app-action="openDistanceTool">📏 Distance</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openBearingTool">🧭 Bearing</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openBuffer">⭕ Buffer</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openBboxClip">✂️ BBox Clip</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openClip">🔲 Clip Extent</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openSimplify">〰️ Simplify</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openBezierSpline">🌊 Spline</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openPolygonSmooth">🔵 Smooth</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openUnion">🔶 Union</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openDissolve">🫧 Dissolve</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openCombine">🔗 Combine</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openKinks">⚠ Kinks</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openNearestNeighborAnalysis">📊 NN Analysis</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openCoordConverter">🌐 Coord Convert</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openPhotoMapper">📷 Photo Map</button>
            <button class="btn btn-secondary btn-sm" data-app-action="openArcGISImporter">🌐 ArcGIS REST</button>
        </div>
        <h3 style="margin-top:10px;">Basemap</h3>
        <select id="basemap-select-mobile" style="width:100%;">
            ${basemapOptions.map(o => `<option value="${o.value}" ${o.value === currentBasemap ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>`;
    el.querySelector('#basemap-select-mobile')?.addEventListener('change', (e) => {
        mapService.setBasemap(e.target.value);
        // Sync header toggle
        document.querySelectorAll('#basemap-toggle .header-toggle-option').forEach(b => b.classList.toggle('active', b.dataset.value === e.target.value));
    });
}

function renderMobileExportPanel() {
    const el = document.getElementById('mobile-export');
    if (!el) return;
    const layer = getActiveLayer();
    if (!layer) {
        el.innerHTML = '<div class="empty-state"><p>Import data first</p></div>';
        return;
    }
    const formats = getAvailableFormats(layer);
    el.innerHTML = `
        <h3>Export</h3>
        <label class="toggle mb-8">
            <input type="checkbox" id="agol-toggle-mobile" ${getState().agolCompatMode ? 'checked' : ''}>
            <span class="toggle-track"></span>
            <span>AGOL Compatible</span>
        </label>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;">
            ${formats.map((f) =>
                `<button class="btn btn-primary btn-sm" data-app-action="doExport" data-app-arg="${f.key}">${f.label}</button>`
            ).join('')}
        </div>`;
    el.querySelector('#agol-toggle-mobile')?.addEventListener('change', () => {
        toggleAGOLCompat();
    });
}

// ============================
// Logs panel
// ============================
function toggleLogs() {
    const logsPanel = document.getElementById('logs-panel');
    if (!logsPanel) return;
    logsPanel.classList.toggle('hidden');
    if (!logsPanel.classList.contains('hidden')) renderLogs();
}

function renderLogs(filter = {}) {
    const body = document.getElementById('logs-body');
    if (!body) return;
    const entries = logger.getEntries(filter);
    body.innerHTML = entries.slice(-200).map(e =>
        `<div class="log-entry">
            <span class="ts">${e.ts.slice(11, 23)}</span>
            <span class="lvl-${e.level}">[${e.level}]</span>
            <span>[${e.module}]</span>
            ${e.action} ${e.context && Object.keys(e.context).length ? JSON.stringify(e.context) : ''}
            ${e.duration != null ? `<span class="text-muted">(${e.duration}ms)</span>` : ''}
        </div>`
    ).join('');
    body.scrollTop = body.scrollHeight;
}

// ============================
// Data Prep tool modals
// ============================

function getFeatures() {
    const layer = getActiveLayer();
    if (!layer) return [];
    if (layer.type === 'spatial') return layer.geojson?.features || [];
    return (layer.rows || []).map(r => ({ type: 'Feature', geometry: null, properties: r }));
}

function getFieldNames() {
    const layer = getActiveLayer();
    return (layer?.schema?.fields || []).map(f => f.name);
}

function applyTransform(name, newFeatures) {
    const layer = getActiveLayer();
    if (!layer) return;
    // Save snapshot before transform
    if (layer.type === 'spatial') {
        saveSnapshot(layer.id, name, layer.geojson);
        layer.geojson = { type: 'FeatureCollection', features: newFeatures };
        layer.schema = analyzeSchema(layer.geojson);
        bus.emit('layer:updated', layer);
        bus.emit('layers:changed', getLayers());
        mapService.addLayer(layer, getLayers().indexOf(layer));
        refreshUI();
    } else if (layer.type === 'table') {
        saveSnapshot(layer.id, name, layer.rows);
        layer.rows = newFeatures.map(f => f.properties ? { ...f.properties } : f);
        layer.schema = analyzeTableSchema(layer.rows, Object.keys(layer.rows[0] || {}));
        bus.emit('layer:updated', layer);
        bus.emit('layers:changed', getLayers());
        refreshUI();
    }
    showToast(`Applied: ${name}`, 'success');
}

// Split Column
async function openSplitColumn() {
    const fields = getFieldNames();
    if (fields.length === 0) return showToast('No fields available', 'warning');

    if (_isReactToolDialogs) {
        const rootId = `split-column-react-${Date.now()}`;
        showModal('Split Column', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountSplitColumnDialog } = await import('../react/tools/mountSplitColumnDialog.jsx');
                const mounted = mountSplitColumnDialog(root, {
                    fields,
                    onCancel: () => close(),
                    onApply: ({ field, delimiter, customDelimiter, trim, maxParts }) => {
                        let delim = delimiter;
                        if (delim === 'custom') delim = customDelimiter || ',';
                        const result = transforms.splitColumn(getFeatures(), field, {
                            delimiter: delim,
                            trim,
                            maxParts: parseInt(maxParts) || 0
                        });
                        applyTransform(`Split: ${field}`, result);
                        close();
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const html = `
        <div class="form-group"><label>Field to split</label>
            <select id="sc-field">${fields.map(f => `<option>${f}</option>`).join('')}</select></div>
        <div class="form-group"><label>Delimiter</label>
            <select id="sc-delim"><option value=",">Comma</option><option value=" ">Space</option><option value="	">Tab</option><option value=";">Semicolon</option><option value="custom">Custom</option></select></div>
        <div class="form-group hidden" id="sc-custom-wrap"><label>Custom delimiter</label>
            <input type="text" id="sc-custom"></div>
        <div class="form-group"><label>Max parts (0=all)</label>
            <input type="number" id="sc-max" value="0" min="0"></div>
        <label class="checkbox-row"><input type="checkbox" id="sc-trim" checked> Trim whitespace</label>`;

    showModal('Split Column', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Apply</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('#sc-delim')?.addEventListener('change', (e) => {
                overlay.querySelector('#sc-custom-wrap').classList.toggle('hidden', e.target.value !== 'custom');
            });
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                let delim = overlay.querySelector('#sc-delim').value;
                if (delim === 'custom') delim = overlay.querySelector('#sc-custom').value || ',';
                const field = overlay.querySelector('#sc-field').value;
                const result = transforms.splitColumn(getFeatures(), field, {
                    delimiter: delim,
                    trim: overlay.querySelector('#sc-trim').checked,
                    maxParts: parseInt(overlay.querySelector('#sc-max').value) || 0
                });
                applyTransform(`Split: ${field}`, result);
                close();
            });
        }
    });
}

// Combine Columns
async function openCombineColumns() {
    const fields = getFieldNames();
    if (fields.length < 2) return showToast('Need at least 2 fields', 'warning');

    if (_isReactToolDialogs) {
        const rootId = `combine-columns-react-${Date.now()}`;
        showModal('Combine Columns', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountCombineColumnsDialog } = await import('../react/tools/mountCombineColumnsDialog.jsx');
                const mounted = mountCombineColumnsDialog(root, {
                    fields,
                    onCancel: () => close(),
                    onApply: ({ selectedFields, delimiter, outputField, skipBlanks }) => {
                        if (selectedFields.length === 0) return showToast('Select at least one field', 'warning');
                        const result = transforms.combineColumns(getFeatures(), selectedFields, {
                            delimiter,
                            outputField: outputField || 'combined',
                            skipBlanks
                        });
                        applyTransform('Combine columns', result);
                        close();
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const html = `
        <div class="form-group"><label>Select fields to combine</label>
            <div id="cc-fields-list" style="max-height:200px;overflow-y:auto;">
                ${fields.map(f => `<label class="checkbox-row"><input type="checkbox" value="${f}"> ${f}</label>`).join('')}
            </div></div>
        <div class="form-group"><label>Delimiter</label>
            <input type="text" id="cc-delim" value=" "></div>
        <div class="form-group"><label>Output field name</label>
            <input type="text" id="cc-output" value="combined"></div>
        <label class="checkbox-row"><input type="checkbox" id="cc-skip" checked> Skip empty values</label>`;

    showModal('Combine Columns', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Apply</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                const selected = Array.from(overlay.querySelectorAll('#cc-fields-list input[type=checkbox]:checked')).map(el => el.value).filter(Boolean);
                if (selected.length === 0) return showToast('Select at least one field', 'warning');
                const result = transforms.combineColumns(getFeatures(), selected, {
                    delimiter: overlay.querySelector('#cc-delim').value,
                    outputField: overlay.querySelector('#cc-output').value || 'combined',
                    skipBlanks: overlay.querySelector('#cc-skip').checked
                });
                applyTransform('Combine columns', result);
                close();
            });
        }
    });
}

// Template Builder
async function openTemplateBuilder() {
    const fields = getFieldNames();
    if (fields.length === 0) return showToast('No fields available', 'warning');
    const features = getFeatures();

    const html = `
        <div class="form-group"><label>Output field name</label>
            <input type="text" id="tb-output" value="template_result"></div>
        <div class="form-group"><label>Template (use {FieldName} for placeholders)</label>
            <textarea id="tb-template" rows="3" placeholder="e.g. {Name} - {City}, {State}"></textarea></div>
        <div class="form-group"><label>Insert field</label>
            <div class="input-with-btn">
                <select id="tb-field-select">${fields.map(f => `<option value="${f}">${f}</option>`).join('')}</select>
                <button class="btn btn-sm btn-secondary" id="tb-insert">Insert</button>
            </div></div>
        <label class="checkbox-row"><input type="checkbox" id="tb-trim" checked> Trim whitespace</label>
        <label class="checkbox-row"><input type="checkbox" id="tb-collapse" checked> Collapse spaces</label>
        <label class="checkbox-row"><input type="checkbox" id="tb-wrappers" checked> Remove empty wrappers ()/[]/{}</label>
        <label class="checkbox-row"><input type="checkbox" id="tb-dangling" checked> Remove dangling separators</label>
        <label class="checkbox-row"><input type="checkbox" id="tb-collsep" checked> Collapse repeated separators</label>
        <div class="divider"></div>
        <div><strong>Live Preview:</strong></div>
        <div id="tb-preview" class="text-sm text-mono" style="background:var(--bg); padding:8px; border-radius:4px; max-height:120px; overflow-y:auto; margin-top:6px;"></div>`;

    showModal('Template Builder', html, {
        width: '650px',
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Apply</button>',
        onMount: (overlay, close) => {
            const textarea = overlay.querySelector('#tb-template');
            const previewEl = overlay.querySelector('#tb-preview');

            const updatePreview = () => {
                const tmpl = textarea.value;
                if (!tmpl) { previewEl.textContent = '(enter a template above)'; return; }
                const opts = {
                    trimWhitespace: overlay.querySelector('#tb-trim').checked,
                    collapseSpaces: overlay.querySelector('#tb-collapse').checked,
                    removeEmptyWrappers: overlay.querySelector('#tb-wrappers').checked,
                    removeDanglingSeparators: overlay.querySelector('#tb-dangling').checked,
                    collapseSeparators: overlay.querySelector('#tb-collsep').checked
                };
                const results = previewTemplate(features, tmpl, opts);
                previewEl.innerHTML = results.map((r, i) => `<div>${i + 1}: ${r || '<em>empty</em>'}</div>`).join('');
            };

            textarea.addEventListener('input', updatePreview);
            overlay.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', updatePreview));

            overlay.querySelector('#tb-insert')?.addEventListener('click', () => {
                const field = overlay.querySelector('#tb-field-select').value;
                const pos = textarea.selectionStart;
                const before = textarea.value.slice(0, pos);
                const after = textarea.value.slice(pos);
                textarea.value = before + `{${field}}` + after;
                textarea.focus();
                updatePreview();
            });

            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                const template = textarea.value;
                if (!template) return showToast('Enter a template', 'warning');
                const outputField = overlay.querySelector('#tb-output').value || 'template_result';
                const opts = {
                    trimWhitespace: overlay.querySelector('#tb-trim').checked,
                    collapseSpaces: overlay.querySelector('#tb-collapse').checked,
                    removeEmptyWrappers: overlay.querySelector('#tb-wrappers').checked,
                    removeDanglingSeparators: overlay.querySelector('#tb-dangling').checked,
                    collapseSeparators: overlay.querySelector('#tb-collsep').checked
                };
                const result = applyTemplate(features, template, outputField, opts);
                applyTransform(`Template: ${outputField}`, result);
                close();
            });

            updatePreview();
        }
    });
}

// Replace/Clean
async function openReplaceClean() {
    const fields = getFieldNames();
    if (fields.length === 0) return showToast('No fields available', 'warning');

    if (_isReactToolDialogs) {
        const rootId = `replace-clean-react-${Date.now()}`;
        showModal('Replace / Clean Text', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountReplaceCleanDialog } = await import('../react/tools/mountReplaceCleanDialog.jsx');
                const mounted = mountReplaceCleanDialog(root, {
                    fields,
                    onCancel: () => close(),
                    onApply: ({ field, find, replace, trimWhitespace, collapseSpaces, caseTransform }) => {
                        const result = transforms.replaceText(getFeatures(), field, {
                            find,
                            replace,
                            trimWhitespace,
                            collapseSpaces,
                            caseTransform: caseTransform || null
                        });
                        applyTransform('Replace/Clean', result);
                        close();
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const html = `
        <div class="form-group"><label>Field</label>
            <select id="rc-field">${fields.map(f => `<option>${f}</option>`).join('')}</select></div>
        <div class="form-group"><label>Find</label>
            <input type="text" id="rc-find"></div>
        <div class="form-group"><label>Replace with</label>
            <input type="text" id="rc-replace"></div>
        <label class="checkbox-row"><input type="checkbox" id="rc-trim"> Trim whitespace</label>
        <label class="checkbox-row"><input type="checkbox" id="rc-collapse"> Collapse multiple spaces</label>
        <div class="form-group"><label>Case transform</label>
            <select id="rc-case"><option value="">None</option><option value="upper">UPPER</option><option value="lower">lower</option><option value="title">Title Case</option></select></div>`;

    showModal('Replace / Clean Text', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Apply</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                const result = transforms.replaceText(getFeatures(), overlay.querySelector('#rc-field').value, {
                    find: overlay.querySelector('#rc-find').value,
                    replace: overlay.querySelector('#rc-replace').value,
                    trimWhitespace: overlay.querySelector('#rc-trim').checked,
                    collapseSpaces: overlay.querySelector('#rc-collapse').checked,
                    caseTransform: overlay.querySelector('#rc-case').value || null
                });
                applyTransform('Replace/Clean', result);
                close();
            });
        }
    });
}

// Type Convert
async function openTypeConvert() {
    const fields = getFieldNames();

    if (_isReactToolDialogs) {
        const rootId = `type-convert-react-${Date.now()}`;
        showModal('Type Convert', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountTypeConvertDialog } = await import('../react/tools/mountTypeConvertDialog.jsx');
                const mounted = mountTypeConvertDialog(root, {
                    fields,
                    onCancel: () => close(),
                    onApply: ({ field, type }) => {
                        const { features: result, failures } = transforms.typeConvert(
                            getFeatures(),
                            field,
                            type
                        );
                        applyTransform('Type Convert', result);
                        if (failures > 0) showToast(`${failures} values could not be converted`, 'warning');
                        close();
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const html = `
        <div class="form-group"><label>Field</label>
            <select id="tc-field">${fields.map(f => `<option>${f}</option>`).join('')}</select></div>
        <div class="form-group"><label>Convert to</label>
            <select id="tc-type"><option value="number">Number</option><option value="string">String</option><option value="boolean">Boolean</option><option value="date">Date (ISO)</option></select></div>`;

    showModal('Type Convert', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Apply</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                const { features: result, failures } = transforms.typeConvert(
                    getFeatures(),
                    overlay.querySelector('#tc-field').value,
                    overlay.querySelector('#tc-type').value
                );
                applyTransform('Type Convert', result);
                if (failures > 0) showToast(`${failures} values could not be converted`, 'warning');
                close();
            });
        }
    });
}

// Filter Builder
async function openFilterBuilder(targetLayerId) {
    // If called with a specific layer, switch to it first
    if (targetLayerId) {
        setActiveLayer(targetLayerId);
        refreshUI();
    }
    const layer = getActiveLayer();
    if (!layer) return showToast('No active layer', 'warning');
    const fields = getFieldNames();
    const operators = transforms.FILTER_OPERATORS;
    const existing = layer._activeFilter || null;

    const removeBtn = existing
        ? '<button class="btn btn-danger" id="fb-remove-filter" style="margin-right:auto;">Remove Filter</button>'
        : '';

    const html = `
        <div id="filter-rules"></div>
        <button class="btn btn-sm btn-secondary mt-8" id="fb-add-rule">+ Add Rule</button>
        <div class="form-group mt-8"><label>Logic</label>
            <select id="fb-logic"><option value="AND" ${existing?.logic === 'AND' ? 'selected' : ''}>AND (all match)</option><option value="OR" ${existing?.logic === 'OR' ? 'selected' : ''}>OR (any match)</option></select></div>`;

    showModal(existing ? 'Edit Filter' : 'Filter Builder', html, {
        width: '650px',
        footer: `${removeBtn}<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Apply Filter</button>`,
        onMount: (overlay, close) => {
            const rulesContainer = overlay.querySelector('#filter-rules');
            let ruleCount = 0;

            const addRule = (preset) => {
                ruleCount++;
                const ruleHtml = `<div class="flex gap-4 items-center mb-8" data-rule="${ruleCount}">
                    <select class="rule-field" style="flex:1">${fields.map(f => `<option ${preset?.field === f ? 'selected' : ''}>${f}</option>`).join('')}</select>
                    <select class="rule-op" style="flex:1">${operators.map(o => `<option value="${o.value}" ${preset?.operator === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
                    <input type="text" class="rule-val" placeholder="value" style="flex:1" value="${preset?.value ?? ''}">
                    <button class="btn-icon" data-remove-parent="true">✕</button>
                </div>`;
                rulesContainer.insertAdjacentHTML('beforeend', ruleHtml);
            };

            // Pre-populate existing rules or add one blank rule
            if (existing && existing.rules.length > 0) {
                existing.rules.forEach(r => addRule(r));
            } else {
                addRule();
            }

            rulesContainer.addEventListener('click', (event) => {
                const removeButton = event.target.closest('[data-remove-parent="true"]');
                if (!removeButton) return;
                event.preventDefault();
                removeButton.parentElement?.remove();
            });

            overlay.querySelector('#fb-add-rule')?.addEventListener('click', () => addRule());
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());

            // Remove filter button
            const removeFilterBtn = overlay.querySelector('#fb-remove-filter');
            if (removeFilterBtn) {
                removeFilterBtn.addEventListener('click', () => {
                    if (layer._preFilterSnapshot) {
                        saveSnapshot(layer.id, 'Remove Filter', layer.geojson);
                        layer.geojson = JSON.parse(JSON.stringify(layer._preFilterSnapshot));
                        delete layer._activeFilter;
                        delete layer._preFilterSnapshot;
                        layer.schema = analyzeSchema(layer.geojson);
                        bus.emit('layer:updated', layer);
                        bus.emit('layers:changed', getLayers());
                        mapService.addLayer(layer, getLayers().indexOf(layer));
                        refreshUI();
                        showToast('Filter removed', 'success');
                    } else {
                        showToast('No snapshot — use Undo to revert', 'info');
                    }
                    close();
                });
            }

            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                const rules = Array.from(rulesContainer.querySelectorAll('[data-rule]')).map(el => ({
                    field: el.querySelector('.rule-field').value,
                    operator: el.querySelector('.rule-op').value,
                    value: el.querySelector('.rule-val').value
                }));
                const logic = overlay.querySelector('#fb-logic').value;

                // If re-filtering, restore pre-filter data first so filter stacks don't compound
                const sourceFeatures = layer._preFilterSnapshot
                    ? JSON.parse(JSON.stringify(layer._preFilterSnapshot)).features
                    : getFeatures();

                // Store pre-filter snapshot only on first filter
                if (!layer._preFilterSnapshot) {
                    layer._preFilterSnapshot = JSON.parse(JSON.stringify(layer.geojson));
                }

                let result;
                if (sourceFeatures.length >= transforms.DATAPREP_CHUNK_THRESHOLD) {
                    close();
                    const filtered = await runWithTaskProgress('Filter', async () => {
                        const { TaskRunner } = await import('./core/task-runner.js');
                        const task = new TaskRunner('Filter', 'DataPrep');
                        return task.run((t) => transforms.applyFiltersAsync(sourceFeatures, rules, logic, t));
                    });
                    if (filtered === null) return;
                    result = filtered;
                } else {
                    result = transforms.applyFilters(sourceFeatures, rules, logic);
                    close();
                }
                layer._activeFilter = { rules, logic };
                applyTransform(`Filter (${result.length} results)`, result);
            });
        }
    });
}

// Deduplicate
async function openDeduplicate() {
    const fields = getFieldNames();

    if (_isReactToolDialogs) {
        const rootId = `deduplicate-react-${Date.now()}`;
        showModal('Deduplicate', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountDeduplicateDialog } = await import('../react/tools/mountDeduplicateDialog.jsx');
                const mounted = mountDeduplicateDialog(root, {
                    fields,
                    onCancel: () => close(),
                    onApply: ({ keyFields, keep }) => {
                        if (keyFields.length === 0) return showToast('Select at least one key field', 'warning');
                        const { features: result, removed } = transforms.deduplicate(
                            getFeatures(),
                            keyFields,
                            keep
                        );
                        applyTransform(`Deduplicate (${removed} removed)`, result);
                        close();
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const html = `
        <div class="form-group"><label>Key fields for dedup</label>
            <div style="max-height:150px;overflow-y:auto;">
                ${fields.map(f => `<label class="checkbox-row"><input type="checkbox" value="${f}"> ${f}</label>`).join('')}
            </div></div>
        <div class="form-group"><label>Keep strategy</label>
            <select id="dd-keep"><option value="first">Keep first</option><option value="last">Keep last</option></select></div>`;

    showModal('Deduplicate', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Apply</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                const keyFields = Array.from(overlay.querySelectorAll('input[type=checkbox]:checked')).map(el => el.value);
                if (keyFields.length === 0) return showToast('Select at least one key field', 'warning');
                const { features: result, removed } = transforms.deduplicate(
                    getFeatures(), keyFields, overlay.querySelector('#dd-keep').value
                );
                applyTransform(`Deduplicate (${removed} removed)`, result);
                close();
            });
        }
    });
}

// Join Tool
async function openJoinTool() {
    const fields = getFieldNames();
    const html = `
        <div class="info-box mb-8">Upload a CSV or Excel file to join with the active layer.</div>
        <div class="form-group"><label>Join file</label>
            <input type="file" id="join-file" accept=".csv,.xlsx,.xls,.json"></div>
        <div class="form-group"><label>Active layer key field</label>
            <select id="join-left-key">${fields.map(f => `<option>${f}</option>`).join('')}</select></div>
        <div class="form-group"><label>Join file key field</label>
            <select id="join-right-key" disabled><option>Load file first</option></select></div>
        <div class="form-group"><label>Fields to bring over</label>
            <div id="join-fields-list" style="max-height:150px;overflow-y:auto;">Load file first</div></div>`;

    showModal('Join Tool', html, {
        width: '600px',
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn" disabled>Join</button>',
        onMount: (overlay, close) => {
            let joinRows = [];

            overlay.querySelector('#join-file')?.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const { importFile } = await import('./import/importer.js');
                    const ds = await importFile(file);
                    joinRows = ds.type === 'spatial'
                        ? ds.geojson.features.map(f => f.properties)
                        : ds.rows || [];

                    const joinFields = joinRows.length > 0 ? Object.keys(joinRows[0]) : [];
                    overlay.querySelector('#join-right-key').innerHTML = joinFields.map(f => `<option>${f}</option>`).join('');
                    overlay.querySelector('#join-right-key').disabled = false;
                    overlay.querySelector('#join-fields-list').innerHTML = joinFields.map(f =>
                        `<label class="checkbox-row"><input type="checkbox" value="${f}" checked> ${f}</label>`
                    ).join('');
                    overlay.querySelector('.apply-btn').disabled = false;
                    showToast(`Loaded ${joinRows.length} rows from ${file.name}`, 'success');
                } catch (err) {
                    showToast('Failed to load join file: ' + err.message, 'error');
                }
            });

            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                const leftKey = overlay.querySelector('#join-left-key').value;
                const rightKey = overlay.querySelector('#join-right-key').value;
                const fieldsToJoin = Array.from(overlay.querySelectorAll('#join-fields-list input:checked')).map(el => el.value);
                const sourceFeatures = getFeatures();
                let joinResult;
                if (sourceFeatures.length >= transforms.DATAPREP_CHUNK_THRESHOLD) {
                    close();
                    joinResult = await runWithTaskProgress('Join', async () => {
                        const { TaskRunner } = await import('./core/task-runner.js');
                        const task = new TaskRunner('Join', 'DataPrep');
                        return task.run((t) =>
                            transforms.joinDataAsync(sourceFeatures, joinRows, leftKey, rightKey, fieldsToJoin, t)
                        );
                    });
                    if (joinResult === null) return;
                } else {
                    joinResult = transforms.joinData(sourceFeatures, joinRows, leftKey, rightKey, fieldsToJoin);
                    close();
                }
                const { features: result, matched, unmatched } = joinResult;
                applyTransform(`Join (${matched} matched, ${unmatched} unmatched)`, result);
            });
        }
    });
}

// Validation
async function openValidation() {
    const fields = getFieldNames();
    const html = `
        <div id="val-rules"></div>
        <button class="btn btn-sm btn-secondary mt-8" id="val-add">+ Add Rule</button>`;

    showModal('Validation Rules', html, {
        width: '600px',
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Run Validation</button>',
        onMount: (overlay, close) => {
            const container = overlay.querySelector('#val-rules');
            let count = 0;

            const addRule = () => {
                count++;
                container.insertAdjacentHTML('beforeend', `
                    <div class="flex gap-4 items-center mb-8" data-rule="${count}">
                        <select class="val-field" style="flex:1">${fields.map(f => `<option>${f}</option>`).join('')}</select>
                        <select class="val-type" style="flex:1">
                            <option value="required">Required</option>
                            <option value="numeric_range">Numeric Range</option>
                            <option value="allowed_values">Allowed Values</option>
                        </select>
                        <input type="text" class="val-extra" placeholder="min,max or val1,val2" style="flex:1">
                        <button class="btn-icon" data-remove-parent="true">✕</button>
                    </div>`);
            };

            addRule();
            container.addEventListener('click', (event) => {
                const removeButton = event.target.closest('[data-remove-parent="true"]');
                if (!removeButton) return;
                event.preventDefault();
                removeButton.parentElement?.remove();
            });
            overlay.querySelector('#val-add')?.addEventListener('click', addRule);
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                const rules = Array.from(container.querySelectorAll('[data-rule]')).map(el => {
                    const rule = {
                        field: el.querySelector('.val-field').value,
                        type: el.querySelector('.val-type').value
                    };
                    const extra = el.querySelector('.val-extra').value;
                    if (rule.type === 'numeric_range' && extra) {
                        const parts = extra.split(',');
                        rule.min = parseFloat(parts[0]) || null;
                        rule.max = parseFloat(parts[1]) || null;
                    }
                    if (rule.type === 'allowed_values' && extra) {
                        rule.values = extra.split(',').map(s => s.trim());
                    }
                    return rule;
                });
                const errors = transforms.validate(getFeatures(), rules);
                showToast(`Validation complete: ${errors.length} errors found`, errors.length > 0 ? 'warning' : 'success');
                if (errors.length > 0) {
                    const detail = errors.slice(0, 20).map(e => `Row ${e.featureIndex}: ${e.message}`).join('\n');
                    showToast(`First errors:\n${detail}`, 'warning', { duration: 10000 });
                }
                close();
            });
        }
    });
}

// Add UID
function addUID() {
    const layer = getActiveLayer();
    if (!layer) return showToast('No active layer', 'warning');
    const result = transforms.addUniqueId(getFeatures(), 'uid', 'uuid');
    applyTransform('Add UID', result);
}

// ============================
// GIS Tool modals
// ============================
async function openBuffer() {
    const layer = getActiveLayer();
    if (!layer || layer.type !== 'spatial') return showToast('Need a spatial layer', 'warning');
    if (typeof turf === 'undefined') return showToast('Turf.js not loaded yet', 'warning');

    const work = getWorkingFeatures(layer);
    if (_isReactToolDialogs) {
        const rootId = `buffer-tool-react-${Date.now()}`;
        showModal('Buffer', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountBufferToolDialog } = await import('../react/tools/mountBufferToolDialog.jsx');
                const mounted = mountBufferToolDialog(root, {
                    selectionCount: work.isSelection ? work.count : 0,
                    totalCount: work.totalCount,
                    showLargeDatasetWarning: work.count > 5000,
                    onCancel: () => close(),
                    onApply: async ({ dist, units }) => {
                        close();
                        try {
                            const result = await runWithTaskProgress('Buffer', () =>
                                gisTools.bufferFeatures(getWorkingDataset(layer), dist, units)
                            );
                            if (!result) return;
                            addLayer(result);
                            mapService.addLayer(result, getLayers().indexOf(result), { fit: true });
                            showToast(`Buffer complete — new layer "${result.name}" created`, 'success');
                            refreshUI();
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'Buffer'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const selNote = work.isSelection ? `<div class="info-box text-xs">Operating on <strong>${work.count}</strong> selected features (of ${work.totalCount}).</div>` : '';
    const html = `
        <div class="form-group"><label>Buffer distance</label>
            <input type="number" id="buf-dist" value="100" min="0.001" step="1"></div>
        <div class="form-group"><label>Units</label>
            <select id="buf-units"><option value="feet" selected>Feet</option><option value="meters">Meters</option><option value="miles">Miles</option><option value="kilometers">Kilometers</option></select></div>
        ${work.count > 5000 ? '<div class="warning-box">Large dataset — this may be slow.</div>' : ''}
        ${selNote}`;

    showModal('Buffer', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Buffer</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                const dist = parseFloat(overlay.querySelector('#buf-dist').value);
                const units = overlay.querySelector('#buf-units').value;
                close();
                try {
                    const result = await runWithTaskProgress('Buffer', () =>
                        gisTools.bufferFeatures(getWorkingDataset(layer), dist, units)
                    );
                    if (!result) return;
                    addLayer(result);
                    mapService.addLayer(result, getLayers().indexOf(result), { fit: true });
                    showToast(`Buffer complete — new layer "${result.name}" created`, 'success');
                    refreshUI();
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'Buffer'));
                }
            });
        }
    });
}

async function openSimplify() {
    const layer = getActiveLayer();
    if (!layer || layer.type !== 'spatial') return showToast('Need a spatial layer', 'warning');

    const work = getWorkingFeatures(layer);
    if (_isReactToolDialogs) {
        const rootId = `simplify-tool-react-${Date.now()}`;
        showModal('Simplify Geometries', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountSimplifyToolDialog } = await import('../react/tools/mountSimplifyToolDialog.jsx');
                const mounted = mountSimplifyToolDialog(root, {
                    selectionCount: work.isSelection ? work.count : 0,
                    onCancel: () => close(),
                    onApply: async ({ tol }) => {
                        close();
                        try {
                            const simplified = await runWithTaskProgress('Simplify', () =>
                                gisTools.simplifyFeatures(getWorkingDataset(layer), tol)
                            );
                            if (!simplified) return;
                            const { dataset, stats } = simplified;
                            addLayer(dataset);
                            mapService.addLayer(dataset, getLayers().indexOf(dataset), { fit: true });
                            showToast(`Simplified: ${stats.verticesBefore} → ${stats.verticesAfter} vertices`, 'success');
                            refreshUI();
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'Simplify'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const selNote = work.isSelection ? `<div class="info-box text-xs">Operating on <strong>${work.count}</strong> selected features.</div>` : '';
    const html = `
        <div class="form-group"><label>Tolerance (degrees, e.g., 0.001)</label>
            <input type="number" id="simp-tol" value="0.001" min="0.00001" step="0.0001"></div>
        ${selNote}`;

    showModal('Simplify Geometries', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Simplify</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                const tol = parseFloat(overlay.querySelector('#simp-tol').value);
                close();
                try {
                    const simplified = await runWithTaskProgress('Simplify', () =>
                        gisTools.simplifyFeatures(getWorkingDataset(layer), tol)
                    );
                    if (!simplified) return;
                    const { dataset, stats } = simplified;
                    addLayer(dataset);
                    mapService.addLayer(dataset, getLayers().indexOf(dataset), { fit: true });
                    showToast(`Simplified: ${stats.verticesBefore} → ${stats.verticesAfter} vertices`, 'success');
                    refreshUI();
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'Simplify'));
                }
            });
        }
    });
}

async function openClip() {
    const layer = getActiveLayer();
    if (!layer || layer.type !== 'spatial') return showToast('Need a spatial layer', 'warning');

    const work = getWorkingFeatures(layer);
    if (_isReactToolDialogs) {
        const rootId = `clip-extent-react-${Date.now()}`;
        showModal('Clip to Current Map Extent', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountClipExtentDialog } = await import('../react/tools/mountClipExtentDialog.jsx');
                const mounted = mountClipExtentDialog(root, {
                    selectionCount: work.isSelection ? work.count : 0,
                    onCancel: () => close(),
                    onApply: async () => {
                        close();
                        const bounds = mapService.getBounds();
                        if (!bounds) return showToast('Map bounds not available', 'warning');
                        const bbox = turf.bboxPolygon([
                            bounds.getWest(), bounds.getSouth(),
                            bounds.getEast(), bounds.getNorth()
                        ]);
                        try {
                            const result = await gisTools.clipFeatures(getWorkingDataset(layer), bbox.geometry);
                            addLayer(result);
                            mapService.addLayer(result, getLayers().indexOf(result), { fit: true });
                            showToast(`Clipped: ${result.geojson.features.length} features`, 'success');
                            refreshUI();
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'Clip'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const selNote = work.isSelection ? `<p class="info-box text-xs">Operating on <strong>${work.count}</strong> selected features.</p>` : '';
    showModal('Clip to Current Map Extent', `<p>This will clip features to the current visible map area.</p>${selNote}`, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Clip</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                close();
                const bounds = mapService.getBounds();
                if (!bounds) return showToast('Map bounds not available', 'warning');
                const bbox = turf.bboxPolygon([
                    bounds.getWest(), bounds.getSouth(),
                    bounds.getEast(), bounds.getNorth()
                ]);
                try {
                    const result = await gisTools.clipFeatures(getWorkingDataset(layer), bbox.geometry);
                    addLayer(result);
                    mapService.addLayer(result, getLayers().indexOf(result), { fit: true });
                    showToast(`Clipped: ${result.geojson.features.length} features`, 'success');
                    refreshUI();
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'Clip'));
                }
            });
        }
    });
}

// ============================
// New Turf.js Geoprocessing Tools
// ============================

// Helper: require spatial layer
function requireSpatialLayer(geomTypes = null) {
    const layer = getActiveLayer();
    if (!layer || layer.type !== 'spatial') { showToast('Need a spatial layer', 'warning'); return null; }
    if (typeof turf === 'undefined') { showToast('Turf.js not loaded yet', 'warning'); return null; }
    if (geomTypes) {
        const types = Array.isArray(geomTypes) ? geomTypes : [geomTypes];
        const has = layer.geojson.features.some(f => f.geometry && types.includes(f.geometry.type));
        if (!has) { showToast(`Need ${types.join(' or ')} features`, 'warning'); return null; }
    }
    return layer;
}

/**
 * Get the features to operate on for the active layer.
 * If features are selected → returns only selected features as a FeatureCollection.
 * If nothing selected → returns all features (the full geojson).
 * Also returns metadata about whether this is a selection or full dataset.
 */
function getWorkingFeatures(layer) {
    if (!layer || layer.type !== 'spatial') return null;
    const selected = mapService.getSelectedFeatures(layer.id, layer.geojson);
    if (selected && selected.features.length > 0) {
        return {
            geojson: selected,
            isSelection: true,
            count: selected.features.length,
            totalCount: layer.geojson.features.length
        };
    }
    return {
        geojson: layer.geojson,
        isSelection: false,
        count: layer.geojson.features.length,
        totalCount: layer.geojson.features.length
    };
}

/**
 * Build a temporary dataset-like object from the working features for tools.
 * Tools that take a `dataset` (with .geojson, .name, etc.) can use this.
 */
function getWorkingDataset(layer) {
    const work = getWorkingFeatures(layer);
    if (!work) return null;
    return {
        ...layer,
        geojson: work.geojson,
        _isSelection: work.isSelection,
        _selectionCount: work.count
    };
}

// Selection mode toggle
function toggleSelectionMode() {
    if (mapService.isSelectionMode()) {
        mapService.exitSelectionMode();
    } else {
        mapService.enterSelectionMode();
    }
    updateSelectionUI();
}

function clearSelection() {
    mapService.clearSelection();
    updateSelectionUI();
}

function selectAllFeatures() {
    const layer = getActiveLayer();
    if (!layer || layer.type !== 'spatial') return;
    mapService.selectAll(layer.id, layer.geojson);
    updateSelectionUI();
}

function invertSelection() {
    const layer = getActiveLayer();
    if (!layer || layer.type !== 'spatial') return;
    mapService.invertSelection(layer.id, layer.geojson);
    updateSelectionUI();
}

async function deleteSelectedFeatures() {
    const layer = getActiveLayer();
    if (!layer || layer.type !== 'spatial') return;
    const indices = mapService.getSelectedIndices(layer.id);
    if (indices.length === 0) return showToast('No features selected', 'warning');
    const ok = await confirm('Delete Features', `Delete ${indices.length} selected feature(s)? This can be undone.`);
    if (!ok) return;

    const selectedSet = new Set(indices);
    const remaining = layer.geojson.features.filter((_, i) => !selectedSet.has(i));
    saveSnapshot(layer.id, `Delete ${indices.length} feature(s)`, layer.geojson);
    layer.geojson = { type: 'FeatureCollection', features: remaining };

    layer.schema = analyzeSchema(layer.geojson);
    bus.emit('layer:updated', layer);
    bus.emit('layers:changed', getLayers());
    mapService.clearSelection(layer.id);
    mapService.addLayer(layer, getLayers().indexOf(layer));
    refreshUI();
    showToast(`Deleted ${indices.length} feature(s)`, 'success');
}

/** Update the selection bar UI */
function updateSelectionUI() {
    const bar = document.getElementById('selection-bar');
    const toggleBtn = document.getElementById('btn-selection-toggle');
    if (!bar) return;

    const layer = getActiveLayer();
    const count = layer ? mapService.getSelectionCount(layer.id) : 0;
    const total = layer?.geojson?.features?.length || 0;
    const isMode = mapService.isSelectionMode();

    // Update toggle button state
    if (toggleBtn) {
        toggleBtn.classList.toggle('active', isMode);
        toggleBtn.textContent = isMode ? '✦ Select ON' : '✦ Select';
    }

    if (count > 0) {
        bar.classList.remove('hidden');
        bar.innerHTML = `
            <span class="sel-count">${count}</span> of ${total} features selected
            <button class="sel-btn" data-app-action="selectAllFeatures">All</button>
            <button class="sel-btn" data-app-action="invertSelection">Invert</button>
            <button class="sel-btn" data-app-action="deleteSelectedFeatures" title="Delete selected features" style="color:var(--error);">🗑 Delete</button>
            <button class="sel-btn sel-clear" data-app-action="clearSelection">✕ Clear</button>
        `;
    } else {
        bar.classList.add('hidden');
        bar.innerHTML = '';
    }
}

// Helper: layer dropdown options
function layerOptions(filterType = null) {
    return getLayers()
        .filter(l => l.type === 'spatial' && (!filterType || l.geojson.features.some(f => f.geometry && (Array.isArray(filterType) ? filterType.includes(f.geometry.type) : f.geometry.type === filterType))))
        .map(l => `<option value="${l.id}">${l.name} (${l.geojson.features.length})</option>`)
        .join('');
}

function addResultLayer(dataset) {
    addLayer(dataset);
    mapService.addLayer(dataset, getLayers().indexOf(dataset), { fit: true });
    refreshUI();
}

// Helper: convert kilometers to the user-selected unit
function convertKm(km, toUnit) {
    switch (toUnit) {
        case 'feet':  return km * 3280.84;
        case 'meters': return km * 1000;
        case 'miles':  return km * 0.621371;
        default:       return km;
    }
}

// Standard unit select options HTML (feet default)
const UNIT_OPTIONS_HTML = '<option value="feet" selected>Feet</option><option value="meters">Meters</option><option value="miles">Miles</option><option value="kilometers">Kilometers</option>';

function watchOverlayUnmount(overlay, onUnmount) {
    const observer = new MutationObserver(() => {
        if (!document.body.contains(overlay)) {
            try {
                onUnmount?.();
            } finally {
                observer.disconnect();
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

// --- Distance ---
async function openDistanceTool() {
    if (typeof turf === 'undefined') return showToast('Turf.js not loaded yet', 'warning');
    if (_isReactToolDialogs) {
        const rootId = `distance-tool-react-${Date.now()}`;
        showModal('Measure Distance', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountDistanceToolDialog } = await import('../react/tools/mountDistanceToolDialog.jsx');
                const mounted = mountDistanceToolDialog(root, {
                    onCancel: () => close(),
                    onPick: async (units) => {
                        close();
                        const pts = await mapService.startTwoPointPick('Click the first point', 'Click the second point');
                        if (!pts) return;
                        const d = gisTools.distance(turf.point(pts[0]), turf.point(pts[1]), units);
                        const line = turf.lineString([pts[0], pts[1]]);
                        mapService.showTempFeature(line, 15000);
                        showToast(`Distance: ${d.toFixed(4)} ${units}`, 'success', { duration: 10000 });
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const html = `
        <p>Click two points on the map to measure the straight-line distance between them.</p>
        <div class="form-group"><label>Units</label>
            <select id="dist-units"><option value="feet" selected>Feet</option><option value="meters">Meters</option><option value="miles">Miles</option><option value="kilometers">Kilometers</option></select>
        </div>`;
    showModal('Measure Distance', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Pick Points on Map</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                const units = overlay.querySelector('#dist-units').value;
                close();
                const pts = await mapService.startTwoPointPick('Click the first point', 'Click the second point');
                if (!pts) return;
                const d = gisTools.distance(turf.point(pts[0]), turf.point(pts[1]), units);
                const line = turf.lineString([pts[0], pts[1]]);
                mapService.showTempFeature(line, 15000);
                showToast(`Distance: ${d.toFixed(4)} ${units}`, 'success', { duration: 10000 });
            });
        }
    });
}

// --- Bearing ---
async function openBearingTool() {
    if (typeof turf === 'undefined') return showToast('Turf.js not loaded yet', 'warning');
    if (_isReactToolDialogs) {
        const rootId = `bearing-tool-react-${Date.now()}`;
        showModal('Measure Bearing', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountBearingToolDialog } = await import('../react/tools/mountBearingToolDialog.jsx');
                const mounted = mountBearingToolDialog(root, {
                    onCancel: () => close(),
                    onPick: async () => {
                        close();
                        const pts = await mapService.startTwoPointPick('Click the origin point', 'Click the target point');
                        if (!pts) return;
                        const b = gisTools.bearing(turf.point(pts[0]), turf.point(pts[1]));
                        const line = turf.lineString([pts[0], pts[1]]);
                        mapService.showTempFeature(line, 15000);
                        const cardinal = bearingToCardinal(b);
                        showToast(`Bearing: ${b.toFixed(2)}° (${cardinal})`, 'success', { duration: 10000 });
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const html = `<p>Click two points on the map. The bearing (compass direction) from the first point to the second will be calculated.</p>`;
    showModal('Measure Bearing', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Pick Points on Map</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                close();
                const pts = await mapService.startTwoPointPick('Click the origin point', 'Click the target point');
                if (!pts) return;
                const b = gisTools.bearing(turf.point(pts[0]), turf.point(pts[1]));
                const line = turf.lineString([pts[0], pts[1]]);
                mapService.showTempFeature(line, 15000);
                const cardinal = bearingToCardinal(b);
                showToast(`Bearing: ${b.toFixed(2)}° (${cardinal})`, 'success', { duration: 10000 });
            });
        }
    });
}

function bearingToCardinal(b) {
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    const norm = ((b % 360) + 360) % 360;
    return dirs[Math.round(norm / 22.5) % 16];
}

// --- Destination ---
async function openDestinationTool() {
    if (typeof turf === 'undefined') return showToast('Turf.js not loaded yet', 'warning');
    if (_isReactToolDialogs) {
        const rootId = `destination-tool-react-${Date.now()}`;
        showModal('Find Destination Point', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountDestinationToolDialog } = await import('../react/tools/mountDestinationToolDialog.jsx');
                const mounted = mountDestinationToolDialog(root, {
                    onCancel: () => close(),
                    onPick: async ({ dist, brng, units }) => {
                        close();
                        const origin = await mapService.startPointPick('Click the starting point');
                        if (!origin) return;
                        const dest = gisTools.destination(turf.point(origin), dist, brng, units);
                        const line = turf.lineString([origin, dest.geometry.coordinates]);
                        mapService.showTempFeature({ type: 'FeatureCollection', features: [dest, line] }, 15000);
                        showToast(`Destination: [${dest.geometry.coordinates[1].toFixed(6)}, ${dest.geometry.coordinates[0].toFixed(6)}]`, 'success', { duration: 10000 });
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const html = `
        <p>Click a starting point, then enter a distance and bearing to find the destination point.</p>
        <div class="form-group"><label>Distance</label>
            <input type="number" id="dest-dist" value="100" min="0.001" step="1"></div>
        <div class="form-group"><label>Bearing (degrees, 0=North, 90=East)</label>
            <input type="number" id="dest-bearing" value="0" min="-180" max="360" step="1"></div>
        <div class="form-group"><label>Units</label>
            <select id="dest-units"><option value="feet" selected>Feet</option><option value="meters">Meters</option><option value="miles">Miles</option><option value="kilometers">Kilometers</option></select></div>`;
    showModal('Find Destination Point', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Pick Origin on Map</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                const dist = parseFloat(overlay.querySelector('#dest-dist').value);
                const brng = parseFloat(overlay.querySelector('#dest-bearing').value);
                const units = overlay.querySelector('#dest-units').value;
                close();
                const origin = await mapService.startPointPick('Click the starting point');
                if (!origin) return;
                const dest = gisTools.destination(turf.point(origin), dist, brng, units);
                const line = turf.lineString([origin, dest.geometry.coordinates]);
                mapService.showTempFeature({type:'FeatureCollection',features:[dest, line]}, 15000);
                showToast(`Destination: [${dest.geometry.coordinates[1].toFixed(6)}, ${dest.geometry.coordinates[0].toFixed(6)}]`, 'success', { duration: 10000 });
            });
        }
    });
}

// --- Along ---
async function openAlongTool() {
    const layer = requireSpatialLayer(['LineString', 'MultiLineString']);
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    if (_isReactToolDialogs) {
        const rootId = `along-tool-react-${Date.now()}`;
        showModal('Point Along Line', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountAlongToolDialog } = await import('../react/tools/mountAlongToolDialog.jsx');
                const mounted = mountAlongToolDialog(root, {
                    selectionCount: work.isSelection ? work.count : 0,
                    onCancel: () => close(),
                    onPick: ({ dist, units }) => {
                        close();
                        const line = findFirstLineStringFeature(work.geojson);
                        if (!line) return showToast('No LineString or MultiLineString found', 'warning');
                        try {
                            const pt = gisTools.pointAlong(line, dist, units);
                            mapService.showTempFeature(pt, 15000);
                            showToast(`Point at ${dist} ${units}: [${pt.geometry.coordinates[1].toFixed(6)}, ${pt.geometry.coordinates[0].toFixed(6)}]`, 'success', { duration: 8000 });
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'Along'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const selNote = work.isSelection ? `<div class="info-box text-xs">Using first line from <strong>${work.count}</strong> selected features.</div>` : '';
    const html = `
        <p>Get a point at a specified distance along a line feature.</p>
        <div class="form-group"><label>Distance along line</label>
            <input type="number" id="along-dist" value="100" min="0" step="1"></div>
        <div class="form-group"><label>Units</label>
            <select id="along-units"><option value="feet" selected>Feet</option><option value="meters">Meters</option><option value="miles">Miles</option><option value="kilometers">Kilometers</option></select></div>
        ${selNote}
        <div class="info-box text-xs">Uses the first LineString in the layer or selection (first part if MultiLineString).</div>`;
    showModal('Point Along Line', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Find Point</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                const dist = parseFloat(overlay.querySelector('#along-dist').value);
                const units = overlay.querySelector('#along-units').value;
                close();
                const line = findFirstLineStringFeature(work.geojson);
                if (!line) return showToast('No LineString or MultiLineString found', 'warning');
                try {
                    const pt = gisTools.pointAlong(line, dist, units);
                    mapService.showTempFeature(pt, 15000);
                    showToast(`Point at ${dist} ${units}: [${pt.geometry.coordinates[1].toFixed(6)}, ${pt.geometry.coordinates[0].toFixed(6)}]`, 'success', { duration: 8000 });
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'Along'));
                }
            });
        }
    });
}

// --- Point to Line Distance ---
async function openPointToLineDistanceTool() {
    if (typeof turf === 'undefined') return showToast('Turf.js not loaded yet', 'warning');
    const lineLayerDefs = getLayers()
        .filter((layer) =>
            layer.type === 'spatial'
            && layer.geojson.features.some((f) => f.geometry
                && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')))
        .map((layer) => ({
            id: layer.id,
            name: layer.name,
            count: layer.geojson.features.length
        }));
    if (lineLayerDefs.length === 0) return showToast('Need a line layer loaded', 'warning');

    if (_isReactToolDialogs) {
        const rootId = `ptl-distance-react-${Date.now()}`;
        showModal('Point to Line Distance', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountPointToLineDistanceDialog } = await import('../react/tools/mountPointToLineDistanceDialog.jsx');
                const mounted = mountPointToLineDistanceDialog(root, {
                    layers: lineLayerDefs,
                    onCancel: () => close(),
                    onPick: async ({ layerId, units }) => {
                        const lineLayer = getLayers().find((layer) => layer.id === layerId);
                        close();
                        if (!lineLayer) return showToast('Line layer not found', 'warning');
                        const pt = await mapService.startPointPick('Click a point to measure from');
                        if (!pt) return;
                        const lineWhole = lineLayer.geojson.features.find((f) =>
                            f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'));
                        if (!lineWhole) return showToast('No LineString or MultiLineString found', 'warning');
                        try {
                            const d = gisTools.pointToLineDistance(turf.point(pt), lineWhole, units);
                            const snap = gisTools.nearestPointOnLine(lineWhole, turf.point(pt), units);
                            const connector = turf.lineString([pt, snap.geometry.coordinates]);
                            mapService.showTempFeature({ type: 'FeatureCollection', features: [turf.point(pt), snap, connector] }, 15000);
                            showToast(`Distance to line: ${d.toFixed(4)} ${units}`, 'success', { duration: 10000 });
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'PointToLineDistance'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const lineLayers = lineLayerDefs
        .map((layer) => `<option value="${layer.id}">${layer.name} (${layer.count})</option>`)
        .join('');
    const html = `
        <p>Click a point on the map, then measure the shortest distance to a line layer.</p>
        <div class="form-group"><label>Line layer</label>
            <select id="ptl-layer">${lineLayers}</select></div>
        <div class="form-group"><label>Units</label>
            <select id="ptl-units"><option value="feet" selected>Feet</option><option value="meters">Meters</option><option value="miles">Miles</option><option value="kilometers">Kilometers</option></select></div>`;
    showModal('Point to Line Distance', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Pick Point on Map</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                const layerId = overlay.querySelector('#ptl-layer').value;
                const units = overlay.querySelector('#ptl-units').value;
                const lineLayer = getLayers().find(l => l.id === layerId);
                close();
                if (!lineLayer) return showToast('Line layer not found', 'warning');
                const pt = await mapService.startPointPick('Click a point to measure from');
                if (!pt) return;
                const lineWhole = lineLayer.geojson.features.find(f =>
                    f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'));
                if (!lineWhole) return showToast('No LineString or MultiLineString found', 'warning');
                try {
                    const d = gisTools.pointToLineDistance(turf.point(pt), lineWhole, units);
                    const snap = gisTools.nearestPointOnLine(lineWhole, turf.point(pt), units);
                    const connector = turf.lineString([pt, snap.geometry.coordinates]);
                    mapService.showTempFeature({type:'FeatureCollection',features:[turf.point(pt), snap, connector]}, 15000);
                    showToast(`Distance to line: ${d.toFixed(4)} ${units}`, 'success', { duration: 10000 });
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'PointToLineDistance'));
                }
            });
        }
    });
}

// --- BBox Clip (draw rectangle) ---
async function openBboxClip() {
    const layer = requireSpatialLayer();
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    if (_isReactToolDialogs) {
        const rootId = `bbox-clip-react-${Date.now()}`;
        showModal('BBox Clip', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountBboxClipDialog } = await import('../react/tools/mountBboxClipDialog.jsx');
                const mounted = mountBboxClipDialog(root, {
                    selectionCount: work.isSelection ? work.count : 0,
                    onCancel: () => close(),
                    onDraw: async () => {
                        close();
                        const bbox = await mapService.startRectangleDraw('Click and drag to draw a clip rectangle');
                        if (!bbox) return;
                        try {
                            const result = await gisTools.bboxClipFeatures(getWorkingDataset(layer), bbox);
                            addResultLayer(result);
                            showToast(`Clipped: ${result.geojson.features.length} features`, 'success');
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'BBoxClip'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const selNote = work.isSelection ? `<p class="info-box text-xs">Operating on <strong>${work.count}</strong> selected features.</p>` : '';
    showModal('BBox Clip', `<p>Draw a rectangle on the map to clip features to that area.</p>${selNote}`, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Draw Rectangle on Map</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                close();
                const bbox = await mapService.startRectangleDraw('Click and drag to draw a clip rectangle');
                if (!bbox) return;
                try {
                    const result = await gisTools.bboxClipFeatures(getWorkingDataset(layer), bbox);
                    addResultLayer(result);
                    showToast(`Clipped: ${result.geojson.features.length} features`, 'success');
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'BBoxClip'));
                }
            });
        }
    });
}

// --- Bezier Spline ---
async function openBezierSpline() {
    const layer = requireSpatialLayer(['LineString', 'MultiLineString']);
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    if (_isReactToolDialogs) {
        const rootId = `bezier-spline-react-${Date.now()}`;
        showModal('Bezier Spline', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountBezierSplineDialog } = await import('../react/tools/mountBezierSplineDialog.jsx');
                const mounted = mountBezierSplineDialog(root, {
                    selectionCount: work.isSelection ? work.count : 0,
                    onCancel: () => close(),
                    onApply: async ({ res, sharp }) => {
                        close();
                        try {
                            const result = await gisTools.bezierSplineFeatures(getWorkingDataset(layer), res, sharp);
                            addResultLayer(result);
                            showToast('Bezier spline applied', 'success');
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'BezierSpline'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const selNote = work.isSelection ? `<div class="info-box text-xs">Operating on <strong>${work.count}</strong> selected features.</div>` : '';
    const html = `
        <p>Smooth line features into curved bezier splines.</p>
        <div class="form-group"><label>Resolution (higher = smoother, default 10000)</label>
            <input type="number" id="spline-res" value="10000" min="100" step="500"></div>
        <div class="form-group"><label>Sharpness (0-1, higher = sharper curves)</label>
            <input type="number" id="spline-sharp" value="0.85" min="0" max="1" step="0.05"></div>
        ${selNote}`;
    showModal('Bezier Spline', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Apply</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                const res = parseInt(overlay.querySelector('#spline-res').value);
                const sharp = parseFloat(overlay.querySelector('#spline-sharp').value);
                close();
                try {
                    const result = await gisTools.bezierSplineFeatures(getWorkingDataset(layer), res, sharp);
                    addResultLayer(result);
                    showToast('Bezier spline applied', 'success');
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'BezierSpline'));
                }
            });
        }
    });
}

// --- Polygon Smooth ---
async function openPolygonSmooth() {
    const layer = requireSpatialLayer(['Polygon', 'MultiPolygon']);
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    if (_isReactToolDialogs) {
        const rootId = `polygon-smooth-react-${Date.now()}`;
        showModal('Polygon Smooth', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountPolygonSmoothDialog } = await import('../react/tools/mountPolygonSmoothDialog.jsx');
                const mounted = mountPolygonSmoothDialog(root, {
                    selectionCount: work.isSelection ? work.count : 0,
                    onCancel: () => close(),
                    onApply: async ({ iter }) => {
                        close();
                        try {
                            const result = await runWithTaskProgress('Polygon Smooth', () =>
                                gisTools.polygonSmoothFeatures(getWorkingDataset(layer), iter)
                            );
                            if (!result) return;
                            addResultLayer(result);
                            showToast('Polygons smoothed', 'success');
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'PolygonSmooth'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const selNote = work.isSelection ? `<div class="info-box text-xs">Operating on <strong>${work.count}</strong> selected features.</div>` : '';
    const html = `
        <p>Smooth jagged polygon edges by averaging corner positions.</p>
        <div class="form-group"><label>Iterations (higher = smoother, default 1)</label>
            <input type="number" id="smooth-iter" value="1" min="1" max="10" step="1"></div>
        ${selNote}`;
    showModal('Polygon Smooth', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Smooth</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                const iter = parseInt(overlay.querySelector('#smooth-iter').value);
                close();
                try {
                    const result = await runWithTaskProgress('Polygon Smooth', () =>
                        gisTools.polygonSmoothFeatures(getWorkingDataset(layer), iter)
                    );
                    if (!result) return;
                    addResultLayer(result);
                    showToast('Polygons smoothed', 'success');
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'PolygonSmooth'));
                }
            });
        }
    });
}

// --- Line Offset ---
async function openLineOffset() {
    const layer = requireSpatialLayer(['LineString', 'MultiLineString']);
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    if (_isReactToolDialogs) {
        const rootId = `line-offset-react-${Date.now()}`;
        showModal('Line Offset', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountLineOffsetDialog } = await import('../react/tools/mountLineOffsetDialog.jsx');
                const mounted = mountLineOffsetDialog(root, {
                    selectionCount: work.isSelection ? work.count : 0,
                    onCancel: () => close(),
                    onApply: async ({ dist, units }) => {
                        close();
                        try {
                            const result = await gisTools.lineOffsetFeatures(getWorkingDataset(layer), dist, units);
                            addResultLayer(result);
                            showToast(`Line offset by ${dist} ${units}`, 'success');
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'LineOffset'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const selNote = work.isSelection ? `<div class="info-box text-xs">Operating on <strong>${work.count}</strong> selected features.</div>` : '';
    const html = `
        <p>Create a parallel copy of line features, offset by the specified distance. Positive = right side, negative = left side.</p>
        <div class="form-group"><label>Offset distance</label>
            <input type="number" id="offset-dist" value="10" step="1"></div>
        <div class="form-group"><label>Units</label>
            <select id="offset-units"><option value="feet" selected>Feet</option><option value="meters">Meters</option><option value="miles">Miles</option><option value="kilometers">Kilometers</option></select></div>
        ${selNote}`;
    showModal('Line Offset', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Offset</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                const dist = parseFloat(overlay.querySelector('#offset-dist').value);
                const units = overlay.querySelector('#offset-units').value;
                close();
                try {
                    const result = await gisTools.lineOffsetFeatures(getWorkingDataset(layer), dist, units);
                    addResultLayer(result);
                    showToast(`Line offset by ${dist} ${units}`, 'success');
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'LineOffset'));
                }
            });
        }
    });
}

// --- Line Slice Along ---
async function openLineSliceAlong() {
    const layer = requireSpatialLayer(['LineString', 'MultiLineString']);
    if (!layer) return;

    if (_isReactToolDialogs) {
        const rootId = `line-slice-along-react-${Date.now()}`;
        showModal('Line Slice Along', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountLineSliceAlongDialog } = await import('../react/tools/mountLineSliceAlongDialog.jsx');
                const mounted = mountLineSliceAlongDialog(root, {
                    onCancel: () => close(),
                    onSlice: ({ start, stop, units }) => {
                        close();
                        const work = getWorkingFeatures(layer);
                        const line = findFirstLineStringFeature(work.geojson);
                        if (!line) return showToast('No LineString or MultiLineString found', 'warning');
                        try {
                            const sliced = gisTools.lineSliceAlong(line, start, stop, units);
                            sliced.properties = { ...line.properties, _sliceStart: start, _sliceStop: stop };
                            const fc = { type: 'FeatureCollection', features: [sliced] };
                            const result = createSpatialDataset(`${layer.name}_slice`, fc, { format: 'derived' });
                            addResultLayer(result);
                            showToast(`Sliced line: ${start}-${stop} ${units}`, 'success');
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'LineSliceAlong'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const html = `
        <p>Extract a section of a line between two distances measured from the start.</p>
        <div class="form-group"><label>Start distance</label>
            <input type="number" id="slice-start" value="0" min="0" step="1"></div>
        <div class="form-group"><label>Stop distance</label>
            <input type="number" id="slice-stop" value="100" min="0" step="1"></div>
        <div class="form-group"><label>Units</label>
            <select id="slice-units"><option value="feet" selected>Feet</option><option value="meters">Meters</option><option value="miles">Miles</option><option value="kilometers">Kilometers</option></select></div>`;
    showModal('Line Slice Along', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Slice</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                const start = parseFloat(overlay.querySelector('#slice-start').value);
                const stop = parseFloat(overlay.querySelector('#slice-stop').value);
                const units = overlay.querySelector('#slice-units').value;
                close();
                const work = getWorkingFeatures(layer);
                const line = findFirstLineStringFeature(work.geojson);
                if (!line) return showToast('No LineString or MultiLineString found', 'warning');
                try {
                    const sliced = gisTools.lineSliceAlong(line, start, stop, units);
                    sliced.properties = { ...line.properties, _sliceStart: start, _sliceStop: stop };
                    const fc = { type: 'FeatureCollection', features: [sliced] };
                    const result = createSpatialDataset(`${layer.name}_slice`, fc, { format: 'derived' });
                    addResultLayer(result);
                    showToast(`Sliced line: ${start}-${stop} ${units}`, 'success');
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'LineSliceAlong'));
                }
            });
        }
    });
}

// --- Line Slice (between two map-clicked points) ---
async function openLineSlice() {
    const layer = requireSpatialLayer(['LineString', 'MultiLineString']);
    if (!layer) return;

    if (_isReactToolDialogs) {
        const rootId = `line-slice-react-${Date.now()}`;
        showModal('Line Slice Between Points', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountLineSliceDialog } = await import('../react/tools/mountLineSliceDialog.jsx');
                const mounted = mountLineSliceDialog(root, {
                    onCancel: () => close(),
                    onPick: async () => {
                        close();
                        const pts = await mapService.startTwoPointPick('Click the start point along the line', 'Click the end point along the line');
                        if (!pts) return;
                        const work = getWorkingFeatures(layer);
                        const line = findFirstLineStringFeature(work.geojson);
                        if (!line) return showToast('No LineString or MultiLineString found', 'warning');
                        try {
                            const sliced = gisTools.lineSlice(turf.point(pts[0]), turf.point(pts[1]), line);
                            sliced.properties = { ...line.properties };
                            const fc = { type: 'FeatureCollection', features: [sliced] };
                            const result = createSpatialDataset(`${layer.name}_sliced`, fc, { format: 'derived' });
                            addResultLayer(result);
                            showToast('Line sliced between points', 'success');
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'LineSlice'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    showModal('Line Slice Between Points', '<p>Click two points on the map. The section of the line between those points (snapped to nearest vertices) will be extracted.</p>', {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Pick Points on Map</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                close();
                const pts = await mapService.startTwoPointPick('Click the start point along the line', 'Click the end point along the line');
                if (!pts) return;
                const work = getWorkingFeatures(layer);
                const line = findFirstLineStringFeature(work.geojson);
                if (!line) return showToast('No LineString or MultiLineString found', 'warning');
                try {
                    const sliced = gisTools.lineSlice(turf.point(pts[0]), turf.point(pts[1]), line);
                    sliced.properties = { ...line.properties };
                    const fc = { type: 'FeatureCollection', features: [sliced] };
                    const result = createSpatialDataset(`${layer.name}_sliced`, fc, { format: 'derived' });
                    addResultLayer(result);
                    showToast('Line sliced between points', 'success');
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'LineSlice'));
                }
            });
        }
    });
}

// --- Line Intersect ---
async function openLineIntersect() {
    if (typeof turf === 'undefined') return showToast('Turf.js not loaded yet', 'warning');
    const lineLayerDefs = getLayers()
        .filter((layer) =>
            layer.type === 'spatial'
            && layer.geojson.features.some((f) => f.geometry
                && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')))
        .map((layer) => ({
            id: layer.id,
            name: layer.name,
            count: layer.geojson.features.length
        }));
    if (lineLayerDefs.length === 0) return showToast('Need line layers loaded', 'warning');

    if (_isReactToolDialogs) {
        const rootId = `line-intersect-react-${Date.now()}`;
        showModal('Line Intersect', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountLineIntersectDialog } = await import('../react/tools/mountLineIntersectDialog.jsx');
                const mounted = mountLineIntersectDialog(root, {
                    layers: lineLayerDefs,
                    onCancel: () => close(),
                    onFind: ({ layerId1, layerId2 }) => {
                        const l1 = getLayers().find((layer) => layer.id === layerId1);
                        const l2 = getLayers().find((layer) => layer.id === layerId2);
                        close();
                        if (!l1 || !l2) return showToast('Select two layers', 'warning');
                        try {
                            const allPts = [];
                            const lines1 = listLineStringFeatures(l1.geojson);
                            const lines2 = listLineStringFeatures(l2.geojson);
                            for (const a of lines1) {
                                for (const b of lines2) {
                                    const pts = gisTools.lineIntersect(a, b);
                                    if (pts?.features) allPts.push(...pts.features);
                                }
                            }
                            const fc = { type: 'FeatureCollection', features: allPts };
                            const result = createSpatialDataset(`intersections_${l1.name}_${l2.name}`, fc, { format: 'derived' });
                            addResultLayer(result);
                            showToast(`Found ${allPts.length} intersection point(s)`, 'success');
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'LineIntersect'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const lineLayers = lineLayerDefs
        .map((layer) => `<option value="${layer.id}">${layer.name} (${layer.count})</option>`)
        .join('');

    const html = `
        <p>Find all points where two line layers cross each other.</p>
        <div class="form-group"><label>Line layer 1</label>
            <select id="lint-layer1">${lineLayers}</select></div>
        <div class="form-group"><label>Line layer 2</label>
            <select id="lint-layer2">${lineLayers}</select></div>`;
    showModal('Line Intersect', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Find Intersections</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                const l1 = getLayers().find(l => l.id === overlay.querySelector('#lint-layer1').value);
                const l2 = getLayers().find(l => l.id === overlay.querySelector('#lint-layer2').value);
                close();
                if (!l1 || !l2) return showToast('Select two layers', 'warning');
                try {
                    const allPts = [];
                    const lines1 = listLineStringFeatures(l1.geojson);
                    const lines2 = listLineStringFeatures(l2.geojson);
                    for (const a of lines1) {
                        for (const b of lines2) {
                            const pts = gisTools.lineIntersect(a, b);
                            if (pts?.features) allPts.push(...pts.features);
                        }
                    }
                    const fc = { type: 'FeatureCollection', features: allPts };
                    const result = createSpatialDataset(`intersections_${l1.name}_${l2.name}`, fc, { format: 'derived' });
                    addResultLayer(result);
                    showToast(`Found ${allPts.length} intersection point(s)`, 'success');
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'LineIntersect'));
                }
            });
        }
    });
}

// --- Kinks (self-intersections) ---
async function openKinks() {
    const layer = requireSpatialLayer();
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    if (_isReactToolDialogs) {
        const rootId = `kinks-react-${Date.now()}`;
        showModal('Find Kinks (Self-Intersections)', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountKinksDialog } = await import('../react/tools/mountKinksDialog.jsx');
                const mounted = mountKinksDialog(root, {
                    selectionCount: work.isSelection ? work.count : 0,
                    onCancel: () => close(),
                    onFind: async () => {
                        close();
                        try {
                            const result = await gisTools.findKinks(getWorkingDataset(layer));
                            addResultLayer(result);
                            showToast(`Found ${result.geojson.features.length} kink(s)`, result.geojson.features.length > 0 ? 'warning' : 'success');
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'Kinks'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const selNote = work.isSelection ? `<p class="info-box text-xs">Checking <strong>${work.count}</strong> selected features.</p>` : '';
    showModal('Find Kinks (Self-Intersections)', `<p>Find all points where lines or polygon edges cross over themselves. Useful for detecting geometry errors.</p>${selNote}`, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Find Kinks</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                close();
                try {
                    const result = await gisTools.findKinks(getWorkingDataset(layer));
                    addResultLayer(result);
                    showToast(`Found ${result.geojson.features.length} kink(s)`, result.geojson.features.length > 0 ? 'warning' : 'success');
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'Kinks'));
                }
            });
        }
    });
}

// --- Combine ---
async function openCombine() {
    const layer = requireSpatialLayer();
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    if (_isReactToolDialogs) {
        const rootId = `combine-features-react-${Date.now()}`;
        showModal('Combine Features', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountCombineFeaturesDialog } = await import('../react/tools/mountCombineFeaturesDialog.jsx');
                const mounted = mountCombineFeaturesDialog(root, {
                    selectionCount: work.isSelection ? work.count : 0,
                    onCancel: () => close(),
                    onCombine: () => {
                        close();
                        try {
                            const result = gisTools.combineFeatures(getWorkingDataset(layer));
                            addResultLayer(result);
                            showToast(`Combined into ${result.geojson.features.length} multi-feature(s)`, 'success');
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'Combine'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const selNote = work.isSelection ? `<p class="info-box text-xs">Combining <strong>${work.count}</strong> selected features.</p>` : '';
    showModal('Combine Features', `<p>Merge all features of the same geometry type into a single Multi-geometry feature (e.g., multiple Points → one MultiPoint).</p>${selNote}`, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Combine</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                close();
                try {
                    const result = gisTools.combineFeatures(getWorkingDataset(layer));
                    addResultLayer(result);
                    showToast(`Combined into ${result.geojson.features.length} multi-feature(s)`, 'success');
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'Combine'));
                }
            });
        }
    });
}

// --- Union ---
async function openUnion() {
    const layer = requireSpatialLayer(['Polygon', 'MultiPolygon']);
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    const polyCount = work.geojson.features.filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')).length;
    if (_isReactToolDialogs) {
        const rootId = `union-polygons-react-${Date.now()}`;
        showModal('Union Polygons', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountUnionPolygonsDialog } = await import('../react/tools/mountUnionPolygonsDialog.jsx');
                const mounted = mountUnionPolygonsDialog(root, {
                    polygonCount: polyCount,
                    isSelection: work.isSelection,
                    showLargeWarning: polyCount > 500,
                    onCancel: () => close(),
                    onUnion: async () => {
                        close();
                        try {
                            const result = await gisTools.unionFeatures(getWorkingDataset(layer));
                            addResultLayer(result);
                            showToast('Union complete', 'success');
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'Union'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const selNote = work.isSelection ? `<p class="info-box text-xs">Unioning <strong>${polyCount}</strong> selected polygons.</p>` : '';
    showModal('Union Polygons', `<p>Merge all ${polyCount} polygon features into a single unified polygon. Overlapping areas are dissolved.</p>
        ${polyCount > 500 ? '<div class="warning-box">Large dataset — this may be slow.</div>' : ''}
        ${selNote}`, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Union</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                close();
                try {
                    const result = await gisTools.unionFeatures(getWorkingDataset(layer));
                    addResultLayer(result);
                    showToast('Union complete', 'success');
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'Union'));
                }
            });
        }
    });
}

// --- Dissolve ---
async function openDissolve() {
    const layer = requireSpatialLayer(['Polygon', 'MultiPolygon']);
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    if (_isReactToolDialogs) {
        const rootId = `dissolve-react-${Date.now()}`;
        showModal('Dissolve', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountDissolveDialog } = await import('../react/tools/mountDissolveDialog.jsx');
                const mounted = mountDissolveDialog(root, {
                    fields: layer.schema?.fields || [],
                    selectionCount: work.isSelection ? work.count : 0,
                    onCancel: () => close(),
                    onDissolve: async ({ field }) => {
                        close();
                        try {
                            const result = await runWithTaskProgress('Dissolve', () =>
                                gisTools.dissolveFeatures(getWorkingDataset(layer), field)
                            );
                            if (!result) return;
                            addResultLayer(result);
                            showToast(field ? `Dissolved by field "${field}"` : 'Dissolved all polygons into merged features', 'success');
                            refreshUI();
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'Dissolve'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const selNote = work.isSelection ? `<div class="info-box text-xs">Dissolving <strong>${work.count}</strong> selected features.</div>` : '';
    const fieldOpts = (layer.schema?.fields || []).map(f => `<option value="${f.name}">${f.name}</option>`).join('');
    const html = `
        <p>Merge polygons that share the same field value, or merge everything into one polygon.</p>
        <div class="form-group"><label>Dissolve field</label>
            <select id="diss-field">
                <option value="">— Merge all polygons (no grouping field) —</option>
                ${fieldOpts}
            </select></div>
        ${selNote}`;
    showModal('Dissolve', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Dissolve</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                const field = overlay.querySelector('#diss-field').value;
                close();
                try {
                    const result = await runWithTaskProgress('Dissolve', () =>
                        gisTools.dissolveFeatures(getWorkingDataset(layer), field)
                    );
                    if (!result) return;
                    addResultLayer(result);
                    showToast(field ? `Dissolved by field "${field}"` : 'Dissolved all polygons into merged features', 'success');
                    refreshUI();
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'Dissolve'));
                }
            });
        }
    });
}

// --- Sector ---
async function openSector() {
    if (typeof turf === 'undefined') return showToast('Turf.js not loaded yet', 'warning');
    if (_isReactToolDialogs) {
        const rootId = `sector-react-${Date.now()}`;
        showModal('Create Sector', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountSectorDialog } = await import('../react/tools/mountSectorDialog.jsx');
                const mounted = mountSectorDialog(root, {
                    onCancel: () => close(),
                    onPickCenter: async ({ radius, b1, b2, units }) => {
                        close();
                        const center = await mapService.startPointPick('Click the center point for the sector');
                        if (!center) return;
                        try {
                            const sector = gisTools.createSector(turf.point(center), radius, b1, b2, units);
                            sector.properties = { radius, bearing1: b1, bearing2: b2, units };
                            const fc = { type: 'FeatureCollection', features: [sector] };
                            const result = createSpatialDataset(`sector_${b1}-${b2}`, fc, { format: 'derived' });
                            addResultLayer(result);
                            showToast('Sector created', 'success');
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'Sector'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const html = `
        <p>Create a pie-slice shaped polygon from a center point, radius, and two compass bearings.</p>
        <div class="form-group"><label>Radius</label>
            <input type="number" id="sector-radius" value="100" min="0.001" step="1"></div>
        <div class="form-group"><label>Start bearing (degrees, 0=North)</label>
            <input type="number" id="sector-b1" value="0" min="-180" max="360" step="1"></div>
        <div class="form-group"><label>End bearing (degrees)</label>
            <input type="number" id="sector-b2" value="90" min="-180" max="360" step="1"></div>
        <div class="form-group"><label>Units</label>
            <select id="sector-units"><option value="feet" selected>Feet</option><option value="meters">Meters</option><option value="miles">Miles</option><option value="kilometers">Kilometers</option></select></div>`;
    showModal('Create Sector', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Pick Center on Map</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                const radius = parseFloat(overlay.querySelector('#sector-radius').value);
                const b1 = parseFloat(overlay.querySelector('#sector-b1').value);
                const b2 = parseFloat(overlay.querySelector('#sector-b2').value);
                const units = overlay.querySelector('#sector-units').value;
                close();
                const center = await mapService.startPointPick('Click the center point for the sector');
                if (!center) return;
                try {
                    const sector = gisTools.createSector(turf.point(center), radius, b1, b2, units);
                    sector.properties = { radius, bearing1: b1, bearing2: b2, units };
                    const fc = { type: 'FeatureCollection', features: [sector] };
                    const result = createSpatialDataset(`sector_${b1}-${b2}`, fc, { format: 'derived' });
                    addResultLayer(result);
                    showToast('Sector created', 'success');
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'Sector'));
                }
            });
        }
    });
}

// --- Nearest Point ---
async function openNearestPoint() {
    if (typeof turf === 'undefined') return showToast('Turf.js not loaded yet', 'warning');
    const pointLayerDefs = getLayers()
        .filter((layer) =>
            layer.type === 'spatial'
            && layer.geojson.features.some((f) => f.geometry && f.geometry.type === 'Point'))
        .map((layer) => ({
            id: layer.id,
            name: layer.name,
            count: layer.geojson.features.length
        }));
    if (pointLayerDefs.length === 0) return showToast('Need a point layer loaded', 'warning');

    if (_isReactToolDialogs) {
        const rootId = `nearest-point-react-${Date.now()}`;
        showModal('Nearest Point', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountNearestPointDialog } = await import('../react/tools/mountNearestPointDialog.jsx');
                const mounted = mountNearestPointDialog(root, {
                    layers: pointLayerDefs,
                    onCancel: () => close(),
                    onPickLocation: async ({ layerId, units }) => {
                        const ptLayer = getLayers().find((layer) => layer.id === layerId);
                        close();
                        if (!ptLayer) return;
                        const target = await mapService.startPointPick('Click the map to find the nearest point');
                        if (!target) return;
                        try {
                            const nearest = gisTools.nearestPoint(turf.point(target), ptLayer);
                            const line = turf.lineString([target, nearest.geometry.coordinates]);
                            mapService.showTempFeature({ type: 'FeatureCollection', features: [nearest, line] }, 15000);
                            const distKm = nearest.properties.distanceToPoint;
                            const dist = convertKm(distKm, units);
                            const name = nearest.properties.name || nearest.properties.NAME || `Feature ${nearest.properties.featureIndex}`;
                            showToast(`Nearest: "${name}" (${dist?.toFixed(2) || '?'} ${units} away)`, 'success', { duration: 10000 });
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'NearestPoint'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const ptLayers = pointLayerDefs
        .map((layer) => `<option value="${layer.id}">${layer.name} (${layer.count})</option>`)
        .join('');

    const html = `
        <p>Click a location on the map to find the closest feature in a point layer.</p>
        <div class="form-group"><label>Point layer to search</label>
            <select id="np-layer">${ptLayers}</select></div>
        <div class="form-group"><label>Units</label>
            <select id="np-units">${UNIT_OPTIONS_HTML}</select></div>`;
    showModal('Nearest Point', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Pick Location on Map</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                const layerId = overlay.querySelector('#np-layer').value;
                const units = overlay.querySelector('#np-units').value;
                const ptLayer = getLayers().find(l => l.id === layerId);
                close();
                if (!ptLayer) return;
                const target = await mapService.startPointPick('Click the map to find the nearest point');
                if (!target) return;
                try {
                    const nearest = gisTools.nearestPoint(turf.point(target), ptLayer);
                    const line = turf.lineString([target, nearest.geometry.coordinates]);
                    mapService.showTempFeature({type:'FeatureCollection',features:[nearest, line]}, 15000);
                    const distKm = nearest.properties.distanceToPoint;
                    const dist = convertKm(distKm, units);
                    const name = nearest.properties.name || nearest.properties.NAME || `Feature ${nearest.properties.featureIndex}`;
                    showToast(`Nearest: "${name}" (${dist?.toFixed(2) || '?'} ${units} away)`, 'success', { duration: 10000 });
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'NearestPoint'));
                }
            });
        }
    });
}

// --- Nearest Point on Line ---
async function openNearestPointOnLine() {
    if (typeof turf === 'undefined') return showToast('Turf.js not loaded yet', 'warning');
    const lineLayerDefs = getLayers()
        .filter((layer) =>
            layer.type === 'spatial'
            && layer.geojson.features.some((f) => f.geometry
                && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')))
        .map((layer) => ({
            id: layer.id,
            name: layer.name,
            count: layer.geojson.features.length
        }));
    if (lineLayerDefs.length === 0) return showToast('Need a line layer loaded', 'warning');

    if (_isReactToolDialogs) {
        const rootId = `nearest-point-on-line-react-${Date.now()}`;
        showModal('Nearest Point on Line', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountNearestPointOnLineDialog } = await import('../react/tools/mountNearestPointOnLineDialog.jsx');
                const mounted = mountNearestPointOnLineDialog(root, {
                    layers: lineLayerDefs,
                    onCancel: () => close(),
                    onPickPoint: async ({ layerId, units }) => {
                        const lineLayer = getLayers().find((layer) => layer.id === layerId);
                        close();
                        if (!lineLayer) return;
                        const pt = await mapService.startPointPick('Click the map to snap to the nearest line');
                        if (!pt) return;
                        const lineWhole = lineLayer.geojson.features.find((f) =>
                            f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'));
                        if (!lineWhole) return showToast('No LineString or MultiLineString found', 'warning');
                        try {
                            const snap = gisTools.nearestPointOnLine(lineWhole, turf.point(pt), 'kilometers');
                            const connector = turf.lineString([pt, snap.geometry.coordinates]);
                            mapService.showTempFeature({ type: 'FeatureCollection', features: [snap, connector] }, 15000);
                            const distKm = snap.properties.dist;
                            const dist = convertKm(distKm, units);
                            showToast(`Snapped to line at ${dist?.toFixed(2) || '?'} ${units}`, 'success', { duration: 10000 });
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'NearestPointOnLine'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const lineLayers = lineLayerDefs
        .map((layer) => `<option value="${layer.id}">${layer.name} (${layer.count})</option>`)
        .join('');

    const html = `
        <p>Click a point on the map to find the closest spot on a line (snaps to the line).</p>
        <div class="form-group"><label>Line layer</label>
            <select id="npol-layer">${lineLayers}</select></div>
        <div class="form-group"><label>Units</label>
            <select id="npol-units">${UNIT_OPTIONS_HTML}</select></div>`;
    showModal('Nearest Point on Line', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Pick Point on Map</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                const layerId = overlay.querySelector('#npol-layer').value;
                const units = overlay.querySelector('#npol-units').value;
                const lineLayer = getLayers().find(l => l.id === layerId);
                close();
                if (!lineLayer) return;
                const pt = await mapService.startPointPick('Click the map to snap to the nearest line');
                if (!pt) return;
                const lineWhole = lineLayer.geojson.features.find(f =>
                    f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'));
                if (!lineWhole) return showToast('No LineString or MultiLineString found', 'warning');
                try {
                    const snap = gisTools.nearestPointOnLine(lineWhole, turf.point(pt), 'kilometers');
                    const connector = turf.lineString([pt, snap.geometry.coordinates]);
                    mapService.showTempFeature({type:'FeatureCollection',features:[snap, connector]}, 15000);
                    const distKm = snap.properties.dist;
                    const dist = convertKm(distKm, units);
                    showToast(`Snapped to line at ${dist?.toFixed(2) || '?'} ${units}`, 'success', { duration: 10000 });
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'NearestPointOnLine'));
                }
            });
        }
    });
}

// --- Nearest Point to Line ---
async function openNearestPointToLine() {
    if (typeof turf === 'undefined') return showToast('Turf.js not loaded yet', 'warning');
    const pointLayerDefs = getLayers()
        .filter((layer) =>
            layer.type === 'spatial'
            && layer.geojson.features.some((f) => f.geometry && f.geometry.type === 'Point'))
        .map((layer) => ({
            id: layer.id,
            name: layer.name,
            count: layer.geojson.features.length
        }));
    const lineLayerDefs = getLayers()
        .filter((layer) =>
            layer.type === 'spatial'
            && layer.geojson.features.some((f) => f.geometry
                && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')))
        .map((layer) => ({
            id: layer.id,
            name: layer.name,
            count: layer.geojson.features.length
        }));
    if (pointLayerDefs.length === 0 || lineLayerDefs.length === 0) return showToast('Need a point layer and a line layer', 'warning');

    if (_isReactToolDialogs) {
        const rootId = `nearest-point-to-line-react-${Date.now()}`;
        showModal('Nearest Point to Line', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountNearestPointToLineDialog } = await import('../react/tools/mountNearestPointToLineDialog.jsx');
                const mounted = mountNearestPointToLineDialog(root, {
                    pointLayers: pointLayerDefs,
                    lineLayers: lineLayerDefs,
                    onCancel: () => close(),
                    onFind: ({ pointLayerId, lineLayerId, units }) => {
                        const ptsLayer = getLayers().find((layer) => layer.id === pointLayerId);
                        const lineLayer = getLayers().find((layer) => layer.id === lineLayerId);
                        close();
                        if (!ptsLayer || !lineLayer) return;
                        const lineWhole = lineLayer.geojson.features.find((f) =>
                            f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'));
                        if (!lineWhole) return showToast('No LineString or MultiLineString found', 'warning');
                        try {
                            const nearest = gisTools.nearestPointToLine(ptsLayer.geojson, lineWhole);
                            mapService.showTempFeature(nearest, 15000);
                            const name = nearest.properties?.name || nearest.properties?.NAME || 'Unnamed';
                            const distKm = nearest.properties?.dist;
                            const dist = convertKm(distKm, units);
                            showToast(`Nearest to line: "${name}" (${dist?.toFixed(2) || '?'} ${units})`, 'success', { duration: 10000 });
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'NearestPointToLine'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const ptLayers = pointLayerDefs
        .map((layer) => `<option value="${layer.id}">${layer.name} (${layer.count})</option>`)
        .join('');
    const lineLayers = lineLayerDefs
        .map((layer) => `<option value="${layer.id}">${layer.name} (${layer.count})</option>`)
        .join('');

    const html = `
        <p>Find which point in a point layer is closest to a specific line feature.</p>
        <div class="form-group"><label>Point layer</label>
            <select id="nptl-pts">${ptLayers}</select></div>
        <div class="form-group"><label>Line layer</label>
            <select id="nptl-line">${lineLayers}</select></div>
        <div class="form-group"><label>Units</label>
            <select id="nptl-units">${UNIT_OPTIONS_HTML}</select></div>`;
    showModal('Nearest Point to Line', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Find</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                const ptsLayer = getLayers().find(l => l.id === overlay.querySelector('#nptl-pts').value);
                const lineLayer = getLayers().find(l => l.id === overlay.querySelector('#nptl-line').value);
                const units = overlay.querySelector('#nptl-units').value;
                close();
                if (!ptsLayer || !lineLayer) return;
                const lineWhole = lineLayer.geojson.features.find(f =>
                    f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'));
                if (!lineWhole) return showToast('No LineString or MultiLineString found', 'warning');
                try {
                    const nearest = gisTools.nearestPointToLine(ptsLayer.geojson, lineWhole);
                    mapService.showTempFeature(nearest, 15000);
                    const name = nearest.properties?.name || nearest.properties?.NAME || 'Unnamed';
                    const distKm = nearest.properties?.dist;
                    const dist = convertKm(distKm, units);
                    showToast(`Nearest to line: "${name}" (${dist?.toFixed(2) || '?'} ${units})`, 'success', { duration: 10000 });
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'NearestPointToLine'));
                }
            });
        }
    });
}

// --- Nearest Neighbor Analysis ---
async function openNearestNeighborAnalysis() {
    const layer = requireSpatialLayer(['Point']);
    if (!layer) return;

    if (_isReactToolDialogs) {
        const rootId = `nearest-neighbor-react-${Date.now()}`;
        showModal('Nearest Neighbor Analysis', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountNearestNeighborAnalysisDialog } = await import('../react/tools/mountNearestNeighborAnalysisDialog.jsx');
                const mounted = mountNearestNeighborAnalysisDialog(root, {
                    onCancel: () => close(),
                    onRun: async () => {
                        close();
                        try {
                            const result = gisTools.nearestNeighborAnalysis(layer);
                            const p = result.properties || result;
                            const pattern = p.zscore < -1.65 ? 'Clustered' : (p.zscore > 1.65 ? 'Dispersed' : 'Random');
                            const featureCount = p.numberOfPoints || layer.geojson.features.filter((f) => f.geometry?.type === 'Point').length;
                            const resultsRootId = `nearest-neighbor-results-react-${Date.now()}`;
                            showModal('Nearest Neighbor Analysis — Results', `<div id="${resultsRootId}"></div>`, {
                                width: '450px',
                                onMount: async (resultsOverlay) => {
                                    const resultsRoot = resultsOverlay.querySelector(`#${resultsRootId}`);
                                    if (!resultsRoot) return;
                                    const { mountNearestNeighborResultsDialog } = await import('../react/tools/mountNearestNeighborResultsDialog.jsx');
                                    const resultsMounted = mountNearestNeighborResultsDialog(resultsRoot, { pattern, p, featureCount });
                                    watchOverlayUnmount(resultsOverlay, () => resultsMounted.unmount?.());
                                }
                            });
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'NearestNeighborAnalysis'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    showModal('Nearest Neighbor Analysis', '<p>Analyze the spatial distribution of points. Returns statistical metrics that indicate whether points are clustered, random, or dispersed.</p>', {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Run Analysis</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                close();
                try {
                    const result = gisTools.nearestNeighborAnalysis(layer);
                    const p = result.properties || result;
                    const pattern = p.zscore < -1.65 ? 'Clustered' : (p.zscore > 1.65 ? 'Dispersed' : 'Random');
                    const html = `
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            <div style="text-align:center;font-size:20px;font-weight:700;color:var(--gold-light);margin-bottom:4px;">${pattern}</div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                                <div style="padding:8px;background:var(--bg-surface);border-radius:4px;border:1px solid var(--border);">
                                    <div style="font-size:11px;color:var(--text-muted);">Observed Mean Distance</div>
                                    <div style="font-size:16px;font-weight:600;color:var(--text);">${p.observedMeanDistance?.toFixed(6) || 'N/A'}</div>
                                </div>
                                <div style="padding:8px;background:var(--bg-surface);border-radius:4px;border:1px solid var(--border);">
                                    <div style="font-size:11px;color:var(--text-muted);">Expected Mean Distance</div>
                                    <div style="font-size:16px;font-weight:600;color:var(--text);">${p.expectedMeanDistance?.toFixed(6) || 'N/A'}</div>
                                </div>
                                <div style="padding:8px;background:var(--bg-surface);border-radius:4px;border:1px solid var(--border);">
                                    <div style="font-size:11px;color:var(--text-muted);">Nearest Neighbor Ratio</div>
                                    <div style="font-size:16px;font-weight:600;color:var(--text);">${p.nearestNeighborIndex?.toFixed(4) || 'N/A'}</div>
                                </div>
                                <div style="padding:8px;background:var(--bg-surface);border-radius:4px;border:1px solid var(--border);">
                                    <div style="font-size:11px;color:var(--text-muted);">Z-Score</div>
                                    <div style="font-size:16px;font-weight:600;color:var(--text);">${p.zscore?.toFixed(4) || 'N/A'}</div>
                                </div>
                            </div>
                            <div class="info-box text-xs" style="margin-top:4px;">
                                <strong>Interpretation:</strong> Z-score &lt; -1.65 → Clustered. Z-score &gt; 1.65 → Dispersed. Between → Random.
                                A ratio &lt; 1 suggests clustering, &gt; 1 suggests dispersion.
                            </div>
                            <div style="font-size:11px;color:var(--text-muted);">
                                Features analyzed: ${p.numberOfPoints || layer.geojson.features.filter(f => f.geometry?.type === 'Point').length}
                            </div>
                        </div>`;
                    showModal('Nearest Neighbor Analysis — Results', html, { width: '450px' });
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'NearestNeighborAnalysis'));
                }
            });
        }
    });
}

// --- Points Within Polygon ---
async function openPointsWithinPolygon() {
    if (typeof turf === 'undefined') return showToast('Turf.js not loaded yet', 'warning');
    const pointLayerDefs = getLayers()
        .filter((layer) =>
            layer.type === 'spatial'
            && layer.geojson.features.some((f) => f.geometry && f.geometry.type === 'Point'))
        .map((layer) => ({
            id: layer.id,
            name: layer.name,
            count: layer.geojson.features.length
        }));
    const polygonLayerDefs = getLayers()
        .filter((layer) =>
            layer.type === 'spatial'
            && layer.geojson.features.some((f) =>
                f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')))
        .map((layer) => ({
            id: layer.id,
            name: layer.name,
            count: layer.geojson.features.length
        }));
    if (pointLayerDefs.length === 0 || polygonLayerDefs.length === 0) return showToast('Need both a point layer and a polygon layer', 'warning');

    if (_isReactToolDialogs) {
        const rootId = `points-within-polygon-react-${Date.now()}`;
        showModal('Points Within Polygon', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountPointsWithinPolygonDialog } = await import('../react/tools/mountPointsWithinPolygonDialog.jsx');
                const mounted = mountPointsWithinPolygonDialog(root, {
                    pointLayers: pointLayerDefs,
                    polygonLayers: polygonLayerDefs,
                    onCancel: () => close(),
                    onFind: ({ pointLayerId, polygonLayerId }) => {
                        const ptsLayer = getLayers().find((layer) => layer.id === pointLayerId);
                        const polyLayer = getLayers().find((layer) => layer.id === polygonLayerId);
                        close();
                        if (!ptsLayer || !polyLayer) return;
                        try {
                            const result = gisTools.pointsWithinPolygon(ptsLayer, polyLayer);
                            addResultLayer(result);
                            const total = ptsLayer.geojson.features.length;
                            const inside = result.geojson.features.length;
                            showToast(`${inside} of ${total} points are within the polygon(s)`, 'success');
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'PointsWithinPolygon'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const ptLayers = pointLayerDefs
        .map((layer) => `<option value="${layer.id}">${layer.name} (${layer.count})</option>`)
        .join('');
    const polyLayers = polygonLayerDefs
        .map((layer) => `<option value="${layer.id}">${layer.name} (${layer.count})</option>`)
        .join('');

    const html = `
        <p>Find all points from one layer that fall inside polygons from another layer.</p>
        <div class="form-group"><label>Point layer</label>
            <select id="pwp-pts">${ptLayers}</select></div>
        <div class="form-group"><label>Polygon layer</label>
            <select id="pwp-polys">${polyLayers}</select></div>`;
    showModal('Points Within Polygon', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Find Points</button>',
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                const ptsLayer = getLayers().find(l => l.id === overlay.querySelector('#pwp-pts').value);
                const polyLayer = getLayers().find(l => l.id === overlay.querySelector('#pwp-polys').value);
                close();
                if (!ptsLayer || !polyLayer) return;
                try {
                    const result = gisTools.pointsWithinPolygon(ptsLayer, polyLayer);
                    addResultLayer(result);
                    const total = ptsLayer.geojson.features.length;
                    const inside = result.geojson.features.length;
                    showToast(`${inside} of ${total} points are within the polygon(s)`, 'success');
                } catch (e) {
                    showErrorToast(handleError(e, 'GISTools', 'PointsWithinPolygon'));
                }
            });
        }
    });
}

// ============================
// Coordinate Converter
// ============================
async function openCoordConverter() {
    const layer = getActiveLayer();
    if (!layer) return showToast('No active layer', 'warning');

    const isSpatial = layer.type === 'spatial';
    const fields = getFieldNames();

    const formats = [
        { id: 'dd', label: 'Decimal Degrees (DD)' },
        { id: 'dms', label: 'Degrees Minutes Seconds (DMS)' },
        { id: 'ddm', label: 'Degrees Decimal Minutes (DDM)' },
        { id: 'utm', label: 'UTM' }
    ];

    const fromFmtOpts = formats.filter(f => f.id !== 'utm')
        .map(f => `<option value="${f.id}">${f.label}</option>`).join('');
    const toFmtOpts = formats.map(f => `<option value="${f.id}" ${f.id === 'dms' ? 'selected' : ''}>${f.label}</option>`).join('');
    const fieldOpts = fields.map(f => `<option value="${f}">${f}</option>`).join('');

    // Auto-detect lat/lon fields
    const latGuess = fields.find(f => /^(lat|latitude|y)$/i.test(f)) || fields[0] || '';
    const lonGuess = fields.find(f => /^(lon|lng|longitude|long|x)$/i.test(f)) || (fields[1] || '');

    if (_isReactToolDialogs) {
        const rootId = `coord-converter-react-${Date.now()}`;
        showModal('Coordinate Converter', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountCoordConverterDialog } = await import('../react/tools/mountCoordConverterDialog.jsx');
                const mounted = mountCoordConverterDialog(root, {
                    isSpatial,
                    fields,
                    latGuess,
                    lonGuess,
                    onCancel: () => close(),
                    onConvert: async ({ source, toFormat, prefix, fromFormat, latField, lonField }) => {
                        close();
                        try {
                            const features = getFeatures();

                            const opts = {
                                toFormat,
                                useGeometry: source === 'geometry',
                                fromFormat: source === 'geometry' ? 'dd' : fromFormat,
                                latField: source === 'fields' ? latField : null,
                                lonField: source === 'fields' ? lonField : null,
                                outputPrefix: prefix?.trim() || undefined
                            };

                            const { features: converted, converted: count, failed } = convertFeatureCoords(features, opts);
                            applyTransform('Coordinate Convert', converted);
                            const msg = `Converted ${count} coordinates to ${toFormat.toUpperCase()}`;
                            showToast(failed > 0 ? `${msg} (${failed} failed)` : msg, failed > 0 ? 'warning' : 'success');
                        } catch (e) {
                            showErrorToast(handleError(e, 'Coordinates', 'Convert'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const html = `
        <div class="form-group"><label>Coordinate Source</label>
            <select id="cc-source">
                ${isSpatial ? '<option value="geometry" selected>Feature Geometry (lat/lon from shape)</option>' : ''}
                <option value="fields" ${!isSpatial ? 'selected' : ''}>Attribute Fields</option>
            </select>
        </div>
        <div id="cc-field-opts" style="${isSpatial ? 'display:none' : ''}">
            <div class="form-group"><label>Source Format</label>
                <select id="cc-from">${fromFmtOpts}</select></div>
            <div class="form-group"><label>Latitude / Y Field</label>
                <select id="cc-lat">${fieldOpts}</select></div>
            <div class="form-group"><label>Longitude / X Field</label>
                <select id="cc-lon">${fieldOpts}</select></div>
        </div>
        <div class="form-group"><label>Convert To</label>
            <select id="cc-to">${toFmtOpts}</select></div>
        <div class="form-group"><label>Output Field Prefix (optional)</label>
            <input type="text" id="cc-prefix" placeholder="Auto (e.g. DMS, UTM)"></div>
        <div class="info-box text-xs">
            Adds new attribute fields with the converted coordinates.<br>
            Examples: <code>DMS_lat</code>, <code>DMS_lon</code>, <code>UTM_zone</code>, <code>UTM_easting</code>, <code>UTM_northing</code>
        </div>`;

    showModal('Coordinate Converter', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Convert</button>',
        onMount: (overlay, close) => {
            // Set guessed field values
            const latSel = overlay.querySelector('#cc-lat');
            const lonSel = overlay.querySelector('#cc-lon');
            if (latGuess && latSel) latSel.value = latGuess;
            if (lonGuess && lonSel) lonSel.value = lonGuess;

            // Toggle field options visibility
            overlay.querySelector('#cc-source').addEventListener('change', (e) => {
                overlay.querySelector('#cc-field-opts').style.display = e.target.value === 'geometry' ? 'none' : '';
            });

            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', async () => {
                const source = overlay.querySelector('#cc-source').value;
                const toFormat = overlay.querySelector('#cc-to').value;
                const prefix = overlay.querySelector('#cc-prefix').value.trim() || undefined;

                close();
                try {
                    const features = getFeatures();

                    const opts = {
                        toFormat,
                        useGeometry: source === 'geometry',
                        fromFormat: source === 'geometry' ? 'dd' : overlay.querySelector('#cc-from').value,
                        latField: source === 'fields' ? overlay.querySelector('#cc-lat').value : null,
                        lonField: source === 'fields' ? overlay.querySelector('#cc-lon').value : null,
                        outputPrefix: prefix
                    };

                    const { features: converted, converted: count, failed } = convertFeatureCoords(features, opts);
                    applyTransform('Coordinate Convert', converted);
                    const msg = `Converted ${count} coordinates to ${toFormat.toUpperCase()}`;
                    showToast(failed > 0 ? `${msg} (${failed} failed)` : msg, failed > 0 ? 'warning' : 'success');
                } catch (e) {
                    showErrorToast(handleError(e, 'Coordinates', 'Convert'));
                }
            });
        }
    });
}

// ============================
// Photo Mapper modal
// ============================
async function openPhotoMapper() {
    if (_isReactToolDialogs) {
        const rootId = `photo-mapper-react-${Date.now()}`;
        showModal('Photo Mapper', `<div id="${rootId}"></div>`, {
            width: '700px',
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountPhotoMapperDialog } = await import('../react/tools/mountPhotoMapperDialog.jsx');
                const mounted = mountPhotoMapperDialog(root, {
                    onCancel: () => close(),
                    onProcessFiles: async (files) => processPhotoFilesForReact(files),
                    onConfirm: ({ useFullSize }) => {
                        photoMapper._useFullSize = !!useFullSize;
                        close();
                        showToast('Photos added to map. Use Export to save in any format.', 'success');
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const html = `
        <div class="drop-zone" id="photo-drop" style="margin-bottom:16px;">
            <div style="font-size:24px; margin-bottom:8px;">📷</div>
            <p>Drop photos here or tap to select</p>
            <input type="file" id="photo-input" multiple accept="image/*,.jpg,.jpeg,.png,.heic,.heif,.tiff,.tif"
                   style="opacity:0;position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;">
            <button class="btn btn-primary mt-8" id="photo-btn">Select Photos</button>
        </div>
        <div class="info-box text-xs mb-8" style="color:var(--text-muted);">
            📍 Photos must contain embedded GPS/geolocation metadata (EXIF) to be placed on the map. Most smartphone cameras save location automatically when location services are enabled. Photos without GPS data will still be listed but won't appear on the map.
        </div>
        <div id="photo-results" class="hidden">
            <div id="photo-stats" class="flex gap-8 mb-8"></div>
            <div id="photo-grid" class="photo-grid"></div>
            <div class="form-group mt-8">
                <label class="checkbox-row"><input type="radio" name="photo-size" value="thumbnail" checked> Thumbnails (smaller, faster)</label>
                <label class="checkbox-row"><input type="radio" name="photo-size" value="full"> Full-size originals (larger file)</label>
            </div>
            <div style="text-align:right; margin-top:12px;">
                <button class="btn btn-primary" id="photo-ok-btn">OK — Add to Map</button>
            </div>
        </div>`;

    showModal('Photo Mapper', html, {
        width: '700px',
        onMount: (overlay, close) => {
            const fileInput = overlay.querySelector('#photo-input');
            const dropZone = overlay.querySelector('#photo-drop');

            // Prevent double-click: button is inside drop zone, so stop propagation
            overlay.querySelector('#photo-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                fileInput.value = '';
                fileInput.click();
            });
            dropZone.addEventListener('click', (e) => {
                if (e.target === dropZone || e.target.tagName === 'P' || e.target.tagName === 'DIV') {
                    fileInput.value = '';
                    fileInput.click();
                }
            });

            dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
            dropZone.addEventListener('drop', e => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                processPhotoFiles(Array.from(e.dataTransfer.files), overlay);
            });

            fileInput.addEventListener('change', () => {
                if (fileInput.files.length > 0) {
                    const files = Array.from(fileInput.files);
                    processPhotoFiles(files, overlay);
                }
            });

            // OK button — store size preference and close
            overlay.querySelector('#photo-ok-btn')?.addEventListener('click', () => {
                const useFullSize = overlay.querySelector('input[name="photo-size"][value="full"]')?.checked;
                // Store the preference so exports can use it
                photoMapper._useFullSize = !!useFullSize;
                close();
                showToast('Photos added to map. Use Export to save in any format.', 'success');
            });
        }
    });
}

async function processPhotoFilesCore(files) {
    // Broad filter — iOS may report no type for some images
    const imageFiles = files.filter(f =>
        f.type.startsWith('image/') ||
        /\.(jpe?g|png|heic|heif|tiff?|webp|bmp|gif)$/i.test(f.name) ||
        (!f.type && f.size > 0) // iOS sometimes gives no MIME type — let it through
    );
    if (imageFiles.length === 0) {
        showToast('No image files found', 'warning');
        return null;
    }

    logger.info('PhotoMapper', 'processPhotoFiles called', {
        count: imageFiles.length,
        names: imageFiles.map(f => f.name).join(', '),
        types: imageFiles.map(f => f.type || 'none').join(', ')
    });

    const progress = showProgressModal('Processing Photos');
    const onPhotoProgress = (data) => progress.update(data.percent, data.step);
    bus.on('task:progress', onPhotoProgress);
    progress.onCancel(() => {
        getActiveTask()?.cancel();
        progress.close();
        bus.off('task:progress', onPhotoProgress);
        showToast('Photo processing cancelled', 'warning');
    });

    try {
        const result = await photoMapper.processPhotos(imageFiles);
        if (!result) return null;

        // Add photos as a layer on the map
        if (result.dataset) {
            addLayer(result.dataset);
            mapService.addLayer(result.dataset, getLayers().indexOf(result.dataset), { fit: true });
            refreshUI();
        }

        if (result.withoutGPS > 0) {
            showToast(`${result.withoutGPS} photo(s) have no GPS data. They won't appear on the map.`, 'warning');
        }

        return result;
    } catch (e) {
        showErrorToast(handleError(e, 'PhotoMapper', 'Process photos'));
        return null;
    } finally {
        progress.close();
        bus.off('task:progress', onPhotoProgress);
    }
}

async function processPhotoFilesForReact(files) {
    return processPhotoFilesCore(files);
}

async function processPhotoFiles(files, modalOverlay) {
    try {
        const result = await processPhotoFilesCore(files);
        if (!result) return null;

        // Show results
        const resultsEl = modalOverlay.querySelector('#photo-results');
        const statsEl = modalOverlay.querySelector('#photo-stats');
        const gridEl = modalOverlay.querySelector('#photo-grid');

        if (resultsEl) resultsEl.classList.remove('hidden');

        statsEl.innerHTML = `
            <span class="badge badge-success">✅ ${result.withGPS} with GPS</span>
            <span class="badge badge-warning">⚠️ ${result.withoutGPS} without GPS</span>
            <span class="badge badge-info">${result.photos.length} total</span>`;

        gridEl.innerHTML = result.photos.map(p => `
            <div class="photo-card ${p.hasGPS ? '' : 'no-gps'}" style="position:relative">
                ${p.thumbnailUrl ? `<img src="${p.thumbnailUrl}" alt="${p.filename}">` : '<div style="height:100px;background:#eee;"></div>'}
                <div class="photo-info">${p.filename}</div>
                ${!p.hasGPS ? '<div style="position:absolute;top:4px;right:4px;background:#d97706;color:white;font-size:9px;padding:1px 4px;border-radius:3px;">No GPS</div>' : ''}
            </div>
        `).join('');
        return result;
    } catch (e) {
        showErrorToast(handleError(e, 'PhotoMapper', 'Process photos'));
        return null;
    }
}

// ============================
// GIS Widgets
// ============================
let _spatialAnalyzerWidget = null;

function openSpatialAnalyzer() {
    if (_isReactToolDialogs) {
        const rootId = `spatial-analyzer-react-${Date.now()}`;
        const spatialLayers = (getLayers() || []).filter((layer) => layer.type === 'spatial');
        const layerOptions = spatialLayers.map((layer) => {
            const hasPolygons = (layer.geojson?.features || []).some((feature) =>
                feature?.geometry?.type === 'Polygon' || feature?.geometry?.type === 'MultiPolygon'
            );
            return {
                id: layer.id,
                name: layer.name,
                featureCount: layer.geojson?.features?.length || 0,
                hasPolygons
            };
        });

        showModal('Find Features in Area', `<div id="${rootId}"></div>`, {
            width: '560px',
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountSpatialAnalyzerDialog } = await import('../react/tools/mountSpatialAnalyzerDialog.jsx');
                const { SPATIAL_RELATIONS, runSpatialAnalysis } = await import('./widgets/spatial-analyzer-engine.js');
                const mounted = mountSpatialAnalyzerDialog(root, {
                    layers: layerOptions,
                    relationOptions: SPATIAL_RELATIONS,
                    onCancel: () => close(),
                    onDrawArea: async (mode) => {
                        if (mode === 'rectangle') {
                            showToast('Draw a rectangle on the map', 'info');
                            const bbox = await mapService.startRectangleDraw('Click and drag to draw your search area');
                            if (!bbox) return null;
                            const [west, south, east, north] = bbox;
                            const analysisArea = turf.bboxPolygon([west, south, east, north]);
                            mapService.showTempFeature(analysisArea, 15000);
                            return { analysisArea, areaSource: 'draw' };
                        }

                        if (mode === 'polygon') {
                            showToast('Click to place points, double-click or Enter to finish', 'info');
                            const geometry = await mapService.startSketchPolygon({
                                bannerText: 'Click to add points. Double-click or Enter to finish the area.',
                                onInsufficientVertices: () => showToast('Need at least 3 points to make an area', 'warning')
                            });
                            if (!geometry) return null;
                            const analysisArea = turf.feature(geometry);
                            mapService.showTempFeature(analysisArea, 15000);
                            return { analysisArea, areaSource: 'draw' };
                        }

                        if (mode === 'circle') {
                            showToast('Click center, then click to set radius', 'info');
                            const geometry = await mapService.startSketchCirclePolygon({
                                bannerText: 'Click center, then click for radius. Esc cancels.',
                                onRadiusTooSmall: () => showToast('Radius too small', 'warning')
                            });
                            if (!geometry) return null;
                            const analysisArea = turf.feature(geometry);
                            mapService.showTempFeature(analysisArea, 15000);
                            return { analysisArea, areaSource: 'draw' };
                        }

                        return null;
                    },
                    onUseLayerArea: async (areaLayerId) => {
                        const layer = getLayers().find((entry) => entry.id === areaLayerId);
                        if (!layer?.geojson?.features?.length) {
                            throw new Error('Selected polygon layer has no features.');
                        }

                        const polygons = layer.geojson.features.filter((feature) =>
                            feature?.geometry &&
                            (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')
                        );

                        if (polygons.length === 0) {
                            throw new Error('No polygon features found in selected layer.');
                        }

                        let analysisArea = polygons[0];
                        if (polygons.length > 1) {
                            try {
                                let merged = polygons[0];
                                for (let i = 1; i < polygons.length; i++) {
                                    const unionResult = turf.union(turf.featureCollection([merged, polygons[i]]));
                                    if (unionResult) merged = unionResult;
                                }
                                analysisArea = merged;
                            } catch {
                                const hull = turf.convex(turf.featureCollection(polygons));
                                analysisArea = hull || polygons[0];
                            }
                        }

                        mapService.showTempFeature(analysisArea, 15000);
                        return { analysisArea, areaSource: 'layer' };
                    },
                    onRun: async ({ targetLayerId, analysisArea, spatialRelation }) => {
                        const targetLayer = getLayers().find((layer) => layer.id === targetLayerId);
                        if (!targetLayer?.geojson?.features?.length) {
                            throw new Error('Target layer has no features.');
                        }

                        const { matchedFeatures, stats } = await runSpatialAnalysis({
                            features: targetLayer.geojson.features,
                            analysisArea,
                            spatialRelation
                        });

                        mapService.showTempFeature(
                            { type: 'FeatureCollection', features: matchedFeatures },
                            15000
                        );

                        return {
                            matched: matchedFeatures.length,
                            total: targetLayer.geojson.features.length,
                            features: matchedFeatures,
                            stats,
                            targetLayerName: targetLayer.name
                        };
                    },
                    onAddResults: (result) => {
                        if (!result?.features?.length) {
                            showToast('No matching features to add', 'warning');
                            return;
                        }

                        const featureCollection = {
                            type: 'FeatureCollection',
                            features: result.features
                        };
                        const dataset = createSpatialDataset(
                            `${result.targetLayerName}_analysis_results`,
                            featureCollection,
                            { format: 'derived' }
                        );
                        addLayer(dataset);
                        mapService.addLayer(dataset, getLayers().indexOf(dataset), { fit: true });
                        refreshUI();
                        showToast(`Added ${result.matched} matched features as a new layer`, 'success');
                    },
                    onAddArea: ({ analysisArea, areaSource }) => {
                        if (!analysisArea) {
                            showToast('No analysis area available', 'warning');
                            return;
                        }
                        const featureCollection = {
                            type: 'FeatureCollection',
                            features: [
                                {
                                    ...analysisArea,
                                    properties: {
                                        ...(analysisArea.properties || {}),
                                        name: 'Analysis Area',
                                        source: areaSource || 'draw'
                                    }
                                }
                            ]
                        };
                        const dataset = createSpatialDataset('Analysis_Area', featureCollection, { format: 'derived' });
                        addLayer(dataset);
                        mapService.addLayer(dataset, getLayers().indexOf(dataset), { fit: true });
                        refreshUI();
                        showToast('Analysis area added as new layer', 'success');
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    if (!_spatialAnalyzerWidget) {
        _spatialAnalyzerWidget = new SpatialAnalyzerWidget();
    }
    // Inject dependencies
    _spatialAnalyzerWidget.getLayers = getLayers;
    _spatialAnalyzerWidget.getLayerById = (id) => getLayers().find(l => l.id === id);
    _spatialAnalyzerWidget.mapService = mapService;
    _spatialAnalyzerWidget.addLayer = addLayer;
    _spatialAnalyzerWidget.createSpatialDataset = createSpatialDataset;
    _spatialAnalyzerWidget.refreshUI = refreshUI;
    _spatialAnalyzerWidget.showToast = showToast;
    _spatialAnalyzerWidget.toggle();
}

let _bulkUpdateWidget = null;

function openBulkUpdate() {
    if (_isReactToolDialogs) {
        const rootId = `bulk-update-react-${Date.now()}`;
        const spatialLayers = (getLayers() || []).filter((layer) => layer.type === 'spatial');
        const layerOptions = spatialLayers.map((layer) => {
            const fields = new Set();
            (layer.geojson?.features || []).slice(0, 200).forEach((feature) => {
                Object.keys(feature?.properties || {}).forEach((key) => fields.add(key));
            });
            return {
                id: layer.id,
                name: layer.name,
                featureCount: layer.geojson?.features?.length || 0,
                fields: [...fields].sort()
            };
        });

        showModal('Bulk Update', `<div id="${rootId}"></div>`, {
            width: '560px',
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountBulkUpdateDialog } = await import('../react/tools/mountBulkUpdateDialog.jsx');

                const mounted = mountBulkUpdateDialog(root, {
                    layers: layerOptions,
                    onCancel: () => {
                        mapService.exitSelectionMode();
                        updateSelectionUI();
                        close();
                    },
                    onStartSelection: (layerId) => {
                        if (!layerId) return;
                        setActiveLayer(layerId);
                        refreshUI();
                        mapService.enterSelectionMode();
                        updateSelectionUI();
                        showToast('Click features on the map to select them', 'info');
                    },
                    onStopSelection: () => {
                        mapService.exitSelectionMode();
                        updateSelectionUI();
                    },
                    onSelectAll: (layerId) => {
                        const layer = getLayers().find((entry) => entry.id === layerId);
                        if (!layer) return;
                        mapService.selectAll(layer.id, layer.geojson);
                        updateSelectionUI();
                    },
                    onInvertSelection: (layerId) => {
                        const layer = getLayers().find((entry) => entry.id === layerId);
                        if (!layer) return;
                        mapService.invertSelection(layer.id, layer.geojson);
                        updateSelectionUI();
                    },
                    onClearSelection: (layerId) => {
                        mapService.clearSelection(layerId || null);
                        updateSelectionUI();
                    },
                    onGetSelectionCount: (layerId) => {
                        if (!layerId) return 0;
                        return mapService.getSelectionCount(layerId) || 0;
                    },
                    onApply: ({ layerId, updates }) => {
                        const layer = getLayers().find((entry) => entry.id === layerId);
                        if (!layer?.geojson?.features) throw new Error('Target layer not found.');

                        const selectedIndices = mapService.getSelectedIndices(layer.id) || [];
                        if (selectedIndices.length === 0) {
                            throw new Error('No selected features found for this layer.');
                        }

                        const safeUpdates = (updates || []).filter((entry) => entry?.field);
                        if (safeUpdates.length === 0) {
                            throw new Error('Add at least one field update.');
                        }

                        let updatedCount = 0;
                        selectedIndices.forEach((index) => {
                            const feature = layer.geojson.features[index];
                            if (!feature) return;
                            if (!feature.properties) feature.properties = {};

                            safeUpdates.forEach((entry) => {
                                const rawValue = entry.value ?? '';
                                if (rawValue === '') {
                                    feature.properties[entry.field] = '';
                                } else if (!Number.isNaN(Number(rawValue)) && String(rawValue).trim() !== '') {
                                    feature.properties[entry.field] = Number(rawValue);
                                } else {
                                    feature.properties[entry.field] = rawValue;
                                }
                            });
                            updatedCount++;
                        });

                        mapService.refreshLayerData(layer);
                        mapService.clearSelection(layer.id);
                        mapService.exitSelectionMode();
                        updateSelectionUI();
                        refreshUI();

                        const fieldCount = safeUpdates.length;
                        showToast(
                            `Updated ${fieldCount} field${fieldCount === 1 ? '' : 's'} on ${updatedCount} feature${updatedCount === 1 ? '' : 's'}`,
                            'success'
                        );
                        return { fieldCount, updatedCount };
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    if (!_bulkUpdateWidget) {
        _bulkUpdateWidget = new BulkUpdateWidget();
    }
    _bulkUpdateWidget.getLayers = getLayers;
    _bulkUpdateWidget.getLayerById = (id) => getLayers().find(l => l.id === id);
    _bulkUpdateWidget.mapService = mapService;
    _bulkUpdateWidget.refreshUI = refreshUI;
    _bulkUpdateWidget.showToast = showToast;
    _bulkUpdateWidget.toggle();
}

let _proximityJoinWidget = null;

function openProximityJoin() {
    if (_isReactToolDialogs) {
        const rootId = `proximity-join-react-${Date.now()}`;
        const spatialLayers = (getLayers() || []).filter((layer) => layer.type === 'spatial');
        const layerOptions = spatialLayers.map((layer) => {
            const keys = new Set();
            (layer.geojson?.features || []).slice(0, 200).forEach((feature) => {
                Object.keys(feature?.properties || {}).forEach((key) => keys.add(key));
            });
            return {
                id: layer.id,
                name: layer.name,
                featureCount: layer.geojson?.features?.length || 0,
                fields: [...keys].sort(),
                selectedCount: mapService.getSelectionCount?.(layer.id) || 0
            };
        });

        showModal('Proximity Join', `<div id="${rootId}"></div>`, {
            width: '560px',
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountProximityJoinDialog } = await import('../react/tools/mountProximityJoinDialog.jsx');
                const { UNIT_LABELS, validateProximityJoinConfig, buildProximityPreview, runProximityJoin, unitAbbr } = await import('./widgets/proximity-join-engine.js');
                const mounted = mountProximityJoinDialog(root, {
                    layers: layerOptions,
                    unitOptions: UNIT_LABELS.map((entry) => ({
                        value: entry.value,
                        label: `${entry.label} (${entry.abbr})`
                    })),
                    onCancel: () => close(),
                    onPreview: async (config) => {
                        const sourceLayer = getLayers().find((layer) => layer.id === config.sourceLayerId);
                        const targetLayer = getLayers().find((layer) => layer.id === config.targetLayerId);
                        const validation = validateProximityJoinConfig({
                            sourceLayer,
                            targetLayer,
                            fieldMappings: config.fieldMappings,
                            maxRadius: config.maxRadius,
                            writeMatchId: config.writeMatchId,
                            matchIdField: config.matchIdField
                        });
                        if (validation.errors.length > 0) {
                            throw new Error(validation.errors[0]);
                        }

                        const sourceFeatures = config.selectionOnly
                            ? (mapService.getSelectedIndices?.(sourceLayer.id) || [])
                                .map((index) => sourceLayer.geojson.features[index])
                                .filter(Boolean)
                            : sourceLayer.geojson.features;

                        return buildProximityPreview({
                            sourceFeatures,
                            targetFeatures: targetLayer.geojson.features,
                            fieldMappings: validation.validMappings,
                            units: config.units,
                            maxRadius: config.maxRadius,
                            writeDistance: config.writeDistance
                        });
                    },
                    onRun: async (config, handlers = {}) => {
                        const sourceLayer = getLayers().find((layer) => layer.id === config.sourceLayerId);
                        const targetLayer = getLayers().find((layer) => layer.id === config.targetLayerId);
                        const validation = validateProximityJoinConfig({
                            sourceLayer,
                            targetLayer,
                            fieldMappings: config.fieldMappings,
                            maxRadius: config.maxRadius,
                            writeMatchId: config.writeMatchId,
                            matchIdField: config.matchIdField
                        });
                        if (validation.errors.length > 0) {
                            throw new Error(validation.errors[0]);
                        }

                        const featureIndices = config.selectionOnly
                            ? (mapService.getSelectedIndices?.(sourceLayer.id) || [])
                            : sourceLayer.geojson.features.map((_, index) => index);

                        if (featureIndices.length === 0) {
                            throw new Error(config.selectionOnly
                                ? 'No selected source features found.'
                                : 'Source layer has no features.');
                        }

                        const result = await runProximityJoin({
                            allSourceFeatures: sourceLayer.geojson.features,
                            featureIndices,
                            targetFeatures: targetLayer.geojson.features,
                            fieldMappings: validation.validMappings,
                            units: config.units,
                            maxRadius: config.maxRadius,
                            writeDistance: config.writeDistance,
                            writeMatchId: config.writeMatchId,
                            matchIdField: config.matchIdField,
                            writeMatchLayer: config.writeMatchLayer,
                            targetLayerName: targetLayer.name,
                            onProgress: handlers.onProgress,
                            isCancelled: handlers.isCancelled
                        });

                        if (result.cancelled) {
                            showToast('Proximity join cancelled', 'warning');
                            return result;
                        }

                        sourceLayer.schema = analyzeSchema(sourceLayer.geojson);
                        mapService.refreshLayerData?.(sourceLayer);
                        refreshUI();
                        showToast(
                            `Proximity join complete: ${result.matched} matched, ${result.unmatched} unmatched`,
                            result.unmatched === 0 ? 'success' : 'info'
                        );

                        return {
                            ...result,
                            unitsLabel: unitAbbr(config.units)
                        };
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    if (!_proximityJoinWidget) {
        _proximityJoinWidget = new ProximityJoinWidget();
    }
    _proximityJoinWidget.getLayers = getLayers;
    _proximityJoinWidget.getLayerById = (id) => getLayers().find(l => l.id === id);
    _proximityJoinWidget.mapService = mapService;
    _proximityJoinWidget.analyzeSchema = analyzeSchema;
    _proximityJoinWidget.refreshUI = refreshUI;
    _proximityJoinWidget.showToast = showToast;
    _proximityJoinWidget.toggle();
}

// ============================
// Import Fence
// ============================
let _fenceBbox = null; // [west, south, east, north] when fence is active

function hasActiveImportFence() {
    return !!_fenceBbox || mapService.hasImportFence();
}

async function startImportFence() {
    if (dualScreenCoordinator.isActive) {
        if (hasActiveImportFence()) {
            if (_isReactToolDialogs) {
                const rootId = `import-fence-react-${Date.now()}`;
                showModal('Import Fence', `<div id="${rootId}"></div>`, {
                    width: '400px',
                    onMount: async (overlay, close) => {
                        const root = overlay.querySelector(`#${rootId}`);
                        if (!root) return;
                        const { mountImportFenceOptionsDialog } = await import('../react/tools/mountImportFenceOptionsDialog.jsx');
                        const mounted = mountImportFenceOptionsDialog(root, {
                            message: '⛶ An import fence is currently active. All imports are filtered to this area.',
                            onPlaceNewFence: () => {
                                close();
                                dualScreenCoordinator.broadcastDrawCmd({ action: 'startFence' });
                                dualScreenCoordinator.focusMapWindow();
                                showToast('Draw the fence on the Dual Screen map window', 'info');
                            },
                            onRemoveFence: () => {
                                _fenceBbox = null;
                                updateFenceButton();
                                dualScreenCoordinator.broadcastDrawCmd({ action: 'clearFence' });
                                close();
                                showToast('Import fence removed', 'info');
                            }
                        });
                        watchOverlayUnmount(overlay, () => mounted.unmount?.());
                    }
                });
                return;
            }

            const html = `
            <div class="info-box text-xs mb-8">
                ⛶ An import fence is currently active. All imports are filtered to this area.
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                <button class="btn btn-primary" id="fence-opt-new" style="padding:10px 16px;">⛶ Place New Fence</button>
                <button class="btn btn-secondary" id="fence-opt-clear" style="padding:10px 16px;">🗑️ Remove Fence</button>
            </div>`;
            showModal('Import Fence', html, {
                width: '400px',
                onMount: (overlay, close) => {
                    overlay.querySelector('#fence-opt-new').addEventListener('click', async () => {
                        close();
                        dualScreenCoordinator.broadcastDrawCmd({ action: 'startFence' });
                        dualScreenCoordinator.focusMapWindow();
                        showToast('Draw the fence on the Dual Screen map window', 'info');
                    });
                    overlay.querySelector('#fence-opt-clear').addEventListener('click', () => {
                        _fenceBbox = null;
                        updateFenceButton();
                        dualScreenCoordinator.broadcastDrawCmd({ action: 'clearFence' });
                        close();
                        showToast('Import fence removed', 'info');
                    });
                }
            });
            return;
        }
        dualScreenCoordinator.broadcastDrawCmd({ action: 'startFence' });
        dualScreenCoordinator.focusMapWindow();
        showToast('Draw the import fence on the Dual Screen map window', 'info');
        return;
    }

    // If fence already active, show options modal
    if (mapService.hasImportFence()) {
        if (_isReactToolDialogs) {
            const rootId = `import-fence-react-${Date.now()}`;
            showModal('Import Fence', `<div id="${rootId}"></div>`, {
                width: '400px',
                onMount: async (overlay, close) => {
                    const root = overlay.querySelector(`#${rootId}`);
                    if (!root) return;
                    const { mountImportFenceOptionsDialog } = await import('../react/tools/mountImportFenceOptionsDialog.jsx');
                    const mounted = mountImportFenceOptionsDialog(root, {
                        message: '⛶ An import fence is currently active on the map. All imports (files and ArcGIS) are filtered to this area.',
                        placeNewDescription: 'Remove current fence and draw a new one',
                        clearDescription: 'Clear fence from map — imports will no longer be filtered',
                        onPlaceNewFence: async () => {
                            close();
                            await drawNewFence();
                        },
                        onRemoveFence: () => {
                            mapService.clearImportFence();
                            _fenceBbox = null;
                            updateFenceButton();
                            close();
                            showToast('Import fence removed', 'info');
                        }
                    });
                    watchOverlayUnmount(overlay, () => mounted.unmount?.());
                }
            });
            return;
        }

        const html = `
            <div class="info-box text-xs mb-8">
                ⛶ An import fence is currently active on the map. All imports (files and ArcGIS) are filtered to this area.
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                <button class="btn btn-primary" id="fence-opt-new" style="padding:10px 16px;">
                    ⛶ Place New Fence
                    <div style="font-size:11px;opacity:0.7;margin-top:2px;">Remove current fence and draw a new one</div>
                </button>
                <button class="btn btn-secondary" id="fence-opt-clear" style="padding:10px 16px;">
                    🗑️ Remove Fence
                    <div style="font-size:11px;opacity:0.7;margin-top:2px;">Clear fence from map — imports will no longer be filtered</div>
                </button>
            </div>`;

        showModal('Import Fence', html, {
            width: '400px',
            onMount: (overlay, close) => {
                overlay.querySelector('#fence-opt-new').addEventListener('click', async () => {
                    close();
                    await drawNewFence();
                });
                overlay.querySelector('#fence-opt-clear').addEventListener('click', () => {
                    mapService.clearImportFence();
                    _fenceBbox = null;
                    updateFenceButton();
                    close();
                    showToast('Import fence removed', 'info');
                });
            }
        });
        return;
    }

    // No fence yet — draw one
    await drawNewFence();
}

async function drawNewFence() {
    const bbox = await mapService.startImportFenceDraw();
    if (!bbox) {
        showToast('Fence cancelled', 'info');
        return;
    }
    _fenceBbox = bbox;
    updateFenceButton();
    showToast('Import fence placed — all imports will be filtered to this area', 'success');
}

function updateFenceButton() {
    const btn = document.getElementById('btn-fence');
    if (!btn) return;
    if (hasActiveImportFence()) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        btn.innerHTML = '<span class="btn-icon-text">⛶</span><span>Import Fence ✓</span>';
    } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        btn.innerHTML = '<span class="btn-icon-text">⛶</span><span>Import Fence</span>';
    }
}

/** Filter a spatial dataset's features to only those intersecting a bbox */
function filterDatasetByFence(dataset, bbox) {
    if (!bbox || dataset.type !== 'spatial' || !dataset.geojson?.features?.length) return dataset;

    const [west, south, east, north] = bbox;
    const fencePoly = turf.bboxPolygon([west, south, east, north]);

    const before = dataset.geojson.features.length;
    dataset.geojson.features = dataset.geojson.features.filter(f => {
        try {
            return turf.booleanIntersects(f, fencePoly);
        } catch (_) {
            return true; // keep features that fail the check
        }
    });
    const after = dataset.geojson.features.length;

    if (before !== after) {
        logger.info('ImportFence', `Filtered ${before} → ${after} features (${before - after} outside fence)`);
        // Re-analyze schema since feature count changed
        dataset.schema = analyzeSchema(dataset.geojson);
    }

    return dataset;
}

// ============================
// ArcGIS REST Importer modal
// ============================
async function openArcGISImporter() {
    const spatialFilter = mapService.getImportFenceEsriEnvelope();
    const fenceBadge = spatialFilter ? '<div class="success-box text-xs mb-8" style="padding:6px 10px;">⛶ <strong>Import Fence active</strong> — only features inside the fence will be downloaded from the server.</div>' : '';

    if (_isReactToolDialogs) {
        const rootId = `arcgis-import-react-${Date.now()}`;
        showModal('ArcGIS REST Import', `<div id="${rootId}"></div>`, {
            width: '600px',
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const startImportLayer = ({ url, name, onProgress, onComplete, onCancelled, onError }) => {
                    if (!url) {
                        showToast('Enter a URL', 'warning');
                        onError?.();
                        return null;
                    }

                    let arcgisTask = null;
                    let onArcgisProgress = null;
                    let finished = false;

                    const finishOnce = (cb) => {
                        if (finished) return;
                        finished = true;
                        cb?.();
                    };

                    const cleanup = () => {
                        if (onArcgisProgress) {
                            bus.off('task:progress', onArcgisProgress);
                            onArcgisProgress = null;
                        }
                    };

                    const run = async () => {
                        try {
                            onProgress?.({ percent: 0, step: `Connecting to ${name || 'layer'}...` });
                            const { TaskRunner } = await import('./core/task-runner.js');
                            arcgisTask = new TaskRunner(`Import ${name || 'layer'}`, 'ArcGIS');
                            onArcgisProgress = (data) => {
                                onProgress?.({
                                    percent: data?.percent || 0,
                                    step: data?.step || ''
                                });
                            };
                            bus.on('task:progress', onArcgisProgress);

                            await arcgisImporter.fetchMetadata(url);
                            const queryOpts = {
                                outFields: '*',
                                where: '1=1',
                                returnGeometry: true
                            };
                            if (spatialFilter) queryOpts.spatialFilter = spatialFilter;
                            const dataset = await arcgisImporter.downloadFeatures(queryOpts, arcgisTask);

                            if (!dataset || arcgisTask.cancelled) {
                                finishOnce(onCancelled);
                                return;
                            }

                            addLayer(dataset);
                            mapService.addLayer(dataset, getLayers().indexOf(dataset), { fit: true });
                            const count = dataset.type === 'spatial' ? dataset.geojson.features.length : dataset.rows.length;
                            showToast(`Imported ${count.toLocaleString()} features: ${dataset.name}`, 'success');
                            refreshUI();
                            finishOnce(() => onComplete?.({ datasetName: dataset.name, count }));
                        } catch (e) {
                            if (e?.cancelled || arcgisTask?.cancelled) {
                                finishOnce(onCancelled);
                                return;
                            }
                            const classified = handleError(e, 'ArcGIS', 'Import');
                            showErrorToast(classified);
                            finishOnce(() => onError?.(classified));
                        } finally {
                            cleanup();
                        }
                    };

                    void run();
                    return () => {
                        arcgisTask?.cancel();
                        arcgisImporter.cancel();
                        cleanup();
                        finishOnce(onCancelled);
                    };
                };

                const { mountArcGISImporterDialog } = await import('../react/tools/mountArcGISImporterDialog.jsx');
                const mounted = mountArcGISImporterDialog(root, {
                    endpoints: ARCGIS_ENDPOINTS,
                    hasImportFence: !!spatialFilter,
                    onCancel: () => close(),
                    onImport: startImportLayer
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const html = `
        ${fenceBadge}
        <div class="info-box text-xs mb-8">
            Select a layer from the list below or enter a custom ArcGIS REST URL. Only publicly accessible layers are supported (no login required).
        </div>

        <!-- Preset layer list -->
        <div style="max-height:45vh;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:12px;" id="arcgis-preset-list">
            ${ARCGIS_ENDPOINTS.map((l, i) => `
                <div class="arcgis-preset-item" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-surface);">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.name}</div>
                        <div style="font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${l.url}">${l.url}</div>
                    </div>
                    <button class="btn btn-sm btn-primary arcgis-import-btn" data-url="${l.url}" data-name="${l.name}" style="flex-shrink:0;">Import</button>
                </div>
            `).join('')}
        </div>

        <!-- Custom URL -->
        <div style="border-top:1px solid var(--border);padding-top:12px;">
            <div class="form-group" style="margin-bottom:8px;">
                <label style="font-weight:600;font-size:13px;">Custom URL</label>
                <input type="url" id="arcgis-custom-url" placeholder="https://services.arcgis.com/.../FeatureServer/0">
            </div>
            <button class="btn btn-primary" id="arcgis-custom-import">Import from URL</button>
        </div>

        <!-- Download progress (hidden by default) -->
        <div id="arcgis-progress" class="hidden mt-8">
            <div style="text-align:center;">
                <div class="spinner" style="margin:0 auto 12px;"></div>
                <div id="arcgis-progress-text">Starting download...</div>
                <div class="progress-bar-container mt-8">
                    <div class="progress-bar-fill" id="arcgis-progress-bar" style="width:0%"></div>
                    <div class="progress-bar-text" id="arcgis-progress-pct">0%</div>
                </div>
                <button class="btn btn-secondary btn-sm mt-8" id="arcgis-cancel">Cancel</button>
            </div>
        </div>`;

    showModal('ArcGIS REST Import', html, {
        width: '600px',
        onMount: (overlay, close) => {

            // Shared import function
            async function importLayer(url, name, statusEl) {
                const progressEl = overlay.querySelector('#arcgis-progress');
                const progressText = overlay.querySelector('#arcgis-progress-text');
                const progressBar = overlay.querySelector('#arcgis-progress-bar');
                const progressPct = overlay.querySelector('#arcgis-progress-pct');

                // Show progress
                progressEl.classList.remove('hidden');
                progressBar.style.width = '0%';
                progressPct.textContent = '0%';
                progressText.textContent = `Connecting to ${name || 'layer'}...`;

                const { TaskRunner } = await import('./core/task-runner.js');
                const arcgisTask = new TaskRunner(`Import ${name || 'layer'}`, 'ArcGIS');
                const onArcgisProgress = (data) => {
                    if (progressBar) progressBar.style.width = data.percent + '%';
                    if (progressPct) progressPct.textContent = Math.round(data.percent) + '%';
                    if (progressText) progressText.textContent = data.step || '';
                };
                bus.on('task:progress', onArcgisProgress);

                overlay.querySelector('#arcgis-cancel')?.addEventListener('click', () => {
                    arcgisTask.cancel();
                    arcgisImporter.cancel();
                    bus.off('task:progress', onArcgisProgress);
                    showToast('Download cancelled', 'warning');
                    progressEl.classList.add('hidden');
                });

                try {
                    await arcgisImporter.fetchMetadata(url);
                    const queryOpts = {
                        outFields: '*', where: '1=1', returnGeometry: true
                    };
                    if (spatialFilter) queryOpts.spatialFilter = spatialFilter;
                    const dataset = await arcgisImporter.downloadFeatures(queryOpts, arcgisTask);
                    bus.off('task:progress', onArcgisProgress);

                    if (!dataset || arcgisTask.cancelled) {
                        progressEl.classList.add('hidden');
                        if (statusEl) {
                            statusEl.textContent = 'Import';
                            statusEl.disabled = false;
                        }
                        return;
                    }
                    addLayer(dataset);
                    mapService.addLayer(dataset, getLayers().indexOf(dataset), { fit: true });
                    const count = dataset.type === 'spatial' ? dataset.geojson.features.length : dataset.rows.length;
                    showToast(`Imported ${count.toLocaleString()} features: ${dataset.name}`, 'success');
                    refreshUI();
                    if (statusEl) {
                        statusEl.textContent = '✅ Done';
                        statusEl.classList.remove('btn-primary');
                        statusEl.classList.add('btn-secondary');
                        statusEl.disabled = true;
                    }
                    progressEl.classList.add('hidden');
                } catch (e) {
                    bus.off('task:progress', onArcgisProgress);
                    progressEl.classList.add('hidden');
                    if (e?.cancelled || arcgisTask.cancelled) return;
                    const classified = handleError(e, 'ArcGIS', 'Import');
                    showErrorToast(classified);
                    if (statusEl) {
                        statusEl.textContent = 'Import';
                        statusEl.disabled = false;
                    }
                }
            }

            // Wire preset Import buttons
            overlay.querySelectorAll('.arcgis-import-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    btn.disabled = true;
                    btn.textContent = 'Loading...';
                    importLayer(btn.dataset.url, btn.dataset.name, btn);
                });
            });

            // Wire custom URL import
            overlay.querySelector('#arcgis-custom-import').addEventListener('click', () => {
                const url = overlay.querySelector('#arcgis-custom-url').value.trim();
                if (!url) return showToast('Enter a URL', 'warning');
                const customBtn = overlay.querySelector('#arcgis-custom-import');
                customBtn.disabled = true;
                customBtn.textContent = 'Loading...';
                importLayer(url, 'Custom Layer', customBtn).finally(() => {
                    customBtn.disabled = false;
                    customBtn.textContent = 'Import from URL';
                });
            });
        }
    });
}

function _escapeHtmlModal(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * After importing KML with NetworkLink but no features, offer best-effort fetch of http(s) links.
 */
async function _promptNetworkLinkAfterImport(dataset) {
    const hrefs = dataset._networkLinkHrefs || [];
    if (!hrefs.length) return;

    if (_isReactToolDialogs) {
        const rootId = `network-links-react-${Date.now()}`;
        await showModal('Network links in KML', `<div id="${rootId}"></div>`, {
            width: '520px',
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountNetworkLinksDialog } = await import('../react/tools/mountNetworkLinksDialog.jsx');
                const mounted = mountNetworkLinksDialog(root, {
                    hrefs,
                    onDismiss: () => close(),
                    onFetch: async () => {
                        try {
                            const { mergeNetworkLinksIntoDataset } = await import('./import/kml-networklink.js');
                            const { TaskRunner } = await import('./core/task-runner.js');
                            const task = new TaskRunner('Network links', 'Import');
                            const { failures, skippedRelative, addedFeatures, totalFeatures } =
                                await mergeNetworkLinksIntoDataset(dataset, hrefs, task);

                            const layerIdx = getLayers().indexOf(dataset);
                            mapService.removeLayer(dataset.id);
                            mapService.addLayer(dataset, Math.max(0, layerIdx), { fit: totalFeatures > 0 });
                            refreshUI();

                            let msg = `Merged network links: ${addedFeatures} new feature(s); ${totalFeatures} total in layer.`;
                            if (skippedRelative.length) {
                                msg += ` Skipped ${skippedRelative.length} relative URL(s).`;
                            }
                            if (failures.length) {
                                showToast(`${msg} ${failures.length} link(s) failed (see log).`, 'warning');
                                failures.forEach(f => logger.warn('Import', 'NetworkLink fetch failed', { href: f.href, reason: f.reason }));
                            } else if (skippedRelative.length) {
                                showToast(msg, 'warning');
                            } else {
                                showToast(msg, 'success');
                            }
                        } catch (e) {
                            showErrorToast(handleError(e, 'Import', 'networklink'));
                        } finally {
                            close();
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const list = hrefs.map(h =>
        `<li style="word-break:break-all;font-size:11px;">${_escapeHtmlModal(h)}</li>`
    ).join('');

    const html = `<p>This KML references external content via <strong>NetworkLink</strong>. In the browser, only URLs that allow cross-origin access can be loaded automatically; many public servers block this.</p>
        <ul style="max-height:180px;overflow:auto;margin:8px 0;padding-left:18px;">${list}</ul>
        <p class="text-xs text-muted">Only <code>http:</code> / <code>https:</code> links are fetched here. Paths inside a KMZ are not resolved from this dialog.</p>`;

    await showModal('Network links in KML', html, {
        width: '520px',
        footer: `<button type="button" class="btn btn-secondary nl-dismiss">Not now</button>
                 <button type="button" class="btn btn-primary nl-fetch">Fetch HTTP(S) links</button>`,
        onMount: (overlay, close) => {
            overlay.querySelector('.nl-dismiss')?.addEventListener('click', () => close());
            overlay.querySelector('.nl-fetch')?.addEventListener('click', async () => {
                const btn = overlay.querySelector('.nl-fetch');
                btn.disabled = true;
                btn.textContent = 'Fetching…';
                try {
                    const { mergeNetworkLinksIntoDataset } = await import('./import/kml-networklink.js');
                    const { TaskRunner } = await import('./core/task-runner.js');
                    const task = new TaskRunner('Network links', 'Import');
                    const { failures, skippedRelative, addedFeatures, totalFeatures } =
                        await mergeNetworkLinksIntoDataset(dataset, hrefs, task);

                    const layerIdx = getLayers().indexOf(dataset);
                    mapService.removeLayer(dataset.id);
                    mapService.addLayer(dataset, Math.max(0, layerIdx), { fit: totalFeatures > 0 });
                    refreshUI();

                    let msg = `Merged network links: ${addedFeatures} new feature(s); ${totalFeatures} total in layer.`;
                    if (skippedRelative.length) {
                        msg += ` Skipped ${skippedRelative.length} relative URL(s).`;
                    }
                    if (failures.length) {
                        showToast(`${msg} ${failures.length} link(s) failed (see log).`, 'warning');
                        failures.forEach(f => logger.warn('Import', 'NetworkLink fetch failed', { href: f.href, reason: f.reason }));
                    } else if (skippedRelative.length) {
                        showToast(msg, 'warning');
                    } else {
                        showToast(msg, 'success');
                    }
                } catch (e) {
                    showErrorToast(handleError(e, 'Import', 'networklink'));
                } finally {
                    close();
                }
            });
        }
    });
}

// ============================
// Export handler
// ============================
async function doExport(format) {
    const layer = getActiveLayer();
    if (!layer) return showToast('No active layer', 'warning');

    // KML/KMZ with 2+ layers: offer multi-layer export
    const allLayers = getLayers().filter(l => l.type === 'spatial');
    if ((format === 'kmz' || format === 'kml') && allLayers.length >= 2) {
        const choice = await _showKmzExportPicker(allLayers, layer, format);
        if (choice === null) return; // cancelled
        if (choice === 'active') {
            // fall through to single-layer export below
        } else if (Array.isArray(choice)) {
            // Multi-layer export — honor chosen format (KML vs KMZ)
            try {
                const layerData = choice.map(ds => ({
                    dataset: ds,
                    style: mapService.getLayerStyle(ds.id) || {}
                }));
                const fname = choice.length === allLayers.length ? 'All_Layers' : choice.map(l => l.name).join('_').slice(0, 60);
                if (format === 'kml') {
                    await exportMultiLayerKMLFile(layerData, { filename: fname });
                    showToast(`Exported ${choice.length} layers as KML`, 'success');
                } else {
                    await exportMultiLayerKMZFile(layerData, { filename: fname });
                    showToast(`Exported ${choice.length} layers as KMZ`, 'success');
                }
            } catch (e) {
                showErrorToast(handleError(e, 'Export', 'multi-kml-kmz'));
            }
            return;
        }
    }

    const state = getState();
    let ds = layer;

    if (state.agolCompatMode) {
        const { nameMapping } = checkAGOLCompatibility(layer);
        ds = applyAGOLFixes(layer, nameMapping);
    }

    try {
        await exportDataset(ds, format);
    } catch (e) {
        showErrorToast(handleError(e, 'Export', format));
    }
}

/**
 * Show KMZ/KML export picker: active layer only, or select multiple layers for folders.
 * Returns 'active', array of selected datasets, or null (cancelled).
 */
async function _showKmzExportPicker(allLayers, activeLayer, format) {
    const fmtLabel = format.toUpperCase();
    const ext = format === 'kml' ? 'kml' : 'kmz';

    if (_isReactToolDialogs) {
        const rootId = `kml-export-picker-react-${Date.now()}`;
        const layers = allLayers.map((layer) => ({
            id: layer.id,
            name: layer.name,
            featureCount: layer.geojson?.features?.length || 0
        }));
        return showModal(`Export ${fmtLabel}`, `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountKmlExportPickerDialog } = await import('../react/tools/mountKmlExportPickerDialog.jsx');
                const mounted = mountKmlExportPickerDialog(root, {
                    layers,
                    activeLayerId: activeLayer.id,
                    activeLayerName: activeLayer.name,
                    ext,
                    onCancel: () => close(null),
                    onActiveOnly: () => close('active'),
                    onWarnNoSelection: () => showToast('Select at least 1 layer', 'warning'),
                    onExportSelected: (selectedLayerIds) => {
                        const selected = allLayers.filter((layer) => selectedLayerIds.includes(layer.id));
                        close(selected);
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
    }

    const checkboxes = allLayers.map((l, i) => {
        const featCount = l.geojson?.features?.length || 0;
        const safeName = l.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const isActive = l.id === activeLayer.id;
        return `<label class="merge-layer-item">
            <input type="checkbox" value="${i}" checked>
            <span>${safeName}${isActive ? ' <small style="color:var(--primary)">(active)</small>' : ''}</span>
            <span class="merge-feat-count">${featCount}</span>
        </label>`;
    }).join('');

    const html = `
        <p style="margin-bottom:12px;">Export <strong>${activeLayer.name}</strong> only, or select layers to combine into a single <strong>.${ext}</strong> with one folder per layer.</p>
        <div class="merge-layer-list" id="kmz-layer-list">${checkboxes}</div>`;

    return showModal(`Export ${fmtLabel}`, html, {
        footer: `<button class="btn btn-secondary cancel-btn">Cancel</button>
                 <button class="btn btn-secondary active-only-btn">Active layer only</button>
                 <button class="btn btn-primary multi-btn">Export selected (multi-folder)</button>`,
        onMount: (overlay, close) => {
            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close(null));
            overlay.querySelector('.active-only-btn')?.addEventListener('click', () => close('active'));
            overlay.querySelector('.multi-btn')?.addEventListener('click', () => {
                const checked = [...overlay.querySelectorAll('#kmz-layer-list input:checked')]
                    .map(cb => allLayers[parseInt(cb.value)]);
                if (checked.length === 0) { showToast('Select at least 1 layer', 'warning'); return; }
                close(checked);
            });
        }
    });
}

// ============================
// Other handlers
// ============================

// ——— Draw Layer ———
function createDrawLayer() {
    const activeLayer = getActiveLayer();
    const hasActiveSpatial = activeLayer && activeLayer.type === 'spatial';

    const items = [
        { icon: '🆕', label: 'New draw layer', desc: 'Create an empty layer and start drawing', action: 'new' },
    ];
    if (hasActiveSpatial) {
        items.push({ icon: '📝', label: `Draw on "${activeLayer.name}"`, desc: 'Add features to the active layer', action: 'active' });
    }

    // If no active spatial layer, just create a new one directly
    if (!hasActiveSpatial) {
        _doCreateDrawLayer();
        return;
    }

    if (_isReactToolDialogs) {
        const rootId = `draw-layer-chooser-react-${Date.now()}`;
        showModal('Draw Features', `<div id="${rootId}"></div>`, {
            width: '380px',
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountDrawLayerChooserDialog } = await import('../react/tools/mountDrawLayerChooserDialog.jsx');
                const mounted = mountDrawLayerChooserDialog(root, {
                    options: items,
                    onChoose: (action) => {
                        close();
                        if (action === 'new') {
                            _doCreateDrawLayer();
                        } else {
                            openDrawTools(activeLayer.id);
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    const html = items.map(item =>
        `<button class="draw-option-btn" data-action="${item.action}">
            <span style="font-size:18px;">${item.icon}</span>
            <div><strong>${item.label}</strong><div style="font-size:11px;color:var(--text-muted);">${item.desc}</div></div>
        </button>`
    ).join('');

    showModal('Draw Features', `<div class="draw-options">${html}</div>`, {
        width: '380px',
        onMount: (overlay, close) => {
            overlay.querySelectorAll('.draw-option-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    close();
                    if (btn.dataset.action === 'new') {
                        _doCreateDrawLayer();
                    } else {
                        openDrawTools(activeLayer.id);
                    }
                });
            });
        }
    });
}

function _doCreateDrawLayer() {
    const geojson = { type: 'FeatureCollection', features: [] };
    const dataset = createSpatialDataset('Draw Layer', geojson, { format: 'draw' });
    dataset._isDrawLayer = true;
    addLayer(dataset);
    setActiveLayer(dataset.id);
    mapService.addLayer(dataset, getLayers().indexOf(dataset), { fit: false });
    refreshUI();
    _openDrawToolbarOnMap(dataset.id, dataset.name);
    showToast('Draw layer created — use the toolbar to draw features', 'success');
}

function openDrawTools(layerId) {
    const layer = getLayers().find(l => l.id === layerId);
    if (!layer || layer.type !== 'spatial') return showToast('Need a spatial layer', 'warning');
    setActiveLayer(layerId);
    refreshUI();
    _openDrawToolbarOnMap(layerId, layer.name);
}

function _openDrawToolbarOnMap(layerId, layerName) {
    if (dualScreenCoordinator.isActive) {
        dualScreenCoordinator.broadcastDrawCmd({ action: 'showToolbar', layerId, layerName });
        dualScreenCoordinator.focusMapWindow();
        dualScreenCoordinator.broadcastToast(`Draw on: ${layerName}`, 'info');
        return;
    }
    drawManager.showToolbar(layerId, layerName);
}

async function handleMergeLayers() {
    const layers = getLayers();
    if (layers.length < 2) return showToast('Need at least 2 layers to merge', 'warning');

    let result;
    if (_isReactToolDialogs) {
        const rootId = `merge-layers-react-${Date.now()}`;
        const mergeLayers = layers.map((layer, index) => ({
            index,
            name: layer.name,
            featureCount: layer.type === 'spatial' ? (layer.geojson?.features?.length || 0) : (layer.rows?.length || 0)
        }));
        result = await showModal('Merge Layers', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountMergeLayersDialog } = await import('../react/tools/mountMergeLayersDialog.jsx');
                const mounted = mountMergeLayersDialog(root, {
                    layers: mergeLayers,
                    onCancel: () => close(null),
                    onMerge: (selectedIndices) => close(selectedIndices)
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
    } else {
        const checkboxes = layers.map((l, i) => {
            const featCount = l.type === 'spatial' ? (l.geojson?.features?.length || 0) : (l.rows?.length || 0);
            const safeName = l.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            return `<label class="merge-layer-item">
            <input type="checkbox" value="${i}" checked>
            <span>${safeName}</span>
            <span class="merge-feat-count">${featCount} features</span>
        </label>`;
        }).join('');

        const html = `<p style="margin-bottom:8px;">Select layers to merge. A <code>source_file</code> field will be added.</p>
        <div class="merge-layer-list">${checkboxes}</div>`;

        result = await showModal('Merge Layers', html, {
            footer: '<button class="btn btn-secondary cancel-btn">Cancel</button> <button class="btn btn-primary confirm-btn">Merge Selected</button>',
            onMount: (overlay, close) => {
                overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close(null));
                overlay.querySelector('.confirm-btn')?.addEventListener('click', () => {
                    const checked = [...overlay.querySelectorAll('.merge-layer-list input:checked')]
                        .map(cb => parseInt(cb.value));
                    close(checked);
                });
            }
        });
    }

    if (!result || result.length < 2) {
        if (result && result.length === 1) showToast('Select at least 2 layers to merge', 'warning');
        return;
    }

    const selected = result.map(i => layers[i]);
    const merged = mergeDatasets(selected);
    addLayer(merged);
    mapService.addLayer(merged, getLayers().indexOf(merged), { fit: true });
    showToast(`Merged ${selected.length} layers → ${merged.geojson.features.length} features`, 'success');
    refreshUI();
}

function handleUndo() {
    const entry = undoHistory();
    if (entry) {
        const layer = getLayers().find(l => l.id === entry.layerId);
        if (layer && layer.type === 'spatial') {
            layer.geojson = JSON.parse(JSON.stringify(entry.snapshot));
            layer.schema = analyzeSchema(layer.geojson);
            mapService.addLayer(layer, getLayers().indexOf(layer));
            refreshUI();
            showToast('Undo', 'info', { duration: 1500 });
        } else if (layer && layer.type === 'table') {
            layer.rows = JSON.parse(JSON.stringify(entry.snapshot));
            layer.schema = analyzeTableSchema(layer.rows, Object.keys(layer.rows[0] || {}));
            refreshUI();
            showToast('Undo', 'info', { duration: 1500 });
        }
    }
}

function handleRedo() {
    const entry = redoHistory();
    if (entry) {
        const layer = getLayers().find(l => l.id === entry.layerId);
        if (layer && layer.type === 'spatial') {
            layer.geojson = JSON.parse(JSON.stringify(entry.snapshot));
            layer.schema = analyzeSchema(layer.geojson);
            mapService.addLayer(layer, getLayers().indexOf(layer));
            refreshUI();
            showToast('Redo', 'info', { duration: 1500 });
        } else if (layer && layer.type === 'table') {
            layer.rows = JSON.parse(JSON.stringify(entry.snapshot));
            layer.schema = analyzeTableSchema(layer.rows, Object.keys(layer.rows[0] || {}));
            refreshUI();
            showToast('Redo', 'info', { duration: 1500 });
        }
    }
}

// ============================
// Feature Editor — edit a single feature's attributes from popup
// ============================
function openFeatureEditor(layerId, featureIndex) {
    const layers = getLayers();
    const layer = layers.find(l => l.id === layerId);
    if (!layer || layer.type !== 'spatial') return showToast('Layer not found', 'warning');

    const feature = layer.geojson.features[featureIndex];
    if (!feature) return showToast('Feature not found', 'warning');

    const props = feature.properties || {};
    const fields = Object.keys(props).filter(k => !k.startsWith('_'));
    const schemaFields = layer.schema?.fields || [];
    const getFieldType = (name) => schemaFields.find(f => f.name === name)?.type || 'string';

    const _formatFileSize = (bytes) => {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    };

    const rowsHtml = fields.map(f => {
        const fieldType = getFieldType(f);
        let val = props[f];
        const isAtt = fieldType === 'attachment' || (val && typeof val === 'object' && val._att);

        if (isAtt) {
            const att = (val && val._att) ? val : null;
            const isImage = att?.type?.startsWith('image/');
            const previewHtml = att ? `
                <div class="att-preview-row" data-field="${f}" style="display:flex;align-items:center;gap:8px;padding:4px 0;">
                    ${isImage && att.dataUrl ? `<img src="${att.dataUrl}" style="max-width:60px;max-height:60px;border-radius:4px;border:1px solid var(--border);">` : '<span style="font-size:20px;">📎</span>'}
                    <span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${att.name}">${att.name}</span>
                    <span style="font-size:10px;color:var(--text-muted);">${_formatFileSize(att.size)}</span>
                    <button class="att-remove-btn btn btn-sm" data-field="${f}" style="font-size:10px;padding:2px 6px;color:var(--error);" title="Remove">✕</button>
                </div>` : '';
            return `<div class="form-group" style="margin-bottom:6px;">
                <label style="font-size:11px;color:var(--text-muted);">${f} <span style="opacity:0.6;font-size:9px;">(photo)</span></label>
                ${previewHtml}
                <label style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--bg-surface);border:1px dashed var(--border);border-radius:6px;cursor:pointer;font-size:12px;color:var(--text-muted);margin-top:2px;">
                    📷 ${att ? 'Replace Photo' : 'Choose Photo'}
                    <input type="file" class="feat-edit-file" data-field="${f}" accept="image/*" style="display:none;">
                </label>
                <span class="att-size-note" style="font-size:10px;color:var(--text-muted);margin-left:6px;">Max 10 MB · KML/KMZ only</span>
            </div>`;
        }

        if (val != null && typeof val === 'object') val = JSON.stringify(val);
        return `<div class="form-group" style="margin-bottom:6px;">
            <label style="font-size:11px;color:var(--text-muted);">${f}</label>
            <input type="text" class="feat-edit-input" data-field="${f}" value="${val != null ? String(val).replace(/"/g, '&quot;') : ''}" style="width:100%;font-size:13px;">
        </div>`;
    }).join('');

    const geomType = feature.geometry?.type || 'Unknown';
    const header = `<div class="text-xs text-muted mb-8" style="border-bottom:1px solid var(--border);padding-bottom:4px;margin-bottom:8px;">
        <strong>${layer.name}</strong> · Feature #${featureIndex + 1} · ${geomType}
    </div>`;

    const html = header + `<div style="max-height:400px;overflow-y:auto;">${rowsHtml}</div>`;

    showModal('Edit Feature', html, {
        width: '420px',
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Save</button>',
        onMount: (overlay, close) => {
            // Focus first input
            setTimeout(() => overlay.querySelector('.feat-edit-input')?.focus(), 50);

            // Track attachment changes during editing
            const attachmentUpdates = new Map();

            // Handle file inputs for photo attachment fields
            overlay.querySelectorAll('.feat-edit-file').forEach(input => {
                input.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (!file.type.startsWith('image/')) {
                        showToast('Only image files are supported', 'warning');
                        input.value = '';
                        return;
                    }
                    if (file.size > 10 * 1024 * 1024) {
                        showToast('Photo too large — max 10 MB', 'warning');
                        input.value = '';
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                        const field = input.dataset.field;
                        const attObj = { _att: true, name: file.name, dataUrl: reader.result, type: file.type, size: file.size };
                        attachmentUpdates.set(field, attObj);
                        // Update preview in-place
                        const isImage = file.type.startsWith('image/');
                        let previewRow = overlay.querySelector(`.att-preview-row[data-field="${field}"]`);
                        const formGroup = input.closest('.form-group');
                        if (!previewRow) {
                            previewRow = document.createElement('div');
                            previewRow.className = 'att-preview-row';
                            previewRow.dataset.field = field;
                            previewRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;';
                            formGroup.insertBefore(previewRow, formGroup.querySelector('label:last-of-type'));
                        }
                        const fmtSize = file.size < 1024 ? file.size + ' B' : file.size < 1048576 ? (file.size / 1024).toFixed(1) + ' KB' : (file.size / 1048576).toFixed(1) + ' MB';
                        previewRow.innerHTML = `
                            ${isImage ? `<img src="${reader.result}" style="max-width:60px;max-height:60px;border-radius:4px;border:1px solid var(--border);">` : '<span style="font-size:20px;">📎</span>'}
                            <span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${file.name}">${file.name}</span>
                            <span style="font-size:10px;color:var(--text-muted);">${fmtSize}</span>
                            <button class="att-remove-btn btn btn-sm" data-field="${field}" style="font-size:10px;padding:2px 6px;color:var(--error);" title="Remove">✕</button>`;
                        // Bind remove on the new button
                        previewRow.querySelector('.att-remove-btn').addEventListener('click', (ev) => {
                            ev.preventDefault();
                            attachmentUpdates.set(field, null);
                            previewRow.remove();
                        });
                    };
                    reader.readAsDataURL(file);
                });
            });

            // Handle remove buttons (for existing attachments)
            overlay.querySelectorAll('.att-remove-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const field = btn.dataset.field;
                    attachmentUpdates.set(field, null);
                    const previewRow = overlay.querySelector(`.att-preview-row[data-field="${field}"]`);
                    if (previewRow) previewRow.remove();
                });
            });

            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                // Save snapshot before editing
                saveSnapshot(layer.id, 'Edit Feature', layer.geojson);

                // Read all text inputs and update properties
                overlay.querySelectorAll('.feat-edit-input').forEach(input => {
                    const field = input.dataset.field;
                    const newVal = input.value;
                    const oldVal = props[field];

                    // Coerce to original type
                    if (oldVal === null || oldVal === undefined) {
                        props[field] = newVal === '' ? null : newVal;
                    } else if (typeof oldVal === 'number') {
                        props[field] = newVal === '' ? null : (isNaN(Number(newVal)) ? newVal : Number(newVal));
                    } else if (typeof oldVal === 'boolean') {
                        props[field] = newVal === 'true' || newVal === '1';
                    } else {
                        props[field] = newVal;
                    }
                });

                // Apply attachment updates
                for (const [field, data] of attachmentUpdates) {
                    props[field] = data; // null removes, object sets
                }

                // Refresh map and UI
                layer.schema = analyzeSchema(layer.geojson);
                bus.emit('layer:updated', layer);
                bus.emit('layers:changed', getLayers());
                mapService.addLayer(layer, getLayers().indexOf(layer));
                refreshUI();
                showToast('Feature updated', 'success');
                close();
            });
        }
    });
}

function showDataTable() {
    const layer = getActiveLayer();
    if (!layer) return;

    const isSpatial = layer.type === 'spatial';
    const features = isSpatial ? layer.geojson.features : [];
    const totalCount = isSpatial ? features.length : (layer.rows || []).length;
    const displayRows = isSpatial
        ? features.slice(0, 500)
        : (layer.rows || []).slice(0, 500);

    if (displayRows.length === 0) return showToast('No data to show', 'warning');

    const firstProps = isSpatial ? (displayRows[0]?.properties || {}) : (displayRows[0] || {});
    const fields = Object.keys(firstProps).filter(k => !k.startsWith('_'));
    const headerHtml = `<th style="width:30px;">#</th>` + fields.map(f => `<th>${f}</th>`).join('');
    const bodyHtml = displayRows.map((item, i) => {
        const props = isSpatial ? (item.properties || {}) : item;
        const cells = fields.map(f => {
            let val = props[f];
            // Attachment cells: show filename, non-editable
            if (val && typeof val === 'object' && val._att) {
                const icon = val.type?.startsWith('image/') ? '🖼️' : '📎';
                return `<td data-row="${i}" data-field="${f}" class="att-cell" style="cursor:default;color:var(--text-muted);font-style:italic;" title="${val.name || 'attachment'}">${icon} ${val.name || 'attachment'}</td>`;
            }
            if (val != null && typeof val === 'object') val = JSON.stringify(val);
            return `<td contenteditable="true" data-row="${i}" data-field="${f}">${val ?? ''}</td>`;
        }).join('');
        return `<tr><td style="color:var(--text-muted);font-size:10px;text-align:center;">${i + 1}</td>${cells}</tr>`;
    }).join('');

    const html = `
        <div class="text-xs text-muted mb-8">
            Showing ${displayRows.length} of ${totalCount} rows · <strong>Click a cell to edit</strong>.
            Changes are saved when you click away.
        </div>
        <div class="data-table-wrap" style="max-height:450px;">
            <table class="data-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
        </div>`;

    showModal(`Data: ${layer.name}`, html, {
        width: '90vw',
        onMount: (overlay) => {
            let dirty = false;
            overlay.querySelectorAll('td[contenteditable]').forEach(td => {
                td.addEventListener('focus', () => {
                    td.style.outline = '2px solid var(--primary)';
                    td.style.background = 'var(--bg-surface)';
                });
                td.addEventListener('blur', () => {
                    td.style.outline = '';
                    td.style.background = '';
                    const row = parseInt(td.dataset.row);
                    const field = td.dataset.field;
                    const newVal = td.textContent;
                    const target = isSpatial ? features[row]?.properties : (layer.rows || [])[row];
                    if (!target) return;
                    const oldVal = target[field];
                    const coerced = (oldVal === null || oldVal === undefined) ? newVal
                        : typeof oldVal === 'number' ? (isNaN(Number(newVal)) ? newVal : Number(newVal))
                        : typeof oldVal === 'boolean' ? (newVal === 'true')
                        : newVal;
                    if (String(oldVal) !== String(coerced)) {
                        if (!dirty) {
                            // Save snapshot on first edit
                            if (isSpatial) saveSnapshot(layer.id, 'Edit field data', layer.geojson);
                            dirty = true;
                        }
                        target[field] = coerced;
                    }
                });
                td.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); td.blur(); }
                    if (e.key === 'Escape') { td.blur(); }
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        const next = e.shiftKey ? td.previousElementSibling : td.nextElementSibling;
                        if (next?.contentEditable === 'true') next.focus();
                    }
                });
            });
            // When modal closes, refresh if dirty
            const obs = new MutationObserver(() => {
                if (!document.body.contains(overlay)) {
                    obs.disconnect();
                    if (dirty && isSpatial) {
                        layer.schema = analyzeSchema(layer.geojson);
                        bus.emit('layer:updated', layer);
                        bus.emit('layers:changed', getLayers());
                        mapService.addLayer(layer, getLayers().indexOf(layer));
                        refreshUI();
                        showToast('Data edits saved', 'success');
                    }
                }
            });
            obs.observe(overlay.parentElement || document.body, { childList: true, subtree: true });
        }
    });
}

// ============================
// Field management
// ============================
function toggleField(fieldName, selected) {
    const layer = getActiveLayer();
    if (!layer) return;
    const field = layer.schema?.fields?.find(f => f.name === fieldName);
    if (field) {
        field.selected = selected;
        renderOutputPanel();
    }
}

function selectAllFields(selected) {
    const layer = getActiveLayer();
    if (!layer) return;
    for (const f of (layer.schema?.fields || [])) f.selected = selected;
    renderFieldList();
    renderOutputPanel();
}

function filterFields(query) {
    const items = document.querySelectorAll('.field-list-items .field-item');
    const q = query.toLowerCase();
    items.forEach(el => {
        const name = el.dataset.field?.toLowerCase() || '';
        el.style.display = name.includes(q) ? '' : 'none';
    });
}

function fixAGOL() {
    const layer = getActiveLayer();
    if (!layer) return;
    const { nameMapping } = checkAGOLCompatibility(layer);
    const fixed = applyAGOLFixes(layer, nameMapping);
    Object.assign(layer, fixed);
    layer.schema = analyzeSchema(layer.geojson);
    refreshUI();
    showToast('AGOL fixes applied', 'success');
}

// ============================
// Rename Layer
// ============================
function renameLayer(layerId, el) {
    const layer = getLayers().find(l => l.id === layerId);
    if (!layer) return;

    // If inline element passed, do inline editing
    if (el && el.nodeType) {
        startInlineEdit(el, layer.name, (newName) => {
            newName = newName.trim();
            if (newName && newName !== layer.name) {
                layer.name = newName;
                renderLayerList();
                renderOutputPanel();
                showToast(`Layer renamed to "${newName}"`, 'success', { duration: 2000 });
            }
        });
        return;
    }

    // Fallback: prompt
    const newName = prompt('Rename layer:', layer.name);
    if (newName && newName.trim() && newName.trim() !== layer.name) {
        layer.name = newName.trim();
        renderLayerList();
        renderOutputPanel();
        showToast(`Layer renamed to "${layer.name}"`, 'success', { duration: 2000 });
    }
}

// ============================
// Rename Field
// ============================
function renameField(fieldName, el) {
    const layer = getActiveLayer();
    if (!layer) return;
    const field = layer.schema?.fields?.find(f => f.name === fieldName);
    if (!field) return;

    const currentName = field.outputName || field.name;

    if (el && el.nodeType) {
        startInlineEdit(el, currentName, (newName) => {
            newName = newName.trim();
            if (newName && newName !== currentName) {
                field.outputName = newName;
                renderFieldList();
                renderOutputPanel();
                showToast(`Field renamed to "${newName}"`, 'success', { duration: 2000 });
            }
        });
        return;
    }

    const newName = prompt('Rename field output name:', currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
        field.outputName = newName.trim();
        renderFieldList();
        renderOutputPanel();
        showToast(`Field renamed to "${field.outputName}"`, 'success', { duration: 2000 });
    }
}

// ============================
// Add New Field
// ============================
function addField() {
    const layer = getActiveLayer();
    if (!layer) return showToast('No layer selected', 'warning');

    const existingNames = new Set((layer.schema?.fields || []).map(f => f.name));

    const html = `
        <div class="form-group"><label>Field Name</label>
            <input type="text" id="af-name" placeholder="new_field" autofocus></div>
        <div class="form-group"><label>Field Type</label>
            <select id="af-type">
                <option value="string" selected>Text (string)</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="date">Date</option>
                <option value="attachment">Attach Photo (KML/KMZ export only)</option>
            </select></div>
        <div class="form-group" id="af-default-group"><label>Default Value <span class="text-muted text-xs">(optional)</span></label>
            <input type="text" id="af-default" placeholder="Leave blank for empty"></div>
        <div id="af-error" class="text-xs" style="color:var(--error);min-height:18px;"></div>`;

    showModal('Add New Field', html, {
        footer: '<button class="btn btn-secondary cancel-btn">Cancel</button><button class="btn btn-primary apply-btn">Add Field</button>',
        onMount: (overlay, close) => {
            const nameInput = overlay.querySelector('#af-name');
            const typeSelect = overlay.querySelector('#af-type');
            const defaultInput = overlay.querySelector('#af-default');
            const defaultGroup = overlay.querySelector('#af-default-group');
            const errorEl = overlay.querySelector('#af-error');

            // Hide default value for attachment type
            typeSelect.addEventListener('change', () => {
                defaultGroup.style.display = typeSelect.value === 'attachment' ? 'none' : '';
                if (typeSelect.value === 'attachment') defaultInput.value = '';
            });

            overlay.querySelector('.cancel-btn')?.addEventListener('click', () => close());
            overlay.querySelector('.apply-btn')?.addEventListener('click', () => {
                const name = nameInput.value.trim();
                if (!name) { errorEl.textContent = 'Field name is required'; nameInput.focus(); return; }
                if (existingNames.has(name)) { errorEl.textContent = `Field "${name}" already exists`; nameInput.focus(); return; }
                if (/[.\[\]]/.test(name)) { errorEl.textContent = 'Field name cannot contain . [ or ]'; nameInput.focus(); return; }

                const type = typeSelect.value;
                const rawDefault = defaultInput.value;

                // Coerce default value to selected type
                let defaultValue = rawDefault === '' ? null : rawDefault;
                if (type === 'attachment') {
                    defaultValue = null; // Attachments have no default
                } else if (defaultValue !== null) {
                    if (type === 'number') {
                        defaultValue = Number(rawDefault);
                        if (isNaN(defaultValue)) { errorEl.textContent = 'Default value is not a valid number'; defaultInput.focus(); return; }
                    } else if (type === 'boolean') {
                        defaultValue = ['true', '1', 'yes'].includes(rawDefault.toLowerCase());
                    }
                }

                // Add field to schema
                const maxOrder = (layer.schema?.fields || []).reduce((m, f) => Math.max(m, f.order || 0), -1);
                const newField = {
                    name,
                    type,
                    nullCount: defaultValue === null ? (layer.schema?.featureCount || 0) : 0,
                    uniqueCount: defaultValue === null ? 0 : 1,
                    sampleValues: defaultValue !== null ? [defaultValue] : [],
                    min: type === 'number' && defaultValue !== null ? defaultValue : null,
                    max: type === 'number' && defaultValue !== null ? defaultValue : null,
                    selected: true,
                    outputName: name,
                    order: maxOrder + 1
                };
                if (!layer.schema) layer.schema = { fields: [], geometryType: null, featureCount: 0, crs: 'EPSG:4326' };
                layer.schema.fields.push(newField);

                // Populate data in every feature / row
                if (layer.type === 'spatial' && layer.geojson?.features) {
                    for (const feat of layer.geojson.features) {
                        if (!feat.properties) feat.properties = {};
                        feat.properties[name] = defaultValue;
                    }
                } else if (layer.rows) {
                    for (const row of layer.rows) {
                        row[name] = defaultValue;
                    }
                }

                renderFieldList();
                renderOutputPanel();
                mapService.refreshLayerData(layer);
                showToast(`Field "${name}" added`, 'success', { duration: 2000 });
                close();
            });

            // Enter key to submit
            const handleEnter = (e) => { if (e.key === 'Enter') overlay.querySelector('.apply-btn').click(); };
            nameInput.addEventListener('keydown', handleEnter);
            defaultInput.addEventListener('keydown', handleEnter);
        }
    });
}

/**
 * Inline editing helper — replaces element text with an input
 */
function startInlineEdit(el, currentValue, onSave) {
    if (el.querySelector('input')) return; // already editing

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue;
    input.className = 'inline-rename-input';
    input.style.cssText = 'width:100%;padding:1px 4px;font-size:inherit;font-weight:inherit;border:1px solid var(--primary);border-radius:3px;background:var(--bg-surface);color:var(--text);outline:none;';

    const originalText = el.textContent;
    el.textContent = '';
    el.appendChild(input);
    input.focus();
    input.select();

    const finish = () => {
        const val = input.value;
        el.textContent = val || originalText;
        onSave(val);
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(); }
        if (e.key === 'Escape') { el.textContent = originalText; }
    });
    input.addEventListener('blur', finish, { once: true });
}

// ============================
// Tool Info / Help Guide
// ============================
function showToolInfo() {
    const sections = [
                {
            title: 'How To',
            tools: [
                ['1️⃣ Import', '➕ Add most Geospatial files types 📂'],
                ['2️⃣ Interact', '🛠️ View, edit, or manipulate ✏️'],
                ['3️⃣ Export', '💾 Same file type or convert 📩']
                
            ]
        },
        {
            title: 'About',
            tools: [
                ['GIS Toolbox', 'A modern web app for working with geospatial data.'],
                ['How it Works', 'Client-side, no backend server processing. All work is done in the browser, no need to download/ install any software.'],
                ['Tools', 'Most tools use Turf.js, a modular geospatial engine written in JavaScript'],
                ['Limitations', 'Large datasets may cause browser performance issues. Try using the "Import Fence" tool to load a smaller area.']
                
            ]
        },
        {
            title: 'Import & Sources',
            tools: [
                ['📂 Import', 'Drag-and-drop or browse to load GeoJSON, CSV, Excel, KML, KMZ, Shapefile (ZIP), or JSON files.'],
                ['📷 Photos', 'Import geotagged photos. Extracts GPS coordinates and EXIF data, maps them as points.'],
                ['🌐 ArcGIS REST', 'Import features directly from an ArcGIS REST service URL (Feature/Map Server).']
            ]
        },
        {
            title: 'Layers & Fields',
            tools: [
                ['Layers Panel', 'View, select, toggle visibility, zoom to, rename, or remove imported layers.'],
                ['Fields Panel', 'View, search, select/deselect, rename, or add new fields on the active layer.'],
                ['Field Types', 'Text, Number, Boolean, Date, and Attach Photo. Photo fields let you attach images to individual features with inline previews. Photos are embedded when exported as KML/KMZ only.'],
                ['Feature Selection', 'Click the ✦ Select button to enter selection mode. Click features to select them (cyan highlight). Shift+click to add/remove. Ctrl+drag to box-select. Tools operate on selected features when a selection exists, or all features when nothing is selected.'],
                ['Merge Layers', 'Select which layers to combine into a single layer. A source_file field is added so you can tell which features came from which original layer. Useful for exporting multiple layers into one KML or KMZ with folders.'],
                ['Data Table', 'View the raw attribute table for the active layer.']
            ]
        },
        {
            title: 'Data Pipeline Editor',
            tools: [
                ['Overview', 'A visual node-based editor for building multi-step data processing pipelines. Drag nodes onto a canvas, connect them with wires, and run the whole chain in one click.'],
                ['Input Nodes', 'Layer Input (use an already-imported layer) or File Import (load a file directly into the pipeline).'],
                ['Transform Nodes', 'Filter Rows, Rename Fields, Delete Fields, Sort, Find & Replace, Deduplicate, and Add Unique ID.'],
                ['Spatial Nodes', 'Buffer, Simplify, Dissolve, Clip, Union, Combine, Spatial Join, Nearest Join, Intersect, Merge Layers, Difference, Summarize Within, and Split by Geometry.'],
                ['Output Nodes', 'Preview (inspect results in a data table) or Add to Map (push the result back as a new map layer).'],
                ['Examples', 'Pre-built pipelines available from the Examples dropdown to get started quickly.']
            ]
        },
        {
            title: 'Layer Data Tools',
            tools: [
                ['Split Column', 'Split a field into multiple new fields by a delimiter (comma, space, etc.).'],
                ['Combine', 'Merge two or more fields into a single field with a separator.'],
                ['Template', 'Build a new field from a text template using values from existing fields.'],
                ['Replace/Clean', 'Find and replace text, trim whitespace, or clean values in a field.'],
                ['Type Convert', 'Change a field\'s data type (text → number, number → text, etc.).'],
                ['Filter', 'Keep or remove rows based on conditions (equals, contains, greater than, etc.).'],
                ['Dedup', 'Remove duplicate rows based on one or more key fields.'],
                ['Join', 'Join two layers together on a matching key field.'],
                ['Validate', 'Run validation rules on fields (required, min/max, regex pattern, etc.).'],
                ['Add UID', 'Add a unique sequential ID field to every row.']
            ]
        },
        {
            title: 'GIS Widgets',
            tools: [
                ['Overview', 'Pre-built workflows that combine multiple steps into a simple, guided interface for common GIS tasks.'],
                ['Import Fence', 'Draw a rectangle on the map to set a spatial filter. All subsequent imports (file or ArcGIS REST) only load features inside the fence. ArcGIS REST queries are filtered server-side so only matching features are downloaded, preventing large dataset browser issues.']
            ]
        },
        {
            title: 'GIS Tools — Measurement',
            tools: [
                ['Distance', 'Measure the straight-line distance between two points you click on the map.'],
                ['Bearing', 'Find the compass direction (in degrees) from one point to another.'],
                ['Destination', 'Given a start point, distance, and compass direction, find where you would end up.'],
                ['Along', 'Find a point at a specific distance along a line feature.'],
                ['Pt→Line Distance', 'Measure the shortest perpendicular distance from a point to a line.']
            ]
        },
        {
            title: 'GIS Tools — Transformation',
            tools: [
                ['Buffer', 'Draw a zone around features at a set distance.'],
                ['BBox Clip', 'Draw a rectangle on the map and clip all features to that area.'],
                ['Clip to Extent', 'Clip features to the current visible map area.'],
                ['Simplify', 'Reduce vertex count on geometries to shrink file size.'],
                ['Bezier Spline', 'Smooth jagged lines into gentle flowing curves.'],
                ['Polygon Smooth', 'Round off rough polygon edges.'],
                ['Line Offset', 'Create a parallel copy of a line shifted left or right.'],
                ['Sector', 'Create a pie-slice shaped area from a center point, radius, and compass bearings.']
            ]
        },
        {
            title: 'GIS Tools — Lines & Analysis',
            tools: [
                ['Line Slice Along', 'Extract a section of a line between two distances.'],
                ['Line Slice (Points)', 'Click two points on the map to cut out the section of line between them.'],
                ['Line Intersect', 'Find all points where two sets of lines cross each other.'],
                ['Kinks', 'Find self-intersections where a line or polygon edge crosses itself.'],
                ['Combine', 'Merge all features of the same type into one multi-feature.'],
                ['Union', 'Merge all polygons into a single unified shape.'],
                ['Dissolve', 'Merge polygons that share the same attribute value.'],
                ['Points in Polygon', 'Find which points fall inside which polygons.'],
                ['Nearest Point', 'Click the map to find the closest feature in a point layer.'],
                ['Nearest Pt on Line', 'Click near a line to snap to the closest point on it.'],
                ['Nearest Pt to Line', 'Find which point in a layer is closest to a line.'],
                ['NN Analysis', 'Statistically test whether points are clustered, dispersed, or random.']
            ]
        },
        {
            title: 'Export',
            tools: [
                ['GeoJSON', 'Export spatial data as a .geojson file.'],
                ['CSV', 'Export attributes as a comma-separated .csv file.'],
                ['Excel', 'Export attributes as an .xlsx spreadsheet.'],
                ['KML', 'Export spatial data as a .kml file (Google Earth). Layer styles are preserved. With two or more layers, you can export a single multi-folder .kml.'],
                ['KMZ', 'Export as .kmz (compressed KML) with styles. With two or more layers, you can export a single multi-folder .kmz (same folder-per-layer behavior as KML). Can include embedded photos.'],
                ['JSON', 'Export raw data as a .json file.'],
                ['Shapefile', 'Export spatial data as a zipped Shapefile (.shp).']
            ]
        },
        {
            title: 'ArcGIS REST Import',
            tools: [
                ['Overview', 'Import features directly from public ArcGIS REST endpoints — no download or login required. All processing is done in the browser.'],
                ['Preset Layers', 'Choose from a curated list of UDOT and Utah layers including Routes ALRS, Reference Posts, Mile Points, Region Boundaries, Bridge Locations, Lanes, County Boundaries, and Municipal Boundaries.'],
                ['Custom URL', 'Enter any public ArcGIS REST FeatureServer or MapServer layer URL to import features directly.'],
                ['Supported', 'Works with Feature Servers, Map Servers, and individual layer endpoints. Handles paginated services that return features in batches automatically.']
            ]
        },
        {
            title: 'Workflows',
            tools: [
                ['Multi-Layer KMZ', 'Import your layers, style each one independently, then Export → KMZ. A picker lets you select which layers to include — each becomes its own folder in the KMZ with its own styling. No merge needed.'],
                ['Merge → Export', 'Use Merge Layers to combine selected layers into one. The merged layer gets a source_file field tracking each feature\'s origin. When exported as KML or KMZ, features are auto-grouped into folders by source layer name.'],
                ['Mixed Geometry', 'When you import a file with mixed geometry types (points + lines + polygons), they are automatically split into separate layers so you can style each type independently.']
            ]
        },
        {
            title: 'Other',
            tools: [
                ['AGOL Compatibility', 'Check and auto-fix field names/types for ArcGIS Online compatibility.']
            ]
        }
    ];

    const toolList = (tools) => `
        <div style="display:flex;flex-direction:column;gap:4px;">
            ${tools.map(([name, desc]) => `
                <div style="display:flex;gap:8px;align-items:baseline;">
                    <span style="font-weight:600;white-space:nowrap;min-width:110px;color:var(--text);">${name}</span>
                    <span style="color:var(--text-muted);font-size:13px;">${desc}</span>
                </div>
            `).join('')}
        </div>`;

    const howToList = (tools) => `
        <div style="display:flex;flex-direction:column;gap:8px;">
            ${tools.map(([name, desc]) => `
                <div style="display:flex;gap:10px;align-items:baseline;">
                    <span style="font-weight:600;white-space:nowrap;min-width:110px;color:var(--text);font-size:16px;">${name}</span>
                    <span style="color:var(--text-muted);font-size:15px;">${desc}</span>
                </div>
            `).join('')}
        </div>`;

    const html = sections.map(s => {
        if (s.title === 'How To') {
            return `<div style="margin-bottom:20px;">
                <div style="font-weight:700;font-size:22px;color:var(--gold-light);margin-bottom:8px;border-bottom:2px solid var(--border);padding-bottom:4px;">${s.title}</div>
                ${howToList(s.tools)}
            </div>`;
        }
        return `<details class="guide-section">
            <summary class="guide-section-title">${s.title}</summary>
            <div class="guide-section-body">${toolList(s.tools)}</div>
        </details>`;
    }).join('');

    const isMobile = window.innerWidth < 768;
    const mobileBanner = `<div class="splash-mobile-notice">📱 Mobile site still under development — for a better experience use a larger screen</div>`;
    const splashWidth = isMobile ? '99vw' : '560px';
    const titleFontSize = isMobile ? 'clamp(18px, 5.5vw, 32px)' : '32px';
    const titleIconSize = isMobile ? '28' : '36';
    const byFontSize = isMobile ? 'clamp(7px, 2vw, 9px)' : '9px';
    showModal(`<div style="display:inline-flex;align-items:baseline;gap:6px;flex-wrap:nowrap;max-width:100%;"><img src="icons/favicon.png" alt="" width="${titleIconSize}" height="${titleIconSize}" style="border-radius:4px;flex-shrink:0;align-self:center;"><span style="font-size:${titleFontSize};font-weight:700;line-height:1;white-space:nowrap;">GIS-Toolbox<span style="font-size:0.65em;font-weight:400;opacity:0.7;">.com</span></span><span style="font-size:${byFontSize};font-weight:400;opacity:0.7;white-space:nowrap;">by Ryan Romney</span></div>`, `${mobileBanner}<div style="overflow-y:auto;flex:1;">${html}</div>`, {
        width: splashWidth,
        onMount: (overlay) => {
            if (isMobile) {
                overlay.classList.add('splash-overlay');
                const modal = overlay.querySelector('.modal');
                if (modal) modal.classList.add('splash-modal');
            }
        }
    });
}

// ============================
// Right-click context menu
// ============================
let _ctxDismissAC = null; // AbortController for context menu dismiss listeners

function dismissContextMenu() {
    document.querySelector('.map-context-menu')?.remove();
    if (_ctxDismissAC) { _ctxDismissAC.abort(); _ctxDismissAC = null; }
}

function showMapContextMenu({ latlng, originalEvent, layerId, featureIndex, feature }) {
    dismissContextMenu();
    const menu = document.createElement('div');
    menu.className = 'map-context-menu';

    const layers = getLayers();
    const layer = layerId ? layers.find(l => l.id === layerId) : null;
    const layerIdx = layer ? layers.indexOf(layer) : -1;

    // Header
    if (layer) {
        menu.innerHTML += `<div class="ctx-header">Layer: ${layer.name}</div>`;
    }

    const items = [];

    // Feature-specific items
    if (feature && layer) {
        items.push({ icon: '📋', label: 'View attributes', action: () => {
            const nearby = mapService.findFeaturesNearClick(latlng, layerId, featureIndex);
            if (nearby.length > 0) mapService.showMultiPopup(nearby, latlng);
            else mapService.showPopup(feature, null, latlng);
        }});
        items.push({ icon: '✏️', label: 'Edit feature', action: () => {
            openFeatureEditor(layerId, featureIndex);
        }});
    }

    // Coordinates
    items.push({ icon: '📍', label: `Copy coordinates`, action: () => {
        const text = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
        navigator.clipboard.writeText(text).then(() => showToast(`Copied: ${text}`, 'success'))
            .catch(() => showToast(text, 'info'));
    }});

    // Camera orbit
    if (mapService.isOrbiting()) {
        items.push({ icon: '⏹️', label: 'Stop camera orbit', action: () => {
            mapService.stopCameraOrbit();
            showToast('Camera orbit stopped', 'info');
        }});
    } else {
        items.push({ icon: '🎥', label: 'Orbit camera around point', action: () => {
            mapService.startCameraOrbit({ lat: latlng.lat, lng: latlng.lng });
            showToast('Camera orbiting — right-click to stop', 'info');
        }});
    }

    // Google Street View
    items.push({ icon: '🛣️', label: 'Open location in Google Street View', action: () => {
        const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${latlng.lat},${latlng.lng}`;
        window.open(url, '_blank', 'noopener');
    }});

    // Google Earth
    items.push({ icon: '🌍', label: 'Open location in Google Earth', action: () => {
        const url = `https://earth.google.com/web/@${latlng.lat},${latlng.lng},1200a,900d,60y,0h,35t,0r`;
        window.open(url, '_blank', 'noopener');
    }});

    if (layer) {
        items.push({ sep: true });

        // Layer reordering
        if (layerIdx > 0) {
            items.push({ icon: '⬆', label: 'Move layer up', action: () => { moveLayerUp(layerId); }});
        }
        if (layerIdx >= 0 && layerIdx < layers.length - 1) {
            items.push({ icon: '⬇', label: 'Move layer down', action: () => { moveLayerDown(layerId); }});
        }
        if (layers.length > 1 && layerIdx !== 0) {
            items.push({ icon: '⏫', label: 'Bring to front', action: () => {
                while (layers.indexOf(layers.find(l => l.id === layerId)) > 0) {
                    reorderLayer(layerId, 'up');
                }
                mapService.syncLayerOrder(getLayers().map(l => l.id));
                renderLayerList();
            }});
        }
        if (layers.length > 1 && layerIdx !== layers.length - 1) {
            items.push({ icon: '⏬', label: 'Send to back', action: () => {
                while (layers.indexOf(layers.find(l => l.id === layerId)) < layers.length - 1) {
                    reorderLayer(layerId, 'down');
                }
                mapService.syncLayerOrder(getLayers().map(l => l.id));
                renderLayerList();
            }});
        }

        items.push({ sep: true });

        // Hide / show
        items.push({ icon: layer.visible !== false ? '👁️‍🗨️' : '👁️', label: layer.visible !== false ? 'Hide layer' : 'Show layer', action: () => {
            toggleLayerVisibility(layerId);
            mapService.toggleLayer(layerId, layers.find(l => l.id === layerId)?.visible);
            renderLayerList();
        }});

        // Zoom to
        items.push({ icon: '🔍', label: 'Zoom to layer', action: () => {
            const ll = mapService.getLayerRecord(layerId);
            if (ll && ll.geojson) { try { const bb = turf.bbox(ll.geojson); mapService.getMap()?.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 30 }); } catch(_) {} }
        }});

        // Set active
        items.push({ icon: '✦', label: 'Set as active layer', action: () => { setActiveLayer(layerId); refreshUI(); }});
    }

    // Build items
    items.forEach(item => {
        if (item.sep) {
            menu.innerHTML += '<div class="ctx-sep"></div>';
            return;
        }
        const el = document.createElement('div');
        el.className = 'ctx-item';
        el.innerHTML = `<span class="ctx-icon">${item.icon}</span>${item.label}`;
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            dismissContextMenu();
            item.action();
        });
        menu.appendChild(el);
    });

    // Position menu at mouse location, clamped to viewport
    let x = originalEvent.clientX;
    let y = originalEvent.clientY;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    // Dismiss listeners — deferred so the originating event doesn't immediately dismiss
    _ctxDismissAC = new AbortController();
    const sig = _ctxDismissAC.signal;
    requestAnimationFrame(() => {
        if (sig.aborted) return;
        // Click anywhere outside the menu dismisses it
        document.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('.map-context-menu')) dismissContextMenu();
        }, { signal: sig });
        // Another right-click outside the menu dismisses it (new one will replace)
        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.map-context-menu')) dismissContextMenu();
        }, { signal: sig });
        // Escape key dismisses
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') dismissContextMenu();
        }, { signal: sig });
        // Scroll / map interaction dismisses
        document.addEventListener('wheel', () => dismissContextMenu(), { signal: sig, passive: true });
    });
}

const APP_ACTIONS = {
    setActiveLayer: setActiveLayerAndRefresh,
    toggleVisibility: toggleLayerVisibilityAndRender,
    zoomToLayer,
    removeLayer: removeLayerWithConfirm,
    moveLayerUp,
    moveLayerDown,
    toggleField, selectAllFields, filterFields,
    renameLayer, renameField,
    addField,
    doExport,
    fixAGOL,
    showDataTable,
    openSplitColumn,
    openCombineColumns,
    openTemplateBuilder,
    openReplaceClean,
    openTypeConvert,
    openFilterBuilder,
    openDeduplicate,
    openJoinTool,
    openValidation,
    addUID,
    openBuffer,
    openSimplify,
    openClip,
    openDistanceTool,
    openBearingTool,
    openDestinationTool,
    openAlongTool,
    openPointToLineDistanceTool,
    openBboxClip,
    openBezierSpline,
    openPolygonSmooth,
    openLineOffset,
    openLineSliceAlong,
    openLineSlice,
    openLineIntersect,
    openKinks,
    openCombine,
    openUnion,
    openDissolve,
    openSector,
    openNearestPoint,
    openNearestPointOnLine,
    openNearestPointToLine,
    openNearestNeighborAnalysis,
    openPointsWithinPolygon,
    openPhotoMapper: openPhotoMapper,
    openArcGISImporter: openArcGISImporter,
    startImportFence,
    openSpatialAnalyzer,
    openBulkUpdate,
    openProximityJoin,
    openCoordConverter,
    mergeLayers: handleMergeLayers,
    showToolInfo,
    // Selection
    toggleSelectionMode,
    clearSelection,
    selectAllFeatures,
    invertSelection,
    deleteSelectedFeatures,
    openFeatureEditor,
    openDrawTools,
    createDrawLayer,
    _coordSearchAddNew,
    _coordSearchAddToExisting,
    _coordSearchClear
};

// Subscribe to logs for panel updates
logger.subscribe(() => {
    if (!document.getElementById('logs-panel')?.classList.contains('hidden')) {
        renderLogs();
    }
});

// Setup logs toolbar
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('logs-search');
    const levelSelect = document.getElementById('logs-level');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderLogs({ search: searchInput.value, level: levelSelect?.value });
        });
    }
    if (levelSelect) {
        levelSelect.addEventListener('change', () => {
            renderLogs({ search: searchInput?.value, level: levelSelect.value });
        });
    }
    document.getElementById('logs-copy')?.addEventListener('click', () => {
        navigator.clipboard?.writeText(logger.toText());
        showToast('Logs copied', 'success', { duration: 1500 });
    });
    document.getElementById('logs-download')?.addEventListener('click', () => {
        const blob = new Blob([logger.toJSON()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gis-toolbox-logs-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });
    document.getElementById('logs-clear')?.addEventListener('click', () => {
        logger.clear();
        renderLogs();
    });
    document.getElementById('logs-close')?.addEventListener('click', () => {
        document.getElementById('logs-panel')?.classList.add('hidden');
    });

    // Render initial data prep tools in left panel (legacy path only).
    if (!_isReactLeftPanel) {
        const dataPrepContainer = document.getElementById('dataprep-tools');
        if (dataPrepContainer) {
            dataPrepContainer.innerHTML = renderDataPrepTools();
        }
    }

    // ========================
    // Floating tooltip portal
    // ========================
    (function initTooltipPortal() {
        const portal = document.createElement('div');
        portal.className = 'geo-tip-portal';
        const arrow = document.createElement('div');
        arrow.className = 'tip-arrow';
        portal.appendChild(arrow);
        document.body.appendChild(portal);
        let hideTimeout = null;
        let activeBtn = null;

        function show(btn) {
            const tip = btn.querySelector('.geo-tip');
            if (!tip) return;
            clearTimeout(hideTimeout);
            activeBtn = btn;

            // Set text (keep arrow element)
            // Clear text nodes only, preserve arrow child
            Array.from(portal.childNodes).forEach(n => {
                if (n !== arrow) portal.removeChild(n);
            });
            portal.insertBefore(document.createTextNode(tip.textContent), arrow);

            // Make visible but off-screen for measurement
            portal.style.left = '-9999px';
            portal.style.top = '0px';
            portal.classList.add('visible');

            const rect = btn.getBoundingClientRect();
            const pw = 240;
            const ph = portal.offsetHeight;
            const btnCenterX = rect.left + rect.width / 2;

            // Horizontal: try to center on button, clamp to viewport
            let left = btnCenterX - pw / 2;
            if (left < 8) left = 8;
            if (left + pw > window.innerWidth - 8) left = window.innerWidth - 8 - pw;

            // Arrow: point at button center relative to tooltip left
            let arrowLeft = btnCenterX - left;
            arrowLeft = Math.max(12, Math.min(pw - 12, arrowLeft));
            arrow.style.left = arrowLeft + 'px';

            portal.style.left = left + 'px';
            portal.style.width = pw + 'px';

            // Vertical: prefer above, fall back to below
            let top = rect.top - ph - 10;
            if (top < 4) {
                top = rect.bottom + 10;
                portal.classList.add('below');
            } else {
                portal.classList.remove('below');
            }
            portal.style.top = top + 'px';
        }

        function hide() {
            hideTimeout = setTimeout(() => {
                portal.classList.remove('visible');
                activeBtn = null;
            }, 100);
        }

        document.addEventListener('pointerenter', (e) => {
            const btn = closestFromEvent(e, '.geo-tool-btn');
            if (btn) show(btn);
        }, true);
        document.addEventListener('pointerleave', (e) => {
            const btn = closestFromEvent(e, '.geo-tool-btn');
            if (btn && btn === activeBtn) hide();
        }, true);
    })();
});
