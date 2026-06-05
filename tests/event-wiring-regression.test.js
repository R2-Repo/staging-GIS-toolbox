import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mapManagerSource = readFileSync(new URL('../js/map/map-manager.js', import.meta.url), 'utf8');

describe('event wiring regression guards', () => {
    it('keeps legacy app modal handlers off property assignments', () => {
        // Guard against reintroducing property-based modal bindings in app.js.
        expect(appSource).not.toMatch(/\.on(?:click|change|input|dblclick)\s*=/);
    });

    it('keeps inline DOM event attributes out of app html strings and index shell', () => {
        const inlineHandlerPattern = /\bon(?:click|change|input|dblclick)\s*=/i;
        expect(appSource).not.toMatch(inlineHandlerPattern);
        expect(indexSource).not.toMatch(inlineHandlerPattern);
    });

    it('prevents reintroducing the window.app global action facade', () => {
        expect(appSource).not.toMatch(/\bwindow\.app\b/);
        expect(mapManagerSource).not.toMatch(/\bwindow\.app\b/);
    });
});
