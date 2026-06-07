/**
 * Parse shapefile ZIP buffer via shpjs.
 * @param {ArrayBuffer} buffer
 * @param {Function} shpFn
 */
export async function parseShapefileBuffer(buffer, shpFn) {
    if (typeof shpFn !== 'function') {
        throw new Error('Shapefile (shpjs) library not loaded');
    }

    let geojson;
    try {
        geojson = await shpFn(buffer);
    } catch (e) {
        throw new Error('Failed to parse shapefile: ' + e.message);
    }

    if (Array.isArray(geojson)) {
        return {
            layers: geojson
                .filter((fc) => fc && fc.type === 'FeatureCollection' && fc.features?.length > 0)
                .map((fc) => ({
                    geojson: {
                        type: 'FeatureCollection',
                        features: fc.features.map((f) => ({
                            type: 'Feature',
                            geometry: f.geometry || null,
                            properties: f.properties || {}
                        }))
                    },
                    fileName: fc.fileName || null
                }))
        };
    }

    if (!geojson || geojson.type !== 'FeatureCollection') {
        throw new Error('Shapefile produced invalid GeoJSON');
    }

    geojson.features = geojson.features.map((f) => ({
        type: 'Feature',
        geometry: f.geometry || null,
        properties: f.properties || {}
    }));

    return { geojson };
}

export default parseShapefileBuffer;
