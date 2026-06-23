import { describe, expect, it, vi } from 'vitest';
import {
    buildSelectionPayload,
    applySelectionPayload,
    shouldApplySelection
} from '../js/dual-screen/selection-sync.js';

describe('dual-screen selection sync', () => {
    it('builds a selection payload from map state', () => {
        const mapApi = {
            getSelectedIndices: vi.fn(() => [1, 3]),
            getTotalSelectionCount: vi.fn(() => 2),
            getActiveLayerId: vi.fn(() => 'layer-a')
        };

        expect(buildSelectionPayload('secondary', mapApi, { layerId: 'layer-a', totalCount: 2 })).toEqual({
            source: 'secondary',
            layerId: 'layer-a',
            indices: [1, 3],
            totalCount: 2,
            activeLayerId: 'layer-a'
        });
    });

    it('applies remote selection and guards inbound relay', () => {
        const mapApi = {
            setActiveLayerId: vi.fn(),
            selectFeatures: vi.fn(),
            clearSelection: vi.fn()
        };
        const inbound = [];

        applySelectionPayload(mapApi, {
            source: 'secondary',
            layerId: 'layer-a',
            indices: [2],
            totalCount: 1,
            activeLayerId: 'layer-a'
        }, {
            setInbound: (v) => inbound.push(v)
        });

        expect(inbound).toEqual([true, false]);
        expect(mapApi.setActiveLayerId).toHaveBeenCalledWith('layer-a');
        expect(mapApi.selectFeatures).toHaveBeenCalledWith('layer-a', [2]);
        expect(mapApi.clearSelection).not.toHaveBeenCalled();
    });

    it('clears selection when totalCount is zero', () => {
        const mapApi = {
            setActiveLayerId: vi.fn(),
            selectFeatures: vi.fn(),
            clearSelection: vi.fn()
        };

        applySelectionPayload(mapApi, {
            source: 'secondary',
            layerId: null,
            indices: [],
            totalCount: 0
        });

        expect(mapApi.clearSelection).toHaveBeenCalledTimes(1);
        expect(mapApi.selectFeatures).not.toHaveBeenCalled();
    });

    it('syncs active layer only when syncSelection is false', () => {
        const mapApi = {
            setActiveLayerId: vi.fn(),
            selectFeatures: vi.fn(),
            clearSelection: vi.fn()
        };

        applySelectionPayload(mapApi, {
            source: 'primary',
            activeLayerId: 'layer-b',
            syncSelection: false,
            totalCount: 0
        });

        expect(mapApi.setActiveLayerId).toHaveBeenCalledWith('layer-b');
        expect(mapApi.clearSelection).not.toHaveBeenCalled();
        expect(mapApi.selectFeatures).not.toHaveBeenCalled();
    });

    it('ignores echo messages from the local role', () => {
        expect(shouldApplySelection({ payload: { source: 'primary' } }, 'primary')).toBe(false);
        expect(shouldApplySelection({ payload: { source: 'secondary' } }, 'primary')).toBe(true);
    });
});
