/**
 * Draw Manager — Create and edit features directly on the map
 * Supports drawing points, lines, and polygons into a target layer.
 * Uses native MapLibre GL JS events (no external draw library required).
 */
import bus from '../core/event-bus.js';
import logger from '../core/logger.js';
import mapManager from './map-manager.js';

const DRAW_STYLE = {
    lineColor: '#01bcdd',
    lineWidth: 3,
    lineOpacity: 0.9,
    fillColor: '#01bcdd',
    fillOpacity: 0.3,
    lineDasharray: [6, 4]
};

const VERTEX_STYLE = {
    radius: 5,
    fillColor: '#fff',
    strokeColor: '#01bcdd',
    strokeWidth: 2
};

let _drawIdCounter = 0;
function _nextDrawId(prefix) { return `draw-${prefix}-${++_drawIdCounter}`; }

class DrawManager {
    constructor() {
        this._active = false;
        this._tool = null;          // 'point' | 'line' | 'polygon' | null
        this._targetLayerId = null;  // layer ID to add features to
        this._vertices = [];         // current drawing vertices [{lat, lng}]
        this._vertexMarkers = [];    // MapLibre Marker instances for vertices
        this._previewSourceId = null;
        this._previewLayerIds = [];
        this._rubberBandSourceId = null;
        this._rubberBandLayerIds = [];
        this._toolbar = null;        // DOM element for draw toolbar
        this._escHandler = null;
        this._clickHandler = null;
        this._moveHandler = null;
        this._dblClickHandler = null;
        this._clickTimeout = null;   // debounce clicks vs dblclick
        this._finishing = false;     // guard to prevent clicks during finish
        this._lastTapTime = 0;       // for mobile double-tap detection
    }

    /** Get the MapLibre map instance */
    get map() { return mapManager.map; }

    /** Is drawing currently active? */
    get isDrawing() { return this._active && this._tool !== null; }

    /** Get the active tool name */
    get activeTool() { return this._tool; }

    /** Get the target layer ID */
    get targetLayerId() { return this._targetLayerId; }

    // ============================
    // Toolbar UI
    // ============================

