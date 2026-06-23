import { beforeEach, describe, expect, it, vi } from 'vitest';

const { coordinatorMock } = vi.hoisted(() => ({
    coordinatorMock: {
        setHandlers: vi.fn(),
        setFenceBbox: vi.fn()
    }
}));

vi.mock('../js/dual-screen/coordinator.js', () => ({
    default: coordinatorMock
}));

import { installDualScreenPrimaryHandlers } from '../js/dual-screen/primary-handlers.js';

function ensureFileCtor() {
    if (typeof globalThis.File === 'function') return;
    globalThis.File = class File {
        constructor(parts, name, opts = {}) {
            this._parts = parts;
            this.name = name;
            this.type = opts.type || '';
            this.lastModified = opts.lastModified || Date.now();
        }
    };
}

describe('dual-screen primary handlers', () => {
    beforeEach(() => {
        coordinatorMock.setHandlers.mockReset();
        coordinatorMock.setFenceBbox.mockReset();
    });

    it('wires draw/popup/fence/context callbacks to app deps', () => {
        const deps = {
            onDrawFeatureCreated: vi.fn(),
            onDrawFeatureEdited: vi.fn(),
            onDrawFeatureDeleted: vi.fn(),
            openFeatureEditor: vi.fn(),
            setFenceBbox: vi.fn(),
            clearFence: vi.fn(),
            toggleLayerVisibility: vi.fn(),
            zoomToLayer: vi.fn(),
            setActiveLayer: vi.fn(),
            onCoordSearchAddNew: vi.fn(),
            onCoordSearchAddToExisting: vi.fn()
        };

        installDualScreenPrimaryHandlers(deps);
        expect(coordinatorMock.setHandlers).toHaveBeenCalledTimes(1);

        const handlers = coordinatorMock.setHandlers.mock.calls[0][0];

        handlers.onDrawEvent({ event: 'featureCreated', layerId: 'a', feature: { id: 1 } });
        handlers.onDrawEvent({ event: 'featureEdited', layerId: 'a', featureIndex: 2 });
        handlers.onDrawEvent({ event: 'featureDeleted', layerId: 'a', featureIndex: 3 });
        handlers.onPopupAction({ action: 'editFeature', layerId: 'b', featureIndex: 4 });
        handlers.onPopupAction({ action: 'coordSearchAddNew', searchInfo: { lat: 1, lng: 2 } });
        handlers.onPopupAction({ action: 'coordSearchAddExisting', searchInfo: { lat: 3, lng: 4 } });
        handlers.onFenceSet({ bbox: [0, 0, 1, 1] });
        handlers.onFenceClear();
        handlers.onCtxCmd({ action: 'toggleVisibility', layerId: 'l1' });
        handlers.onCtxCmd({ action: 'zoomToLayer', layerId: 'l2' });
        handlers.onCtxCmd({ action: 'setActiveLayer', layerId: 'l3' });

        expect(deps.onDrawFeatureCreated).toHaveBeenCalledWith('a', { id: 1 });
        expect(deps.onDrawFeatureEdited).toHaveBeenCalledWith('a', 2);
        expect(deps.onDrawFeatureDeleted).toHaveBeenCalledWith('a', 3);
        expect(deps.openFeatureEditor).toHaveBeenCalledWith('b', 4);
        expect(deps.onCoordSearchAddNew).toHaveBeenCalledWith({ lat: 1, lng: 2 });
        expect(deps.onCoordSearchAddToExisting).toHaveBeenCalledWith({ lat: 3, lng: 4 });
        expect(coordinatorMock.setFenceBbox).toHaveBeenCalledWith([0, 0, 1, 1]);
        expect(deps.setFenceBbox).toHaveBeenCalledWith([0, 0, 1, 1]);
        expect(coordinatorMock.setFenceBbox).toHaveBeenCalledWith(null);
        expect(deps.clearFence).toHaveBeenCalledTimes(1);
        expect(deps.toggleLayerVisibility).toHaveBeenCalledWith('l1');
        expect(deps.zoomToLayer).toHaveBeenCalledWith('l2');
        expect(deps.setActiveLayer).toHaveBeenCalledWith('l3');
    });

    it('routes dropped data files and image files to appropriate handlers', async () => {
        ensureFileCtor();
        const deps = {
            onDrawFeatureCreated: vi.fn(),
            onDrawFeatureEdited: vi.fn(),
            onDrawFeatureDeleted: vi.fn(),
            openFeatureEditor: vi.fn(),
            setFenceBbox: vi.fn(),
            clearFence: vi.fn(),
            toggleLayerVisibility: vi.fn(),
            zoomToLayer: vi.fn(),
            setActiveLayer: vi.fn(),
            handleFileImport: vi.fn(async () => {}),
            handlePhotoImport: vi.fn(async () => {})
        };

        installDualScreenPrimaryHandlers(deps);
        const handlers = coordinatorMock.setHandlers.mock.calls[0][0];

        await handlers.onFileDrop({
            files: [
                {
                    buffer: new Uint8Array([1, 2, 3]).buffer,
                    name: 'roads.geojson',
                    type: 'application/geo+json',
                    lastModified: 1
                },
                {
                    buffer: new Uint8Array([4, 5, 6]).buffer,
                    name: 'photo.jpg',
                    type: 'image/jpeg',
                    lastModified: 2
                }
            ]
        });

        expect(deps.handleFileImport).toHaveBeenCalledTimes(1);
        expect(deps.handlePhotoImport).toHaveBeenCalledTimes(1);
        const importedDataFiles = deps.handleFileImport.mock.calls[0][0];
        const importedPhotoFiles = deps.handlePhotoImport.mock.calls[0][0];
        expect(importedDataFiles[0].name).toBe('roads.geojson');
        expect(importedPhotoFiles[0].name).toBe('photo.jpg');
    });
});

