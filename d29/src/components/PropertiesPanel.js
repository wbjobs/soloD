import React from 'react';

function PropertiesPanel({ selectedElement, onUpdateElement, onDeleteElement }) {
  if (!selectedElement) {
    return (
      <div className="properties-panel">
        <h3>属性面板</h3>
        <p style={{ color: '#999', fontSize: '14px' }}>
          选择一个元件以编辑属性
        </p>
      </div>
    );
  }

  const handleValueChange = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      onUpdateElement({ ...selectedElement, value });
    }
  };

  const handleParamChange = (param, value) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      onUpdateElement({
        ...selectedElement,
        params: { ...selectedElement.params, [param]: numValue }
      });
    }
  };

  return (
    <div className="properties-panel">
      <h3>元件属性</h3>

      <div className="property-item">
        <label>类型</label>
        <input type="text" value={selectedElement.label} disabled />
      </div>

      {selectedElement.value !== null && (
        <div className="property-item">
          <label>值 ({selectedElement.unit})</label>
          <input
            type="number"
            value={selectedElement.value}
            onChange={handleValueChange}
          />
        </div>
      )}

      {selectedElement.type === 'resistor' && selectedElement.params && (
        <div className="property-item">
          <label>温度 (K)</label>
          <input
            type="number"
            value={selectedElement.params.temperature || 300}
            onChange={(e) => handleParamChange('temperature', e.target.value)}
          />
        </div>
      )}

      {selectedElement.type === 'opamp' && selectedElement.params && (
        <>
          <div className="property-item">
            <label>电压噪声密度 (nV/√Hz)</label>
            <input
              type="number"
              value={(selectedElement.params.voltageNoise || 10e-9) * 1e9}
              onChange={(e) => handleParamChange('voltageNoise', e.target.value * 1e-9)}
            />
          </div>
          <div className="property-item">
            <label>电流噪声密度 (pA/√Hz)</label>
            <input
              type="number"
              value={(selectedElement.params.currentNoise || 1e-12) * 1e12}
              onChange={(e) => handleParamChange('currentNoise', e.target.value * 1e-12)}
            />
          </div>
          <div className="property-item">
            <label>转角频率 (Hz)</label>
            <input
              type="number"
              value={selectedElement.params.cornerFrequency || 100}
              onChange={(e) => handleParamChange('cornerFrequency', e.target.value)}
            />
          </div>
        </>
      )}

      <div style={{ marginTop: '20px' }}>
        <button
          className="btn-secondary"
          style={{ width: '100%', background: '#f44336', color: 'white', border: 'none' }}
          onClick={() => onDeleteElement(selectedElement.id)}
        >
          删除元件
        </button>
      </div>
    </div>
  );
}

export default PropertiesPanel;
