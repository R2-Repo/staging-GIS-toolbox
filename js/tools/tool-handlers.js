/**
 * GIS Toolbox — tool handlers, app wiring, and action dispatch.
 * UI shell lives in react/App.jsx; this module owns domain-side handlers.
 */
import logger from '../core/logger.js';
import bus from '../core/event-bus.js';
import { handleError } from '../core/error-handler.js';
import {
    getState, getLayers, getActiveLayer, addLayer, removeLayer, updateLayer,
    setActiveLayer, toggleLayerVisibility, reorderLayer, setUIState, toggleAGOLCompat
} from '../core/state.js';
import { mergeDatasets, getSelectedFields, tableToSpatial, createSpatialDataset, createTableDataset, analyzeSchema, analyzeTableSchema } from '../core/data-model.js';
import { importFile, importFiles } from '../import/importer.js';
import {
    finalizeImportedDatasets,
    applyImportLayerStyles,
    applyImportMetadata,
    revokeKmzBlobUrls
} from '../import/post-import.js';
import { getLayerDefaultColor } from '../map/layer-palette.js';
import { getActiveTask } from '../core/task-runner.js';
import { getAvailableFormats, exportDataset, exportMultiLayerKMZFile, exportMultiLayerKMLFile, setExportMapManager } from '../export/exporter.js';
import mapService from '../map/map-service.js';
import { isSmartStyleActive } from '../map/style-engine.js';
import dualScreenCoordinator from '../dual-screen/coordinator.js';
import { installDualScreenPrimaryHandlers } from '../dual-screen/primary-handlers.js';
import {
    POPUP_BLOCKED_MESSAGE,
    RELOAD_REMINDER_MESSAGE,
    consumeDualScreenReloadReminder
} from '../dual-screen/storage-hint.js';
import {
    applyDualScreenDocumentLayout,
    syncDualScreenHeaderButton
} from '../dual-screen/layout.js';

import { showToast, showErrorToast } from '../ui/toast.js';
import { showModal, confirm, showProgressModal } from '../ui/modals.js';
import * as transforms from '../dataprep/transforms.js';
import { applyTemplate } from '../dataprep/template-builder.js';
import { saveSnapshot, undo as undoHistory, redo as redoHistory, getHistoryState } from '../dataprep/transform-history.js';
import { photoMapper } from '../photo/photo-mapper.js';
import { arcgisImporter } from '../arcgis/rest-importer.js';
import ARCGIS_ENDPOINTS from '../arcgis/endpoints.js';
import { checkAGOLCompatibility, applyAGOLFixes } from '../agol/compatibility.js';
import * as gisTools from './gis-tools.js';
import { convertFeatureCoords } from './coordinates.js';
import { findFirstLineStringFeature, listLineStringFeatures } from './line-geojson.js';

import drawManager from '../map/draw-manager.js';
import { initSelectionShortcuts } from '../map/selection-shortcuts.js';
import sessionStore from '../core/session-store.js';
import { buildWidgetActions } from '../widgets/registry.js';
import { createWidgetContext } from '../widgets/widget-context.js';
import { createWorkflowController } from '../workflow/workflow-controller.js';

// ============================
// Initialize app
// ============================
let _importInputEl = null;
let _workflowOverlay = null;
export function getWorkflowOverlay() { return _workflowOverlay; }

// ============================
// Session Restore
// ============================
export async function restoreSessionIfAvailable() {
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

            if (session.layerStyles) {
                mapService.setLayerStylesRecord(session.layerStyles);
            }

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

export function buildMapContextMenuItems(payload) {
    const { latlng, layerId, featureIndex, feature } = payload;
    const layers = getLayers();
    const layer = layerId ? layers.find((l) => l.id === layerId) : null;
    const layerIdx = layer ? layers.indexOf(layer) : -1;
    const items = [];

    if (feature && layer) {
        items.push({
            icon: '👁',
            label: 'View attributes',
            action: () => {
                const nearby = mapService.findFeaturesNearClick(latlng, layerId, featureIndex);
                if (nearby.length > 0) mapService.showMultiPopup(nearby, latlng);
                else mapService.showPopup(feature, null, latlng);
            }
        });
        items.push({
            icon: '✏',
            label: 'Edit feature',
            action: () => openFeatureEditor(layerId, featureIndex)
        });
    }

    items.push({
        icon: '📋',
        label: 'Copy coordinates',
        action: () => {
            const text = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
            navigator.clipboard.writeText(text).then(() => showToast(`Copied: ${text}`, 'success'))
                .catch(() => showToast(text, 'info'));
        }
    });

    if (mapService.isOrbiting()) {
        items.push({
            icon: '⏹',
            label: 'Stop camera orbit',
            action: () => {
                mapService.stopCameraOrbit();
                showToast('Camera orbit stopped', 'info');
            }
        });
    } else {
        items.push({
            icon: '🔄',
            label: 'Orbit camera around point',
            action: () => {
                mapService.startCameraOrbit({ lat: latlng.lat, lng: latlng.lng });
                showToast('Camera orbiting — right-click to stop', 'info');
            }
        });
    }

    items.push({
        icon: '🚶',
        label: 'Open location in Google Street View',
        action: () => {
            const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${latlng.lat},${latlng.lng}`;
            window.open(url, '_blank', 'noopener');
        }
    });

    items.push({
        icon: '🌍',
        label: 'Open location in Google Earth',
        action: () => {
            const url = `https://earth.google.com/web/@${latlng.lat},${latlng.lng},1200a,900d,60y,0h,35t,0r`;
            window.open(url, '_blank', 'noopener');
        }
    });

    if (layer) {
        items.push({ sep: true });
        if (layerIdx > 0) {
            items.push({ icon: '⬆', label: 'Move layer up', action: () => moveLayerUp(layerId) });
        }
        if (layerIdx >= 0 && layerIdx < layers.length - 1) {
            items.push({ icon: '⬇', label: 'Move layer down', action: () => moveLayerDown(layerId) });
        }
        if (layers.length > 1 && layerIdx !== 0) {
            items.push({
                icon: '⏫',
                label: 'Bring to front',
                action: () => {
                    while (layers.indexOf(layers.find((l) => l.id === layerId)) > 0) {
                        reorderLayer(layerId, 'up');
                    }
                    mapService.syncLayerOrder(getLayers().map((l) => l.id));
                    refreshUI();
                }
            });
        }
        if (layers.length > 1 && layerIdx !== layers.length - 1) {
            items.push({
                icon: '⏬',
                label: 'Send to back',
                action: () => {
                    while (layers.indexOf(layers.find((l) => l.id === layerId)) < layers.length - 1) {
                        reorderLayer(layerId, 'down');
                    }
                    mapService.syncLayerOrder(getLayers().map((l) => l.id));
                    refreshUI();
                }
            });
        }
        items.push({ sep: true });
        items.push({
            icon: layer.visible !== false ? '👁️‍🗨️' : '👁️',
            label: layer.visible !== false ? 'Hide layer' : 'Show layer',
            action: () => {
                toggleLayerVisibility(layerId);
                mapService.toggleLayer(layerId, layers.find((l) => l.id === layerId)?.visible);
                refreshUI();
            }
        });
        items.push({
            icon: '🔍',
            label: 'Zoom to layer',
            action: () => {
                const ll = mapService.getLayerRecord(layerId);
                if (ll?.geojson) {
                    try {
                        const bb = turf.bbox(ll.geojson);
                        mapService.getMap()?.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 30 });
                    } catch (_) { /* ignore */ }
                }
            }
        });
        items.push({
            icon: '★',
            label: 'Set as active layer',
            action: () => {
                setActiveLayer(layerId);
                refreshUI();
            }
        });
    }

    return { items, layerName: layer?.name || null };
}

