import { useEffect, useMemo, useRef, useState } from 'react';
import { WidgetPanelShell } from './shared/WidgetPanelShell.jsx';
import {
    formatMilepost,
    validateMilepostRange,
    validateMilepostValue
} from '../../js/widgets/route-milepost-segment/engine.js';

const PREVIEW_DEBOUNCE_MS = 500;

function formatLength(value) {
    if (value == null || !Number.isFinite(value)) return '-';
    return `${value.toFixed(3)} mi`;
}

export function RouteMilepostSegmentDialog({
    onCancel,
    onSearchRoutes,
    onSelectRoute,
    onMilepostPreview,
    onRun
}) {
    const [searchText, setSearchText] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [selectedRoute, setSelectedRoute] = useState(null);
    const [routePickerOpen, setRoutePickerOpen] = useState(true);
    const [startMilepost, setStartMilepost] = useState('');
    const [endMilepost, setEndMilepost] = useState('');
    const [preview, setPreview] = useState(null);
    const [routeWarnings, setRouteWarnings] = useState([]);
    const [running, setRunning] = useState(false);
    const [previewing, setPreviewing] = useState(false);
    const [error, setError] = useState('');
    const searchTimer = useRef(null);
    const previewTimer = useRef(null);
    const previewRequestId = useRef(0);
    const startMpRef = useRef(null);

    const milepostValidation = useMemo(
        () => validateMilepostRange(startMilepost, endMilepost),
        [startMilepost, endMilepost]
    );

    const buildInput = () => ({
        routeId: selectedRoute?.routeId,
        routeAlias: selectedRoute?.routeAlias,
        routeRecord: selectedRoute?.raw,
        startMilepost,
        endMilepost
    });

    const hasPreviewableMilepost = useMemo(() => {
        if (!selectedRoute?.routeId) return false;
        if (milepostValidation.valid) return true;
        return validateMilepostValue(startMilepost).valid || validateMilepostValue(endMilepost).valid;
    }, [selectedRoute, startMilepost, endMilepost, milepostValidation.valid]);

    useEffect(() => {
        if (!routePickerOpen) return undefined;
        if (searchTimer.current) clearTimeout(searchTimer.current);
        const term = searchText.trim();
        if (term.length < 2) {
            setSearchResults([]);
            return undefined;
        }

        searchTimer.current = setTimeout(async () => {
            setSearching(true);
            setError('');
            try {
                const results = await onSearchRoutes?.(term);
                setSearchResults(results || []);
            } catch (err) {
                setSearchResults([]);
                setError(err?.message || 'Route search failed.');
            } finally {
                setSearching(false);
            }
        }, 300);

        return () => {
            if (searchTimer.current) clearTimeout(searchTimer.current);
        };
    }, [searchText, routePickerOpen, onSearchRoutes]);

    useEffect(() => {
        if (!selectedRoute?.routeId || !hasPreviewableMilepost) {
            if (previewTimer.current) clearTimeout(previewTimer.current);
            return undefined;
        }

        if (previewTimer.current) clearTimeout(previewTimer.current);
        previewTimer.current = setTimeout(async () => {
            const requestId = ++previewRequestId.current;
            setPreviewing(true);
            setError('');
            try {
                const data = await onMilepostPreview?.({
                    routeId: selectedRoute.routeId,
                    routeAlias: selectedRoute.routeAlias,
                    routeRecord: selectedRoute.raw,
                    startMilepost,
                    endMilepost
                });
                if (requestId !== previewRequestId.current) return;
                setPreview(data?.summary ? data : null);
            } catch (err) {
                if (requestId !== previewRequestId.current) return;
                setPreview(null);
                setError(err?.message || 'Preview failed.');
            } finally {
                if (requestId === previewRequestId.current) {
                    setPreviewing(false);
                }
            }
        }, PREVIEW_DEBOUNCE_MS);

        return () => {
            if (previewTimer.current) clearTimeout(previewTimer.current);
        };
    }, [selectedRoute, startMilepost, endMilepost, hasPreviewableMilepost, onMilepostPreview]);

    const selectRoute = async (routeOption) => {
        setError('');
        setPreview(null);
        previewRequestId.current += 1;
        try {
            const info = await onSelectRoute?.(routeOption);
            setSelectedRoute({ ...routeOption, ...info });
            setRouteWarnings(info?.warnings || []);
            setRoutePickerOpen(false);
            setSearchText('');
            setSearchResults([]);
            setStartMilepost('');
            setEndMilepost('');
            requestAnimationFrame(() => startMpRef.current?.focus());
        } catch (err) {
            setSelectedRoute(null);
            setError(err?.message || 'Unable to load selected route.');
        }
    };

    const changeRoute = () => {
        previewRequestId.current += 1;
        setSelectedRoute(null);
        setPreview(null);
        setRouteWarnings([]);
        setStartMilepost('');
        setEndMilepost('');
        setRoutePickerOpen(true);
        setSearchText('');
        setSearchResults([]);
        setError('');
    };

    const createLayer = async () => {
        setError('');
        setRunning(true);
        try {
            await onRun?.(buildInput());
        } catch (err) {
            setError(err?.message || 'Unable to create output layer.');
            setRunning(false);
        }
    };

    const canCreate = Boolean(preview?.summary) && !previewing;
    const statusText = error || (previewing ? 'Updating preview…' : '');
    const warnings = useMemo(() => {
        const all = [...(preview?.warnings || []), ...routeWarnings];
        return [...new Set(all)];
    }, [preview, routeWarnings]);

    return (
        <WidgetPanelShell
            className="route-mp-widget"
            status={statusText}
            statusTone={error ? 'danger' : 'muted'}
            onCancel={onCancel}
            onRun={createLayer}
            runLabel="Create Layer"
            running={running}
            disabled={!canCreate || running}
        >
            {routePickerOpen || !selectedRoute ? (
                <div className="route-mp-widget__route-search mb-8">
                    <label className="text-xs text-muted" htmlFor="route-search">Search routes</label>
                    <input
                        id="route-search"
                        type="search"
                        placeholder="e.g. I-15"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="route-mp-widget__input"
                    />
                    {searching ? <div className="text-xs text-muted mt-4">Searching…</div> : null}
                    <div className="route-search-results">
                        {searchResults.map((route) => (
                            <button
                                key={route.routeAlias}
                                type="button"
                                className="route-search-result"
                                onClick={() => selectRoute(route)}
                            >
                                {route.routeAlias}
                            </button>
                        ))}
                        {!searching && searchText.trim().length >= 2 && searchResults.length === 0 ? (
                            <div className="text-xs text-muted p-4">No routes matched.</div>
                        ) : null}
                    </div>
                </div>
            ) : (
                <div className="route-mp-widget__route-chip mb-8">
                    <span className="text-xs text-muted">Route:</span>{' '}
                    <strong>{selectedRoute.routeAlias}</strong>
                    <button type="button" className="btn btn-sm btn-secondary route-mp-widget__change-btn" onClick={changeRoute}>
                        Change
                    </button>
                </div>
            )}

            <div className="route-mp-widget__mileposts">
                <div className="route-mp-widget__mp-grid">
                    <div>
                        <label className="text-xs text-muted" htmlFor="start-mp">Start MP</label>
                        <input
                            ref={startMpRef}
                            id="start-mp"
                            type="text"
                            inputMode="decimal"
                            placeholder="e.g. 10.65"
                            value={startMilepost}
                            onChange={(e) => { setStartMilepost(e.target.value); setPreview(null); }}
                            disabled={!selectedRoute}
                            className="route-mp-widget__input"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-muted" htmlFor="end-mp">End MP</label>
                        <input
                            id="end-mp"
                            type="text"
                            inputMode="decimal"
                            placeholder="e.g. 12.50"
                            value={endMilepost}
                            onChange={(e) => { setEndMilepost(e.target.value); setPreview(null); }}
                            disabled={!selectedRoute}
                            className="route-mp-widget__input"
                        />
                    </div>
                </div>
                {!milepostValidation.valid && (startMilepost || endMilepost) ? (
                    <div className="text-xs mt-4" style={{ color: 'var(--danger)' }}>
                        {milepostValidation.errors?.[0]}
                    </div>
                ) : null}
            </div>

            {preview?.summary ? (
                <div className="route-mp-widget__summary text-xs mt-8">
                    Segment: {formatLength(preview.summary.lengthMiles)}
                    {' · '}
                    MP {formatMilepost(preview.summary.startMp)}–{formatMilepost(preview.summary.endMp)}
                </div>
            ) : null}

            {warnings.length > 0 ? (
                <ul className="route-mp-widget__warnings text-xs text-muted mt-4">
                    {warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                    ))}
                </ul>
            ) : null}
        </WidgetPanelShell>
    );
}
