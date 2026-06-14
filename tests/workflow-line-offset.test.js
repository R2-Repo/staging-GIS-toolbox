import { describe, it, expect } from 'vitest';
import * as turf from '@turf/turf';
import { LineOffsetNode } from '../js/workflow/nodes/spatial-nodes.js';
import { createSpatialDataset } from '../js/core/data-model.js';

describe('LineOffsetNode', () => {
    it('validates positive distance', () => {
        const node = new LineOffsetNode();
        node.config.distance = 10;
        expect(node.validate().valid).toBe(true);

        node.config.distance = 0;
        expect(node.validate().valid).toBe(false);
    });

    it('offsets line features in execute', async () => {
        const ds = createSpatialDataset(
            'roads',
            turf.featureCollection([turf.lineString([[0, 0], [0, 0.01]], { id: 'a' })]),
            { format: 'test' }
        );
        const node = new LineOffsetNode();
        node.config = { distance: 0.001, units: 'kilometers' };
        const out = await node.execute([ds]);
        expect(out.geojson.features).toHaveLength(1);
        expect(out.geojson.features[0].geometry.type).toBe('LineString');
        expect(out.name).toContain('roads_offset');
    });
});
