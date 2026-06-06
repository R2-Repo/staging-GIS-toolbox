import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RECT_DRAG_MIN_DIAGONAL_PX, bboxDiagonalMeetsMinDragPx } from '../js/map/map-interaction-utils.js';

describe('selection UX helpers', () => {
    it('box drag meets minimum diagonal threshold', () => {
        const project = ([lng, lat]) => ({ x: lng * 100, y: lat * 100 });
        const small = bboxDiagonalMeetsMinDragPx(0, 0, 0.00001, 0.00001, project);
        const large = bboxDiagonalMeetsMinDragPx(0, 0, 0.2, 0.2, project);
        expect(small).toBe(false);
        expect(large).toBe(true);
    });

    it('RECT_DRAG_MIN_DIAGONAL_PX is 10px', () => {
        expect(RECT_DRAG_MIN_DIAGONAL_PX).toBe(10);
    });
});

describe('getWorkingFeatures applyTo logic', () => {
    function getWorkingFeatures(layer, applyTo, getSelectedFeatures) {
        if (!layer || layer.type !== 'spatial') return null;
        const totalCount = layer.geojson.features.length;
        const selected = getSelectedFeatures(layer.id, layer.geojson);
        const selectionCount = selected?.features?.length ?? 0;
        const useSelection = applyTo === 'selection'
            || (applyTo === 'auto' && selectionCount > 0);
        if (useSelection && selectionCount > 0) {
            return { geojson: selected, isSelection: true, count: selectionCount, totalCount };
        }
        return { geojson: layer.geojson, isSelection: false, count: totalCount, totalCount };
    }

    const layer = {
        id: 'L1',
        type: 'spatial',
        geojson: {
            type: 'FeatureCollection',
            features: [{ properties: { _featureIndex: 0 } }, { properties: { _featureIndex: 1 } }]
        }
    };

    it('auto uses selection when features selected', () => {
        const work = getWorkingFeatures(layer, 'auto', () => ({
            type: 'FeatureCollection',
            features: [layer.geojson.features[0]]
        }));
        expect(work.isSelection).toBe(true);
        expect(work.count).toBe(1);
    });

    it('layer forces entire layer', () => {
        const work = getWorkingFeatures(layer, 'layer', () => ({
            type: 'FeatureCollection',
            features: [layer.geojson.features[0]]
        }));
        expect(work.isSelection).toBe(false);
        expect(work.count).toBe(2);
    });

    it('selection falls back to layer when nothing selected', () => {
        const work = getWorkingFeatures(layer, 'selection', () => null);
        expect(work.isSelection).toBe(false);
        expect(work.count).toBe(2);
    });
});

describe('selection shortcuts guard', () => {
    let addSpy;
    let removeSpy;

    beforeEach(() => {
        addSpy = vi.fn();
        removeSpy = vi.fn();
        global.document = {
            addEventListener: addSpy,
            removeEventListener: removeSpy,
            querySelector: () => null
        };
    });

    afterEach(() => {
        delete global.document;
    });

    it('registers keydown listener', async () => {
        const { initSelectionShortcuts } = await import('../js/map/selection-shortcuts.js');
        const teardown = initSelectionShortcuts({ getSelectionCount: () => 0 });
        expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
        teardown();
        expect(removeSpy).toHaveBeenCalled();
    });

    it('handler skips when draw tool active', async () => {
        const { initSelectionShortcuts } = await import('../js/map/selection-shortcuts.js');
        const clearSelection = vi.fn();
        initSelectionShortcuts({
            clearSelection,
            getSelectionCount: () => 3,
            isDrawToolActive: () => true
        });
        const handler = addSpy.mock.calls[0][1];
        handler({ key: 'Escape', target: { tagName: 'BODY' } });
        expect(clearSelection).not.toHaveBeenCalled();
    });

    it('handler clears selection on Escape when idle', async () => {
        const { initSelectionShortcuts } = await import('../js/map/selection-shortcuts.js');
        const clearSelection = vi.fn();
        initSelectionShortcuts({
            clearSelection,
            getSelectionCount: () => 2,
            isDrawToolActive: () => false
        });
        const handler = addSpy.mock.calls[0][1];
        handler({ key: 'Escape', target: { tagName: 'BODY' } });
        expect(clearSelection).toHaveBeenCalledTimes(1);
    });
});
