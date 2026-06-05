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

export function resolveReactToolDialogsFlag({
    queryString = '',
    storageValue = null,
    globalValue = null
} = {}) {
    const globalParsed = parseFlagValue(globalValue);
    if (globalParsed != null) return globalParsed;

    const search = String(queryString || '').replace(/^\?/, '');
    const params = new URLSearchParams(search);
    const queryParsed = parseFlagValue(params.get('toolDialogsReact'));
    if (queryParsed != null) return queryParsed;

    const storageParsed = parseFlagValue(storageValue);
    if (storageParsed != null) return storageParsed;

    // M7 staged rollout: keep legacy tool dialogs default until parity checks complete.
    return false;
}

export function isReactToolDialogsEnabled(env = globalThis) {
    const globalValue = env?.__TOOL_DIALOGS_REACT__;
    const queryString = env?.location?.search || '';
    let storageValue = null;
    try {
        storageValue = env?.localStorage?.getItem?.('toolDialogsReact');
    } catch {
        storageValue = null;
    }

    return resolveReactToolDialogsFlag({ queryString, storageValue, globalValue });
}
