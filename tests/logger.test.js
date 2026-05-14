import { describe, it, expect } from 'vitest';
import { logger } from '../js/core/logger.js';

describe('logger', () => {
  it('exports a singleton with core methods', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});
