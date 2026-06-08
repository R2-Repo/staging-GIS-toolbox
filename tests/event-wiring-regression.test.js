import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const handlersSource = readFileSync(new URL('../js/tools/tool-handlers.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mapManagerSource = readFileSync(new URL('../js/map/map-manager.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../react/App.jsx', import.meta.url), 'utf8');

describe('event wiring regression guards', () => {
    it('keeps modal handler wiring off property assignments', () => {
        expect(handlersSource).not.toMatch(/\.on(?:click|change|input|dblclick)\s*=/);
    });

    it('keeps inline DOM event attributes out of handler html strings and index shell', () => {
        const inlineHandlerPattern = /\bon(?:click|change|input|dblclick)\s*=/i;
        expect(handlersSource).not.toMatch(inlineHandlerPattern);
        expect(indexSource).not.toMatch(inlineHandlerPattern);
    });

    it('prevents reintroducing the window.app global action facade', () => {
        expect(handlersSource).not.toMatch(/\bwindow\.app\b/);
        expect(mapManagerSource).not.toMatch(/\bwindow\.app\b/);
    });

    it('boots from a single React root', () => {
        expect(indexSource).toContain('id="root"');
        expect(indexSource).toContain('/react/main.jsx');
        expect(indexSource).not.toContain('js/app.js');
    });

    it('routes handleFileImport through shared post-import pipeline', () => {
        expect(handlersSource).toContain('finalizeImportedDatasets');
        expect(handlersSource).toContain('applyImportLayerStyles');
        expect(handlersSource).not.toMatch(/function _maybeOfferSimpleStyleConvert\s*\(/);
    });

    it('does not duplicate panel collapse wiring in setupAppWiring', () => {
        expect(handlersSource).not.toMatch(/toggle-left-panel.*addEventListener/);
        expect(handlersSource).not.toMatch(/toggle-right-panel.*addEventListener/);
        expect(handlersSource).not.toMatch(/panel-section-header/);
    });

    it('uses React CollapsibleSection for panel section collapse', () => {
        expect(appSource).toContain('CollapsibleSection');
        expect(appSource).not.toMatch(/onSectionHeaderClick/);
    });
});
