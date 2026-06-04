import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDualScreenPlaceholderMarkup } from '../js/dual-screen/layout.js';

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
});
