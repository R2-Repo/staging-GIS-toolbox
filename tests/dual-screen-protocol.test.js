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
});
