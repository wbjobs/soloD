import React, { useState } from 'react';

const BoundaryConfigPanel = ({ boundaryConfig, onBoundaryChange, nx = 200, ny = 100 }) => {
  const [localConfig, setLocalConfig] = useState(boundaryConfig || {
    left: { type: 'inlet', velocity: [0.1, 0.0] },
    right: { type: 'outlet' },
    top: { type: 'wall' },
    bottom: { type: 'wall' },
    obstacles: []
  });

  const [obstacleType, setObstacleType] = useState('circle');

  const handleSideChange = (side, type, extra = {}) => {
    const newConfig = { ...localConfig };
    newConfig[side] = { type, ...extra };
    setLocalConfig(newConfig);
  };

  const handleVelocityChange = (side, index, value) => {
    const newConfig = { ...localConfig };
    if (!newConfig[side]) newConfig[side] = {};
    if (!newConfig[side].velocity) newConfig[side].velocity = [0, 0];
    newConfig[side].velocity[index] = parseFloat(value);
    setLocalConfig(newConfig);
  };

  const addObstacle = () => {
    const newObstacle = {
      type: obstacleType,
      params: obstacleType === 'circle' 
        ? { cx: Math.floor(nx / 4), cy: Math.floor(ny / 2), r: Math.floor(min(nx, ny) / 12) }
        : { x1: Math.floor(nx / 3), y1: Math.floor(ny / 3), x2: Math.floor(nx / 2), y2: Math.floor(ny / 1.5) }
    };
    const newConfig = { ...localConfig };
    if (!newConfig.obstacles) newConfig.obstacles = [];
    newConfig.obstacles.push(newObstacle);
    setLocalConfig(newConfig);
  };

  const removeObstacle = (index) => {
    const newConfig = { ...localConfig };
    newConfig.obstacles.splice(index, 1);
    setLocalConfig(newConfig);
  };

  const handleApply = () => {
    onBoundaryChange(localConfig);
  };

  const min = (a, b) => a < b ? a : b;

  const containerStyle = {
    padding: '15px',
    backgroundColor: '#2d2d44',
    borderRadius: '8px',
    color: '#fff',
    marginBottom: '15px'
  };

  const sectionStyle = {
    marginBottom: '15px'
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '5px',
    fontSize: '13px',
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

  const sideConfigStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginBottom: '10px'
  };

  return (
    <div style={containerStyle}>
      <h4 style={{ marginBottom: '15px', fontSize: '15px' }}>边界条件配置</h4>

      <div style={sectionStyle}>
        <label style={labelStyle}>四边边界设置</label>
        <div style={sideConfigStyle}>
          {['left', 'right', 'top', 'bottom'].map((side) => (
            <div key={side} style={{ marginBottom: '8px' }}>
              <label style={{ fontSize: '12px', color: '#aaa', marginBottom: '3px', display: 'block' }}>
                {side === 'left' ? '左边界' : side === 'right' ? '右边界' : side === 'top' ? '顶边界' : '底边界'}
              </label>
              <select
                value={localConfig[side]?.type || 'wall'}
                onChange={(e) => handleSideChange(side, e.target.value)}
                style={selectStyle}
              >
                <option value="wall">固壁 (Wall)</option>
                <option value="inlet">入口 (Inlet)</option>
                <option value="outlet">出口 (Outlet)</option>
              </select>
              
              {localConfig[side]?.type === 'inlet' && (
                <div style={{ marginTop: '5px', display: 'flex', gap: '5px' }}>
                  <input
                    type="number"
                    value={localConfig[side]?.velocity?.[0] || 0.1}
                    onChange={(e) => handleVelocityChange(side, 0, e.target.value)}
                    placeholder="Ux"
                    step="0.01"
                    style={{ ...inputStyle, width: '50%' }}
                  />
                  <input
                    type="number"
                    value={localConfig[side]?.velocity?.[1] || 0}
                    onChange={(e) => handleVelocityChange(side, 1, e.target.value)}
                    placeholder="Uy"
                    step="0.01"
                    style={{ ...inputStyle, width: '50%' }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>障碍物配置</label>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <select
            value={obstacleType}
            onChange={(e) => setObstacleType(e.target.value)}
            style={{ ...selectStyle, flex: 1 }}
          >
            <option value="circle">圆形</option>
            <option value="rectangle">矩形</option>
          </select>
          <button
            onClick={addObstacle}
            style={{
              padding: '8px 15px',
              backgroundColor: '#4a90d9',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            + 添加
          </button>
        </div>
        
        {localConfig.obstacles?.length > 0 && (
          <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
            {localConfig.obstacles.map((obs, idx) => (
              <div key={idx} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px',
                backgroundColor: '#1a1a2e',
                borderRadius: '4px',
                marginBottom: '5px'
              }}>
                <span style={{ fontSize: '13px' }}>
                  {obs.type === 'circle' ? '⚪ 圆形' : '⬜ 矩形'} #{idx + 1}
                </span>
                <button
                  onClick={() => removeObstacle(idx)}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#ff6b6b',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={handleApply}
        style={{
          width: '100%',
          padding: '10px',
          backgroundColor: '#5ab96c',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px'
        }}
      >
        应用边界配置
      </button>
    </div>
  );
};

export default BoundaryConfigPanel;
