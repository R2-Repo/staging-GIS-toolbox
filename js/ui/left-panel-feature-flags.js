const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function parseFlagValue(value) {
    if (typeof value === 'boolean') return value;
    if (value == null) return null;
    const normalized = String(value).trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) return true;
    if (FALSE_VALUES.has(normalized)) return false;
    return null;
}

export function resolveReactLeftPanelFlag({
    queryString = '',
    storageValue = null,
    globalValue = null
} = {}) {
    const globalParsed = parseFlagValue(globalValue);
    if (globalParsed != null) return globalParsed;

    const search = String(queryString || '').replace(/^\?/, '');
    const params = new URLSearchParams(search);
    const queryParsed = parseFlagValue(params.get('leftPanelReact'));
    if (queryParsed != null) return queryParsed;

    const storageParsed = parseFlagValue(storageValue);
    if (storageParsed != null) return storageParsed;

    // M5 default: React left panel is primary path.
    // Rollback path: set leftPanelReact=0 (query/localStorage/global).
    return true;
}

export function isReactLeftPanelEnabled(env = globalThis) {
    const globalValue = env?.__LEFT_PANEL_REACT__;
    const queryString = env?.location?.search || '';
    let storageValue = null;
    try {
        storageValue = env?.localStorage?.getItem?.('leftPanelReact');
    } catch {
        storageValue = null;
    }

    return resolveReactLeftPanelFlag({ queryString, storageValue, globalValue });
}
