import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    buildDualScreenPlaceholderMarkup,
    scheduleMapResizeAfterLayout
} from '../js/dual-screen/layout.js';

const mainCss = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../css/main.css'),
    'utf8'
);

describe('dual-screen layout', () => {
    it('keeps panel-center visible so placeholder and exit affordance show', () => {
        expect(mainCss).not.toMatch(
            /\.app-layout\.dual-screen-active\s+\.panel-center\s*\{[^}]*display:\s*none/
        );
    });

    it('placeholder includes a return-map control', () => {
        const html = buildDualScreenPlaceholderMarkup();
        expect(html).toContain('btn-return-map-primary');
        expect(html.toLowerCase()).toContain('return');
    });

    it('scheduleMapResizeAfterLayout calls resize after animation frames', () => {
        vi.useFakeTimers();
        const resize = vi.fn();
        const raf = vi.fn((cb) => cb());
        vi.stubGlobal('requestAnimationFrame', raf);

        scheduleMapResizeAfterLayout({ resize, map: null });
        expect(resize).toHaveBeenCalled();

        vi.advanceTimersByTime(250);
        expect(resize.mock.calls.length).toBeGreaterThanOrEqual(3);

        vi.useRealTimers();
        vi.unstubAllGlobals();
    });
});
