import { describe, it, expect } from 'vitest';
import { RENDER_LIMITS, MAP_CHUNK_BATCH_SIZE } from '../js/map/render-limits.js';

describe('render-limits', () => {
    it('exports sane map budgets', () => {
        expect(RENDER_LIMITS.maxFeaturesPerSource).toBe(10_000);
        expect(RENDER_LIMITS.maxVerticesPerViewport).toBe(250_000);
        expect(MAP_CHUNK_BATCH_SIZE).toBe(5000);
    });
});
