/**
 * Dual Screen Mode — secondary map window entry
 */
import mapManager from './map/map-manager.js';
import { DualScreenChannel } from './dual-screen/channel.js';
import {
    MessageType,
    createMessage,
    shouldApplyViewport
} from './dual-screen/protocol.js';
import { createSpatialDataset } from './core/data-model.js';
import {
    initSecondaryClient,
    applyMapToast,
    handleDrawCmdMessage,
    broadcastViewportFromMap
} from './dual-screen/secondary-client.js';

const ROLE = 'secondary';
let channel = null;
let suppressViewportBroadcast = false;
let lastAppliedViewportId = null;
let viewportDebounce = null;
let byeSent = false;

function post(type, payload) {
    channel?.post(createMessage(ROLE, type, payload));
}

function sendBye() {
    if (byeSent) return;
    byeSent = true;
    post(MessageType.BYE, {});
}

function applySnapshot(payload) {
    if (!payload) return;
    const { layers, viewport, basemap, is3d } = payload;

    if (basemap && basemap !== mapManager.currentBasemap) {
        mapManager.setBasemap(basemap);
        syncBasemapToggle(basemap);
    }

    if (mapManager.map) {
        for (const id of [...mapManager.dataLayers.keys()]) {
            mapManager.removeLayer(id);
        }
    }

    (layers || []).forEach((entry, i) => {
        if (!entry.geojson) return;
        const dataset = createSpatialDataset(entry.name, entry.geojson, entry.source || { format: 'sync' });
        dataset.id = entry.id;
        dataset.visible = entry.visible !== false;
        if (entry.style) mapManager.setLayerStyle(entry.id, entry.style);
        mapManager.addLayer(dataset, i, { fit: false });
    });

    if (is3d) mapManager.enable3D();
    else mapManager.disable3D();
    syncDimensionToggle(!!is3d);

    if (viewport && mapManager.map) {
        suppressViewportBroadcast = true;
        mapManager.map.jumpTo({
            center: viewport.center,
            zoom: viewport.zoom,
            bearing: viewport.bearing ?? 0,
            pitch: viewport.pitch ?? 0
        });
        suppressViewportBroadcast = false;
    }
}

function applyLayerAdd(payload) {
    const { dataset, colorIndex, fit } = payload || {};
    if (!dataset?.geojson) return;
    const layer = createSpatialDataset(dataset.name, dataset.geojson, dataset.source || { format: 'sync' });
    layer.id = dataset.id;
    layer.visible = dataset.visible !== false;
    mapManager.removeLayer(layer.id);
    mapManager.addLayer(layer, colorIndex ?? 0, { fit: !!fit });
}

function applyLayerRemove(payload) {
    if (payload?.id) mapManager.removeLayer(payload.id);
}

function applyLayerOrder(payload) {
    const { orderedIds } = payload || {};
    if (!orderedIds?.length) return;
    mapManager.syncLayerOrder(orderedIds);
}

function applyViewport(payload) {
    if (!payload || !mapManager.map) return;
    if (payload.command === 'fitAll') {
        mapManager.fitToAll();
        return;
    }
    if (payload.command === 'fitLayers' && payload.layerIds?.length) {
        mapManager.fitToLayers(payload.layerIds);
        return;
    }
    if (payload.center) {
        mapManager.map.jumpTo({
            center: payload.center,
            zoom: payload.zoom ?? mapManager.map.getZoom(),
            bearing: payload.bearing ?? 0,
            pitch: payload.pitch ?? 0
        });
    }
}

function syncBasemapToggle(basemap) {
    document.querySelectorAll('#basemap-toggle .header-toggle-option').forEach(b => {
        b.classList.toggle('active', b.dataset.value === basemap);
    });
}

function syncDimensionToggle(is3d) {
    document.querySelectorAll('#dimension-toggle .header-toggle-option').forEach(b => {
        b.classList.toggle('active', b.dataset.value === (is3d ? '3d' : '2d'));
    });
}

function broadcastViewport() {
    if (suppressViewportBroadcast || !mapManager.map) return;
    post(MessageType.VIEWPORT, broadcastViewportFromMap(mapManager.map));
}

function onMapReady() {
    mapManager.map.on('moveend', () => {
        clearTimeout(viewportDebounce);
        viewportDebounce = setTimeout(broadcastViewport, 80);
    });
}

function handleMessage(msg) {
    switch (msg.type) {
        case MessageType.SNAPSHOT:
            applySnapshot(msg.payload);
            break;
        case MessageType.LAYER_ADD:
            applyLayerAdd(msg.payload);
            break;
        case MessageType.LAYER_REMOVE:
            applyLayerRemove(msg.payload);
            break;
        case MessageType.LAYER_ORDER:
            applyLayerOrder(msg.payload);
            break;
        case MessageType.VIEWPORT:
            if (shouldApplyViewport(msg, ROLE, lastAppliedViewportId)) {
                lastAppliedViewportId = msg.msgId;
                suppressViewportBroadcast = true;
                applyViewport(msg.payload);
                suppressViewportBroadcast = false;
            }
            break;
        case MessageType.DRAW_CMD:
            handleDrawCmdMessage(msg.payload, post);
            break;
        case MessageType.TOAST:
            applyMapToast(msg.payload);
            break;
        case MessageType.BYE:
            window.close();
            break;
        default:
            break;
    }
}

function setupHeaderControls() {
    document.getElementById('btn-exit-dual-screen')?.addEventListener('click', () => {
        sendBye();
        try {
            if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ type: 'gis-toolbox-dual-screen-exit' }, window.location.origin);
            }
        } catch (_) { /* ignore */ }
        window.close();
    });

    document.getElementById('basemap-toggle')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-value]');
        if (!btn) return;
        syncBasemapToggle(btn.dataset.value);
        mapManager.setBasemap(btn.dataset.value);
        post(MessageType.MAP_CHROME, { basemap: btn.dataset.value });
    });

    document.getElementById('dimension-toggle')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-value]');
        if (!btn) return;
        const is3d = btn.dataset.value === '3d';
        syncDimensionToggle(is3d);
        if (is3d) mapManager.enable3D();
        else mapManager.disable3D();
        post(MessageType.MAP_CHROME, { is3d });
    });
}

function boot() {
    if (typeof BroadcastChannel === 'undefined') {
        document.body.innerHTML = '<p style="padding:24px">Dual Screen requires BroadcastChannel (modern browser).</p>';
        return;
    }

    channel = new DualScreenChannel(ROLE, handleMessage);
    mapManager.init('map-container');
    setupHeaderControls();
    initSecondaryClient({ post, getChannel: () => channel });

    if (mapManager.map?.loaded()) onMapReady();
    else mapManager.map?.once('load', onMapReady);

    post(MessageType.HELLO, {});

    const teardownSecondary = () => {
        sendBye();
        channel?.close();
        channel = null;
    };

    window.addEventListener('beforeunload', teardownSecondary);
    window.addEventListener('pagehide', (e) => {
        if (!e.persisted) teardownSecondary();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
