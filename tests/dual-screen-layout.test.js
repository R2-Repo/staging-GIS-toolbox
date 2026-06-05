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

    it('hides the React map host while dual-screen is active on the primary window', () => {
        expect(mainCss).toMatch(
            /#map-container\.dual-screen-map-hidden\s+\.map-react-view-host[\s\S]*display:\s*none/
        );
    });

    it('scheduleMapResizeAfterLayout calls resize after animation frames', () => {
        vi.useFakeTimers();
        const resize = vi.fn();
        const raf = vi.fn((cb) => cb());
        vi.stubGlobal('requestAnimationFrame', raf);

        scheduleMapResizeAfterLayout({ resize });
        expect(resize).toHaveBeenCalled();

        vi.advanceTimersByTime(250);
        expect(resize.mock.calls.length).toBeGreaterThanOrEqual(3);

        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('scheduleMapResizeAfterLayout also resizes after map load when available', () => {
        vi.useFakeTimers();
        const resize = vi.fn();
        const raf = vi.fn((cb) => cb());
        vi.stubGlobal('requestAnimationFrame', raf);

        const map = {
            loaded: vi.fn(() => false),
            once: vi.fn((_event, cb) => cb())
        };

        scheduleMapResizeAfterLayout({
            resize,
            getMap: () => map
        });

        expect(map.once).toHaveBeenCalledWith('load', expect.any(Function));
        expect(resize).toHaveBeenCalled();

        vi.advanceTimersByTime(250);
        expect(resize.mock.calls.length).toBeGreaterThanOrEqual(4);

        vi.useRealTimers();
        vi.unstubAllGlobals();
    });
});
