import { nearestPointOnLineAny, pointToLineDistanceAny } from '../../tools/line-geojson.js';
import { lineSlice, nearestPointOnLine } from '../../tools/gis-tools.js';
import { OUTPUT_ALIGNMENT, METHOD_VALUES } from './config.js';

const FEET_PER_MILE = 5280;

export function normalizeRouteSearchTerm(term) {
    return String(term ?? '').trim();
}

export function escapeSqlLiteral(value) {
    return String(value ?? '').replace(/'/g, "''");
}

/**
 * @param {string|number} value
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
export function validateMilepostValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) {
        return { valid: false, error: 'Milepost is required.' };
    }

    if (!/^\d+(\.\d)?$/.test(raw)) {
        return { valid: false, error: 'Milepost must be a whole mile or one decimal place (tenth-mile).' };
    }

    const parts = raw.split('.');
    if (parts.length === 2 && parts[1].length !== 1) {
        return { valid: false, error: 'Milepost must be a whole mile or one decimal place (tenth-mile).' };
    }

    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) {
        return { valid: false, error: 'Milepost must be a non-negative number.' };
    }

    return { valid: true, value: num };
}

/**
 * @param {string|number} start
 * @param {string|number} end
 */
export function validateMilepostRange(start, end) {
    const startResult = validateMilepostValue(start);
    if (!startResult.valid) {
        return { valid: false, errors: [startResult.error || 'Invalid start milepost.'] };
    }

    const endResult = validateMilepostValue(end);
    if (!endResult.valid) {
        return { valid: false, errors: [endResult.error || 'Invalid end milepost.'] };
    }

    if (startResult.value === endResult.value) {
        return { valid: false, errors: ['Start and end mileposts cannot be the same.'] };
    }

    const reversed = startResult.value > endResult.value;
    return {
        valid: true,
        startMp: Math.min(startResult.value, endResult.value),
        endMp: Math.max(startResult.value, endResult.value),
        reversed
    };
}

export function isWholeMilepost(value) {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) && Math.abs(num - Math.round(num)) < 0.0001;
}

export function isTenthMilepost(value) {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) && !isWholeMilepost(num);
}

/**
 * @param {number} startMp
 * @param {number} endMp
 * @param {import('./config.js').UDOT_ROUTE_SEGMENT_CONFIG} config
 */
export function chooseMilepostLayer(startMp, endMp, config) {
    if (isWholeMilepost(startMp) && isWholeMilepost(endMp)) {
        return {
            layerKey: 'whole',
            url: config.milepostWholeLayerUrl,
            label: 'whole-mile'
        };
    }
    return {
        layerKey: 'tenth',
        url: config.milepostTenthLayerUrl,
        label: 'tenth-mile'
    };
}

export function buildRouteCartoCodeWhere(config) {
    const field = config.cartoCodeField;
    const codes = (config.allowedCartoCodes || []).map((code) => `'${escapeSqlLiteral(code)}'`);
    if (!field || codes.length === 0) return '1=1';
    return `${field} IN (${codes.join(', ')})`;
}

export function buildRouteBaseWhere(config) {
    const dir = escapeSqlLiteral(config.positiveDirectionValue);
    const type = escapeSqlLiteral(config.routeTypeValue);
    return `${config.routeDirectionField} = '${dir}' AND ${config.routeTypeField} = '${type}' AND ${buildRouteCartoCodeWhere(config)}`;
}

export function buildRouteSearchWhere(searchTerm, config) {
    const term = normalizeRouteSearchTerm(searchTerm);
    if (!term) return '1=2';

    const cleaned = escapeSqlLiteral(term).replace(/[%_]/g, '');
    const upper = cleaned.toUpperCase();
    const alias = config.routeAliasField;
    return `${buildRouteBaseWhere(config)} AND UPPER(${alias}) LIKE '%${upper}%'`;
}

