import { useEffect } from 'react';

function renderAgolIssue(issue) {
    const suffix = issue.message || issue.fixed ? ` -> ${issue.message || issue.fixed}` : '';
    return `${issue.type}: ${issue.field || ''} ${suffix}`.trim();
}

export function RightPanel({
    snapshot,
    onToggleAgol,
    onExport,
    onFixAgol,
    onShowDataTable,
    onStyleMounted
}) {
    const layer = snapshot?.layer || null;
    const selectedFields = snapshot?.selectedFields || [];
    const formats = snapshot?.formats || [];
    const agolMode = !!snapshot?.agolMode;
    const agolCheck = snapshot?.agolCheck || null;
    const stylePanelHtml = snapshot?.stylePanelHtml || '';

    useEffect(() => {
        if (!layer?.id) return;
        if (!stylePanelHtml) return;
        onStyleMounted?.(layer);
    }, [layer?.id, stylePanelHtml, onStyleMounted]);

    if (!layer) {
        return <div className="empty-state"><p>No layer selected</p></div>;
    }

    return (
        <>
            <div className="panel-section">
                <div className="panel-section-header">Output Schema ({selectedFields.length} fields)</div>
                <div className="panel-section-body">
                    {selectedFields.map((field) => (
                        <div className="field-item" key={field.name}>
                            <span className="field-name">{field.outputName}</span>
                            <span className="field-type">{field.type}</span>
                        </div>
                    ))}
                    {selectedFields.length === 0 ? <div className="text-muted text-sm">No fields selected</div> : null}
                </div>
            </div>

            <div className="panel-section">
                <div className="panel-section-header">Export</div>
                <div className="panel-section-body">
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
                </div>
            </div>

            {agolMode ? (
                <div className="panel-section">
                    <div className="panel-section-header">AGOL Readiness</div>
                    <div className="panel-section-body">
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
                    </div>
                </div>
            ) : null}

            <div className="panel-section">
                <div className="panel-section-header">Data Preview</div>
                <div className="panel-section-body">
                    <button className="btn btn-sm btn-secondary w-full" onClick={onShowDataTable}>
                        Show Data Table
                    </button>
                </div>
            </div>

            {stylePanelHtml ? (
                <div dangerouslySetInnerHTML={{ __html: stylePanelHtml }} />
            ) : null}
        </>
    );
}