    showToolbar(layerId, layerName) {
        this.hideToolbar();
        this._targetLayerId = layerId;

        const toolbar = document.createElement('div');
        toolbar.className = 'draw-toolbar';
        toolbar.innerHTML = `
            <div class="draw-toolbar-header">
                <span class="draw-toolbar-title">✏️ Draw: <strong>${layerName}</strong></span>
                <button class="draw-toolbar-close" title="Close draw tools">✕</button>
            </div>
            <div class="draw-toolbar-tools">
                <button class="draw-tool-btn" data-tool="point" title="Draw point">
                    <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="4" fill="currentColor"/></svg>
                    <span>Point</span>
                </button>
                <button class="draw-tool-btn" data-tool="line" title="Draw line">
                    <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 14L14 2" stroke="currentColor" stroke-width="2" fill="none"/></svg>
                    <span>Line</span>
                </button>
                <button class="draw-tool-btn" data-tool="polygon" title="Draw polygon">
                    <svg width="16" height="16" viewBox="0 0 16 16"><polygon points="8,1 15,12 1,12" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.3"/></svg>
                    <span>Polygon</span>
                </button>
            </div>
            <div class="draw-toolbar-hint"></div>
            <button class="draw-finish-btn" style="display:none;">✓ Finish</button>
        `;

        toolbar.querySelector('.draw-toolbar-close').onclick = () => this.hideToolbar();
        toolbar.querySelector('.draw-finish-btn').onclick = (e) => {
            e.stopPropagation();
            this._finishDraw();
        };
        toolbar.querySelectorAll('.draw-tool-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const tool = btn.dataset.tool;
                if (this._tool === tool) {
                    this.cancelDraw();
                } else {
                    this.startTool(tool);
                }
            };
        });

        toolbar.addEventListener('click', (e) => e.stopPropagation());
        toolbar.addEventListener('dblclick', (e) => e.stopPropagation());
        toolbar.addEventListener('mousedown', (e) => e.stopPropagation());

        this.map.getContainer().appendChild(toolbar);
        this._toolbar = toolbar;
        this._active = true;

        logger.info('Draw', `Draw toolbar opened for layer: ${layerName}`);
        bus.emit('draw:toolbarOpened', { layerId });
    }

    hideToolbar() {
        this.cancelDraw();
        if (this._toolbar) {
            this._toolbar.remove();
            this._toolbar = null;
        }
        this._active = false;
        this._targetLayerId = null;
        bus.emit('draw:toolbarClosed');
    }

    _setHint(text) {
        if (!this._toolbar) return;
        const hint = this._toolbar.querySelector('.draw-toolbar-hint');
        if (hint) hint.textContent = text;
    }

    _updateToolButtons() {
        if (!this._toolbar) return;
        this._toolbar.querySelectorAll('.draw-tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === this._tool);
        });
    }

    // ============================
    // Drawing tools
    // ============================

    startTool(tool) {
        this.cancelDraw();
        this._tool = tool;
        this._vertices = [];
        this._finishing = false;
        this._updateToolButtons();

        if (mapManager._selectionMode) mapManager.exitSelectionMode();

        this.map.getCanvas().style.cursor = 'crosshair';

        this._clickHandler = (e) => this._onMapClick(e);
        this._moveHandler = (e) => this._onMapMove(e);
        this._dblClickHandler = (e) => this._onMapDblClick(e);
        this._escHandler = (e) => { if (e.key === 'Escape') this.cancelDraw(); };

        this.map.on('click', this._clickHandler);
        this.map.on('mousemove', this._moveHandler);
        document.addEventListener('keydown', this._escHandler);

        if (tool === 'line' || tool === 'polygon') {
            this.map.doubleClickZoom.disable();
            this.map.on('dblclick', this._dblClickHandler);
            const isMobile = window.innerWidth < 768 || 'ontouchstart' in window;
            if (isMobile) {
                this._setHint(tool === 'line'
                    ? 'Tap to add vertices. Tap Finish when done.'
                    : 'Tap to add vertices. Tap Finish to close polygon.');
            } else {
                this._setHint(tool === 'line'
                    ? 'Click to add vertices. Double-click or press Enter to finish.'
                    : 'Click to add vertices. Double-click or press Enter to close polygon.');
            }
        } else if (tool === 'point') {
            this._setHint(window.innerWidth < 768 ? 'Tap on the map to place a point.' : 'Click on the map to place a point.');
        }

        const enterHandler = (e) => {
            if (e.key === 'Enter') {
                const minVerts = this._tool === 'polygon' ? 3 : 2;
                if (this._vertices.length >= minVerts) {
                    this._finishDraw();
                }
            }
        };
        this._enterHandler = enterHandler;
        document.addEventListener('keydown', enterHandler);

        logger.info('Draw', `Started tool: ${tool}`);
    }

    cancelDraw() {
        this._clearPreview();
        this._vertices = [];
        this._tool = null;
        this._finishing = false;
        this._lastTapTime = 0;
        this._updateToolButtons();
        this._setHint('');
        this._updateFinishBtn();

        if (this._clickTimeout) {
            clearTimeout(this._clickTimeout);
            this._clickTimeout = null;
        }

        if (this.map) {
            this.map.getCanvas().style.cursor = '';
            this.map.doubleClickZoom.enable();
        }

        if (this._clickHandler) { this.map?.off('click', this._clickHandler); this._clickHandler = null; }
        if (this._moveHandler) { this.map?.off('mousemove', this._moveHandler); this._moveHandler = null; }
        if (this._dblClickHandler) { this.map?.off('dblclick', this._dblClickHandler); this._dblClickHandler = null; }
        if (this._escHandler) { document.removeEventListener('keydown', this._escHandler); this._escHandler = null; }
        if (this._enterHandler) { document.removeEventListener('keydown', this._enterHandler); this._enterHandler = null; }
    }

    // ============================
    // Map event handlers
    // ============================

    _onMapClick(e) {
        if (e.originalEvent) {
            e.originalEvent.stopPropagation();
            e.originalEvent._drawHandled = true;
        }
        e._drawHandled = true;

        if (this._finishing) return;

        const lat = e.lngLat.lat;
        const lng = e.lngLat.lng;

        if (this._tool === 'point') {
            this._createFeature('Point', [[lng, lat]]);
            return;
        }

        const now = Date.now();
        if (now - this._lastTapTime < 400) {
            this._lastTapTime = 0;
            if (this._clickTimeout) { clearTimeout(this._clickTimeout); this._clickTimeout = null; }
            const minVerts = this._tool === 'polygon' ? 3 : 2;
            this._addVertex(lat, lng);
            if (this._vertices.length >= minVerts) {
                this._finishDraw();
            }
            return;
        }
        this._lastTapTime = now;

        if (this._clickTimeout) clearTimeout(this._clickTimeout);
        this._clickTimeout = setTimeout(() => {
            this._clickTimeout = null;
            if (this._finishing) return;
            this._addVertex(lat, lng);
        }, 200);
    }

    _addVertex(lat, lng) {
        this._vertices.push({ lat, lng });
        this._addVertexMarker(lat, lng);
        this._updatePreviewLine();

        const n = this._vertices.length;
        const isMobile = window.innerWidth < 768 || 'ontouchstart' in window;
        const finishHint = isMobile ? 'Tap Finish when done.' : 'Double-click or Enter to finish.';
        const closeHint = isMobile ? 'Tap Finish to close polygon.' : 'Double-click or Enter to close polygon.';
        if (this._tool === 'line') {
            this._setHint(`${n} vertex${n > 1 ? 'es' : ''} placed. ${finishHint}`);
        } else {
            this._setHint(`${n} vertex${n > 1 ? 'es' : ''} placed. ${n < 3 ? 'Need at least 3.' : closeHint}`);
        }
        this._updateFinishBtn();
    }

    _updateFinishBtn() {
        if (!this._toolbar) return;
        const btn = this._toolbar.querySelector('.draw-finish-btn');
        if (!btn) return;
        const minVerts = this._tool === 'polygon' ? 3 : 2;
        btn.style.display = (this._tool === 'line' || this._tool === 'polygon') && this._vertices.length >= minVerts ? '' : 'none';
    }

    _onMapMove(e) {
        if (this._tool === 'point' || this._vertices.length === 0) return;
        this._updateRubberBand(e.lngLat);
    }

    _onMapDblClick(e) {
        if (e.originalEvent) {
            e.originalEvent.preventDefault();
            e.originalEvent.stopPropagation();
            e.originalEvent._drawHandled = true;
        }
        e._drawHandled = true;

        if (this._clickTimeout) {
            clearTimeout(this._clickTimeout);
            this._clickTimeout = null;
        }

        if (e.lngLat) {
            this._addVertex(e.lngLat.lat, e.lngLat.lng);
        }

        const minVerts = this._tool === 'polygon' ? 3 : 2;
        if (this._vertices.length >= minVerts) {
            this._finishDraw();
        }
    }

    // ============================
    // Preview rendering (MapLibre sources/layers + markers)
    // ============================

    _addVertexMarker(lat, lng) {
        const el = document.createElement('div');
        el.style.cssText = `width:${VERTEX_STYLE.radius * 2}px;height:${VERTEX_STYLE.radius * 2}px;background:${VERTEX_STYLE.fillColor};border:${VERTEX_STYLE.strokeWidth}px solid ${VERTEX_STYLE.strokeColor};border-radius:50%;`;
        const marker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(this.map);
        this._vertexMarkers.push(marker);
    }

    _updatePreviewLine() {
        // Remove old preview source/layers
        this._removePreviewLine();

        if (this._vertices.length < 2) return;

        const coords = this._vertices.map(v => [v.lng, v.lat]);
        if (this._tool === 'polygon' && this._vertices.length >= 3) {
            coords.push(coords[0]);
        }

        const srcId = _nextDrawId('preview');
        this._previewSourceId = srcId;

        this.map.addSource(srcId, {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
        });

        const lineId = srcId + '-line';
        this.map.addLayer({
            id: lineId, type: 'line', source: srcId,
            paint: {
                'line-color': DRAW_STYLE.lineColor,
                'line-width': DRAW_STYLE.lineWidth,
                'line-opacity': DRAW_STYLE.lineOpacity,
                'line-dasharray': DRAW_STYLE.lineDasharray
            }
        });
        this._previewLayerIds = [lineId];

        // Add fill for polygon preview
        if (this._tool === 'polygon' && this._vertices.length >= 3) {
            const fillCoords = this._vertices.map(v => [v.lng, v.lat]);
            fillCoords.push(fillCoords[0]);
            const fillSrcId = srcId + '-fill-src';
            this.map.addSource(fillSrcId, {
                type: 'geojson',
                data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [fillCoords] } }
            });
            const fillId = srcId + '-fill';
            this.map.addLayer({
                id: fillId, type: 'fill', source: fillSrcId,
                paint: { 'fill-color': DRAW_STYLE.fillColor, 'fill-opacity': DRAW_STYLE.fillOpacity }
            });
            this._previewLayerIds.push(fillId);
            this._previewLayerIds.push(fillSrcId); // track for cleanup
        }
    }

    _removePreviewLine() {
        if (this._previewLayerIds.length > 0) {
            for (const id of this._previewLayerIds) {
                if (this.map?.getLayer(id)) this.map.removeLayer(id);
            }
            this._previewLayerIds = [];
        }
        if (this._previewSourceId) {
            // Also remove fill source if present
            const fillSrcId = this._previewSourceId + '-fill-src';
            if (this.map?.getSource(fillSrcId)) this.map.removeSource(fillSrcId);
            if (this.map?.getSource(this._previewSourceId)) this.map.removeSource(this._previewSourceId);
            this._previewSourceId = null;
        }
    }

    _updateRubberBand(lngLat) {
        this._removeRubberBand();
        const lastVertex = this._vertices[this._vertices.length - 1];
        if (!lastVertex) return;

        const coords = [[lastVertex.lng, lastVertex.lat], [lngLat.lng, lngLat.lat]];
        if (this._tool === 'polygon' && this._vertices.length >= 2) {
            coords.push([this._vertices[0].lng, this._vertices[0].lat]);
        }

        const srcId = _nextDrawId('rubber');
        this._rubberBandSourceId = srcId;

        this.map.addSource(srcId, {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
        });

        const lineId = srcId + '-line';
        this.map.addLayer({
            id: lineId, type: 'line', source: srcId,
            paint: {
                'line-color': DRAW_STYLE.lineColor,
                'line-width': DRAW_STYLE.lineWidth,
                'line-opacity': 0.5,
                'line-dasharray': [4, 6]
            }
        });
        this._rubberBandLayerIds = [lineId];
    }

    _removeRubberBand() {
        for (const lid of this._rubberBandLayerIds) {
            if (this.map?.getLayer(lid)) this.map.removeLayer(lid);
        }
        this._rubberBandLayerIds = [];
        if (this._rubberBandSourceId) {
            if (this.map?.getSource(this._rubberBandSourceId)) this.map.removeSource(this._rubberBandSourceId);
            this._rubberBandSourceId = null;
        }
    }

    _clearPreview() {
        // Remove vertex markers
        for (const m of this._vertexMarkers) {
            try { m.remove(); } catch (_) {}
        }
        this._vertexMarkers = [];

        // Remove preview line/fill
        this._removePreviewLine();

        // Remove rubber band
        this._removeRubberBand();
    }

    // ============================
    // Feature creation
    // ============================

    _finishDraw() {
        this._finishing = true;
        if (this._tool === 'line' && this._vertices.length >= 2) {
            const coords = this._vertices.map(v => [v.lng, v.lat]);
            this._createFeature('LineString', coords);
        } else if (this._tool === 'polygon' && this._vertices.length >= 3) {
            const coords = this._vertices.map(v => [v.lng, v.lat]);
            coords.push(coords[0]);
            this._createFeature('Polygon', [coords]);
        }
        this._finishing = false;
    }

    _createFeature(type, coordinates) {
        const feature = {
            type: 'Feature',
            properties: {},
            geometry: {
                type,
                coordinates: type === 'Point' ? coordinates[0] : coordinates
            }
        };

        this._clearPreview();
        this._vertices = [];

        bus.emit('draw:featureCreated', {
            layerId: this._targetLayerId,
            feature
        });

        logger.info('Draw', `Created ${type} feature`);

        if (this._tool === 'point') {
            this._setHint('Point placed! Click again to add another.');
        } else {
            const currentTool = this._tool;
            this.cancelDraw();
            this.startTool(currentTool);
        }
    }
}

const drawManager = new DrawManager();
export default drawManager;
