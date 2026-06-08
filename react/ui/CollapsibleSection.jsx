import { useCallback, useState } from 'react';

export function CollapsibleSection({
    title,
    children,
    defaultOpen = true,
    className = '',
    bodyClassName = '',
    bodyId = null
}) {
    const [collapsed, setCollapsed] = useState(!defaultOpen);

    const toggle = useCallback(() => {
        setCollapsed((prev) => !prev);
    }, []);

    const onKeyDown = useCallback((event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggle();
    }, [toggle]);

    return (
        <div className={`panel-section${className ? ` ${className}` : ''}`}>
            <div
                className={`panel-section-header${collapsed ? ' collapsed' : ''}`}
                data-collapsible="true"
                role="button"
                tabIndex={0}
                onClick={toggle}
                onKeyDown={onKeyDown}
            >
                <span>{title}</span>
                <span className="arrow">▼</span>
            </div>
            <div
                id={bodyId || undefined}
                className={`panel-section-body${collapsed ? ' hidden' : ''}${bodyClassName ? ` ${bodyClassName}` : ''}`}
            >
                {children}
            </div>
        </div>
    );
}
