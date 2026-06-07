import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskRunner } from '../js/core/task-runner.js';
import { importKML } from '../js/import/kml-importer.js';
import { importKMZ } from '../js/import/kmz-importer.js';
import { collectNetworkLinkHrefs } from '../js/import/kml-networklink.js';
import { loadJSZip } from '../js/core/libs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, 'fixtures', 'import');

function readFixture(name) {
    return readFileSync(join(fixtures, name), 'utf8');
}

function mockTask() {
    return { updateProgress: vi.fn() };
}

describe('KML import', () => {
    beforeEach(() => {
        const t = TaskRunner.activeTask;
        if (t && !t.cancelled) t.cancel();
    });

    it('imports point, line, and polygon placemarks', async () => {
        const text = readFixture('point-line-polygon.kml');
        const ds = await importKML(text, mockTask(), { sourceFileName: 'point-line-polygon.kml' });
        expect(ds.type).toBe('spatial');
        expect(ds.geojson.features.length).toBe(3);
        const types = new Set(ds.geojson.features.map((f) => f.geometry.type));
        expect(types.has('Point')).toBe(true);
        expect(types.has('LineString')).toBe(true);
        expect(types.has('Polygon')).toBe(true);
    });

    it('explodes MultiGeometry into separate features', async () => {
        const text = readFixture('multigeometry.kml');
        const ds = await importKML(text, mockTask(), { sourceFileName: 'multigeometry.kml' });
        expect(ds.geojson.features.length).toBe(2);
        expect(ds.geojson.features.every((f) => f.geometry.type !== 'GeometryCollection')).toBe(true);
    });

    it('creates empty layer with network link hrefs and warning', async () => {
        const text = readFixture('empty-networklink.kml');
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');
        expect(collectNetworkLinkHrefs(doc)).toEqual(['https://example.com/data.kml']);

        const ds = await importKML(text, mockTask(), { sourceFileName: 'empty-networklink.kml' });
        expect(ds.geojson.features.length).toBe(0);
        expect(ds._networkLinkHrefs).toContain('https://example.com/data.kml');
        expect(ds._importWarning).toBeTruthy();
    });

    it('imports a minimal KMZ built in test', async () => {
        const JSZip = await loadJSZip();
        const kml = readFixture('point-line-polygon.kml');
        const zip = new JSZip();
        zip.file('doc.kml', kml);
        const buffer = await zip.generateAsync({ type: 'arraybuffer' });
        const file = new File([buffer], 'minimal.kmz', { type: 'application/vnd.google-earth.kmz' });

        const ds = await importKMZ(file, mockTask());
        expect(ds.source.format).toBe('kmz');
        expect(ds.geojson.features.length).toBe(3);
    });
});
