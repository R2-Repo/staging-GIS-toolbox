import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mainCss = readFileSync(join(root, 'css/main.css'), 'utf8');

describe('panel side background', () => {
    it('Side_Background.webp exists at repo root', () => {
        expect(existsSync(join(root, 'Side_Background.webp'))).toBe(true);
    });

    it('main.css references Side_Background.webp on panel pseudo-elements', () => {
        expect(mainCss).toMatch(/\.panel-left::after,\s*\n\.panel-right::after\s*\{[^}]*url\(['"]?\.\.\/Side_Background\.webp['"]?\)/s);
    });
});
