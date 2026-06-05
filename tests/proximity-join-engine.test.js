import { describe, it, expect, beforeAll } from 'vitest';
import * as turf from '@turf/turf';
import {
    buildProximityPreview,
    runProximityJoin,
    validateProximityJoinConfig
} from '../js/widgets/proximity-join-engine.js';

beforeAll(() => {
    globalThis.turf = turf;
});

describe('validateProximityJoinConfig', () => {
    it('reports duplicate destination field names', () => {
        const sourceLayer = { id: 'src', geojson: { features: [turf.point([0, 0])] } };
        const targetLayer = { id: 'tgt', geojson: { features: [turf.point([1, 1])] } };
        const { errors } = validateProximityJoinConfig({
            sourceLayer,
            targetLayer,
            fieldMappings: [
                { targetField: 'name', newFieldName: 'nearest_name' },
                { targetField: 'id', newFieldName: 'nearest_name' }
            ]
        });
        expect(errors.join(' ')).toContain('Duplicate new field names');
    });
});

describe('buildProximityPreview', () => {
    it('maps nearest target fields in preview rows', () => {
        const sourceFeatures = [
            turf.point([0, 0]),
            turf.point([10, 10])
        ];
        const targetFeatures = [
            turf.point([0.01, 0.01], { label: 'near-a' }),
            turf.point([10.01, 10.01], { label: 'near-b' })
        ];

        const preview = buildProximityPreview({
            sourceFeatures,
            targetFeatures,
            fieldMappings: [{ targetField: 'label', newFieldName: 'nearest_label' }],
            units: 'meters',
            writeDistance: true
        });

        expect(preview.rows).toHaveLength(2);
        expect(preview.rows[0].nearest_label).toBe('near-a');
        expect(preview.rows[1].nearest_label).toBe('near-b');
        expect(preview.rows[0].nearest_distance).toBeTypeOf('number');
    });
});

describe('runProximityJoin', () => {
    it('updates selected source features with nearest mapped values', async () => {
        const sourceFeatures = [
            turf.point([0, 0], { srcId: 'a' }),
            turf.point([10, 10], { srcId: 'b' })
        ];
        const targetFeatures = [
            turf.point([0.02, 0.02], { code: 'X1' }),
            turf.point([10.02, 10.02], { code: 'Y2' })
        ];

        const result = await runProximityJoin({
            allSourceFeatures: sourceFeatures,
            featureIndices: [0, 1],
            targetFeatures,
            fieldMappings: [{ targetField: 'code', newFieldName: 'nearest_code' }],
            units: 'meters',
            writeDistance: true,
            writeMatchId: false,
            writeMatchLayer: false
        });

        expect(result.cancelled).toBe(false);
        expect(result.matched).toBe(2);
        expect(sourceFeatures[0].properties.nearest_code).toBe('X1');
        expect(sourceFeatures[1].properties.nearest_code).toBe('Y2');
        expect(sourceFeatures[0].properties.nearest_distance).toBeTypeOf('number');
    });
});
