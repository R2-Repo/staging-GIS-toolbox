/**
 * Dual Screen Mode — primary-window lifecycle & sync orchestration
 */
import { getLayers } from '../core/state.js';
import mapManager from '../map/map-manager.js';
import { DualScreenChannel } from './channel.js';
import {
    MessageType,
    createMessage,
    buildSnapshotPayload
} from './protocol.js';

const MAP_WINDOW_NAME = 'gis-toolbox-map';
const MAP_WINDOW_PATH = 'map-window.html';
const POLL_MS = 500;

class DualScreenCoordinator {
    constructor() {
        this.isActive = false;
        this._mapWindow = null;
        this._channel = null;
        this._pollTimer = null;
        this._lastViewport = null;
        this._lastAppliedViewportId = null;
        this._secondaryReady = false;
        this._onStateChange = null;
    }

    onStateChange(fn) {
        this._onStateChange = fn;
    }

    _notify() {
        this._onStateChange?.(this.isActive);
    }

    _isMobile() {
        return window.innerWidth < 768;
    }

    /**
     * @returns {boolean} true if dual mode activated
     */
    activate() {
        if (this.isActive) {
            if (this._mapWindow && !this._mapWindow.closed) {
                this._mapWindow.focus();
            }
            return true;
        }
        if (this._isMobile()) return false;
        if (typeof BroadcastChannel === 'undefined') {
            console.warn('[DualScreen] BroadcastChannel not supported');
            return false;
        }

        const features = 'noopener,noreferrer';
        this._mapWindow = window.open(MAP_WINDOW_PATH, MAP_WINDOW_NAME, features);
        if (!this._mapWindow) return false;

        this.isActive = true;
        this._secondaryReady = false;

        this._channel = new DualScreenChannel('primary', (msg) => this._handleMessage(msg));

        if (mapManager.map) {
            this._lastViewport = this._captureViewport();
            mapManager.destroy();
        }

        this._startPoll();
        this._notify();
        return true;
    }

    deactivate() {
        if (!this.isActive) return;

        this._stopPoll();
        if (this._channel) {
            this._channel.post(createMessage('primary', MessageType.BYE, {}));
            this._channel.close();
            this._channel = null;
        }

        if (this._mapWindow && !this._mapWindow.closed) {
            try { this._mapWindow.close(); } catch (_) { /* ignore */ }
        }
        this._mapWindow = null;
        this.isActive = false;
        this._secondaryReady = false;

        this._restorePrimaryMap();
        this._notify();
    }

    _startPoll() {
        this._stopPoll();
        this._pollTimer = setInterval(() => {
            if (this._mapWindow?.closed) this.deactivate();
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
        return {
            center: [c.lng, c.lat],
            zoom: map.getZoom(),
            bearing: map.getBearing(),
            pitch: map.getPitch()
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

    _handleMessage(msg) {
        switch (msg.type) {
            case MessageType.HELLO:
                this._secondaryReady = true;
                this.sendSnapshot();
                break;
            case MessageType.VIEWPORT:
                if (msg.payload) this._lastViewport = msg.payload;
                break;
            case MessageType.BYE:
                this.deactivate();
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

    getBounds() {
        if (!this._lastViewport) return null;
        const map = mapManager.map;
        if (map) return mapManager.getBounds();
        return this._estimateBoundsFromViewport(this._lastViewport);
    }

    _estimateBoundsFromViewport(vp) {
        if (!vp?.center) return null;
        const [lng, lat] = vp.center;
        const z = vp.zoom || 7;
        const span = 360 / Math.pow(2, z);
        const half = span / 2;
        return {
            getWest: () => lng - half,
            getEast: () => lng + half,
            getSouth: () => lat - half,
            getNorth: () => lat + half
        };
    }
}

export const dualScreenCoordinator = new DualScreenCoordinator();
export default dualScreenCoordinator;
