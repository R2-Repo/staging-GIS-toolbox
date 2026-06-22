import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../js/core/logger.js';

describe('logger', () => {
    beforeEach(() => {
        logger.clear();
        logger.setPanelOpen(false);
    });

    afterEach(() => {
        logger.setPanelOpen(false);
    });

    it('exports a singleton with core methods', () => {
        expect(logger).toBeDefined();
        expect(typeof logger.info).toBe('function');
        expect(typeof logger.error).toBe('function');
        expect(typeof logger.setPanelOpen).toBe('function');
    });

    it('stores entries regardless of panel state', () => {
        logger.setPanelOpen(false);
        logger.info('Test', 'stored');
        expect(logger.getEntries()).toHaveLength(1);
        expect(logger.getEntries()[0].action).toBe('stored');
    });

    it('mirrors WARN/ERROR to console when panel is closed', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        logger.setPanelOpen(false);
        logger.info('Test', 'quiet info');
        logger.warn('Test', 'loud warn');
        logger.error('Test', 'loud error');
        expect(spy.mock.calls).toHaveLength(2);
        spy.mockRestore();
    });

    it('mirrors DEBUG/INFO to console only when panel is open', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        logger.setPanelOpen(true);
        logger.debug('Test', 'visible debug');
        logger.info('Test', 'visible info');
        expect(spy.mock.calls).toHaveLength(2);
        spy.mockRestore();
    });

    it('caps entries at 5000', () => {
        for (let i = 0; i < 5005; i++) {
            logger.info('Test', `entry-${i}`);
        }
        expect(logger.getEntries()).toHaveLength(5000);
        expect(logger.getEntries()[0].action).toBe('entry-5');
    });

    it('timed helper records duration on end and fail', () => {
        const timer = logger.timed('Test', 'op');
        timer.end({ status: 'ok' });
        const entry = logger.getEntries().at(-1);
        expect(entry.duration).toBeTypeOf('number');
        expect(entry.level).toBe('INFO');

        const failTimer = logger.timed('Test', 'fail-op');
        failTimer.fail({ status: 'bad' });
        expect(logger.getEntries().at(-1).level).toBe('ERROR');
    });
});
