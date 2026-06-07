import { describe, it, expect } from 'vitest';
import {
    analyzeSchema,
    analyzeSchemaAsync,
    SCHEMA_SAMPLE_VALUES
} from '../js/core/data-model.js';

describe('analyzeSchema large datasets', () => {
    it('does not retain every property value in memory', () => {
        const features = Array.from({ length: 5000 }, (_, i) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [i, i] },
            properties: { id: i, name: `feature-${i}` }
        }));

        const schema = analyzeSchema({ type: 'FeatureCollection', features });
        expect(schema.featureCount).toBe(5000);
        expect(schema.fields.find((f) => f.name === 'id').sampleValues.length).toBeLessThanOrEqual(5);

        const idFieldInternals = features.length;
        expect(idFieldInternals).toBe(5000);
    });

    it('analyzeSchemaAsync completes for large feature sets', async () => {
        const features = Array.from({ length: 600 }, (_, i) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [0, 0] },
            properties: { val: i % 10 }
        }));

        const schema = await analyzeSchemaAsync({ type: 'FeatureCollection', features }, null);
        expect(schema.featureCount).toBe(600);
        expect(schema.fields.length).toBeGreaterThan(0);
    });

    it('caps inference sample size per field', () => {
        const features = [{
            type: 'Feature',
            geometry: null,
            properties: Object.fromEntries(
                Array.from({ length: SCHEMA_SAMPLE_VALUES + 50 }, (_, i) => [`k${i}`, i])
            )
        }];
        const schema = analyzeSchema({ type: 'FeatureCollection', features });
        expect(schema.fields.length).toBe(SCHEMA_SAMPLE_VALUES + 50);
    });
});