export function buildSelectedRouteWhere(routeId, direction, config) {
    const id = escapeSqlLiteral(routeId);
    const dir = escapeSqlLiteral(direction);
    return `${config.routeIdField} = '${id}' AND ${config.routeDirectionField} = '${dir}' AND ${config.routeTypeField} = '${escapeSqlLiteral(config.routeTypeValue)}' AND ${buildRouteCartoCodeWhere(config)}`;
}

export function buildRouteIdWhere(routeId, config) {
    const id = escapeSqlLiteral(routeId);
    return `${config.routeIdField} = '${id}' AND ${buildRouteBaseWhere(config)}`;
}

export function buildMilepostWhere(routeId, minMp, maxMp, config) {
    const id = escapeSqlLiteral(routeId);
    return `${config.milepostRouteIdField} = '${id}' AND ${config.milepostValueField} >= ${minMp} AND ${config.milepostValueField} <= ${maxMp}`;
}

export function buildMilepostPointWhere(routeId, mp, config) {
    return buildMilepostWhere(routeId, mp, mp, config);
}

/**
 * @param {import('geojson').Feature[]} features
 * @param {number} startMp
 * @param {number} endMp
 * @param {number} [tolerance]
 * @param {string} [valueField]
 */
export function findStartEndMilepostPoints(features, startMp, endMp, tolerance = 0.001, valueField = 'Measure') {
    const missing = [];
    let startPoint = null;
    let endPoint = null;

    for (const feature of features || []) {
        const measure = Number(feature?.properties?.[valueField]);
        if (!Number.isFinite(measure)) continue;
        if (Math.abs(measure - startMp) <= tolerance) startPoint = feature;
        if (Math.abs(measure - endMp) <= tolerance) endPoint = feature;
    }

    if (!startPoint) missing.push(startMp);
    if (!endPoint) missing.push(endMp);

    return { startPoint, endPoint, missing };
}

function lineLengthValue(feature, config) {
    const fromAttr = Number(feature?.properties?.[config.routeLengthField]);
    if (Number.isFinite(fromAttr) && fromAttr > 0) return fromAttr;
    if (typeof turf !== 'undefined' && feature?.geometry) {
        return turf.length(feature, { units: 'meters' });
    }
    return 0;
}

/**
 * @param {import('geojson').Feature[]} features
 * @param {import('./config.js').UDOT_ROUTE_SEGMENT_CONFIG} config
 */
export function selectRouteFeatures(features, config) {
    const warnings = [];
    const positiveDir = config.positiveDirectionValue;
    const negativeDir = config.negativeDirectionValue;

    const positiveCandidates = (features || []).filter((feature) =>
        feature?.geometry &&
        String(feature.properties?.[config.routeDirectionField] ?? '').toUpperCase() === String(positiveDir).toUpperCase()
    );

    const negativeCandidates = (features || []).filter((feature) =>
        feature?.geometry &&
        String(feature.properties?.[config.routeDirectionField] ?? '').toUpperCase() === String(negativeDir).toUpperCase()
    );

    if (positiveCandidates.length === 0) {
        return {
            positiveLine: null,
            negativeLine: null,
            warnings: ['No positive-direction route centerline found for the selected route.']
        };
    }

    if (positiveCandidates.length > 1) {
        warnings.push('Multiple positive-direction route features found; using the longest segment.');
    }

    const positiveLine = positiveCandidates.reduce((best, current) => {
        if (!best) return current;
        return lineLengthValue(current, config) > lineLengthValue(best, config) ? current : best;
    }, null);

    let negativeLine = null;
    if (negativeCandidates.length > 0) {
        negativeLine = negativeCandidates.reduce((best, current) => {
            if (!best) return current;
            return lineLengthValue(current, config) > lineLengthValue(best, config) ? current : best;
        }, null);
    }

    return { positiveLine, negativeLine, warnings };
}

/**
 * @param {import('geojson').Feature<import('geojson').LineString>} routeLine
 * @param {import('geojson').Feature<import('geojson').Point>} startPoint
 * @param {import('geojson').Feature<import('geojson').Point>} endPoint
 */
