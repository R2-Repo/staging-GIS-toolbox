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

export function resolveReactMapViewFlag({
    queryString = '',
    storageValue = null,
    globalValue = null
} = {}) {
    const globalParsed = parseFlagValue(globalValue);
    if (globalParsed != null) return globalParsed;

    const search = String(queryString || '').replace(/^\?/, '');
    const params = new URLSearchParams(search);
    const queryParsed = parseFlagValue(params.get('mapReactView'));
    if (queryParsed != null) return queryParsed;

    const storageParsed = parseFlagValue(storageValue);
    if (storageParsed != null) return storageParsed;

    // M11 shell flip: React map view is the primary runtime path.
    return true;
}

export function isReactMapViewEnabled(env = globalThis) {
    const globalValue = env?.__MAP_REACT_VIEW__;
    const queryString = env?.location?.search || '';
    let storageValue = null;
    try {
        storageValue = env?.localStorage?.getItem?.('mapReactView');
    } catch {
        storageValue = null;
    }

    return resolveReactMapViewFlag({ queryString, storageValue, globalValue });
}
