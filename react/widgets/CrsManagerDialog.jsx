import { useMemo, useState } from 'react';
import { WidgetPanelShell } from './shared/WidgetPanelShell.jsx';
import { CrsPicker } from './shared/CrsPicker.jsx';

export function CrsManagerDialog({
    layers = [],
    audit = [],
    presets = [],
    favorites: initialFavorites = [],
    onCancel,
    onSaveFavorites,
    onRegisterWkt,
    onReprojectLayers
}) {
    const [selected, setSelected] = useState(new Set());
    const [targetCrs, setTargetCrs] = useState('EPSG:4326');
    const [favorites, setFavorites] = useState(initialFavorites);
    const [customWkt, setCustomWkt] = useState('');
    const [status, setStatus] = useState('');
    const [running, setRunning] = useState(false);

    const needsAttention = useMemo(
        () => audit.filter((entry) => !entry.displayReady),
        [audit]
    );

    const toggleLayer = (id) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleFavorite = (code) => {
        setFavorites((prev) => {
            const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
            onSaveFavorites?.(next);
            return next;
        });
    };

    const runBatch = async () => {
        if (!selected.size) {
            setStatus('Select at least one layer.');
            return;
        }
        setRunning(true);
        setStatus('');
        try {
            await onReprojectLayers?.([...selected], targetCrs);
            setStatus('Batch reproject complete.');
        } catch (err) {
            setStatus(err?.message || 'Reproject failed.');
        } finally {
            setRunning(false);
        }
    };

    const registerWkt = async () => {
        setRunning(true);
        setStatus('');
        try {
            const code = await onRegisterWkt?.(customWkt);
            setStatus(`Registered ${code}`);
            setCustomWkt('');
        } catch (err) {
            setStatus(err?.message || 'Invalid WKT.');
        } finally {
            setRunning(false);
        }
    };

    return (
        <WidgetPanelShell
            status={status}
            statusTone={status.includes('failed') || status.includes('Select') ? 'danger' : 'muted'}
            onCancel={onCancel}
            onRun={runBatch}
            runLabel="Reproject Selected"
            running={running}
            disabled={running || selected.size === 0}
        >
            <div className="mb-8">
                <div className="text-xs text-muted mb-4">Layer CRS audit</div>
                <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                    {audit.length === 0 ? (
                        <p className="text-xs p-8 text-muted">No spatial layers loaded.</p>
                    ) : audit.map((entry) => (
                        <label key={entry.id} className="text-xs p-4" style={{ display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                            <input
                                type="checkbox"
                                checked={selected.has(entry.id)}
                                onChange={() => toggleLayer(entry.id)}
                            />
                            <span style={{ flex: 1 }}>
                                <strong>{entry.name}</strong>
                                {' · '}{entry.crsLabel}
                                {' · '}{entry.featureCount} features
                                {!entry.displayReady ? (
                                    <span className="layer-filter-badge" style={{ marginLeft: 6 }} title={entry.warning}>CRS</span>
                                ) : null}
                            </span>
                        </label>
                    ))}
                </div>
                {needsAttention.length > 0 ? (
                    <p className="text-xs text-muted mt-4">{needsAttention.length} layer(s) need reprojection for map display.</p>
                ) : null}
            </div>

            <CrsPicker label="Target CRS for batch reproject" value={targetCrs} onChange={setTargetCrs} presets={presets} />

            <div className="mb-8 mt-8">
                <div className="text-xs text-muted mb-4">Favorite CRS codes</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {presets.slice(0, 8).map((preset) => (
                        <button
                            key={preset.code}
                            type="button"
                            className={`btn btn-sm ${favorites.includes(preset.code) ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => toggleFavorite(preset.code)}
                        >
                            {preset.code}
                        </button>
                    ))}
                </div>
            </div>

            <div className="form-group">
                <label className="text-xs text-muted">Register custom WKT</label>
                <textarea
                    rows={4}
                    value={customWkt}
                    onChange={(e) => setCustomWkt(e.target.value)}
                    placeholder="Paste .prj WKT text…"
                    style={{ width: '100%' }}
                />
                <button type="button" className="btn btn-sm btn-secondary mt-4" onClick={registerWkt} disabled={running || !customWkt.trim()}>
                    Register WKT
                </button>
            </div>
        </WidgetPanelShell>
    );
}
