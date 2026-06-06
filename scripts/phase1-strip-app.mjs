/**
 * One-off Phase 1 transform: strip rollback branches from js/app.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appPath = join(root, 'js', 'app.js');
let src = readFileSync(appPath, 'utf8');

function stripIfBlock(source, condition) {
    const needle = `if (${condition}) {`;
    let result = '';
    let i = 0;

    while (i < source.length) {
        const idx = source.indexOf(needle, i);
        if (idx === -1) {
            result += source.slice(i);
            break;
        }

        result += source.slice(i, idx);
        let pos = idx + needle.length;
        let depth = 1;
        const bodyStart = pos;

        while (pos < source.length && depth > 0) {
            const ch = source[pos];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            pos++;
        }

        let body = source.slice(bodyStart, pos - 1);
        // Drop trailing `return;` inside the if body (common pattern)
        body = body.replace(/\n\s*return;\s*$/, '');
        result += body;
        i = pos;
    }

    return result;
}

function removeFunction(source, name) {
    const patterns = [
        new RegExp(`function ${name}\\([^)]*\\)\\s*\\{`, 'g'),
        new RegExp(`async function ${name}\\([^)]*\\)\\s*\\{`, 'g')
    ];

    for (const re of patterns) {
        let match;
        while ((match = re.exec(source)) !== null) {
            const start = match.index;
            let pos = match.index + match[0].length;
            let depth = 1;
            while (pos < source.length && depth > 0) {
                const ch = source[pos];
                if (ch === '{') depth++;
                else if (ch === '}') depth--;
                pos++;
            }
            source = source.slice(0, start) + source.slice(pos);
            re.lastIndex = 0;
        }
    }
    return source;
}

// Remove feature-flag imports
src = src.replace(/import \{ isReactMapViewEnabled \} from '\.\/map\/map-feature-flags\.js';\n/, '');
src = src.replace(/import \{ isReactLeftPanelEnabled \} from '\.\/ui\/left-panel-feature-flags\.js';\n/, '');
src = src.replace(/import \{ isReactRightPanelEnabled \} from '\.\/ui\/right-panel-feature-flags\.js';\n/, '');
src = src.replace(/import \{ isReactModalEnabled \} from '\.\/ui\/modal-feature-flags\.js';\n/, '');
src = src.replace(/import \{ isReactToastEnabled \} from '\.\/ui\/toast-feature-flags\.js';\n/, '');
src = src.replace(/import \{ isReactToolDialogsEnabled \} from '\.\/ui\/tool-dialog-feature-flags\.js';\n/, '');
src = src.replace(/import \{ isReactHeaderEnabled \} from '\.\/ui\/header-feature-flags\.js';\n/, '');

// Add renderDataPrepTools import from tool-catalog
if (!src.includes('renderDataPrepToolsHtml')) {
    src = src.replace(
        /from '\.\/tools\/tool-catalog\.js';/,
        "from './tools/tool-catalog.js';\nimport { renderDataPrepToolsHtml } from './ui/data-prep-panel-html.js';"
    );
}

// Remove flag state variables
src = src.replace(/let _isReactLeftPanel = false;\n/, '');
src = src.replace(/let _isReactRightPanel = false;\n/, '');
src = src.replace(/let _isReactToast = false;\n/, '');
src = src.replace(/let _isReactModal = false;\n/, '');
src = src.replace(/let _isReactToolDialogs = false;\n/, '');
src = src.replace(/let _isReactHeader = false;\n/, '');

// Simplify boot — replace flag init block with direct mounts
src = src.replace(
    /async function boot\(\) \{[\s\S]*?logger\.info\('App', 'Initializing GIS Toolbox'\);[\s\S]*?if \(_isReactHeader\) \{[\s\S]*?\}\n    setupEventListeners/,
    `async function boot() {
    logger.info('App', 'Initializing GIS Toolbox');
    await _mountReactModalHost();
    await _mountReactToastHost();
    await initMap();
    await _mountReactLeftPanel();
    await _mountReactRightPanel();
    await _mountReactHeader();
    setupEventListeners`
);

// Simplify initMap — always React map
src = src.replace(
    /async function initMap\(\) \{[\s\S]*?try \{[\s\S]*?if \(isReactMapViewEnabled\(\)\) \{[\s\S]*?\} else \{[\s\S]*?mapService\.init\('map-container'\);[\s\S]*?\}[\s\S]*?setExportMapManager\(mapService\);[\s\S]*?\} catch \(e\) \{[\s\S]*?\}\n\}/,
    `async function initMap() {
    try {
        await _mountReactMapView();
        setExportMapManager(mapService);
    } catch (e) {
        logger.error('App', 'Map init failed', { error: e.message });
        showToast('Map failed to initialize. Some features may be limited.', 'warning');
    }
}`
);

// Simplify panel render helpers
src = src.replace(
    /function _renderReactLeftPanel\(\) \{\n    if \(!_isReactLeftPanel\) return;\n    _reactLeftPanelMount\?\.render\(\);\n\}/,
    'function _renderReactLeftPanel() {\n    _reactLeftPanelMount?.render();\n}'
);
src = src.replace(
    /function _renderReactRightPanel\(\) \{\n    if \(!_isReactRightPanel\) return;\n    _reactRightPanelMount\?\.render\(\);\n\}/,
    'function _renderReactRightPanel() {\n    _reactRightPanelMount?.render();\n}'
);

// renderDataPrepTools callback for left panel mount
src = src.replace(
    /renderDataPrepTools\n    \}\);/,
    'renderDataPrepTools: () => renderDataPrepToolsHtml(getActiveLayer)\n    });'
);

// Strip _isReactToolDialogs guarded blocks (keep body)
src = stripIfBlock(src, '_isReactToolDialogs');

// Strip !_isReactHeader guarded blocks (legacy header listeners)
src = stripIfBlock(src, '!_isReactHeader');

// Simplify refreshUINow
src = src.replace(
    /function refreshUINow\(\) \{[\s\S]*?renderMobileContent\(\);[\s\S]*?updateToolbarState\(\);\n\}/,
    `function refreshUINow() {
    _renderReactLeftPanel();
    _renderReactRightPanel();
    renderMobileContent();
    updateToolbarState();
}`
);

// Remove legacy panel functions
for (const fn of [
    'renderLayerList',
    'renderFieldList',
    'renderOutputPanel',
    'buildStylePanel',
    'bindStylePanel',
    '_detectGeomTypes',
    'renderDataPrepTools'
]) {
    src = removeFunction(src, fn);
}

// Replace renderLayerList/renderFieldList/renderOutputPanel calls
src = src.replace(/\brenderLayerList\(\);/g, '_renderReactLeftPanel();');
src = src.replace(/\brenderFieldList\(\);/g, '_renderReactLeftPanel();');
src = src.replace(/\brenderOutputPanel\(\);/g, '_renderReactRightPanel();');

// getWidgetContext — drop isReactToolDialogs
src = src.replace(/\s*isReactToolDialogs: _isReactToolDialogs,\n/, '\n');

// openImportFlow legacy fallback function can stay unused or we remove triggerLegacyImportInput usage
// triggerLegacyImportInput is only used from removed legacy path — keep function for now (harmless)

writeFileSync(appPath, src);
console.log('Phase 1 app.js transform complete');
