export function LayerSelect({
    label = 'Layer',
    value,
    onChange,
    layers = [],
    placeholder = '- select layer -',
    formatOption = (layer) => `${layer.name} (${layer.featureCount})`
}) {
    return (
        <div className="form-group">
            <label>{label}</label>
            <select value={value} onChange={(e) => onChange?.(e.target.value)}>
                <option value="">{placeholder}</option>
                {layers.map((layer) => (
                    <option key={layer.id} value={layer.id}>
                        {formatOption(layer)}
                    </option>
                ))}
            </select>
        </div>
    );
}
