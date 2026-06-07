import React, { useCallback, useMemo, useState } from 'react';
import bus from '../../js/core/event-bus.js';
import { INPUT_NODES } from '../../js/workflow/nodes/input-nodes.js';
import { TRANSFORM_NODES } from '../../js/workflow/nodes/transform-nodes.js';
import { SPATIAL_NODES } from '../../js/workflow/nodes/spatial-nodes.js';
import { ENRICHMENT_NODES } from '../../js/workflow/nodes/enrichment-nodes.js';
import { OUTPUT_NODES } from '../../js/workflow/nodes/output-nodes.js';
import { isPipelineNodeEnabled } from '../../js/tools/tool-catalog.js';

const CATEGORIES = [
    { key: 'input', label: 'Inputs', color: '#d97706', nodes: INPUT_NODES },
    { key: 'transform', label: 'Transforms', color: '#2563eb', nodes: TRANSFORM_NODES },
    { key: 'spatial', label: 'Spatial', color: '#059669', nodes: SPATIAL_NODES },
    { key: 'enrichment', label: 'Enrichment', color: '#0891b2', nodes: ENRICHMENT_NODES },
    { key: 'output', label: 'Outputs', color: '#7c3aed', nodes: OUTPUT_NODES }
];

function PaletteItem({ def, categoryKey }) {
    const onDragStart = useCallback((e) => {
        e.dataTransfer.setData('application/x-wf-node', JSON.stringify({ type: def.type, category: categoryKey }));
        e.dataTransfer.effectAllowed = 'copy';
    }, [def.type, categoryKey]);

    const onClick = useCallback(() => {
        bus.emit('workflow:palette-add', { type: def.type, category: categoryKey });
    }, [def.type, categoryKey]);

    return (
        <div
            className="wf-palette-item"
            draggable
            onDragStart={onDragStart}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
        >
            <span className="wf-palette-icon">{def.icon}</span>
            <span>{def.label}</span>
        </div>
    );
}

export function WorkflowPalette() {
    const [collapsed, setCollapsed] = useState({});

    const visibleCategories = useMemo(() => {
        return CATEGORIES.map((cat) => ({
            ...cat,
            visibleNodes: cat.nodes.filter((def) => isPipelineNodeEnabled(def.type))
        })).filter((cat) => cat.visibleNodes.length > 0);
    }, []);

    const toggleCategory = useCallback((key) => {
        setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
    }, []);

    return (
        <div className="wf-palette">
            <div className="wf-palette-title">Nodes</div>
            {visibleCategories.map((cat) => (
                <div key={cat.key} className="wf-palette-section">
                    <div
                        className="wf-palette-cat-header"
                        onClick={() => toggleCategory(cat.key)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') toggleCategory(cat.key); }}
                    >
                        <span className={`wf-palette-arrow${collapsed[cat.key] ? ' collapsed' : ''}`}>▾</span>
                        <span style={{ color: cat.color, fontWeight: 600 }}>{cat.label}</span>
                    </div>
                    {!collapsed[cat.key] && (
                        <div className="wf-palette-list">
                            {cat.visibleNodes.map((def) => (
                                <PaletteItem key={def.type} def={def} categoryKey={cat.key} />
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
