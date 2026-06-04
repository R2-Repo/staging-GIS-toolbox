/**
 * Dual Screen Mode — primary-window lifecycle & sync orchestration
 */
import { getLayers } from '../core/state.js';
import mapManager from '../map/map-manager.js';
import { DualScreenChannel } from './channel.js';
import {
    MessageType,
    createMessage,
    buildSnapshotPayload,
    boundsFromViewportPayload
} from './protocol.js';
import { setDualScreenActiveHint } from './storage-hint.js';
import {
    isSecondaryMapWindowOpen,
    openSecondaryMapWindow
} from './window-open.js';

const POLL_MS = 500;
const ACTIVATE_HANDSHAKE_MS = 5000;

class DualScreenCoordinator {
    constructor() {
        this.isActive = false;
        this._mapWindow = null;
        this._channel = null;
        this._pollTimer = null;
        this._lastViewport = null;
        this._lastBounds = null;
        this._secondaryReady = false;
        this._onStateChange = null;
        this._handlers = {};
        /** @type {[number, number, number, number] | null} */
        this._fenceBbox = null;
        this._deactivating = false;
        this._pendingActivation = false;
        /** @type {ReturnType<typeof setTimeout> | null} */
        this._activateTimeout = null;
        /** @type {((ok: boolean) => void) | null} */
        this._activateResolve = null;
    }

    setFenceBbox(bbox) {
        this._fenceBbox = bbox || null;
    }

    onStateChange(fn) {
        this._onStateChange = fn;
    }

    /** @param {Partial<Record<string, Function>>} handlers */
    setHandlers(handlers) {
        this._handlers = { ...this._handlers, ...handlers };
    }

    _notify() {
        this._onStateChange?.(this.isActive);
    }

    _isMobile() {
        return window.innerWidth < 768;
    }

    _clearActivateTimeout() {
        if (this._activateTimeout) {
            clearTimeout(this._activateTimeout);
            this._activateTimeout = null;
        }
    }

    _abortPendingActivation() {
        this._clearActivateTimeout();
        this._pendingActivation = false;
        if (this._channel) {
            this._channel.post(createMessage('primary', MessageType.BYE, {}));
            this._channel.close();
            this._channel = null;
        }
        this._mapWindow = null;
        const resolve = this._activateResolve;
        this._activateResolve = null;
        resolve?.(false);
    }

    /**
     * @returns {Promise<boolean>} true if dual mode activated
     */
    async activate() {
        if (this.isActive) {
            this._focusMapWindow();
            return true;
        }
        if (this._isMobile()) return false;
        if (typeof BroadcastChannel === 'undefined') {
            console.warn('[DualScreen] BroadcastChannel not supported');
            return false;
        }
        if (this._pendingActivation) return false;

        this._mapWindow = openSecondaryMapWindow();

        if (isSecondaryMapWindowOpen(this._mapWindow)) {
            this._completeActivation();
            return true;
        }

        // Popup may have opened without a Window ref (e.g. cached script used noreferrer).
        this._pendingActivation = true;
        this._channel = new DualScreenChannel('primary', (msg) => this._handleMessage(msg));

        return new Promise((resolve) => {
            this._activateResolve = resolve;
            this._activateTimeout = setTimeout(() => {
                if (this._pendingActivation) this._abortPendingActivation();
            }, ACTIVATE_HANDSHAKE_MS);
        });
    }

    _completeActivation() {
        if (this.isActive) return;

        this._pendingActivation = false;
        this._clearActivateTimeout();

        this.isActive = true;
        setDualScreenActiveHint(typeof sessionStorage !== 'undefined' ? sessionStorage : null, true);
        this._secondaryReady = false;

        if (!this._channel) {
            this._channel = new DualScreenChannel('primary', (msg) => this._handleMessage(msg));
        }

        if (mapManager.map) {
            this._lastViewport = this._captureViewport();
            mapManager.destroy();
        }

        this._startPoll();
        this._notify();
    }

    /**
     * @param {{ fromSecondaryBye?: boolean }} [options]
     */
    deactivate(options = {}) {
        if (this._pendingActivation) {
            this._abortPendingActivation();
            return;
        }
        if (!this.isActive || this._deactivating) return;

        this._deactivating = true;
        try {
            this._stopPoll();

            if (!options.fromSecondaryBye) {
                if (this._channel) {
                    this._channel.post(createMessage('primary', MessageType.BYE, {}));
                }
                if (isSecondaryMapWindowOpen(this._mapWindow)) {
                    try { this._mapWindow.close(); } catch (_) { /* ignore */ }
                }
            }

            if (this._channel) {
                this._channel.close();
                this._channel = null;
            }

            this._mapWindow = null;
            this.isActive = false;
            this._secondaryReady = false;
            this._lastBounds = null;
            setDualScreenActiveHint(typeof sessionStorage !== 'undefined' ? sessionStorage : null, false);

            this._restorePrimaryMap();
            this._notify();
        } finally {
            this._deactivating = false;
        }
    }

    _startPoll() {
        this._stopPoll();
        this._pollTimer = setInterval(() => {
            if (this._mapWindow && this._mapWindow.closed) this.deactivate();
        }, POLL_MS);
    }

