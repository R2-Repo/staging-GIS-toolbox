import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
    vi.stubGlobal('window', {
        innerWidth: 1440,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
    });
});

const primaryMapMock = vi.hoisted(() => ({
    id: 'map',
    getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
    getBounds: vi.fn(() => ({
        getWest: () => -1,
        getSouth: () => -1,
        getEast: () => 1,
        getNorth: () => 1
    })),
    getZoom: vi.fn(() => 2),
    getBearing: vi.fn(() => 0),
    getPitch: vi.fn(() => 0)
}));

const mapServiceMock = vi.hoisted(() => ({
    getMap: vi.fn(() => primaryMapMock),
    destroy: vi.fn(),
    getCurrentBasemap: vi.fn(() => 'voyager'),
    is3DEnabled: vi.fn(() => false),
    getLayerStyles: vi.fn(() => ({}))
}));

vi.mock('../js/map/map-service.js', () => ({
    default: mapServiceMock
}));

import dualScreenCoordinator from '../js/dual-screen/coordinator.js';

describe('dual-screen coordinator activation', () => {
    beforeEach(() => {
        mapServiceMock.getMap.mockReset();
        mapServiceMock.destroy.mockReset();
        mapServiceMock.getMap.mockReturnValue(primaryMapMock);
        dualScreenCoordinator.isActive = false;
        dualScreenCoordinator._pendingActivation = false;
        dualScreenCoordinator._mapWindow = null;
        dualScreenCoordinator._channel = null;
        dualScreenCoordinator._activateResolve = null;
        dualScreenCoordinator._clearActivateTimeout?.();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.stubGlobal('window', {
            innerWidth: 1440,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        });
    });

    it('destroys the primary map before marking dual-screen active', () => {
        const order = [];
        mapServiceMock.getMap.mockImplementation(() => {
            order.push(`getMap:active=${dualScreenCoordinator.isActive}`);
            return dualScreenCoordinator.isActive ? null : primaryMapMock;
        });
        mapServiceMock.destroy.mockImplementation(() => {
            order.push(`destroy:active=${dualScreenCoordinator.isActive}`);
        });

        dualScreenCoordinator._completeActivation();

        expect(mapServiceMock.destroy).toHaveBeenCalledTimes(1);
        expect(order[order.length - 1]).toBe('destroy:active=false');
        expect(order.every((entry) => entry.endsWith('active=false'))).toBe(true);
        expect(dualScreenCoordinator.isActive).toBe(true);
    });
});
