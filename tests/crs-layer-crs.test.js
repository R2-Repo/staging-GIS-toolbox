import { describe, it, expect } from 'vitest';
import * as turf from '@turf/turf';
import { createSpatialDataset } from '../js/core/data-model.js';
import {
    hasProjectedCoordinates,
    parseReprojectSuffixCrs,
    resolveReprojectFromCrs,
    sampleLayerCoordinate
} from '../js/crs/layer-crs.js';

describe('layer crs helpers', () => {
    it('samples the first coordinate from a feature collection', () => {
        const geojson = turf.featureCollection([
            turf.point([-111.8, 40.4]),
            turf.point([-111.9, 40.5])
        ]).geojson ?? turf.featureCollection([turf.point([-111.8, 40.4])]);
        const fc = { type: 'FeatureCollection', features: [turf.point([-111.8, 40.4]), turf.point([-111.9, 40.5])] };
        expect(sampleLayerCoordinate(fc)).toEqual([-111.8, 40.4]);
    });

    it('parses EPSG code from derived reproject layer names', () => {
        expect(parseReprojectSuffixCrs('roads_reproject_EPSG26912')).toBe('EPSG:26912');
        expect(parseReprojectSuffixCrs('roads')).toBeNull();
    });

    it('resolves projected suffix CRS when schema is mislabeled as WGS84', () => {
        const layer = createSpatialDataset(
            'Divided highway example_reproject_EPSG26912',
            turf.featureCollection([turf.point([436182.15, 4509317.04])]),
            { format: 'derived' },
            { crs: 'EPSG:4326' }
        );
        expect(hasProjectedCoordinates(layer.geojson)).toBe(true);
        expect(resolveReprojectFromCrs(layer, layer.geojson)).toBe('EPSG:26912');
    });

    it('uses schema CRS when it already names a projected system', () => {
        const layer = createSpatialDataset(
            'survey',
            turf.featureCollection([turf.point([436182.15, 4509317.04])]),
            { format: 'xlsx' },
            { crs: 'EPSG:26912' }
        );
        expect(resolveReprojectFromCrs(layer, layer.geojson)).toBe('EPSG:26912');
    });

    it('keeps geographic schema for geographic coordinates', () => {
        const layer = createSpatialDataset(
            'draw',
            turf.featureCollection([turf.point([-111.8, 40.4])]),
            { format: 'draw' },
            { crs: 'EPSG:4326' }
        );
        expect(resolveReprojectFromCrs(layer, layer.geojson)).toBe('EPSG:4326');
    });
});
