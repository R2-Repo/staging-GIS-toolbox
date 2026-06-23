import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

describe('deploy static assets', () => {
    it('copies public icons and background into dist for GitHub Pages', () => {
        execSync('npm run build', { cwd: root, stdio: 'pipe' });

        expect(existsSync(join(dist, 'icons/favicon.png'))).toBe(true);
        expect(existsSync(join(dist, 'icons/PWAicon.png'))).toBe(true);
        expect(existsSync(join(dist, 'Side_Background.webp'))).toBe(true);
        expect(existsSync(join(dist, '.nojekyll'))).toBe(true);
    }, 120_000);
});
