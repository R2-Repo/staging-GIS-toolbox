import { useEffect, useMemo, useRef, useState } from 'react';
import { WidgetPanelShell } from './shared/WidgetPanelShell.jsx';
import { validateMilepostRange } from '../../js/widgets/route-milepost-segment/engine.js';
import {
    validateStation,
    DEFAULT_INTERVAL_FT
} from '../../js/widgets/project-stationing/engine.js';

const PREVIEW_DEBOUNCE_MS = 500;

const OUTPUT_OPTIONS = [
    { value: 'segments_only', label: 'Stationing only' },
    { value: 'with_mileposts', label: 'Stationing + LM tenth mileposts' }
];

function formatFeet(value) {
    if (value == null || !Number.isFinite(value)) return '-';
    return `${Math.round(value).toLocaleString()} ft`;
}

export function ProjectStationingDialog({
    onCancel,
    onSearchRoutes,
    onSelectRoute,
    onPickClipOnRoute,
    onImportStationTable,
    onStationPreview,
    onRun
}) {
    const [searchText, setSearchText] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [selectedRoute, setSelectedRoute] = useState(null);
    const [routePickerOpen, setRoutePickerOpen] = useState(true);
    const [routeWarnings, setRouteWarnings] = useState([]);
    const [begMileageFormatted, setBegMileageFormatted] = useState('—');
    const [endMileageFormatted, setEndMileageFormatted] = useState('—');

    const [startMilepost, setStartMilepost] = useState('');
    const [endMilepost, setEndMilepost] = useState('');
    const [mapClip, setMapClip] = useState(null);

    const [beginStation, setBeginStation] = useState('');
    const [endStation, setEndStation] = useState('');
    const [intervalFt, setIntervalFt] = useState(String(DEFAULT_INTERVAL_FT));
    const [outputMode, setOutputMode] = useState('segments_only');

    const [preview, setPreview] = useState(null);
    const [previewing, setPreviewing] = useState(false);
    const [picking, setPicking] = useState(false);
    const [importLaunching, setImportLaunching] = useState(false);
    const [running, setRunning] = useState(false);
    const [success, setSuccess] = useState(null);
    const [error, setError] = useState('');

    const searchTimer = useRef(null);
    const previewTimer = useRef(null);
    const previewRequestId = useRef(0);
    const startMpRef = useRef(null);

    const milepostValidation = useMemo(
        () => validateMilepostRange(startMilepost, endMilepost),
        [startMilepost, endMilepost]
    );

    const beginStationValidation = useMemo(
        () => validateStation(beginStation),
        [beginStation]
    );

    const hasMilepostClip = Boolean(startMilepost.trim() && endMilepost.trim());
    const hasMapClip = mapClip != null;
    const milepostClipValid = hasMilepostClip && milepostValidation.valid;
    const milepostClipInvalid = hasMilepostClip && !milepostValidation.valid;

    const includeMilepostTenths = outputMode === 'with_mileposts';

    const buildInput = () => ({
        routeId: selectedRoute?.routeId,
        routeAlias: selectedRoute?.routeAlias,
        routeRecord: selectedRoute?.raw,
        startMilepost: hasMapClip ? '' : startMilepost,
        endMilepost: hasMapClip ? '' : endMilepost,
        mapClipStartFt: mapClip?.mapClipStartFt ?? null,
        mapClipEndFt: mapClip?.mapClipEndFt ?? null,
        beginStation,
        endStation,
        intervalFt: Number(intervalFt) || DEFAULT_INTERVAL_FT,
        includeMilepostTenths
    });

    const canPreview = Boolean(
        selectedRoute?.routeId &&
        beginStationValidation.valid &&
        !milepostClipInvalid
    );

    const canCreate = canPreview && !running;

    const resetClipState = () => {
        setMapClip(null);
        setStartMilepost('');
        setEndMilepost('');
        setPreview(null);
    };

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
        if (!canPreview || picking) {
            if (previewTimer.current) clearTimeout(previewTimer.current);
            if (!beginStationValidation.valid) setPreview(null);
            return undefined;
        }

        if (previewTimer.current) clearTimeout(previewTimer.current);
        previewTimer.current = setTimeout(async () => {
            const requestId = ++previewRequestId.current;
            setPreviewing(true);
            setError('');
            try {
                const data = await onStationPreview?.(buildInput());
                if (requestId !== previewRequestId.current) return;
                setPreview(data?.summary ? data : null);
            } catch (err) {
                if (requestId !== previewRequestId.current) return;
                setPreview(null);
                setError(err?.message || 'Preview failed.');
            } finally {
                if (requestId === previewRequestId.current) setPreviewing(false);
            }
        }, PREVIEW_DEBOUNCE_MS);

        return () => {
            if (previewTimer.current) clearTimeout(previewTimer.current);
        };
    }, [
        canPreview,
        selectedRoute,
        startMilepost,
        endMilepost,
        mapClip,
        beginStation,
        endStation,
        intervalFt,
        outputMode,
        picking,
        onStationPreview
    ]);

    const selectRoute = async (routeOption) => {
        setError('');
        setPreview(null);
        previewRequestId.current += 1;
        try {
            const info = await onSelectRoute?.(routeOption);
            setSelectedRoute({ ...routeOption, ...info });
            setRouteWarnings(info?.warnings || []);
            setBegMileageFormatted(info?.begMileageFormatted ?? '—');
            setEndMileageFormatted(info?.endMileageFormatted ?? '—');
            setRoutePickerOpen(false);
            setSearchText('');
            setSearchResults([]);
            resetClipState();
            setBeginStation('');
            setEndStation('');
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
        setBegMileageFormatted('—');
        setEndMileageFormatted('—');
        setRoutePickerOpen(true);
        setSearchText('');
        setSearchResults([]);
        resetClipState();
        setBeginStation('');
        setEndStation('');
        setError('');
    };

    const handleMilepostChange = (field, value) => {
        if (field === 'start') setStartMilepost(value);
        else setEndMilepost(value);
        setMapClip(null);
        setPreview(null);
    };

    const handlePickClip = async () => {
        if (!selectedRoute) return;
        if (previewTimer.current) clearTimeout(previewTimer.current);
        previewRequestId.current += 1;
        setStartMilepost('');
        setEndMilepost('');
        setPreview(null);
        setPicking(true);
        setError('');
        try {
            const result = await onPickClipOnRoute?.();
            if (!result) {
                setError('Clip pick cancelled.');
                return;
            }
            setMapClip(result);
        } catch (err) {
            setMapClip(null);
            setError(err?.message || 'Map pick failed.');
        } finally {
            setPicking(false);
        }
    };

    const clearMapClip = () => {
        setMapClip(null);
        setPreview(null);
    };

    const createLayer = async () => {
        setError('');
        setRunning(true);
        try {
            const result = await onRun?.(buildInput());
            setSuccess(result || null);
            setRunning(false);
        } catch (err) {
            setError(err?.message || 'Unable to create output layer.');
            setRunning(false);
        }
    };

    const launchImportStationTable = async () => {
        if (!success?.centerlineLayerId) return;
        setImportLaunching(true);
        setError('');
        try {
            await onImportStationTable?.(success.centerlineLayerId);
        } catch (err) {
            setError(err?.message || 'Unable to open Import Station Table.');
        } finally {
            setImportLaunching(false);
        }
    };

    const warnings = useMemo(() => {
        const all = [...(preview?.warnings || []), ...routeWarnings];
        return [...new Set(all)];
    }, [preview, routeWarnings]);

    const statusText = error || (previewing ? 'Updating preview…' : picking ? 'Click on map…' : '');

    return (
        <WidgetPanelShell
            className="project-stationing-widget"
            status={statusText}
            statusTone={error ? 'danger' : 'muted'}
            onCancel={onCancel}
            onRun={createLayer}
            runLabel="Create Layers"
            running={running}
            disabled={!canCreate || running}
        >
            {routePickerOpen || !selectedRoute ? (
                <div className="route-mp-widget__route-search mb-8">
                    <label className="text-xs text-muted" htmlFor="ps-route-search">Search routes</label>
                    <input
                        id="ps-route-search"
                        type="search"
                        placeholder="e.g. SR-145"
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
                <>
                    <div className="route-mp-widget__route-chip mb-8">
                        <span className="text-xs text-muted">Route:</span>{' '}
                        <strong>{selectedRoute.routeAlias}</strong>
                        <button type="button" className="btn btn-sm btn-secondary route-mp-widget__change-btn" onClick={changeRoute}>
                            Change
                        </button>
                    </div>
                    <div className="text-xs text-muted mb-8">
                        Route mileage: {begMileageFormatted} → {endMileageFormatted}
                    </div>
                </>
            )}

            <div className="mb-8">
                <div className="text-xs text-muted mb-4">Clip (optional — leave blank for full route)</div>
                <p className="text-xs text-muted mb-4">Use mileposts <strong>or</strong> pick on route — not both.</p>
                <div className="route-mp-widget__mp-grid mb-8">
                    <div>
                        <label className="text-xs text-muted" htmlFor="ps-start-mp">Start MP</label>
                        <input
                            ref={startMpRef}
                            id="ps-start-mp"
                            type="text"
                            inputMode="decimal"
                            placeholder={begMileageFormatted !== '—' ? String(begMileageFormatted) : 'e.g. 10.5'}
                            value={startMilepost}
                            onChange={(e) => handleMilepostChange('start', e.target.value)}
                            disabled={!selectedRoute || hasMapClip}
                            className="route-mp-widget__input"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-muted" htmlFor="ps-end-mp">End MP</label>
                        <input
                            id="ps-end-mp"
                            type="text"
                            inputMode="decimal"
                            placeholder={endMileageFormatted !== '—' ? String(endMileageFormatted) : 'e.g. 10.8'}
                            value={endMilepost}
                            onChange={(e) => handleMilepostChange('end', e.target.value)}
                            disabled={!selectedRoute || hasMapClip}
                            className="route-mp-widget__input"
                        />
                    </div>
                </div>
                {milepostClipInvalid ? (
                    <div className="text-xs mb-4" style={{ color: 'var(--danger)' }}>
                        {milepostValidation.errors?.[0]}
                    </div>
                ) : null}
                <div className="mb-4">
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handlePickClip}
                        disabled={!selectedRoute || picking || running}
                    >
                        {picking ? 'Pick on map…' : 'Pick clip on route'}
                    </button>
                    {hasMapClip ? (
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm ml-4"
                            onClick={clearMapClip}
                            disabled={running}
                        >
                            Clear pick
                        </button>
                    ) : null}
                </div>
                {hasMapClip ? (
                    <div className="text-xs text-muted">
                        Clip defined from map pick ({Math.round(mapClip.mapClipStartFt).toLocaleString()}–{Math.round(mapClip.mapClipEndFt).toLocaleString()} ft along route).
                    </div>
                ) : null}
            </div>

            <div className="route-mp-widget__mp-grid mb-8">
                <div>
                    <label className="text-xs text-muted" htmlFor="ps-begin-station">Begin station</label>
                    <input
                        id="ps-begin-station"
                        type="text"
                        placeholder="e.g. 817+15"
                        value={beginStation}
                        onChange={(e) => { setBeginStation(e.target.value); setPreview(null); }}
                        disabled={!selectedRoute}
                        className="route-mp-widget__input"
                    />
                    {!beginStationValidation.valid && beginStation ? (
                        <div className="text-xs mt-4" style={{ color: 'var(--danger)' }}>
                            {beginStationValidation.error}
                        </div>
                    ) : null}
                </div>
                <div>
                    <label className="text-xs text-muted" htmlFor="ps-interval">Interval (ft)</label>
                    <input
                        id="ps-interval"
                        type="number"
                        min="1"
                        step="1"
                        value={intervalFt}
                        onChange={(e) => { setIntervalFt(e.target.value); setPreview(null); }}
                        disabled={!selectedRoute}
                        className="route-mp-widget__input"
                    />
                </div>
            </div>

            <div className="mb-8">
                <label className="text-xs text-muted" htmlFor="ps-end-station">End station (optional)</label>
                <input
                    id="ps-end-station"
                    type="text"
                    placeholder="Auto from clip length"
                    value={endStation}
                    onChange={(e) => { setEndStation(e.target.value); setPreview(null); }}
                    disabled={!selectedRoute}
                    className="route-mp-widget__input"
                />
            </div>

            <div className="mb-8">
                <div className="text-xs text-muted mb-4">Output layers</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {OUTPUT_OPTIONS.map((opt) => (
                        <label key={opt.value} className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                                type="radio"
                                name="ps-output-mode"
                                value={opt.value}
                                checked={outputMode === opt.value}
                                onChange={() => { setOutputMode(opt.value); setPreview(null); }}
                                disabled={!selectedRoute || running}
                            />
                            {opt.label}
                        </label>
                    ))}
                </div>
            </div>

            {preview?.summary ? (
                <div className="route-mp-widget__summary text-xs mt-8">
                    {preview.summary.beginStation} → {preview.summary.endStation}
                    {' · '}
                    {preview.summary.segmentCount} segments
                    {' · '}
                    {formatFeet(preview.summary.lineLengthFeet)}
                </div>
            ) : null}

            {success?.summary ? (
                <div className="info-box mt-8">
                    <strong>Project stationing created.</strong>
                    <div className="text-xs mt-4">
                        {success.summary.beginStation} → {success.summary.endStation}
                        {' · '}
                        {success.summary.tickCount} ticks
                        {' · '}
                        {success.summary.labelCount} labels
                    </div>
                    <div className="mt-8" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={launchImportStationTable}
                            disabled={importLaunching}
                        >
                            {importLaunching ? 'Opening…' : 'Import Station Table'}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
                            Done
                        </button>
                    </div>
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
