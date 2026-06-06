/**
 * Remove leftover legacy HTML modal blocks from functions that already mount React dialogs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appPath = join(root, 'js', 'app.js');
let src = readFileSync(appPath, 'utf8');

// Phase 2 vanilla-only handlers — keep legacy HTML in these
const KEEP_LEGACY = new Set([
    'openFilterBuilder',
    'openJoinTool',
    'openValidation',
    'openTemplateBuilder',
    'openFeatureEditor',
    'showDataTable',
    'showToolInfo',
    'showMapContextMenu',
    'openReplaceClean' // check - might have react now
]);

function findFunctionBounds(source, name) {
    const re = new RegExp(`(?:async )?function ${name}\\([^)]*\\)\\s*\\{`);
    const match = re.exec(source);
    if (!match) return null;
    const start = match.index;
    let pos = match.index + match[0].length;
    let depth = 1;
    while (pos < source.length && depth > 0) {
        const ch = source[pos];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        pos++;
    }
    return { start, end: pos, body: source.slice(match.index + match[0].length, pos - 1) };
}

const fnRe = /(?:async )?function (\w+)\([^)]*\)\s*\{/g;
const functions = [];
let m;
while ((m = fnRe.exec(src)) !== null) {
    functions.push(m[1]);
}

let removed = 0;
for (const fnName of functions) {
    if (KEEP_LEGACY.has(fnName)) continue;
    const bounds = findFunctionBounds(src, fnName);
    if (!bounds) continue;
    if (!/mount\w+Dialog/.test(bounds.body)) continue;
    if (!/const html = `/.test(bounds.body)) continue;

    // Remove from first `const html = \`` after mount*Dialog to end of function body
    const htmlIdx = bounds.body.indexOf('const html = `');
    if (htmlIdx === -1) continue;

    const newBody = bounds.body.slice(0, htmlIdx).replace(/\s+$/, '\n');
    const fnStart = bounds.start;
    const fnHeaderEnd = src.indexOf('{', fnStart) + 1;
    src = src.slice(0, fnHeaderEnd) + newBody + src.slice(bounds.end - 1);
    removed++;
}

// openImportFlow legacy fallback
src = src.replace(/\n\s*triggerLegacyImportInput\(\);\n/, '\n');

// Remove triggerLegacyImportInput if unused
if (!src.includes('triggerLegacyImportInput(')) {
    src = src.replace(/function triggerLegacyImportInput\(\) \{[\s\S]*?\}\n\n/, '');
}

writeFileSync(appPath, src);
console.log(`Removed legacy modal blocks from ${removed} functions`);
