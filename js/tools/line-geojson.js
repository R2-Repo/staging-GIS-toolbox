/**
 * LineString / MultiLineString helpers for GIS tools (expects global Turf in browser).
 */

/**
 * Iterate synthetic LineString features (explodes MultiLineString parts).
 * @param {GeoJSON.FeatureCollection} geojson
 * @param {(lineFeat: GeoJSON.Feature<GeoJSON.LineString>) => void} fn
 */
export function forEachLineStringFeature(geojson, fn) {
    const features = geojson?.features || [];
    for (const f of features) {
        const g = f.geometry;
        if (!g) continue;
        if (g.type === 'LineString') {
            fn(f);
        } else if (g.type === 'MultiLineString') {
            for (const coords of g.coordinates) {
                fn({
                    type: 'Feature',
                    properties: { ...f.properties },
                    geometry: { type: 'LineString', coordinates: coords }
                });
            }
        }
    }
}

/**
 * First LineString feature in collection order (first segment of MultiLineString if no plain LineString).
 * @param {GeoJSON.FeatureCollection} geojson
 * @returns {GeoJSON.Feature<GeoJSON.LineString> | null}
 */
export function findFirstLineStringFeature(geojson) {
    let found = null;
    forEachLineStringFeature(geojson, (lf) => {
        if (!found) found = lf;
    });
    return found;
}

/** All LineString features (MultiLineString exploded to segments). */
export function listLineStringFeatures(geojson) {
    const out = [];
    forEachLineStringFeature(geojson, (lf) => { out.push(lf); });
    return out;
}

/**
 * Shortest point-to-line distance for LineString or MultiLineString.
 * @param {GeoJSON.Feature<GeoJSON.Point>} pointFeature
 * @param {GeoJSON.Feature} lineFeature LineString or MultiLineString
 * @param {string} [units]
 * @returns {number}
 */
export function pointToLineDistanceAny(pointFeature, lineFeature, units = 'kilometers') {
    if (typeof turf === 'undefined') throw new Error('Turf.js not loaded');
    const g = lineFeature.geometry;
    if (!g) throw new Error('Line feature has no geometry');
    if (g.type === 'LineString') {
        return turf.pointToLineDistance(pointFeature, lineFeature, { units });
    }
    if (g.type === 'MultiLineString') {
        let min = Infinity;
        for (const coords of g.coordinates) {
            const seg = turf.lineString(coords);
            const d = turf.pointToLineDistance(pointFeature, seg, { units });
            if (d < min) min = d;
        }
        return min;
    }
    throw new Error('Need LineString or MultiLineString');
}

/**
 * Nearest snap on LineString or MultiLineString (minimum distance segment wins).
 * @param {GeoJSON.Feature<GeoJSON.Point>} pointFeature
 * @param {GeoJSON.Feature} lineFeature
 * @param {string} [units]
 * @returns {GeoJSON.Feature<GeoJSON.Point>}
 */
export function nearestPointOnLineAny(pointFeature, lineFeature, units = 'kilometers') {
    if (typeof turf === 'undefined') throw new Error('Turf.js not loaded');
    const g = lineFeature.geometry;
    if (!g) throw new Error('Line feature has no geometry');
    if (g.type === 'LineString') {
        return turf.nearestPointOnLine(lineFeature, pointFeature, { units });
    }
    if (g.type === 'MultiLineString') {
        let best = null;
        let bestD = Infinity;
        for (const coords of g.coordinates) {
            const seg = turf.lineString(coords);
            const snap = turf.nearestPointOnLine(seg, pointFeature, { units });
            const d = snap.properties.dist ?? Infinity;
            if (d < bestD) {
                bestD = d;
                best = snap;
            }
        }
        if (!best) throw new Error('Empty MultiLineString');
        return best;
    }
    throw new Error('Need LineString or MultiLineString');
}
