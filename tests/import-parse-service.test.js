import { describe, it, expect, vi, beforeEach } from 'vitest';

const parseInWorker = vi.fn();

vi.mock('../js/import/import-worker-pool.js', () => ({
    parseInWorker,
    cancelWorkerParse: vi.fn(),
    supportsWorkers: () => true
}));

const { parseGeoJSONForImport, parseKmlForImport } = await import('../js/import/import-parse-service.js');

describe('import-parse-service', () => {
    beforeEach(() => {
        parseInWorker.mockReset();
    });

    it('uses worker for large geojson payloads', async () => {
        parseInWorker.mockResolvedValue({
            geojson: { type: 'FeatureCollection', features: [] }
        });
        const text = '{"type":"FeatureCollection","features":[]}';
        const result = await parseGeoJSONForImport(text, 300 * 1024);
        expect(parseInWorker).toHaveBeenCalledWith('geojson', text);
        expect(result.geojson.features).toEqual([]);
    });

    it('falls back to main-thread parse when worker returns null', async () => {
        parseInWorker.mockResolvedValue(null);
        const text = '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":null,"properties":{}}]}';
        const result = await parseGeoJSONForImport(text, 300 * 1024);
        expect(result.geojson.features.length).toBe(1);
    });

    it('skips worker for small kml payloads', async () => {
        parseInWorker.mockResolvedValue(null);
        const text = '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>';
        await parseKmlForImport(text, 100);
        expect(parseInWorker).not.toHaveBeenCalled();
    });
});
