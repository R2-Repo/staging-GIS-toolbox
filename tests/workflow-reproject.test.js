import { describe, it, expect } from 'vitest';
import { ReprojectNode } from '../js/workflow/nodes/spatial-nodes.js';
import { createSpatialDataset } from '../js/core/data-model.js';
import * as turf from '@turf/turf';

describe('ReprojectNode', () => {
    it('validates target CRS', () => {
        const node = new ReprojectNode();
        node.config.toCrs = '';
        expect(node.validate().valid).toBe(false);
        node.config.toCrs = 'EPSG:4326';
        expect(node.validate().valid).toBe(true);
    });

    it('reprojects features in execute', async () => {
        const pt = turf.point([500000, 4500000]);
        const ds = createSpatialDataset(
            'projected',
            turf.featureCollection([pt]),
            { format: 'test' },
            { crs: 'EPSG:26912' }
        );
        const node = new ReprojectNode();
        node.config.fromCrs = 'EPSG:26912';
        node.config.toCrs = 'EPSG:4326';
        const out = await node.execute([ds]);
        expect(out.schema.crs).toBe('EPSG:4326');
        const [lon, lat] = out.geojson.features[0].geometry.coordinates;
        expect(Math.abs(lon)).toBeLessThan(180);
        expect(Math.abs(lat)).toBeLessThan(90);
    });
});