export function snapMilepostsToRoute(routeLine, startPoint, endPoint) {
    const startSnap = nearestPointOnLine(routeLine, startPoint, 'miles');
    const endSnap = nearestPointOnLine(routeLine, endPoint, 'miles');
    return { startSnap, endSnap };
}

/**
 * @param {import('geojson').Feature} routeLine
 * @param {import('geojson').Feature<import('geojson').Point>} startSnap
 * @param {import('geojson').Feature<import('geojson').Point>} endSnap
 */
export function sliceRouteBetweenMileposts(routeLine, startSnap, endSnap) {
    return lineSlice(startSnap, endSnap, routeLine);
}

/**
 * @param {number[]} values
 */
export function median(values) {
    const nums = (values || []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (nums.length === 0) return 0;
    const mid = Math.floor(nums.length / 2);
    if (nums.length % 2 === 0) {
        return (nums[mid - 1] + nums[mid]) / 2;
    }
    return nums[mid];
}

/**
 * @param {import('geojson').Feature<import('geojson').LineString>} line
 * @param {number} [segmentLengthMiles]
 */
export function sampleLineForSeparation(line, segmentLengthMiles = 0) {
    if (typeof turf === 'undefined') throw new Error('Turf.js not loaded');
    const lengthMiles = turf.length(line, { units: 'miles' });
    const byQuarterMile = Math.max(1, Math.ceil(lengthMiles / 0.25));
    const count = Math.min(25, Math.max(7, byQuarterMile));
    const samples = [];

    for (let i = 0; i < count; i++) {
        const dist = count === 1 ? 0 : (lengthMiles * i) / (count - 1);
        samples.push(turf.along(line, dist, { units: 'miles' }));
    }

    return samples;
}

/**
 * @param {import('geojson').Feature<import('geojson').Point>[]} samplePoints
 * @param {import('geojson').Feature} referenceLine
 * @param {string} [units]
 */
export function measureDistancesToReferenceLine(samplePoints, referenceLine, units = 'feet') {
    return (samplePoints || []).map((point) =>
        pointToLineDistanceAny(point, referenceLine, units)
    );
}

/**
 * @param {import('geojson').Feature<import('geojson').LineString>} positiveSegment
 * @param {import('geojson').Feature} referenceLine
 * @param {number} offsetDistanceFeet
 * @param {string} [units]
 */
export function chooseOffsetDirectionTowardReferenceLine(positiveSegment, referenceLine, offsetDistanceFeet, units = 'feet') {
    if (typeof turf === 'undefined') throw new Error('Turf.js not loaded');

    const miles = offsetDistanceFeet / FEET_PER_MILE;
    const positiveOffset = turf.lineOffset(positiveSegment, miles, { units: 'miles' });
    const negativeOffset = turf.lineOffset(positiveSegment, -miles, { units: 'miles' });

    const samplePoints = sampleLineForSeparation(positiveSegment);
    const baseline = measureDistancesToReferenceLine(samplePoints, referenceLine, units);
    const baselineAvg = baseline.reduce((sum, d) => sum + d, 0) / Math.max(baseline.length, 1);

    const positiveDistances = samplePoints.map((point) => {
        const nearest = nearestPointOnLineAny(point, positiveOffset, units);
        const refNearest = nearestPointOnLineAny(point, referenceLine, units);
        return turf.distance(nearest, refNearest, { units });
    });
    const negativeDistances = samplePoints.map((point) => {
        const nearest = nearestPointOnLineAny(point, negativeOffset, units);
        const refNearest = nearestPointOnLineAny(point, referenceLine, units);
        return turf.distance(nearest, refNearest, { units });
    });

    const positiveAvg = positiveDistances.reduce((sum, d) => sum + d, 0) / Math.max(positiveDistances.length, 1);
    const negativeAvg = negativeDistances.reduce((sum, d) => sum + d, 0) / Math.max(negativeDistances.length, 1);

    if (positiveAvg <= negativeAvg && positiveAvg < baselineAvg) return 'positive';
    if (negativeAvg < positiveAvg && negativeAvg < baselineAvg) return 'negative';
    return positiveAvg <= negativeAvg ? 'positive' : 'negative';
}

/**
 * @param {import('geojson').Feature<import('geojson').LineString>} positiveSegment
 * @param {import('geojson').Feature} referenceLine
 */
export function buildApproximateMedianLine(positiveSegment, referenceLine) {
    if (typeof turf === 'undefined') throw new Error('Turf.js not loaded');

    const samplePoints = sampleLineForSeparation(positiveSegment);
    const distancesFeet = measureDistancesToReferenceLine(samplePoints, referenceLine, 'feet');
    const medianSeparationFeet = median(distancesFeet);
    const offsetFeet = medianSeparationFeet / 2;
    const offsetMiles = offsetFeet / FEET_PER_MILE;

    const direction = chooseOffsetDirectionTowardReferenceLine(positiveSegment, referenceLine, offsetFeet, 'feet');
    const signedMiles = direction === 'positive' ? offsetMiles : -offsetMiles;
    const geometry = turf.lineOffset(positiveSegment, signedMiles, { units: 'miles' });

    return {
        ...geometry,
        medianSeparationFeet,
        offsetFeet,
        offsetDirection: direction
    };
}

export function formatMilepost(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value ?? '');
    if (isWholeMilepost(num)) return String(Math.round(num));
    return num.toFixed(1);
}

