import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseGeoJSONText } from '../js/import/parsers/parse-geojson.js';
import { parseKmlText } from '../js/import/parsers/parse-kml.js';
import { extractKmlStyleFromFeatures } from '../js/import/parsers/kml-style.js';
import { loadToGeoJSON } from '../js/core/libs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, 'fixtures', 'import');

function readFixture(name) {
    return readFileSync(join(fixtures, name), 'utf8');
}

describe('import parsers', () => {
    it('parseGeoJSONText normalizes FeatureCollection', () => {
        const { geojson } = parseGeoJSONText('{"type":"FeatureCollection","features":[]}');
        expect(geojson.type).toBe('FeatureCollection');
        expect(Array.isArray(geojson.features)).toBe(true);
    });

    it('parseKmlText parses fixture placemarks', async () => {
        const text = readFixture('point-line-polygon.kml');
        const toGeoJsonLib = await loadToGeoJSON();
        const { geojson, networkHrefs } = parseKmlText(text, {
            DOMParserImpl: DOMParser,
            toGeoJsonLib
        });
        expect(geojson.features.length).toBe(3);
        expect(networkHrefs).toEqual([]);
    });

    it('extractKmlStyleFromFeatures reads stroke/fill', () => {
        const style = extractKmlStyleFromFeatures([
            { properties: { stroke: '#ff0000', fill: '#00ff00', 'stroke-width': 2 } }
        ]);
        expect(style.strokeColor).toBe('#ff0000');
        expect(style.fillColor).toBe('#00ff00');
    });
});
