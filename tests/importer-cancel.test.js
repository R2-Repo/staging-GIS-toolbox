import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskRunner, getActiveTask } from '../js/core/task-runner.js';

vi.mock('../js/import/geojson-importer.js', () => ({
    importGeoJSON: vi.fn(async (file, task) => {
        for (let i = 0; i < 8; i++) {
            task.throwIfCancelled();
            await new Promise((r) => setTimeout(r, 15));
            task.updateProgress((i + 1) * 10, `Parsing chunk ${i}`);
        }
        return {
            type: 'spatial',
            name: file.name,
            geojson: { type: 'FeatureCollection', features: [] },
            schema: { fields: [], geometryType: null, featureCount: 0, crs: 'EPSG:4326' }
        };
    })
}));

const { importFile, importFiles } = await import('../js/import/importer.js');

describe('importer cancel', () => {
    beforeEach(() => {
        const t = getActiveTask();
        if (t && !t.cancelled) t.cancel();
        vi.clearAllMocks();
    });

    it('importFile returns null when cancelled mid-run', async () => {
        const file = new File(['{"type":"FeatureCollection","features":[]}'], 'test.geojson', {
            type: 'application/geo+json'
        });

        const runPromise = importFile(file);
        await new Promise((r) => setTimeout(r, 25));
        const active = getActiveTask();
        expect(active).toBeTruthy();
        active.cancel();

        const result = await runPromise;
        expect(result).toBeNull();
    });

    it('importFiles stops after cancel and does not accumulate datasets', async () => {
        const files = [
            new File(['{}'], 'a.geojson', { type: 'application/geo+json' }),
            new File(['{}'], 'b.geojson', { type: 'application/geo+json' })
        ];

        const runPromise = importFiles(files);
        await new Promise((r) => setTimeout(r, 25));
        getActiveTask()?.cancel();

        const { datasets, cancelled } = await runPromise;
        expect(cancelled).toBe(true);
        expect(datasets.length).toBeLessThan(2);
    });
});