export function getRightPanelSnapshot() {
    const layer = getActiveLayer();
    if (!layer) {
        return {
            layer: null,
            selectedFields: [],
            formats: [],
            agolMode: !!getState().agolCompatMode,
            agolCheck: null,
            layerStyle: null,
            styleDefaultColor: '#2563eb'
        };
    }

    const agolMode = !!getState().agolCompatMode;
    const layerIndex = getLayers().indexOf(layer);
    return {
        layer,
        selectedFields: getSelectedFields(layer.schema),
        formats: getAvailableFormats(layer),
        agolMode,
        agolCheck: agolMode ? checkAGOLCompatibility(layer) : null,
        layerStyle: layer.type === 'spatial' ? mapService.getLayerStyle(layer.id) : null,
        styleDefaultColor: getLayerDefaultColor(layerIndex)
    };
}

export function handleLayerStyleChange(style) {
    const layer = getActiveLayer();
    if (!layer || layer.type !== 'spatial') return;
    mapService.restyleLayer(layer.id, layer, style);
}

// ============================
// Drag & Drop file import (global ??? works anywhere in the app)
// ============================
export function setupDragDrop() {
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

export async function handleFileImport(files, fenceBbox = null) {
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

        const { expanded, totalFiltered } = finalizeImportedDatasets(datasets, { fenceBbox });

        const importedLayerIds = [];
        for (const ds of expanded) {
            throwIfTaskCancelled();
            addLayer(ds);
            const layerIdx = getLayers().indexOf(ds);
            mapService.addLayer(ds, layerIdx, { fit: false });
            applyImportLayerStyles(ds, { mapService, getLayers, layerIndex: layerIdx });
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

export function openImportFlow() {
    const rootId = `import-flow-react-${Date.now()}`;
        showModal('Import Files', `<div id="${rootId}"></div>`, {
            width: '560px',
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountImportFlowDialog } = await import('../../react/tools/mountImportFlowDialog.jsx');
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

export function applyBasemapHeaderSelection(value) {
    if (!value) return;
    mapService.setBasemap(value);
    setBasemapToggleActive(value);
}

export function applyDimensionHeaderSelection(value) {
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

export function setPanelCollapsed(side, collapsed) {
    const panel = document.querySelector(`.panel-${side}`);
    if (!panel) return;
    panel.classList.toggle('collapsed', !!collapsed);

    const expandId = side === 'left' ? 'expand-left-panel' : 'expand-right-panel';
    const toggleId = side === 'left' ? 'toggle-left-panel' : 'toggle-right-panel';
    const collapsedGlyph = side === 'left' ? '???' : '???';
    const expandedGlyph = side === 'left' ? '???' : '???';

    document.getElementById(expandId)?.classList.toggle('hidden', !collapsed);
    const toggleButton = document.getElementById(toggleId);
    if (toggleButton) {
        toggleButton.textContent = collapsed ? collapsedGlyph : expandedGlyph;
    }
    setTimeout(() => { mapService.resize(); }, 250);
}

export function togglePanelCollapsed(side) {
    const panel = document.querySelector(`.panel-${side}`);
    if (!panel) return;
    const willCollapse = !panel.classList.contains('collapsed');
    setPanelCollapsed(side, willCollapse);
}

function closestFromEvent(event, selector) {
    const node = event.target instanceof Element ? event.target : event.target?.parentElement;
    return node?.closest(selector) ?? null;
}

// ============================
// Setup all event listeners
// ============================
export function setupAppWiring() {
    // Import button ??? use a persistent hidden input (iOS-safe)
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

    // Workflow editor
    if (!_workflowOverlay) {
        _workflowOverlay = createWorkflowController({
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
                // Check if a workflow layer with this name already exists — update in place
                const existing = getLayers().find(l => l.name === name && l.source?.format === 'workflow');
                if (existing) {
                    updateLayer(existing.id, { geojson: data.geojson });
                    applyImportMetadata(existing, data);
                    mapService.removeLayer(existing.id);
                    const idx = getLayers().indexOf(existing);
                    mapService.addLayer(existing, idx, { fit: !opts.workflow });
                    applyImportLayerStyles(existing, { mapService, getLayers, layerIndex: idx });
                    refreshUI();
                    showToast(`Layer "${name}" updated`, 'success');
                    return existing.id;
                }
                // New layer
                const dataset = createSpatialDataset(name, data.geojson, { format: 'workflow' });
                applyImportMetadata(dataset, data);
                addLayer(dataset);
                const layerIdx = getLayers().indexOf(dataset);
                mapService.addLayer(dataset, layerIdx, { fit: !opts.workflow });
                applyImportLayerStyles(dataset, { mapService, getLayers, layerIndex: layerIdx });
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
                const layer = getLayers().find(l => l.id === layerId);
                if (layer) revokeKmzBlobUrls(layer);
                mapService.removeLayer(layerId);
                removeLayer(layerId);
                refreshUI();
            }
        });
    }
    
    setupDualScreenMode();

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

    // Layer list activation
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

    // Field list controls
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
    bus.on('layers:changed', () => sessionStore.scheduleSave(getLayers(), mapService.getLayerStylesRecord()));
    bus.on('map:styleChanged', () => sessionStore.scheduleSave(getLayers(), mapService.getLayerStylesRecord()));
    bus.on('layer:active', (layer) => {
        mapService.setActiveLayerId?.(layer?.id ?? getActiveLayer()?.id ?? null);
        refreshUI();
    });
    bus.on('map:ready', () => {
        const layer = getActiveLayer();
        mapService.setActiveLayerId?.(layer?.id ?? null);
    });
    bus.on('task:error', (data) => {
        showErrorToast(data.error);
    });

    bus.on('map:popup:edit', (hit) => {
        if (!hit) return;
        mapService.closePopup();
        openFeatureEditor(hit.layerId, hit.featureIndex);
    });

    initSelectionShortcuts({
        clearSelection,
        selectAllFeatures,
        invertSelection,
        deleteSelectedFeatures,
        getSelectionCount: () => {
            const layer = getActiveLayer();
            return layer ? mapService.getSelectionCount(layer.id) : 0;
        },
        isDrawToolActive: () => !!drawManager.activeTool
    });

    bus.on('coord-search:add-new', _coordSearchAddNew);
    bus.on('coord-search:add-existing', _coordSearchAddToExisting);
    bus.on('coord-search:clear', _coordSearchClear);

}

// ============================
// Dual Screen Mode
// ============================
function setupDualScreenMode() {
    const btn = document.getElementById('btn-dual-screen');
    if (!btn) return;

    installDualScreenPrimaryHandlers({
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
            updateFenceButtonState();
            showToast('Import fence placed — all imports will be filtered to this area', 'success');
        },
        clearFence: () => {
            _fenceBbox = null;
            dualScreenCoordinator.setFenceBbox(null);
            mapService.clearImportFence();
            updateFenceButtonState();
            if (dualScreenCoordinator.isActive) {
                dualScreenCoordinator.broadcastDrawCmd({ action: 'clearFence' });
            }
            showToast('Import fence removed', 'info');
        },
        toggleLayerVisibility: (layerId) => {
            toggleLayerVisibility(layerId);
            mapService.toggleLayer(layerId, getLayers().find(l => l.id === layerId)?.visible);
            refreshUI();
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
        syncDualScreenHeaderButton(btn, active);
        document.querySelectorAll('[data-dual-screen-toggle]').forEach(el => {
            el.classList.toggle('active', active);
            if (el.id === 'wf-dual-screen') {
                el.textContent = active ? '???? Exit Dual Screen' : '???? Dual Screen';
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
// UI refresh — emit ui:refresh for React store
// ============================
const REFRESH_UI_DEBOUNCE_MS = 150;
let _refreshUITimer = null;

function refreshUINow() {
    bus.emit('ui:refresh');
}

/** Debounced ui:refresh — coalesces bursts during import / multi-layer updates. */
export function refreshUI() {
    clearTimeout(_refreshUITimer);
    _refreshUITimer = setTimeout(() => {
        _refreshUITimer = null;
        refreshUINow();
    }, REFRESH_UI_DEBOUNCE_MS);
}

// ============================
// Layer List (left panel)
// ============================


export function moveLayerUp(id) {
    reorderLayer(id, 'up');
    mapService.syncLayerOrder(getLayers().map(l => l.id));
    refreshUI();
}

export function moveLayerDown(id) {
    reorderLayer(id, 'down');
    mapService.syncLayerOrder(getLayers().map(l => l.id));
    refreshUI();
}

export function setActiveLayerAndRefresh(id) {
    setActiveLayer(id);
    refreshUI();
}

export function toggleLayerVisibilityAndRender(id) {
    toggleLayerVisibility(id);
    mapService.toggleLayer(id, getLayers().find(l => l.id === id)?.visible);
    refreshUI();
}

export function zoomToLayer(id) {
    const layer = mapService.getLayerRecord(id);
    if (layer && layer.geojson) {
        try {
            const bb = turf.bbox(layer.geojson);
            mapService.getMap()?.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 30 });
        } catch (_) {}
    }
}

export async function removeLayerWithConfirm(id) {
    const ok = await confirm('Remove Layer', 'Remove this layer?');
    if (ok) {
        const layer = getLayers().find(l => l.id === id);
        if (layer) revokeKmzBlobUrls(layer);
        removeLayer(id);
        mapService.removeLayer(id);
        refreshUI();
    }
}

// ============================
// Field List (left panel)
// ============================


// ============================
// Output Panel (right panel)
// ============================


// ============================
// Layer Styling Panel
// ============================







// ============================
// Layer Data Tools Panel (left panel section)
// ============================


// ============================
// Coordinate Search ??? add point from search marker
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
        // No layers ??? fall back to creating new
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
// Logs panel
// ============================
export function toggleLogs() {
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

    
        const rootId = `split-column-react-${Date.now()}`;
        showModal('Split Column', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountSplitColumnDialog } = await import('../../react/tools/mountSplitColumnDialog.jsx');
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
}

// Combine Columns
async function openCombineColumns() {
    const fields = getFieldNames();
    if (fields.length < 2) return showToast('Need at least 2 fields', 'warning');

    
        const rootId = `combine-columns-react-${Date.now()}`;
        showModal('Combine Columns', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountCombineColumnsDialog } = await import('../../react/tools/mountCombineColumnsDialog.jsx');
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
}

// Template Builder
async function openTemplateBuilder() {
    const fields = getFieldNames();
    if (fields.length === 0) return showToast('No fields available', 'warning');
    const features = getFeatures();

    const rootId = `template-builder-react-${Date.now()}`;
    showModal('Template Builder', `<div id="${rootId}"></div>`, {
        width: '650px',
        onMount: async (overlay, close) => {
            const root = overlay.querySelector(`#${rootId}`);
            if (!root) return;
            const { mountTemplateBuilderDialog } = await import('../../react/tools/mountTemplateBuilderDialog.jsx');
            const mounted = mountTemplateBuilderDialog(root, {
                fields,
                features,
                onCancel: () => close(),
                onApply: ({ template, outputField, trimWhitespace, collapseSpaces, removeEmptyWrappers, removeDanglingSeparators, collapseSeparators }) => {
                    if (!template) return showToast('Enter a template', 'warning');
                    const opts = { trimWhitespace, collapseSpaces, removeEmptyWrappers, removeDanglingSeparators, collapseSeparators };
                    const result = applyTemplate(features, template, outputField || 'template_result', opts);
                    applyTransform(`Template: ${outputField || 'template_result'}`, result);
                    close();
                }
            });
            watchOverlayUnmount(overlay, () => mounted.unmount?.());
        }
    });
}

// Replace/Clean
async function openReplaceClean() {
    const fields = getFieldNames();
    if (fields.length === 0) return showToast('No fields available', 'warning');

    
        const rootId = `replace-clean-react-${Date.now()}`;
        showModal('Replace / Clean Text', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountReplaceCleanDialog } = await import('../../react/tools/mountReplaceCleanDialog.jsx');
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
}

// Type Convert
async function openTypeConvert() {
    const fields = getFieldNames();

    
        const rootId = `type-convert-react-${Date.now()}`;
        showModal('Type Convert', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountTypeConvertDialog } = await import('../../react/tools/mountTypeConvertDialog.jsx');
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
}

// Filter Builder
export async function openFilterBuilder(targetLayerId) {
    if (targetLayerId) {
        setActiveLayer(targetLayerId);
        refreshUI();
    }
    const layer = getActiveLayer();
    if (!layer) return showToast('No active layer', 'warning');
    const fields = getFieldNames();
    const existing = layer._activeFilter || null;

    const rootId = `filter-builder-react-${Date.now()}`;
    showModal(existing ? 'Edit Filter' : 'Filter Builder', `<div id="${rootId}"></div>`, {
        width: '650px',
        onMount: async (overlay, close) => {
            const root = overlay.querySelector(`#${rootId}`);
            if (!root) return;
            const { mountFilterBuilderDialog } = await import('../../react/tools/mountFilterBuilderDialog.jsx');
            const mounted = mountFilterBuilderDialog(root, {
                fields,
                operators: transforms.FILTER_OPERATORS,
                existing,
                onCancel: () => close(),
                onRemoveFilter: () => {
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
                        showToast('No snapshot ? use Undo to revert', 'info');
                    }
                    close();
                },
                onApply: async ({ rules, logic }) => {
                    const sourceFeatures = layer._preFilterSnapshot
                        ? JSON.parse(JSON.stringify(layer._preFilterSnapshot)).features
                        : getFeatures();
                    if (!layer._preFilterSnapshot) {
                        layer._preFilterSnapshot = JSON.parse(JSON.stringify(layer.geojson));
                    }
                    let result;
                    if (sourceFeatures.length >= transforms.DATAPREP_CHUNK_THRESHOLD) {
                        close();
                        const filtered = await runWithTaskProgress('Filter', async () => {
                            const { TaskRunner } = await import('../core/task-runner.js');
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
                }
            });
            watchOverlayUnmount(overlay, () => mounted.unmount?.());
        }
    });
}

// Deduplicate
async function openDeduplicate() {
    const fields = getFieldNames();

    
        const rootId = `deduplicate-react-${Date.now()}`;
        showModal('Deduplicate', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountDeduplicateDialog } = await import('../../react/tools/mountDeduplicateDialog.jsx');
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
}

// Join Tool
async function openJoinTool() {
    const fields = getFieldNames();
    let joinRows = [];

    const rootId = `join-tool-react-${Date.now()}`;
    showModal('Join Tool', `<div id="${rootId}"></div>`, {
        width: '600px',
        onMount: async (overlay, close) => {
            const root = overlay.querySelector(`#${rootId}`);
            if (!root) return;
            const { mountJoinToolDialog } = await import('../../react/tools/mountJoinToolDialog.jsx');
            const mounted = mountJoinToolDialog(root, {
                fields,
                onCancel: () => close(),
                onFileLoad: async (file) => {
                    try {
                        const ds = await importFile(file);
                        joinRows = ds.type === 'spatial'
                            ? ds.geojson.features.map((f) => f.properties)
                            : ds.rows || [];
                        const joinFields = joinRows.length > 0 ? Object.keys(joinRows[0]) : [];
                        showToast(`Loaded ${joinRows.length} rows from ${file.name}`, 'success');
                        return { joinFields, rowCount: joinRows.length };
                    } catch (err) {
                        showToast(`Failed to load join file: ${err.message}`, 'error');
                        return null;
                    }
                },
                onApply: async ({ leftKey, rightKey, fieldsToJoin }) => {
                    const sourceFeatures = getFeatures();
                    let joinResult;
                    if (sourceFeatures.length >= transforms.DATAPREP_CHUNK_THRESHOLD) {
                        close();
                        joinResult = await runWithTaskProgress('Join', async () => {
                            const { TaskRunner } = await import('../core/task-runner.js');
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
                }
            });
            watchOverlayUnmount(overlay, () => mounted.unmount?.());
        }
    });
}

// Validation
async function openValidation() {
    const fields = getFieldNames();
    const rootId = `validation-react-${Date.now()}`;
    showModal('Validation Rules', `<div id="${rootId}"></div>`, {
        width: '600px',
        onMount: async (overlay, close) => {
            const root = overlay.querySelector(`#${rootId}`);
            if (!root) return;
            const { mountValidationDialog } = await import('../../react/tools/mountValidationDialog.jsx');
            const mounted = mountValidationDialog(root, {
                fields,
                onCancel: () => close(),
                onApply: (rules) => {
                    const errors = transforms.validate(getFeatures(), rules);
                    showToast(`Validation complete: ${errors.length} errors found`, errors.length > 0 ? 'warning' : 'success');
                    if (errors.length > 0) {
                        const detail = errors.slice(0, 20).map((e) => `Row ${e.featureIndex}: ${e.message}`).join('\n');
                        showToast(`First errors:\n${detail}`, 'warning', { duration: 10000 });
                    }
                    close();
                }
            });
            watchOverlayUnmount(overlay, () => mounted.unmount?.());
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
    
        const rootId = `buffer-tool-react-${Date.now()}`;
        showModal('Buffer', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountBufferToolDialog } = await import('../../react/tools/mountBufferToolDialog.jsx');
                const mounted = mountBufferToolDialog(root, {
                    selectionCount: mapService.getSelectionCount(layer.id),
                    totalCount: work.totalCount,
                    layerName: layer.name,
                    showLargeDatasetWarning: work.totalCount > 5000,
                    onCancel: () => close(),
                    onApply: async ({ dist, units, applyTo }) => {
                        close();
                        try {
                            const result = await runWithTaskProgress('Buffer', () =>
                                gisTools.bufferFeatures(getWorkingDataset(layer, applyTo), dist, units)
                            );
                            if (!result) return;
                            addLayer(result);
                            mapService.addLayer(result, getLayers().indexOf(result), { fit: true });
                            showToast(`Buffer complete ??? new layer "${result.name}" created`, 'success');
                            refreshUI();
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'Buffer'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });

}

async function openSimplify() {
    const layer = getActiveLayer();
    if (!layer || layer.type !== 'spatial') return showToast('Need a spatial layer', 'warning');

    const work = getWorkingFeatures(layer);
    
        const rootId = `simplify-tool-react-${Date.now()}`;
        showModal('Simplify Geometries', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountSimplifyToolDialog } = await import('../../react/tools/mountSimplifyToolDialog.jsx');
                const mounted = mountSimplifyToolDialog(root, {
                    selectionCount: mapService.getSelectionCount(layer.id),
                    totalCount: work.totalCount,
                    layerName: layer.name,
                    onCancel: () => close(),
                    onApply: async ({ tol, applyTo }) => {
                        close();
                        try {
                            const simplified = await runWithTaskProgress('Simplify', () =>
                                gisTools.simplifyFeatures(getWorkingDataset(layer, applyTo), tol)
                            );
                            if (!simplified) return;
                            const { dataset, stats } = simplified;
                            addLayer(dataset);
                            mapService.addLayer(dataset, getLayers().indexOf(dataset), { fit: true });
                            showToast(`Simplified: ${stats.verticesBefore} ??? ${stats.verticesAfter} vertices`, 'success');
                            refreshUI();
                        } catch (e) {
                            showErrorToast(handleError(e, 'GISTools', 'Simplify'));
                        }
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });

}

async function openClip() {
    const layer = getActiveLayer();
    if (!layer || layer.type !== 'spatial') return showToast('Need a spatial layer', 'warning');

    const work = getWorkingFeatures(layer);
    
        const rootId = `clip-extent-react-${Date.now()}`;
        showModal('Clip to Current Map Extent', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountClipExtentDialog } = await import('../../react/tools/mountClipExtentDialog.jsx');
                const mounted = mountClipExtentDialog(root, {
                    selectionCount: mapService.getSelectionCount(layer.id),
                    totalCount: work.totalCount,
                    layerName: layer.name,
                    onCancel: () => close(),
                    onApply: async ({ applyTo }) => {
                        close();
                        const bounds = mapService.getBounds();
                        if (!bounds) return showToast('Map bounds not available', 'warning');
                        const bbox = turf.bboxPolygon([
                            bounds.getWest(), bounds.getSouth(),
                            bounds.getEast(), bounds.getNorth()
                        ]);
                        try {
                            const result = await runWithTaskProgress('Clip', () =>
                                gisTools.clipFeatures(getWorkingDataset(layer, applyTo), bbox.geometry)
                            );
                            if (!result) return;
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
        const work = getWorkingFeatures(layer);
        const features = work?.geojson?.features || [];
        const has = features.some(f => f.geometry && types.includes(f.geometry.type));
        if (!has) {
            const scope = work?.isSelection ? 'selection' : 'layer';
            showToast(`Need ${types.join(' or ')} features in ${scope}`, 'warning');
            return null;
        }
    }
    return layer;
}

/**
 * Get the features to operate on for the active layer.
 * If features are selected ??? returns only selected features as a FeatureCollection.
 * If nothing selected ??? returns all features (the full geojson).
 * Also returns metadata about whether this is a selection or full dataset.
 */
/**
 * @param {'auto'|'layer'|'selection'} applyTo
 */
function getWorkingFeatures(layer, applyTo = 'auto') {
    if (!layer || layer.type !== 'spatial') return null;
    const totalCount = layer.geojson.features.length;
    const selected = mapService.getSelectedFeatures(layer.id, layer.geojson);
    const selectionCount = selected?.features?.length ?? 0;

    const useSelection = applyTo === 'selection'
        || (applyTo === 'auto' && selectionCount > 0);

    if (useSelection && selectionCount > 0) {
        return {
            geojson: selected,
            isSelection: true,
            count: selectionCount,
            totalCount
        };
    }
    return {
        geojson: layer.geojson,
        isSelection: false,
        count: totalCount,
        totalCount
    };
}

/**
 * Build a temporary dataset-like object from the working features for tools.
 */
function getWorkingDataset(layer, applyTo = 'auto') {
    const work = getWorkingFeatures(layer, applyTo);
    if (!work) return null;
    return {
        ...layer,
        geojson: work.geojson,
        _isSelection: work.isSelection,
        _selectionCount: work.count
    };
}

/** @deprecated Selection is always on; clears current selection */
export function toggleSelectionMode() {
    clearSelection();
}

export function clearSelection() {
    mapService.clearSelection();
}

export function selectAllFeatures() {
    const layer = getActiveLayer();
    if (!layer || layer.type !== 'spatial') return;
    mapService.selectAll(layer.id, layer.geojson);
}

export function invertSelection() {
    const layer = getActiveLayer();
    if (!layer || layer.type !== 'spatial') return;
    mapService.invertSelection(layer.id, layer.geojson);
}

export async function deleteSelectedFeatures() {
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
    
        const rootId = `distance-tool-react-${Date.now()}`;
        showModal('Measure Distance', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountDistanceToolDialog } = await import('../../react/tools/mountDistanceToolDialog.jsx');
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
}

// --- Bearing ---
async function openBearingTool() {
    if (typeof turf === 'undefined') return showToast('Turf.js not loaded yet', 'warning');
    
        const rootId = `bearing-tool-react-${Date.now()}`;
        showModal('Measure Bearing', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountBearingToolDialog } = await import('../../react/tools/mountBearingToolDialog.jsx');
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
                        showToast(`Bearing: ${b.toFixed(2)}? (${cardinal})`, 'success', { duration: 10000 });
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
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
    
        const rootId = `destination-tool-react-${Date.now()}`;
        showModal('Find Destination Point', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountDestinationToolDialog } = await import('../../react/tools/mountDestinationToolDialog.jsx');
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
}

// --- Along ---
async function openAlongTool() {
    const layer = requireSpatialLayer(['LineString', 'MultiLineString']);
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    
        const rootId = `along-tool-react-${Date.now()}`;
        showModal('Point Along Line', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountAlongToolDialog } = await import('../../react/tools/mountAlongToolDialog.jsx');
                const mounted = mountAlongToolDialog(root, {
                    selectionCount: mapService.getSelectionCount(layer.id),
                    totalCount: work.totalCount,
                    layerName: layer.name,
                    onCancel: () => close(),
                    onPick: ({ dist, units, applyTo }) => {
                        close();
                        const line = findFirstLineStringFeature(getWorkingFeatures(layer, applyTo).geojson);
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

    
        const rootId = `ptl-distance-react-${Date.now()}`;
        showModal('Point to Line Distance', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountPointToLineDistanceDialog } = await import('../../react/tools/mountPointToLineDistanceDialog.jsx');
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
}

// --- BBox Clip (draw rectangle) ---
async function openBboxClip() {
    const layer = requireSpatialLayer();
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    
        const rootId = `bbox-clip-react-${Date.now()}`;
        showModal('BBox Clip', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountBboxClipDialog } = await import('../../react/tools/mountBboxClipDialog.jsx');
                const mounted = mountBboxClipDialog(root, {
                    selectionCount: mapService.getSelectionCount(layer.id),
                    totalCount: work.totalCount,
                    layerName: layer.name,
                    onCancel: () => close(),
                    onDraw: async ({ applyTo }) => {
                        close();
                        const bbox = await mapService.startRectangleDraw('Click and drag to draw a clip rectangle');
                        if (!bbox) return;
                        try {
                            const result = await runWithTaskProgress('BBox Clip', () =>
                                gisTools.bboxClipFeatures(getWorkingDataset(layer, applyTo), bbox)
                            );
                            if (!result) return;
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
}

// --- Bezier Spline ---
async function openBezierSpline() {
    const layer = requireSpatialLayer(['LineString', 'MultiLineString']);
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    
        const rootId = `bezier-spline-react-${Date.now()}`;
        showModal('Bezier Spline', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountBezierSplineDialog } = await import('../../react/tools/mountBezierSplineDialog.jsx');
                const mounted = mountBezierSplineDialog(root, {
                    selectionCount: mapService.getSelectionCount(layer.id),
                    totalCount: work.totalCount,
                    layerName: layer.name,
                    onCancel: () => close(),
                    onApply: async ({ res, sharp, applyTo }) => {
                        close();
                        try {
                            const result = await gisTools.bezierSplineFeatures(getWorkingDataset(layer, applyTo), res, sharp);
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

}

// --- Polygon Smooth ---
async function openPolygonSmooth() {
    const layer = requireSpatialLayer(['Polygon', 'MultiPolygon']);
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    
        const rootId = `polygon-smooth-react-${Date.now()}`;
        showModal('Polygon Smooth', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountPolygonSmoothDialog } = await import('../../react/tools/mountPolygonSmoothDialog.jsx');
                const mounted = mountPolygonSmoothDialog(root, {
                    selectionCount: mapService.getSelectionCount(layer.id),
                    totalCount: work.totalCount,
                    layerName: layer.name,
                    onCancel: () => close(),
                    onApply: async ({ iter, applyTo }) => {
                        close();
                        try {
                            const result = await runWithTaskProgress('Polygon Smooth', () =>
                                gisTools.polygonSmoothFeatures(getWorkingDataset(layer, applyTo), iter)
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

}

// --- Line Offset ---
async function openLineOffset() {
    const layer = requireSpatialLayer(['LineString', 'MultiLineString']);
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    
        const rootId = `line-offset-react-${Date.now()}`;
        showModal('Line Offset', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountLineOffsetDialog } = await import('../../react/tools/mountLineOffsetDialog.jsx');
                const mounted = mountLineOffsetDialog(root, {
                    selectionCount: mapService.getSelectionCount(layer.id),
                    totalCount: work.totalCount,
                    layerName: layer.name,
                    onCancel: () => close(),
                    onApply: async ({ dist, units, applyTo }) => {
                        close();
                        try {
                            const result = await gisTools.lineOffsetFeatures(getWorkingDataset(layer, applyTo), dist, units);
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

}

// --- Line Slice Along ---
async function openLineSliceAlong() {
    const layer = requireSpatialLayer(['LineString', 'MultiLineString']);
    if (!layer) return;

    
        const rootId = `line-slice-along-react-${Date.now()}`;
        showModal('Line Slice Along', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountLineSliceAlongDialog } = await import('../../react/tools/mountLineSliceAlongDialog.jsx');
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
}

// --- Line Slice (between two map-clicked points) ---
async function openLineSlice() {
    const layer = requireSpatialLayer(['LineString', 'MultiLineString']);
    if (!layer) return;

    
        const rootId = `line-slice-react-${Date.now()}`;
        showModal('Line Slice Between Points', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountLineSliceDialog } = await import('../../react/tools/mountLineSliceDialog.jsx');
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

    
        const rootId = `line-intersect-react-${Date.now()}`;
        showModal('Line Intersect', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountLineIntersectDialog } = await import('../../react/tools/mountLineIntersectDialog.jsx');
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
}

// --- Kinks (self-intersections) ---
async function openKinks() {
    const layer = requireSpatialLayer();
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    
        const rootId = `kinks-react-${Date.now()}`;
        showModal('Find Kinks (Self-Intersections)', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountKinksDialog } = await import('../../react/tools/mountKinksDialog.jsx');
                const mounted = mountKinksDialog(root, {
                    selectionCount: mapService.getSelectionCount(layer.id),
                    totalCount: work.totalCount,
                    layerName: layer.name,
                    onCancel: () => close(),
                    onFind: async ({ applyTo }) => {
                        close();
                        try {
                            const result = await gisTools.findKinks(getWorkingDataset(layer, applyTo));
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
}

// --- Combine ---
async function openCombine() {
    const layer = requireSpatialLayer();
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    
        const rootId = `combine-features-react-${Date.now()}`;
        showModal('Combine Features', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountCombineFeaturesDialog } = await import('../../react/tools/mountCombineFeaturesDialog.jsx');
                const mounted = mountCombineFeaturesDialog(root, {
                    selectionCount: mapService.getSelectionCount(layer.id),
                    totalCount: work.totalCount,
                    layerName: layer.name,
                    onCancel: () => close(),
                    onCombine: ({ applyTo }) => {
                        close();
                        try {
                            const result = gisTools.combineFeatures(getWorkingDataset(layer, applyTo));
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
}

// --- Union ---
async function openUnion() {
    const layer = requireSpatialLayer(['Polygon', 'MultiPolygon']);
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    const polyCount = work.geojson.features.filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')).length;
    
        const rootId = `union-polygons-react-${Date.now()}`;
        showModal('Union Polygons', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountUnionPolygonsDialog } = await import('../../react/tools/mountUnionPolygonsDialog.jsx');
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
}

// --- Dissolve ---
async function openDissolve() {
    const layer = requireSpatialLayer(['Polygon', 'MultiPolygon']);
    if (!layer) return;

    const work = getWorkingFeatures(layer);
    
        const rootId = `dissolve-react-${Date.now()}`;
        showModal('Dissolve', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountDissolveDialog } = await import('../../react/tools/mountDissolveDialog.jsx');
                const mounted = mountDissolveDialog(root, {
                    fields: layer.schema?.fields || [],
                    selectionCount: mapService.getSelectionCount(layer.id),
                    totalCount: work.totalCount,
                    layerName: layer.name,
                    onCancel: () => close(),
                    onDissolve: async ({ field, applyTo }) => {
                        close();
                        try {
                            const result = await runWithTaskProgress('Dissolve', () =>
                                gisTools.dissolveFeatures(getWorkingDataset(layer, applyTo), field)
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
}

// --- Sector ---
async function openSector() {
    if (typeof turf === 'undefined') return showToast('Turf.js not loaded yet', 'warning');
    
        const rootId = `sector-react-${Date.now()}`;
        showModal('Create Sector', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountSectorDialog } = await import('../../react/tools/mountSectorDialog.jsx');
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

    
        const rootId = `nearest-point-react-${Date.now()}`;
        showModal('Nearest Point', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountNearestPointDialog } = await import('../../react/tools/mountNearestPointDialog.jsx');
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

    const ptLayers = pointLayerDefs
        .map((layer) => `<option value="${layer.id}">${layer.name} (${layer.count})</option>`)
        .join('');
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

    
        const rootId = `nearest-point-on-line-react-${Date.now()}`;
        showModal('Nearest Point on Line', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountNearestPointOnLineDialog } = await import('../../react/tools/mountNearestPointOnLineDialog.jsx');
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

    
        const rootId = `nearest-point-to-line-react-${Date.now()}`;
        showModal('Nearest Point to Line', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountNearestPointToLineDialog } = await import('../../react/tools/mountNearestPointToLineDialog.jsx');
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
}

// --- Nearest Neighbor Analysis ---
async function openNearestNeighborAnalysis() {
    const layer = requireSpatialLayer(['Point']);
    if (!layer) return;

    
        const rootId = `nearest-neighbor-react-${Date.now()}`;
        showModal('Nearest Neighbor Analysis', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountNearestNeighborAnalysisDialog } = await import('../../react/tools/mountNearestNeighborAnalysisDialog.jsx');
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
                            showModal('Nearest Neighbor Analysis ??? Results', `<div id="${resultsRootId}"></div>`, {
                                width: '450px',
                                onMount: async (resultsOverlay) => {
                                    const resultsRoot = resultsOverlay.querySelector(`#${resultsRootId}`);
                                    if (!resultsRoot) return;
                                    const { mountNearestNeighborResultsDialog } = await import('../../react/tools/mountNearestNeighborResultsDialog.jsx');
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

    
        const rootId = `points-within-polygon-react-${Date.now()}`;
        showModal('Points Within Polygon', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountPointsWithinPolygonDialog } = await import('../../react/tools/mountPointsWithinPolygonDialog.jsx');
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

    const ptLayers = pointLayerDefs
        .map((layer) => `<option value="${layer.id}">${layer.name} (${layer.count})</option>`)
        .join('');
    const polyLayers = polygonLayerDefs
        .map((layer) => `<option value="${layer.id}">${layer.name} (${layer.count})</option>`)
        .join('');
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

    
        const rootId = `coord-converter-react-${Date.now()}`;
        showModal('Coordinate Converter', `<div id="${rootId}"></div>`, {
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountCoordConverterDialog } = await import('../../react/tools/mountCoordConverterDialog.jsx');
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
}

// ============================
// Photo Mapper modal
// ============================
export async function openPhotoMapper() {
    
        const rootId = `photo-mapper-react-${Date.now()}`;
        showModal('Photo Mapper', `<div id="${rootId}"></div>`, {
            width: '700px',
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;

                const { mountPhotoMapperDialog } = await import('../../react/tools/mountPhotoMapperDialog.jsx');
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
}

async function processPhotoFilesCore(files) {
    // Broad filter ??? iOS may report no type for some images
    const imageFiles = files.filter(f =>
        f.type.startsWith('image/') ||
        /\.(jpe?g|png|heic|heif|tiff?|webp|bmp|gif)$/i.test(f.name) ||
        (!f.type && f.size > 0) // iOS sometimes gives no MIME type ??? let it through
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
            <span class="badge badge-success">??? ${result.withGPS} with GPS</span>
            <span class="badge badge-warning">???? ${result.withoutGPS} without GPS</span>
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
export function getWidgetContext() {
    return createWidgetContext({
        getLayers,
        getLayerById: (id) => getLayers().find((layer) => layer.id === id),
        mapService,
        addLayer,
        createSpatialDataset,
        refreshUI,
        showToast,
        setActiveLayer: setActiveLayerAndRefresh,
        analyzeSchema,
        turf: globalThis.turf
    });
}

// ============================
// Import Fence
// ============================
let _fenceBbox = null; // [west, south, east, north] when fence is active

function hasActiveImportFence() {
    return !!_fenceBbox || mapService.hasImportFence();
}

export async function startImportFence() {
    if (dualScreenCoordinator.isActive) {
        if (hasActiveImportFence()) {
            const rootId = `import-fence-react-${Date.now()}`;
            showModal('Import Fence', `<div id="${rootId}"></div>`, {
                width: '400px',
                onMount: async (overlay, close) => {
                    const root = overlay.querySelector(`#${rootId}`);
                    if (!root) return;
                    const { mountImportFenceOptionsDialog } = await import('../../react/tools/mountImportFenceOptionsDialog.jsx');
                    const mounted = mountImportFenceOptionsDialog(root, {
                        message: 'An import fence is currently active. All imports are filtered to this area.',
                        onPlaceNewFence: () => {
                            close();
                            dualScreenCoordinator.broadcastDrawCmd({ action: 'startFence' });
                            dualScreenCoordinator.focusMapWindow();
                            showToast('Draw the fence on the Dual Screen map window', 'info');
                        },
                        onRemoveFence: () => {
                            _fenceBbox = null;
                            updateFenceButtonState();
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
        dualScreenCoordinator.broadcastDrawCmd({ action: 'startFence' });
        dualScreenCoordinator.focusMapWindow();
        showToast('Draw the import fence on the Dual Screen map window', 'info');
        return;
    }

    if (mapService.hasImportFence()) {
        const rootId = `import-fence-react-${Date.now()}`;
        showModal('Import Fence', `<div id="${rootId}"></div>`, {
            width: '400px',
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountImportFenceOptionsDialog } = await import('../../react/tools/mountImportFenceOptionsDialog.jsx');
                const mounted = mountImportFenceOptionsDialog(root, {
                    message: 'An import fence is currently active on the map. All imports (files and ArcGIS) are filtered to this area.',
                    placeNewDescription: 'Remove current fence and draw a new one',
                    clearDescription: 'Clear fence from map ? imports will no longer be filtered',
                    onPlaceNewFence: async () => {
                        close();
                        await drawNewFence();
                    },
                    onRemoveFence: () => {
                        mapService.clearImportFence();
                        _fenceBbox = null;
                        updateFenceButtonState();
                        close();
                        showToast('Import fence removed', 'info');
                    }
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
            }
        });
        return;
    }

    await drawNewFence();
}

async function drawNewFence() {
    const bbox = await mapService.startImportFenceDraw();
    if (!bbox) {
        showToast('Fence cancelled', 'info');
        return;
    }
    _fenceBbox = bbox;
    updateFenceButtonState();
    showToast('Import fence placed — all imports will be filtered to this area', 'success');
}

export function updateFenceButtonState() {
    const btn = document.getElementById('btn-fence');
    if (!btn) return;
    if (hasActiveImportFence()) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        btn.innerHTML = '<span class="btn-icon-text">⛶</span><span>Import Fence (active)</span>';
    } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        btn.innerHTML = '<span class="btn-icon-text">⛶</span><span>Import Fence</span>';
    }
}

// ============================
// ArcGIS REST Importer modal
// ============================
export async function openArcGISImporter() {
    const spatialFilter = mapService.getImportFenceEsriEnvelope();
    const fenceBadge = spatialFilter ? '<div class="success-box text-xs mb-8" style="padding:6px 10px;">⛶ <strong>Import Fence active</strong> — only features inside the fence will be downloaded from the server.</div>' : '';

    
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
                            const { TaskRunner } = await import('../core/task-runner.js');
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

                const { mountArcGISImporterDialog } = await import('../../react/tools/mountArcGISImporterDialog.jsx');
                const mounted = mountArcGISImporterDialog(root, {
                    endpoints: ARCGIS_ENDPOINTS,
                    hasImportFence: !!spatialFilter,
                    onCancel: () => close(),
                    onImport: startImportLayer
                });
                watchOverlayUnmount(overlay, () => mounted.unmount?.());
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

    
        const rootId = `network-links-react-${Date.now()}`;
        await showModal('Network links in KML', `<div id="${rootId}"></div>`, {
            width: '520px',
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountNetworkLinksDialog } = await import('../../react/tools/mountNetworkLinksDialog.jsx');
                const mounted = mountNetworkLinksDialog(root, {
                    hrefs,
                    onDismiss: () => close(),
                    onFetch: async () => {
                        try {
                            const { mergeNetworkLinksIntoDataset } = await import('../import/kml-networklink.js');
                            const { TaskRunner } = await import('../core/task-runner.js');
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

    const list = hrefs.map(h =>
        `<li style="word-break:break-all;font-size:11px;">${_escapeHtmlModal(h)}</li>`
    ).join('');
}

// ============================
// Export handler
// ============================
export async function doExport(format) {
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
            // Multi-layer export ??? honor chosen format (KML vs KMZ)
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
        const layerStyle = mapService.getLayerStyle(layer.id);
        if (layerStyle && isSmartStyleActive(layerStyle) && ['shapefile', 'csv', 'xlsx'].includes(format)) {
            showToast('Smart styling is not included in this format. Use KML, KMZ, or GeoJSON for styled output.', 'info');
        }
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
                const { mountKmlExportPickerDialog } = await import('../../react/tools/mountKmlExportPickerDialog.jsx');
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

// ============================
// Other handlers
// ============================

// ????????? Draw Layer ?????????
export function createDrawLayer() {
    const activeLayer = getActiveLayer();
    const hasActiveSpatial = activeLayer && activeLayer.type === 'spatial';

    const items = [
        { icon: '????', label: 'New draw layer', desc: 'Create an empty layer and start drawing', action: 'new' },
    ];
    if (hasActiveSpatial) {
        items.push({ icon: '????', label: `Draw on "${activeLayer.name}"`, desc: 'Add features to the active layer', action: 'active' });
    }

    // If no active spatial layer, just create a new one directly
    if (!hasActiveSpatial) {
        _doCreateDrawLayer();
        return;
    }

    
        const rootId = `draw-layer-chooser-react-${Date.now()}`;
        showModal('Draw Features', `<div id="${rootId}"></div>`, {
            width: '380px',
            onMount: async (overlay, close) => {
                const root = overlay.querySelector(`#${rootId}`);
                if (!root) return;
                const { mountDrawLayerChooserDialog } = await import('../../react/tools/mountDrawLayerChooserDialog.jsx');
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
    showToast('Draw layer created ??? use the toolbar to draw features', 'success');
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

export async function handleMergeLayers() {
    const layers = getLayers();
    if (layers.length < 2) return showToast('Need at least 2 layers to merge', 'warning');

    const rootId = `merge-layers-react-${Date.now()}`;
    const mergeLayers = layers.map((layer, index) => ({
        index,
        name: layer.name,
        featureCount: layer.type === 'spatial' ? (layer.geojson?.features?.length || 0) : (layer.rows?.length || 0)
    }));
    const result = await showModal('Merge Layers', `<div id="${rootId}"></div>`, {
        onMount: async (overlay, close) => {
            const root = overlay.querySelector(`#${rootId}`);
            if (!root) return;
            const { mountMergeLayersDialog } = await import('../../react/tools/mountMergeLayersDialog.jsx');
            const mounted = mountMergeLayersDialog(root, {
                layers: mergeLayers,
                onCancel: () => close(null),
                onMerge: (selectedIndices) => close(selectedIndices)
            });
            watchOverlayUnmount(overlay, () => mounted.unmount?.());
        }
    });

    if (!result || result.length < 2) {
        if (result && result.length === 1) showToast('Select at least 2 layers to merge', 'warning');
        return;
    }

    const selected = result.map(i => layers[i]);
    const merged = mergeDatasets(selected);
    addLayer(merged);
    mapService.addLayer(merged, getLayers().indexOf(merged), { fit: true });
    showToast(`Merged ${selected.length} layers ? ${merged.geojson.features.length} features`, 'success');
    refreshUI();
}

export function handleUndo() {
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

export function handleRedo() {
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
// Feature Editor ? edit a single feature's attributes from popup
// ============================
export function openFeatureEditor(layerId, featureIndex) {
    const layers = getLayers();
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== 'spatial') return showToast('Layer not found', 'warning');

    const feature = layer.geojson.features[featureIndex];
    if (!feature) return showToast('Feature not found', 'warning');

    const props = feature.properties || {};
    const fields = Object.keys(props).filter((k) => !k.startsWith('_'));
    const schemaFields = layer.schema?.fields || [];
    const getFieldType = (name) => schemaFields.find((f) => f.name === name)?.type || 'string';
    const geomType = feature.geometry?.type || 'Unknown';

    const rootId = `feature-editor-react-${Date.now()}`;
    showModal('Edit Feature', `<div id="${rootId}"></div>`, {
        width: '420px',
        onMount: async (overlay, close) => {
            const root = overlay.querySelector(`#${rootId}`);
            if (!root) return;
            const { mountFeatureEditorDialog } = await import('../../react/tools/mountFeatureEditorDialog.jsx');
            const mounted = mountFeatureEditorDialog(root, {
                layerName: layer.name,
                featureIndex,
                geomType,
                fields,
                getFieldType,
                getFieldValue: (name) => props[name],
                onError: (msg) => showToast(msg, 'warning'),
                onCancel: () => close(),
                onSave: ({ textValues, attachmentUpdates }) => {
                    saveSnapshot(layer.id, 'Edit Feature', layer.geojson);
                    for (const [field, newVal] of Object.entries(textValues || {})) {
                        const oldVal = props[field];
                        if (oldVal === null || oldVal === undefined) {
                            props[field] = newVal === '' ? null : newVal;
                        } else if (typeof oldVal === 'number') {
                            props[field] = newVal === '' ? null : (Number.isNaN(Number(newVal)) ? newVal : Number(newVal));
                        } else if (typeof oldVal === 'boolean') {
                            props[field] = newVal === 'true' || newVal === '1';
                        } else {
                            props[field] = newVal;
                        }
                    }
                    for (const [field, data] of Object.entries(attachmentUpdates || {})) {
                        props[field] = data;
                    }
                    layer.schema = analyzeSchema(layer.geojson);
                    bus.emit('layer:updated', layer);
                    bus.emit('layers:changed', getLayers());
                    mapService.addLayer(layer, getLayers().indexOf(layer));
                    refreshUI();
                    showToast('Feature updated', 'success');
                    close();
                }
            });
            watchOverlayUnmount(overlay, () => mounted.unmount?.());
        }
    });
}

export function showDataTable() {
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
    const fields = Object.keys(firstProps).filter((k) => !k.startsWith('_'));
    const tableRows = displayRows.map((item) => (isSpatial ? (item.properties || {}) : item));

    const rootId = `data-table-react-${Date.now()}`;
    showModal(`Data: ${layer.name}`, `<div id="${rootId}"></div>`, {
        width: '90vw',
        onMount: async (overlay, close) => {
            const root = overlay.querySelector(`#${rootId}`);
            if (!root) return;
            const { mountDataTableDialog } = await import('../../react/tools/mountDataTableDialog.jsx');
            const mounted = mountDataTableDialog(root, {
                layerName: layer.name,
                fields,
                rows: tableRows,
                totalCount,
                isSpatial,
                onCellEdit: (rowIndex, field, coerced, isFirstEdit) => {
                    const target = isSpatial ? features[rowIndex]?.properties : (layer.rows || [])[rowIndex];
                    if (!target) return;
                    if (isFirstEdit && isSpatial) saveSnapshot(layer.id, 'Edit field data', layer.geojson);
                    target[field] = coerced;
                },
                onClose: ({ dirty: wasDirty }) => {
                    if (wasDirty && isSpatial) {
                        layer.schema = analyzeSchema(layer.geojson);
                        bus.emit('layer:updated', layer);
                        bus.emit('layers:changed', getLayers());
                        mapService.addLayer(layer, getLayers().indexOf(layer));
                        refreshUI();
                        showToast('Data edits saved', 'success');
                    }
                }
            });
            watchOverlayUnmount(overlay, () => mounted.unmount?.());
        }
    });
}

// ============================
// Field management
// ============================
export function toggleField(fieldName, selected) {
    const layer = getActiveLayer();
    if (!layer) return;
    const field = layer.schema?.fields?.find(f => f.name === fieldName);
    if (field) {
        field.selected = selected;
        refreshUI();
    }
}

export function selectAllFields(selected) {
    const layer = getActiveLayer();
    if (!layer) return;
    for (const f of (layer.schema?.fields || [])) f.selected = selected;
    refreshUI();
    refreshUI();
}

function filterFields(query) {
    const items = document.querySelectorAll('.field-list-items .field-item');
    const q = query.toLowerCase();
    items.forEach(el => {
        const name = el.dataset.field?.toLowerCase() || '';
        el.style.display = name.includes(q) ? '' : 'none';
    });
}

export function fixAGOL() {
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
export function renameLayer(layerId, el) {
    const layer = getLayers().find(l => l.id === layerId);
    if (!layer) return;

    // If inline element passed, do inline editing
    if (el && el.nodeType) {
        startInlineEdit(el, layer.name, (newName) => {
            newName = newName.trim();
            if (newName && newName !== layer.name) {
                layer.name = newName;
                refreshUI();
                refreshUI();
                showToast(`Layer renamed to "${newName}"`, 'success', { duration: 2000 });
            }
        });
        return;
    }

    // Fallback: prompt
    const newName = prompt('Rename layer:', layer.name);
    if (newName && newName.trim() && newName.trim() !== layer.name) {
        layer.name = newName.trim();
        refreshUI();
        refreshUI();
        showToast(`Layer renamed to "${layer.name}"`, 'success', { duration: 2000 });
    }
}

// ============================
// Rename Field
// ============================
export function renameField(fieldName, el) {
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
                refreshUI();
                refreshUI();
                showToast(`Field renamed to "${newName}"`, 'success', { duration: 2000 });
            }
        });
        return;
    }

    const newName = prompt('Rename field output name:', currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
        field.outputName = newName.trim();
        refreshUI();
        refreshUI();
        showToast(`Field renamed to "${field.outputName}"`, 'success', { duration: 2000 });
    }
}

// ============================
// Add New Field
// ============================
export function addField() {
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

                refreshUI();
                refreshUI();
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
 * Inline editing helper ??? replaces element text with an input
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
export function showToolInfo() {
    const rootId = `tool-guide-react-${Date.now()}`;
    showModal('Guide', `<div id="${rootId}"></div>`, {
        width: '560px',
        onMount: async (overlay) => {
            const root = overlay.querySelector(`#${rootId}`);
            if (!root) return;
            const { mountToolGuideDialog } = await import('../../react/tools/mountToolGuideDialog.jsx');
            const mounted = mountToolGuideDialog(root, { showTitle: true });
            watchOverlayUnmount(overlay, () => mounted.unmount?.());
        }
    });
}


export function getAppActions() {
    return APP_ACTIONS;
}

export function invokeAppAction(action, arg) {
    if (!action) return;
    const fn = APP_ACTIONS[action];
    if (typeof fn !== 'function') return;
    if (arg == null) { fn(); return; }
    if (arg === 'true') { fn(true); return; }
    if (arg === 'false') { fn(false); return; }
    fn(arg);
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
    ...buildWidgetActions(getWidgetContext),
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
export function setupLogsPanel() {
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
}
