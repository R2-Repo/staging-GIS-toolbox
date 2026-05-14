/**
 * Browser loads Turf from CDN as global `turf`; tests pin the same major via devDependency.
 */
import * as turf from '@turf/turf';

globalThis.turf = turf;
