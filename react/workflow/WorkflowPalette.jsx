import React, { useCallback, useMemo, useState } from 'react';
import bus from '../../js/core/event-bus.js';
import { NODE_CATEGORIES } from '../../js/workflow/node-catalog.js';
import { isPipelineNodeEnabled } from '../../js/tools/tool-catalog.js';

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
        return NODE_CATEGORIES.map((cat) => ({
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
