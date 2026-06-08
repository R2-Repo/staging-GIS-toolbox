import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findNodeDef } from '../js/workflow/node-catalog.js';
import { normalizeFilterOperator } from '../js/workflow/nodes/transform-nodes.js';
import { FILTER_OPERATORS } from '../react/workflow/inspectors/helpers.js';

const PIPELINES_DIR = join(process.cwd(), 'pipelines');
const KNOWN_OPERATORS = new Set([
    ...FILTER_OPERATORS.map((o) => o.v),
    'greaterThan',
    'lessThan',
    'notEquals',
    'notContains',
    'startsWith',
    'endsWith',
    'isNull',
    'isNotNull'
]);

function loadPipelineFiles() {
    return readdirSync(PIPELINES_DIR)
        .filter((f) => f.endsWith('.json') && f !== 'manifest.json' && f !== 'index.json');
}

describe('pipeline example JSON files', () => {
    const files = loadPipelineFiles();

    it('includes at least one example pipeline', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const file of files) {
        describe(file, () => {
            let config;

            it('parses as valid JSON with pipeline nodes', () => {
                const raw = readFileSync(join(PIPELINES_DIR, file), 'utf8');
                config = JSON.parse(raw);
                expect(Array.isArray(config.pipeline?.nodes)).toBe(true);
                expect(config.pipeline.nodes.length).toBeGreaterThan(0);
            });

            it('uses registered node types', () => {
                const raw = readFileSync(join(PIPELINES_DIR, file), 'utf8');
                config = JSON.parse(raw);
                for (const nd of config.pipeline.nodes) {
                    expect(findNodeDef(nd.type), `unknown type ${nd.type}`).toBeTruthy();
                }
            });

            it('uses known filter operators when filter-rows present', () => {
                const raw = readFileSync(join(PIPELINES_DIR, file), 'utf8');
                config = JSON.parse(raw);
                for (const nd of config.pipeline.nodes) {
                    if (nd.type !== 'filter-rows') continue;
                    for (const rule of nd.config?.rules || []) {
                        if (!rule.operator) continue;
                        expect(
                            KNOWN_OPERATORS.has(rule.operator) || KNOWN_OPERATORS.has(normalizeFilterOperator(rule.operator)),
                            `unknown operator ${rule.operator}`
                        ).toBe(true);
                    }
                }
            });
        });
    }
});

describe('pipelines/manifest.json', () => {
    it('lists every example JSON file', () => {
        const manifest = JSON.parse(readFileSync(join(PIPELINES_DIR, 'manifest.json'), 'utf8'));
        const manifestFiles = new Set(manifest.map((e) => e.file));
        for (const file of loadPipelineFiles()) {
            expect(manifestFiles.has(file), `missing manifest entry for ${file}`).toBe(true);
        }
    });
});