    _stopPoll() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    }

    _captureViewport() {
        const map = mapManager.map;
        if (!map) return this._lastViewport;
        const c = map.getCenter();
        const b = map.getBounds();
        return {
            center: [c.lng, c.lat],
            zoom: map.getZoom(),
            bearing: map.getBearing(),
            pitch: map.getPitch(),
            bounds: {
                west: b.getWest(),
                south: b.getSouth(),
                east: b.getEast(),
                north: b.getNorth()
            }
        };
    }

    _restorePrimaryMap() {
        const container = document.getElementById('map-container');
        if (!container) return;

        const placeholder = container.querySelector('.dual-screen-placeholder');
        if (placeholder) placeholder.remove();
        container.classList.remove('dual-screen-map-hidden');

        if (!mapManager.map) {
            mapManager.init('map-container');
        }

        const layers = getLayers().filter(l => l.type === 'spatial' && l.geojson);
        layers.forEach((layer, i) => {
            mapManager.addLayer(layer, i, { fit: false });
        });

        if (this._lastViewport && mapManager.map) {
            mapManager.map.jumpTo({
                center: this._lastViewport.center,
                zoom: this._lastViewport.zoom,
                bearing: this._lastViewport.bearing,
                pitch: this._lastViewport.pitch
            });
        } else if (layers.length) {
            mapManager.fitToAll();
        }

        setTimeout(() => mapManager.resize(), 100);
    }

    _applyMapChrome(payload) {
        if (!payload) return;
        if (payload.basemap && payload.basemap !== mapManager.currentBasemap) {
            mapManager.currentBasemap = payload.basemap;
            document.querySelectorAll('#basemap-toggle .header-toggle-option').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.value === payload.basemap);
            });
        }
        if (payload.is3d !== undefined) {
            mapManager._3dEnabled = !!payload.is3d;
            document.querySelectorAll('#dimension-toggle .header-toggle-option').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.value === (payload.is3d ? '3d' : '2d'));
            });
        }
    }

    _handleMessage(msg) {
        switch (msg.type) {
            case MessageType.HELLO:
                if (this._pendingActivation) {
                    this._completeActivation();
                    const resolve = this._activateResolve;
                    this._activateResolve = null;
                    resolve?.(true);
                    return;
                }
                this._secondaryReady = true;
                this.sendSnapshot();
                break;
            case MessageType.VIEWPORT:
                if (msg.payload) {
                    this._lastViewport = msg.payload;
                    this._lastBounds = boundsFromViewportPayload(msg.payload);
                }
                break;
            case MessageType.MAP_CHROME:
                this._applyMapChrome(msg.payload);
                break;
            case MessageType.DRAW_EVENT:
                this._handlers.onDrawEvent?.(msg.payload);
                break;
            case MessageType.POPUP_ACTION:
                this._handlers.onPopupAction?.(msg.payload);
                break;
            case MessageType.FILE_DROP:
                this._handlers.onFileDrop?.(msg.payload);
                break;
            case MessageType.FENCE_SET:
                this._handlers.onFenceSet?.(msg.payload);
                break;
            case MessageType.FENCE_CLEAR:
                this._handlers.onFenceClear?.(msg.payload);
                break;
            case MessageType.CTX_CMD:
                this._handlers.onCtxCmd?.(msg.payload);
                break;
            case MessageType.BYE:
                this.deactivate({ fromSecondaryBye: true });
                break;
            default:
                break;
        }
    }

    sendSnapshot() {
        if (!this._channel || !this._secondaryReady) return;
        const layers = getLayers();
        const payload = buildSnapshotPayload({
            layers: layers.filter(l => l.type === 'spatial'),
            viewport: this._lastViewport,
            basemap: mapManager.currentBasemap || 'voyager',
            is3d: !!mapManager._3dEnabled,
            layerStyles: mapManager._layerStyles
        });
        this._channel.post(createMessage('primary', MessageType.SNAPSHOT, payload));
    }

    syncLayersChanged() {
        if (!this.isActive || !this._secondaryReady) return;
        this.sendSnapshot();
    }

    broadcastLayerAdd(dataset, colorIndex, options = {}) {
        if (!this._channel) return;
        this._channel.post(createMessage('primary', MessageType.LAYER_ADD, {
            dataset: {
                id: dataset.id,
                name: dataset.name,
                type: dataset.type,
                visible: dataset.visible !== false,
                geojson: dataset.geojson ? JSON.parse(JSON.stringify(dataset.geojson)) : null
            },
            colorIndex,
            fit: !!options.fit
        }));
    }

    broadcastLayerRemove(id) {
        if (!this._channel) return;
        this._channel.post(createMessage('primary', MessageType.LAYER_REMOVE, { id }));
    }

    broadcastLayerOrder(orderedIds) {
        if (!this._channel) return;
        this._channel.post(createMessage('primary', MessageType.LAYER_ORDER, { orderedIds }));
    }

    broadcastFit(command, payload = {}) {
        if (!this._channel) return;
        this._channel.post(createMessage('primary', MessageType.VIEWPORT, {
            source: 'primary',
            command,
            ...payload
        }));
    }

    broadcastDrawCmd(payload) {
        if (!this._channel) return;
        this._channel.post(createMessage('primary', MessageType.DRAW_CMD, payload));
    }

    broadcastToast(message, type = 'info') {
        if (!this._channel) return;
        this._channel.post(createMessage('primary', MessageType.TOAST, { message, type }));
    }

    getBounds() {
        if (this._lastBounds) return this._lastBounds;
        if (!this._lastViewport) return null;
        const map = mapManager.map;
        if (map) return mapManager.getBounds();
        return boundsFromViewportPayload(this._lastViewport);
    }

    _focusMapWindow() {
        if (!isSecondaryMapWindowOpen(this._mapWindow)) {
            this._mapWindow = openSecondaryMapWindow();
        }
        if (isSecondaryMapWindowOpen(this._mapWindow)) {
            try { this._mapWindow.focus(); } catch (_) { /* ignore */ }
        }
    }

    focusMapWindow() {
        this._focusMapWindow();
    }
}

export const dualScreenCoordinator = new DualScreenCoordinator();
export default dualScreenCoordinator;