/**
 * @param {string} routeAlias
 * @param {number} startMp
 * @param {number} endMp
 * @param {string} alignment
 */
export function buildOutputLayerName(routeAlias, startMp, endMp, alignment) {
    const alias = routeAlias || 'Route';
    const startLabel = formatMilepost(startMp);
    const endLabel = formatMilepost(endMp);
    if (alignment === OUTPUT_ALIGNMENT.APPROXIMATE_MEDIAN) {
        return `${alias} MP ${startLabel} to ${endLabel} Median Approx`;
    }
    return `${alias} MP ${startLabel} to ${endLabel} Centerline`;
}

/**
 * @param {import('geojson').Feature} geometryFeature
 * @param {object} attrs
 */
export function buildOutputFeature(geometryFeature, attrs = {}) {
    return {
        type: 'Feature',
        geometry: geometryFeature.geometry,
        properties: { ...attrs }
    };
}

/**
 * @param {object} options
 */
export function buildWarnings(options = {}) {
    const warnings = [...(options.extraWarnings || [])];
    if (options.alignment === OUTPUT_ALIGNMENT.APPROXIMATE_MEDIAN) {
        warnings.push(
            'Approximate median mode offsets the positive-direction route segment halfway toward the opposite-direction reference line. It is intended for clean visual/export geometry, not survey-grade route geometry.'
        );
    }
    if (options.dividedHighwayDetected === false && options.alignment === OUTPUT_ALIGNMENT.APPROXIMATE_MEDIAN) {
        warnings.push('No opposite-direction reference line was found; approximate median mode is unavailable.');
    }
    return warnings;
}

/**
 * @param {object} input
 */
