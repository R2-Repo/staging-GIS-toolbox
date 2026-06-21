import { describe, it, expect } from 'vitest';
import { exportKML, exportMultiLayerKML } from '../js/export/kml-exporter.js';
import {
    isKmlMilepostLayer,
    resolveMilepostPlacemarkName,
    MILEPOST_ICON_HREF_KMZ,
    MILEPOST_ICON_HREF_REMOTE
} from '../js/export/kml-milepost-style.js';

describe('kml-export label-only layers', () => {
    it('hides point icons for _kmlExport.labelOnly layers', async () => {
        const dataset = {
            name: 'Station Labels',
            _kmlExport: { labelOnly: true },
            geojson: {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [-111.5, 40.2] },
                    properties: { name: '10+00', station_label: '10+00' }
                }]
            }
        };

        const { text } = await exportKML(dataset, {
            style: {
                mode: 'simple',
                strokeColor: '#111111',
                fillColor: '#111111',
                pointSize: 0,
                fillOpacity: 0
            }
        });

        expect(text).toContain('<name>10+00</name>');
        expect(text).toContain('<IconStyle><scale>0</scale></IconStyle>');
        expect(text).toContain('<LabelStyle><scale>1</scale><color>ffffffff</color></LabelStyle>');
    });
});

describe('kml-export milepost layers', () => {
    it('detects milepost layers by export flag, source url, or layer name', () => {
        expect(isKmlMilepostLayer({ _kmlExport: { milepost: true } }, null, [])).toBe(true);
        expect(isKmlMilepostLayer({
            name: 'Route Mileposts',
            source: { url: 'https://roads.udot.utah.gov/server/rest/services/Public/Mile_Point_Tenth_Measures_Open_Data/MapServer/0' }
        }, null, [{ geometry: { type: 'Point' }, properties: { Measure: 12.5 } }])).toBe(true);
        expect(isKmlMilepostLayer({
            name: 'Roads',
            geojson: { features: [{ geometry: { type: 'Point' }, properties: { id: 1 } }] }
        }, null, [{ geometry: { type: 'Point' }, properties: { id: 1 } }])).toBe(false);
    });

    it('uses green dot icon, label style, and milepost measure as placemark name', async () => {
        const dataset = {
            name: 'SR-145 Mileposts (tenth)',
            _kmlExport: { milepost: true, labelField: 'milepost' },
            geojson: {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [-111.5, 40.2] },
                    properties: { milepost: '12.50', Measure: 12.5, name: '12.50' }
                }]
            }
        };

        const kml = await exportKML(dataset, {
            forKmzArchive: true,
            style: {
                fillColor: '#00ff66',
                pointSize: 4,
                fillOpacity: 1
            }
        });

        expect(kml.text).toContain('<name>12.50</name>');
        expect(kml.text).toContain(`<href>${MILEPOST_ICON_HREF_KMZ}</href>`);
        expect(kml.text).toContain('<LabelStyle>');
        expect(kml.text).not.toContain('<IconStyle><scale>0</scale></IconStyle>');
    });

    it('uses remote dot icon for standalone KML export', async () => {
        const { text } = await exportKML({
            name: 'Mileposts',
            _kmlExport: { milepost: true },
            geojson: {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [-111, 40] },
                    properties: { Measure: '10.0' }
                }]
            }
        }, { style: { fillColor: '#00ff66', pointSize: 4, fillOpacity: 1 } });

        expect(text).toContain(`<href>${MILEPOST_ICON_HREF_REMOTE}</href>`);
        expect(text).toContain('<name>10.0</name>');
    });

    it('keeps visible default icons for normal point layers', async () => {
        const dataset = {
            name: 'Sites',
            geojson: {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [-111.5, 40.2] },
                    properties: { name: 'Site A' }
                }]
            }
        };

        const { text } = await exportKML(dataset, {
            style: {
                mode: 'simple',
                strokeColor: '#0066cc',
                fillColor: '#0066cc',
                pointSize: 6,
                fillOpacity: 1
            }
        });

        expect(text).toContain('<IconStyle><color>');
        expect(text).not.toContain('<IconStyle><scale>0</scale></IconStyle>');
        expect(text).not.toContain('files/milepost-dot.png');
    });

    it('applies milepost styling per folder in multi-layer export', async () => {
        const { text } = await exportMultiLayerKML([
            {
                dataset: {
                    name: 'Labels',
                    _kmlExport: { labelOnly: true },
                    geojson: {
                        type: 'FeatureCollection',
                        features: [{
                            type: 'Feature',
                            geometry: { type: 'Point', coordinates: [-111, 40] },
                            properties: { name: '5+00' }
                        }]
                    }
                },
                style: { pointSize: 0, fillOpacity: 0, strokeColor: '#111111' }
            },
            {
                dataset: {
                    name: 'Mileposts (tenth)',
                    _kmlExport: { milepost: true, labelField: 'milepost' },
                    geojson: {
                        type: 'FeatureCollection',
                        features: [{
                            type: 'Feature',
                            geometry: { type: 'Point', coordinates: [-111.1, 40.1] },
                            properties: { milepost: '12.50', name: '12.50' }
                        }]
                    }
                },
                style: { pointSize: 4, fillColor: '#00ff66', fillOpacity: 1, strokeColor: '#00ff66' }
            }
        ], { forKmzArchive: true });

        expect(text).toContain('<Folder>\n      <name>Labels</name>');
        expect(text).toContain('<Folder>\n      <name>Mileposts (tenth)</name>');
        expect(text).toContain('<IconStyle><scale>0</scale></IconStyle>');
        expect(text).toContain(`<href>${MILEPOST_ICON_HREF_KMZ}</href>`);
        expect(text).toContain('<name>12.50</name>');
    });

    it('resolveMilepostPlacemarkName prefers configured label field', () => {
        const feature = { properties: { milepost: '12.50', Measure: 12.5, name: 'x' } };
        expect(resolveMilepostPlacemarkName(feature, { _kmlExport: { labelField: 'milepost' } })).toBe('12.50');
        expect(resolveMilepostPlacemarkName(feature, {})).toBe('12.50');
    });
});

describe('kml-export layer label field', () => {
    it('uses style.labels.field for placemark name when enabled', async () => {
        const dataset = {
            name: 'Routes',
            geojson: {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [-111.5, 40.2] },
                    properties: { route_name: 'I-15 NB', name: 'ignored' }
                }]
            }
        };

        const { text } = await exportKML(dataset, {
            style: {
                mode: 'simple',
                strokeColor: '#0066cc',
                fillColor: '#0066cc',
                pointSize: 6,
                fillOpacity: 1,
                labels: { enabled: true, field: 'route_name', color: '#ff0000' }
            }
        });

        expect(text).toContain('<name>I-15 NB</name>');
        expect(text).not.toContain('<name>ignored</name>');
        expect(text).toContain('<LabelStyle>');
    });
});
