import React, { useState } from 'react';

const ParameterPanel = ({ parameters, onParametersChange, onCreateSimulation }) => {
  const [localParams, setLocalParams] = useState(parameters);

  const containerStyle = {
    padding: '20px',
    backgroundColor: '#2d2d44',
    borderRadius: '8px',
    color: '#fff',
    minWidth: '250px'
  };

  const sectionStyle = {
    marginBottom: '20px'
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    color: '#ccc'
  };

  const inputStyle = {
    width: '100%',
    padding: '8px',
    backgroundColor: '#1a1a2e',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: '4px'
  };

  const buttonStyle = {
    width: '100%',
    padding: '12px',
    backgroundColor: '#4a90d9',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  };

  const handleChange = (key, value) => {
    const newParams = { ...localParams, [key]: value };
    setLocalParams(newParams);
  };

  const handleApply = () => {
    onParametersChange(localParams);
  };

  return (
    <div style={containerStyle}>
      <h3 style={{ marginBottom: '20px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
        参数配置
      </h3>

      <div style={sectionStyle}>
        <label style={labelStyle}>网格宽度 (nx):</label>
        <input
          type="number"
          value={localParams.nx}
          onChange={(e) => handleChange('nx', parseInt(e.target.value) || 100)}
          min="50"
          max="500"
          style={inputStyle}
        />
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>网格高度 (ny):</label>
        <input
          type="number"
          value={localParams.ny}
          onChange={(e) => handleChange('ny', parseInt(e.target.value) || 50)}
          min="25"
          max="250"
          style={inputStyle}
        />
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>粘度 (viscosity):</label>
        <input
          type="number"
          value={localParams.viscosity}
          onChange={(e) => handleChange('viscosity', parseFloat(e.target.value) || 0.01)}
          min="0.001"
          max="0.1"
          step="0.001"
          style={inputStyle}
        />
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>入口速度 (inlet_velocity):</label>
        <input
          type="number"
          value={localParams.inlet_velocity}
          onChange={(e) => handleChange('inlet_velocity', parseFloat(e.target.value) || 0.1)}
          min="0.01"
          max="1.0"
          step="0.01"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          style={{ ...buttonStyle, backgroundColor: '#5ab96c', flex: 1 }}
          onClick={onCreateSimulation}
        >
          创建新模拟
        </button>
        <button
          style={{ ...buttonStyle, flex: 1 }}
          onClick={handleApply}
        >
          应用参数
        </button>
      </div>
    </div>
  );
};

export default ParameterPanel;
