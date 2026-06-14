/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { addLayer, getActiveLayer, getState, setActiveLayer } from '../js/core/state.js';
import { createSpatialDataset } from '../js/core/data-model.js';

function resetLayerState() {
    const state = getState();
    state.layers = [];
    state.activeLayerId = null;
}

describe('import active layer', () => {
    beforeEach(resetLayerState);

    it('addLayer with activate:true switches active layer when one already exists', () => {
        const existing = createSpatialDataset('Existing', { type: 'FeatureCollection', features: [] });
        addLayer(existing);
        setActiveLayer(existing.id);

        const imported = createSpatialDataset('Imported', { type: 'FeatureCollection', features: [] });
        addLayer(imported, { activate: true });

        expect(getActiveLayer()?.id).toBe(imported.id);
    });

    it('addLayer without activate keeps existing active layer', () => {
        const existing = createSpatialDataset('Existing', { type: 'FeatureCollection', features: [] });
        addLayer(existing);
        setActiveLayer(existing.id);

        const second = createSpatialDataset('Second', { type: 'FeatureCollection', features: [] });
        addLayer(second);

        expect(getActiveLayer()?.id).toBe(existing.id);
    });

    it('last activated import wins when multiple layers are added in sequence', () => {
        const first = createSpatialDataset('First', { type: 'FeatureCollection', features: [] });
        const second = createSpatialDataset('Second', { type: 'FeatureCollection', features: [] });
        addLayer(first, { activate: true });
        addLayer(second, { activate: true });

        expect(getActiveLayer()?.id).toBe(second.id);
    });
});
