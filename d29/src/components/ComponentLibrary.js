import React from 'react';

const componentTypes = [
  { type: 'resistor', label: '电阻', value: 1000, unit: 'Ω', width: 60, height: 40 },
  { type: 'capacitor', label: '电容', value: 1e-6, unit: 'F', width: 60, height: 40 },
  { type: 'opamp', label: '运放', value: null, width: 80, height: 60 },
  { type: 'voltage_source', label: '电压源', value: 5, unit: 'V', width: 60, height: 60 },
  { type: 'ground', label: '接地', value: null, width: 40, height: 40 }
];

function ComponentLibrary({ onAddElement }) {
  const handleDragStart = (e, component) => {
    e.dataTransfer.setData('component', JSON.stringify(component));
  };

  return (
    <div className="sidebar">
      <h3>元件库</h3>
      {componentTypes.map((comp) => (
        <div
          key={comp.type}
          className="component-item"
          draggable
          onDragStart={(e) => handleDragStart(e, comp)}
        >
          <div style={{ fontWeight: 'bold' }}>{comp.label}</div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
            {comp.value !== null && `${comp.value} ${comp.unit}`}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ComponentLibrary;
