import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflowCss = readFileSync(new URL('../css/workflow.css', import.meta.url), 'utf8');
const mainCss = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');
const headerSource = readFileSync(new URL('../react/header/HeaderBar.jsx', import.meta.url), 'utf8');
const controllerSource = readFileSync(new URL('../js/workflow/workflow-controller.js', import.meta.url), 'utf8');

describe('workflow overlay hit testing', () => {
    it('keeps hidden overlay below app chrome and above only when visible', () => {
        expect(workflowCss).toMatch(/\.wf-overlay\s*\{[\s\S]*z-index:\s*-1/);
        expect(workflowCss).toMatch(/\.wf-overlay\.visible\s*\{[\s\S]*z-index:\s*9000/);
        expect(workflowCss).toMatch(/#wf-overlay-root:not\(:has\(\.wf-overlay\.visible\)\)/);
    });

    it('marks closed overlay root inert in the controller', () => {
        expect(controllerSource).toContain("rootEl?.setAttribute('inert', '')");
        expect(controllerSource).toContain("rootEl.removeAttribute('inert')");
    });
});

describe('header pipeline button layout', () => {
    it('groups pipeline and dual screen so flex-wrap does not split them', () => {
        expect(headerSource).toContain('header-pipeline-cluster');
        expect(headerSource).toContain('header-pipeline-dual');
    });

    it('normalizes header button hit height for the pipeline control', () => {
        expect(mainCss).toMatch(/\.header \.btn-sm\s*\{[^}]*min-height:\s*28px/);
    });
});