export function computeSegmentResult(input) {
    const {
        positiveLine,
        negativeLine,
        milepostFeatures,
        startMp,
        endMp,
        alignment,
        config,
        milepostLayerKey,
        routeMeta = {}
    } = input;

    const errors = [];
    const warnings = [];

    if (!positiveLine) {
        return { ok: false, errors: ['Positive-direction route centerline is required.'] };
    }

    const { startPoint, endPoint, missing } = findStartEndMilepostPoints(
        milepostFeatures,
        startMp,
        endMp,
        config.milepostTolerance,
        config.milepostValueField
    );

    if (missing.length > 0) {
        return {
            ok: false,
            errors: [`Milepost point(s) not found for: ${missing.map(formatMilepost).join(', ')}.`]
        };
    }

    const { startSnap, endSnap } = snapMilepostsToRoute(positiveLine, startPoint, endPoint);
    const centerlineSegment = sliceRouteBetweenMileposts(positiveLine, startSnap, endSnap);

    let outputGeometry = centerlineSegment;
    let method = METHOD_VALUES.POSITIVE_CENTERLINE;
    let medianSeparationFeet = null;
    let medianOffsetFeet = null;
    const dividedHighwayDetected = Boolean(negativeLine);

    if (alignment === OUTPUT_ALIGNMENT.APPROXIMATE_MEDIAN) {
        if (!negativeLine) {
            errors.push('Approximate divided-highway median mode requires an opposite-direction reference line.');
            return { ok: false, errors };
        }
        const medianResult = buildApproximateMedianLine(centerlineSegment, negativeLine);
        outputGeometry = medianResult;
        method = METHOD_VALUES.APPROXIMATE_MEDIAN;
        medianSeparationFeet = medianResult.medianSeparationFeet;
        medianOffsetFeet = medianResult.offsetFeet;
    }

    const lengthMiles = typeof turf !== 'undefined'
        ? turf.length(outputGeometry, { units: 'miles' })
        : null;

    const milepostPrecision = isWholeMilepost(startMp) && isWholeMilepost(endMp) ? 'whole' : 'tenth';
    const routeAlias = routeMeta.routeAlias
        || positiveLine.properties?.[config.routeAliasField]
        || routeMeta.routeId
        || 'Route';
    const routeId = routeMeta.routeId || positiveLine.properties?.[config.routeIdField] || '';

    const outputFeature = buildOutputFeature(outputGeometry, {
        route_alias_common: routeAlias,
        route_id: routeId,
        route_name: positiveLine.properties?.ROUTE_ALIAS_STD_DIR || routeAlias,
        start_milepost: startMp,
        end_milepost: endMp,
        milepost_precision: milepostPrecision,
        milepost_layer_used: milepostLayerKey === 'whole' ? 'whole-mile' : 'tenth-mile',
        output_alignment: alignment,
        source_route_layer_url: config.routeLayerUrl,
        source_milepost_layer_url: milepostLayerKey === 'whole'
            ? config.milepostWholeLayerUrl
            : config.milepostTenthLayerUrl,
        length_miles: lengthMiles,
        divided_highway_detected: dividedHighwayDetected,
        median_separation_feet: medianSeparationFeet,
        median_offset_feet: medianOffsetFeet,
        created_at: new Date().toISOString(),
        method
    });

    const summary = {
        routeAlias,
        routeId,
        startMp,
        endMp,
        milepostLayerUsed: milepostLayerKey === 'whole' ? 'whole-mile' : 'tenth-mile',
        alignment,
        lengthMiles,
        dividedHighwayDetected,
        medianSeparationFeet,
        medianOffsetFeet
    };

    warnings.push(...buildWarnings({
        alignment,
        dividedHighwayDetected,
        extraWarnings: input.extraWarnings || []
    }));

    return {
        ok: true,
        outputFeature,
        centerlineSegment,
        startPoint,
        endPoint,
        startSnap,
        endSnap,
        summary,
        warnings,
        errors
    };
}

/**
 * @param {object} result
 */
export function buildPreviewSummary(result) {
    if (!result?.summary) return null;
    return {
        ...result.summary,
        warnings: result.warnings || []
    };
}

/** @deprecated scaffold compat — use validateMilepostRange */
export function validateRouteMilepostSegmentConfig(config = {}) {
    const range = validateMilepostRange(config.startMilepost, config.endMilepost);
    if (!range.valid) {
        return { valid: false, errors: range.errors || ['Invalid milepost range.'] };
    }
    if (!config.routeId) {
        return { valid: false, errors: ['Route is required.'] };
    }
    return { valid: true, errors: [] };
}

/** @deprecated scaffold compat */
export async function runRouteMilepostSegment(config = {}) {
    const validation = validateRouteMilepostSegmentConfig(config);
    if (!validation.valid) {
        throw new Error(validation.errors[0] || 'Invalid configuration.');
    }
    return { ok: true };
}
