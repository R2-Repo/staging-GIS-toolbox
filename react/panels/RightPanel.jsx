import { isSpatialLayer } from '../../js/core/data-model.js';
import { SmartStylePanel } from './SmartStylePanel.jsx';
import { LabelsSection } from './LabelsSection.jsx';
import { VisibilityRangeSection } from './VisibilityRangeSection.jsx';
import { CollapsibleSection } from '../ui/CollapsibleSection.jsx';

function ToolboxKitSection({ snapshot, onExportProjectKit, onImportProjectKit }) {
    const layerCount = snapshot?.layerCount ?? 0;
    return (
        <CollapsibleSection title="Toolbox Kit" defaultOpen={true}>
            <p className="text-sm text-muted mb-8">
                Export or import a portable <strong>.gtbx</strong> project file — layers, map, pipeline, and preferences.
            </p>
            <div className="text-xs text-muted mb-8">
                {layerCount} layer{layerCount !== 1 ? 's' : ''} in workspace
                {snapshot?.hasWorkflow ? ' · pipeline saved' : ''}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => onExportProjectKit?.()}>
                    Export Kit…
                </button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => onImportProjectKit?.()}>
                    Import Kit…
                </button>
            </div>
        </CollapsibleSection>
    );
}

function renderAgolIssue(issue) {
    const suffix = issue.message || issue.fixed ? ` -> ${issue.message || issue.fixed}` : '';
    return `${issue.type}: ${issue.field || ''} ${suffix}`.trim();
}

export function RightPanel({
    snapshot,
    kitSnapshot,
    onToggleAgol,
    onExport,
    onExportProjectKit,
    onImportProjectKit,
    onFixAgol,
    onShowDataTable,
    onStyleChange,
    onScaleRangeChange
}) {
    const layer = snapshot?.layer || null;
    const selectedFields = snapshot?.selectedFields || [];
    const formats = snapshot?.formats || [];
    const agolMode = !!snapshot?.agolMode;
    const agolCheck = snapshot?.agolCheck || null;
    const layerStyle = snapshot?.layerStyle ?? null;
    const styleDefaultColor = snapshot?.styleDefaultColor || '#2563eb';
    const mapZoom = snapshot?.mapZoom ?? 7;
    const mapLatitude = snapshot?.mapLatitude ?? 0;

    if (!layer) {
        return (
            <>
                <ToolboxKitSection
                    snapshot={kitSnapshot}
                    onExportProjectKit={onExportProjectKit}
                    onImportProjectKit={onImportProjectKit}
                />
                <div className="empty-state"><p>No layer selected</p></div>
            </>
        );
    }

    return (
        <>
            <ToolboxKitSection
                snapshot={kitSnapshot}
                onExportProjectKit={onExportProjectKit}
                onImportProjectKit={onImportProjectKit}
            />
            <CollapsibleSection title={`Output Schema (${selectedFields.length} fields)`} defaultOpen={false}>
                {selectedFields.map((field) => (
                    <div className="field-item" key={field.name}>
                        <span className="field-name">{field.outputName}</span>
                        <span className="field-type">{field.type}</span>
                    </div>
                ))}
                {selectedFields.length === 0 ? <div className="text-muted text-sm">No fields selected</div> : null}
            </CollapsibleSection>

            <CollapsibleSection title="Export" defaultOpen={false}>
                <label className="toggle mb-8">
                    <input type="checkbox" checked={agolMode} onChange={onToggleAgol} />
                    <span className="toggle-track"></span>
                    <span>AGOL Compatible</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {formats.map((format) => (
                        <button
                            key={format.key}
                            className="btn btn-sm btn-primary"
                            onClick={() => onExport(format.key)}
                        >
                            {format.label}
                        </button>
                    ))}
                </div>
            </CollapsibleSection>

            {isSpatialLayer(layer) ? (
                <>
                    <SmartStylePanel
                        key={layer.id}
                        layer={layer}
                        style={layerStyle}
                        defaultColor={styleDefaultColor}
                        onStyleChange={onStyleChange}
                    />
                    <LabelsSection
                        key={`${layer.id}-labels`}
                        layer={layer}
                        style={layerStyle}
                        defaultColor={styleDefaultColor}
                        onStyleChange={onStyleChange}
                    />
                </>
            ) : null}

            {agolMode ? (
                <CollapsibleSection title="AGOL Readiness" defaultOpen={false}>
                    {agolCheck?.issues?.length
                        ? agolCheck.issues.map((issue, idx) => (
                            <div className="warning-box text-xs mb-8" key={`${issue.type}-${issue.field || idx}`}>
                                {renderAgolIssue(issue)}
                            </div>
                        ))
                        : <div className="success-box">✅ All checks passed</div>}
                    {agolCheck?.issues?.length ? (
                        <button className="btn btn-sm btn-primary w-full mt-8" onClick={onFixAgol}>
                            Fix All
                        </button>
                    ) : null}
                </CollapsibleSection>
            ) : null}

            <CollapsibleSection title="Data Preview" defaultOpen={false}>
                <button className="btn btn-sm btn-secondary w-full" onClick={onShowDataTable}>
                    Show Data Table
                </button>
            </CollapsibleSection>

            {isSpatialLayer(layer) ? (
                <VisibilityRangeSection
                    layer={layer}
                    mapZoom={mapZoom}
                    mapLatitude={mapLatitude}
                    onChange={onScaleRangeChange}
                />
            ) : null}
        </>
    );
}
