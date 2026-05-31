import React from 'react';

const ControlPanel = ({
  isRunning,
  onStart,
  onPause,
  onStep,
  onReset,
  onSave,
  stepSize = 10,
  onStepSizeChange,
  fieldType,
  onFieldTypeChange,
  showVectors,
  onShowVectorsChange
}) => {
  const containerStyle = {
    padding: '20px',
    backgroundColor: '#2d2d44',
    borderRadius: '8px',
    color: '#fff',
    minWidth: '250px'
  };

  const buttonStyle = {
    padding: '10px 15px',
    margin: '5px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  };

  const primaryButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#4a90d9',
    color: '#fff'
  };

  const successButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#5ab96c',
    color: '#fff'
  };

  const dangerButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#d9534f',
    color: '#fff'
  };

  const secondaryButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#6c757d',
    color: '#fff'
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

  const selectStyle = {
    width: '100%',
    padding: '8px',
    backgroundColor: '#1a1a2e',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: '4px'
  };

  const inputStyle = {
    width: '100%',
    padding: '8px',
    backgroundColor: '#1a1a2e',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: '4px'
  };

  const checkboxContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  };

  return (
    <div style={containerStyle}>
      <h3 style={{ marginBottom: '20px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
        控制面板
      </h3>

      <div style={sectionStyle}>
        <h4 style={{ marginBottom: '10px', fontSize: '15px' }}>模拟控制</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {isRunning ? (
            <button style={dangerButtonStyle} onClick={onPause}>
              ⏸ 暂停
            </button>
          ) : (
            <button style={successButtonStyle} onClick={onStart}>
              ▶ 开始
            </button>
          )}
          <button style={secondaryButtonStyle} onClick={onStep}>
            ⏭ 单步
          </button>
          <button style={dangerButtonStyle} onClick={onReset}>
            ↺ 重置
          </button>
        </div>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>每步步数:</label>
        <input
          type="number"
          value={stepSize}
          onChange={(e) => onStepSizeChange(parseInt(e.target.value) || 1)}
          min="1"
          max="100"
          style={inputStyle}
        />
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>显示场类型:</label>
        <select
          value={fieldType}
          onChange={(e) => onFieldTypeChange(e.target.value)}
          style={selectStyle}
        >
          <option value="velocity">速度场</option>
          <option value="pressure">压力场</option>
          <option value="vorticity">涡量场</option>
        </select>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}></label>
        <div style={checkboxContainerStyle}>
          <input
            type="checkbox"
            checked={showVectors}
            onChange={(e) => onShowVectorsChange(e.target.checked)}
            id="showVectors"
          />
          <label htmlFor="showVectors" style={{ fontSize: '14px' }}>
            显示速度矢量
          </label>
        </div>
      </div>

      <div style={sectionStyle}>
        <button style={primaryButtonStyle} onClick={onSave} style={{ width: '100%', ...primaryButtonStyle }}>
          💾 保存模拟
        </button>
      </div>
    </div>
  );
};

export default ControlPanel;
