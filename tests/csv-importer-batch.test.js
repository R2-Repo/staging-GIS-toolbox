import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockParse = vi.fn();

vi.mock('../js/core/libs.js', () => ({
    loadPapaParse: vi.fn(async () => ({ parse: mockParse }))
}));

const { importCSV, CSV_BATCH_SIZE } = await import('../js/import/csv-importer.js');

function makeTask() {
    return {
        updateProgress: vi.fn(),
        throwIfCancelled: vi.fn()
    };
}

describe('csv-importer batching', () => {
    beforeEach(() => {
        mockParse.mockReset();
    });

    it('uses step mode for parsing', async () => {
        mockParse.mockImplementation((text, opts) => {
            expect(opts.step).toBeTypeOf('function');
            opts.step({ data: { lat: 1, lon: 2, name: 'a' }, meta: { fields: ['lat', 'lon', 'name'] }, errors: [] }, { pause: vi.fn(), resume: vi.fn() });
            opts.complete({});
        });

        const file = new File(['lat,lon,name\n1,2,a'], 'pts.csv');
        const task = makeTask();
        const ds = await importCSV(file, task);
        expect(ds.type).toBe('spatial');
        expect(ds.geojson.features.length).toBe(1);
    });

    it('builds spatial features in batches for large row counts', async () => {
        const rowCount = CSV_BATCH_SIZE + 100;
        mockParse.mockImplementation((text, opts) => {
            for (let i = 0; i < rowCount; i++) {
                opts.step({
                    data: { lat: 40 + i * 0.001, lon: -74, id: i },
                    meta: { fields: ['lat', 'lon', 'id'] },
                    errors: []
                }, { pause: vi.fn(), resume: vi.fn() });
            }
            opts.complete({});
        });

        const file = new File(['x'], 'big.csv');
        const task = makeTask();
        const ds = await importCSV(file, task);
        expect(ds.geojson.features.length).toBe(rowCount);
    });
});
