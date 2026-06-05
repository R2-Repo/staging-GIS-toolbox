import { beforeEach, describe, expect, it, vi } from 'vitest';

const { busMock, mapServiceMock, drawManagerMock } = vi.hoisted(() => ({
    busMock: {
        on: vi.fn(() => () => {})
    },
    mapServiceMock: {
        clearImportFence: vi.fn(),
        setImportFenceFromBbox: vi.fn()
    },
    drawManagerMock: {
        showToolbar: vi.fn(),
        hideToolbar: vi.fn()
    }
}));

vi.mock('../js/core/event-bus.js', () => ({
    default: busMock
}));

vi.mock('../js/map/map-service.js', () => ({
    default: mapServiceMock
}));

vi.mock('../js/map/draw-manager.js', () => ({
    default: drawManagerMock
}));

import {
    broadcastViewportFromMap,
    handleDrawCmd,
    handleDrawCmdMessage,
    handleFenceClearCmd
} from '../js/dual-screen/secondary-client.js';

describe('dual-screen secondary client helpers', () => {
    beforeEach(() => {
        busMock.on.mockClear();
        mapServiceMock.clearImportFence.mockReset();
        mapServiceMock.setImportFenceFromBbox.mockReset();
        drawManagerMock.showToolbar.mockReset();
        drawManagerMock.hideToolbar.mockReset();
    });

    it('applies fence commands through map service', () => {
        handleFenceClearCmd();
        expect(mapServiceMock.clearImportFence).toHaveBeenCalledTimes(1);

        handleDrawCmdMessage({ action: 'applyFence', bbox: [1, 2, 3, 4] }, vi.fn());
        expect(mapServiceMock.setImportFenceFromBbox).toHaveBeenCalledWith([1, 2, 3, 4]);
    });

    it('routes draw toolbar commands', () => {
        handleDrawCmdMessage({ action: 'hideToolbar' }, vi.fn());
        expect(drawManagerMock.hideToolbar).toHaveBeenCalledTimes(1);

        handleDrawCmd({ action: 'hideToolbar' });
        expect(drawManagerMock.hideToolbar).toHaveBeenCalledTimes(2);
    });

    it('builds viewport payload from a map instance', () => {
        const payload = broadcastViewportFromMap({
            getCenter: () => ({ lng: -111.9, lat: 40.7 }),
            getZoom: () => 9,
            getBearing: () => 12,
            getPitch: () => 30,
            getBounds: () => ({
                getWest: () => -112.1,
                getSouth: () => 40.5,
                getEast: () => -111.7,
                getNorth: () => 40.9
            })
        });

        expect(payload).toEqual({
            source: 'secondary',
            center: [-111.9, 40.7],
            zoom: 9,
            bearing: 12,
            pitch: 30,
            bounds: {
                west: -112.1,
                south: 40.5,
                east: -111.7,
                north: 40.9
            }
        });
    });
});

