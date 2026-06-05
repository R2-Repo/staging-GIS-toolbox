import { beforeEach, describe, expect, it } from 'vitest';
import {
    loadPapaParse,
    loadXLSX,
    loadJSZip,
    loadToGeoJSON,
    loadShpjs,
    loadExifr,
    resetLibLoadersForTests
} from '../js/core/libs.js';

describe('external library loaders', () => {
    beforeEach(() => {
        delete globalThis.Papa;
        delete globalThis.XLSX;
        delete globalThis.JSZip;
        delete globalThis.toGeoJSON;
        delete globalThis.shp;
        delete globalThis.exifr;
        resetLibLoadersForTests();
    });

    it('prefers an existing browser global when available', async () => {
        const fakePapa = { parse: () => {}, unparse: () => '' };
        globalThis.Papa = fakePapa;

        const loaded = await loadPapaParse();
        expect(loaded).toBe(fakePapa);
    });

    it('loads npm modules when globals are not present', async () => {
        const papa = await loadPapaParse();
        const xlsx = await loadXLSX();
        const jszip = await loadJSZip();
        const toGeoJSON = await loadToGeoJSON();
        const shp = await loadShpjs();
        const exifr = await loadExifr();

        expect(typeof papa.parse).toBe('function');
        expect(typeof papa.unparse).toBe('function');
        expect(typeof xlsx.read).toBe('function');
        expect(typeof xlsx.write).toBe('function');
        expect(typeof jszip).toBe('function');
        expect(typeof toGeoJSON.kml).toBe('function');
        expect(typeof shp).toBe('function');
        expect(typeof exifr.parse).toBe('function');
    });
});
