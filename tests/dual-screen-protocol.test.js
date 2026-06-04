import { describe, it, expect } from 'vitest';
import {
    CHANNEL_NAME,
    PROTOCOL_VERSION,
    MessageType,
    createMessage,
    parseMessage,
    shouldApplyViewport,
    serializeLayerForSync,
    buildSnapshotPayload,
    boundsFromViewportPayload
} from '../js/dual-screen/protocol.js';
import {
    DUAL_SCREEN_HINT_KEY,
    DUAL_SCREEN_HINT_VALUE,
    POPUP_BLOCKED_MESSAGE,
    setDualScreenActiveHint,
    hasDualScreenActiveHint,
    consumeDualScreenReloadReminder
} from '../js/dual-screen/storage-hint.js';
import {
    isSecondaryMapWindowOpen,
    MAP_WINDOW_OPEN_FEATURES
} from '../js/dual-screen/window-open.js';

describe('dual-screen protocol', () => {
    it('exports channel name and version', () => {
        expect(CHANNEL_NAME).toBe('gis-toolbox-dual-screen');
        expect(PROTOCOL_VERSION).toBe(1);
    });

    it('createMessage builds valid envelope', () => {
        const msg = createMessage('primary', MessageType.HELLO, { ok: true });
        expect(msg.v).toBe(PROTOCOL_VERSION);
        expect(msg.role).toBe('primary');
        expect(msg.type).toBe(MessageType.HELLO);
        expect(msg.payload.ok).toBe(true);
        expect(msg.msgId).toMatch(/^primary-/);
    });

    it('parseMessage rejects invalid data', () => {
        expect(parseMessage(null)).toBeNull();
        expect(parseMessage({ v: 99, type: 'X', msgId: 'a' })).toBeNull();
        const valid = createMessage('secondary', MessageType.BYE, {});
        expect(parseMessage(valid)).toEqual(valid);
    });

    it('shouldApplyViewport ignores echo from same role', () => {
        const msg = createMessage('secondary', MessageType.VIEWPORT, {
            source: 'secondary',
            center: [0, 0],
            zoom: 10
        });
        expect(shouldApplyViewport(msg, 'secondary', null)).toBe(false);
        expect(shouldApplyViewport(msg, 'primary', null)).toBe(true);
    });

    it('shouldApplyViewport skips duplicate msgId', () => {
        const msg = createMessage('primary', MessageType.VIEWPORT, {
            source: 'primary',
            center: [1, 2],
            zoom: 5
        });
        expect(shouldApplyViewport(msg, 'secondary', msg.msgId)).toBe(false);
    });

    it('serializeLayerForSync clones geojson', () => {
        const layer = {
            id: 'a',
            name: 'Test',
            type: 'spatial',
            visible: true,
            geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }] }
        };
        const out = serializeLayerForSync(layer, 0);
        expect(out.id).toBe('a');
        expect(out.geojson).not.toBe(layer.geojson);
        expect(out.geojson.features).toHaveLength(1);
    });

    it('buildSnapshotPayload includes layers and viewport', () => {
        const payload = buildSnapshotPayload({
            layers: [{ id: '1', name: 'L', type: 'spatial', visible: true, geojson: null }],
            viewport: { center: [0, 0], zoom: 4 },
            basemap: 'satellite',
            is3d: true
        });
        expect(payload.layers).toHaveLength(1);
        expect(payload.viewport.zoom).toBe(4);
        expect(payload.basemap).toBe('satellite');
        expect(payload.is3d).toBe(true);
    });

    it('boundsFromViewportPayload uses explicit bounds when present', () => {
        const b = boundsFromViewportPayload({
            center: [-100, 40],
            zoom: 10,
            bounds: { west: -101, south: 39, east: -99, north: 41 }
        });
        expect(b.getWest()).toBe(-101);
        expect(b.getNorth()).toBe(41);
    });

    it('boundsFromViewportPayload estimates from center when no bounds', () => {
        const b = boundsFromViewportPayload({ center: [0, 0], zoom: 2 });
        expect(b.getWest()).toBeLessThan(0);
        expect(b.getEast()).toBeGreaterThan(0);
    });

    it('exports CTX_CMD message type', () => {
        expect(MessageType.CTX_CMD).toBe('CTX_CMD');
    });

    it('setDualScreenActiveHint writes and clears sessionStorage key', () => {
        const storage = new Map();
        const mock = {
            setItem: (k, v) => storage.set(k, v),
            getItem: (k) => storage.get(k) ?? null,
            removeItem: (k) => storage.delete(k)
        };
        expect(hasDualScreenActiveHint(mock)).toBe(false);
        setDualScreenActiveHint(mock, true);
        expect(storage.get(DUAL_SCREEN_HINT_KEY)).toBe(DUAL_SCREEN_HINT_VALUE);
        expect(hasDualScreenActiveHint(mock)).toBe(true);
        setDualScreenActiveHint(mock, false);
        expect(hasDualScreenActiveHint(mock)).toBe(false);
    });

    it('consumeDualScreenReloadReminder runs once per page state', () => {
        const storage = new Map();
        const mock = {
            setItem: (k, v) => storage.set(k, v),
            getItem: (k) => storage.get(k) ?? null,
            removeItem: (k) => storage.delete(k)
        };
        setDualScreenActiveHint(mock, true);
        const state = {};
        expect(consumeDualScreenReloadReminder(mock, state)).toBe(true);
        expect(consumeDualScreenReloadReminder(mock, state)).toBe(false);
    });

    it('POPUP_BLOCKED_MESSAGE mentions pop-ups', () => {
        expect(POPUP_BLOCKED_MESSAGE.toLowerCase()).toContain('pop-up');
    });

    it('MAP_WINDOW_OPEN_FEATURES omits noopener so window.open returns a Window', () => {
        expect(MAP_WINDOW_OPEN_FEATURES).not.toMatch(/noopener/i);
    });

    it('isSecondaryMapWindowOpen rejects null and closed windows', () => {
        expect(isSecondaryMapWindowOpen(null)).toBe(false);
        expect(isSecondaryMapWindowOpen({ closed: true })).toBe(false);
        expect(isSecondaryMapWindowOpen({ closed: false })).toBe(true);
    });
});
