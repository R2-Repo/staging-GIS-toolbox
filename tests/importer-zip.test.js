import { describe, it, expect } from 'vitest';
import { loadJSZip } from '../js/core/libs.js';
import { detectZipKind } from '../js/import/importer.js';
import { resolveZipInternalHref, readKmlFromKmzZip } from '../js/import/zip-utils.js';

describe('ZIP import sniffing', () => {
    it('detectZipKind identifies KMZ-style zip', async () => {
        const JSZip = await loadJSZip();
        const zip = new JSZip();
        zip.file('doc.kml', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>');
        const buffer = await zip.generateAsync({ type: 'arraybuffer' });
        const file = new File([buffer], 'test.zip', { type: 'application/zip' });
        expect(await detectZipKind(file)).toBe('kmz');
    });

    it('detectZipKind prefers shapefile when .shp present', async () => {
        const JSZip = await loadJSZip();
        const zip = new JSZip();
        zip.file('layer.shp', new Uint8Array([0]));
        zip.file('layer.dbf', new Uint8Array([0]));
        const buffer = await zip.generateAsync({ type: 'arraybuffer' });
        const file = new File([buffer], 'test.zip', { type: 'application/zip' });
        expect(await detectZipKind(file)).toBe('shapefile');
    });

    it('readKmlFromKmzZip resolves relative network link paths', async () => {
        const JSZip = await loadJSZip();
        const childKml = '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><Point><coordinates>1,2,0</coordinates></Point></Placemark></Document></kml>';
        const zip = new JSZip();
        zip.file('doc.kml', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>');
        zip.file('links/child.kml', childKml);
        const buffer = await zip.generateAsync({ type: 'arraybuffer' });
        const loaded = await JSZip.loadAsync(buffer);

        expect(resolveZipInternalHref('doc.kml', 'links/child.kml')).toBe('links/child.kml');
        const text = await readKmlFromKmzZip(loaded, 'doc.kml', 'links/child.kml');
        expect(text).toContain('<Point>');
    });
});
