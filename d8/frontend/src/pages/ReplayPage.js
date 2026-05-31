import React, { useState, useEffect } from 'react';
import SimulationCanvas from '../components/SimulationCanvas';
import { savedSimulationsAPI } from '../services/api';

const ReplayPage = () => {
  const [simulations, setSimulations] = useState([]);
  const [selectedSim, setSelectedSim] = useState(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fieldType, setFieldType] = useState('velocity');
  const [compareSim, setCompareSim] = useState(null);
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    loadSimulations();
  }, []);

  const loadSimulations = async () => {
    try {
      const response = await savedSimulationsAPI.list();
      setSimulations(response.simulations || []);
    } catch (error) {
      console.error('Failed to load simulations:', error);
    }
  };

  const loadSimulation = async (simId) => {
    try {
      const data = await savedSimulationsAPI.get(simId);
      setSelectedSim(data);
      setCurrentFrame(0);
    } catch (error) {
      console.error('Failed to load simulation:', error);
    }
  };

  const deleteSimulation = async (simId, event) => {
    event.stopPropagation();
    if (!confirm('确定要删除这个模拟吗？')) return;
    
    try {
      await savedSimulationsAPI.delete(simId);
      await loadSimulations();
      if (selectedSim?.id === simId) {
        setSelectedSim(null);
      }
      if (compareSim?.id === simId) {
        setCompareSim(null);
      }
    } catch (error) {
      console.error('Failed to delete simulation:', error);
    }
  };

  useEffect(() => {
    if (!isPlaying || !selectedSim) return;
    
    const interval = setInterval(() => {
      setCurrentFrame((prev) => {
        if (prev >= selectedSim.frames.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, selectedSim]);

  const currentFrameData = selectedSim?.frames[currentFrame]?.state;

  const pageStyle = {
    minHeight: '100vh',
    backgroundColor: '#1a1a2e',
    color: '#fff',
    padding: '20px'
  };

  const headerStyle = {
    marginBottom: '20px',
    padding: '15px 0',
    borderBottom: '1px solid #333'
  };

  const contentStyle = {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap'
  };

  const sidebarStyle = {
    width: '300px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  };

  const listContainerStyle = {
    backgroundColor: '#2d2d44',
    padding: '15px',
    borderRadius: '8px',
    maxHeight: '500px',
    overflowY: 'auto'
  };

  const itemStyle = {
    padding: '12px',
    backgroundColor: '#1a1a2e',
    borderRadius: '4px',
    marginBottom: '10px',
    cursor: 'pointer',
    border: '2px solid transparent'
  };

  const selectedItemStyle = {
    ...itemStyle,
    borderColor: '#4a90d9'
  };

  const mainContentStyle = {
    flex: 1,
    minWidth: '800px'
  };

  const canvasContainerStyle = {
    backgroundColor: '#2d2d44',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px',
    justifyContent: 'center'
  };

  const controlsStyle = {
    backgroundColor: '#2d2d44',
    padding: '20px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    flexWrap: 'wrap'
  };

  const buttonStyle = {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: '28px' }}>📼 模拟回放与对比</h1>
        <p style={{ margin: '10px 0 0 0', color: '#aaa', fontSize: '14px' }}>
          查看保存的流体模拟结果，进行回放和对比分析
        </p>
      </div>

      <div style={contentStyle}>
        <div style={sidebarStyle}>
          <div style={listContainerStyle}>
            <h3 style={{ marginBottom: '15px' }}>已保存的模拟</h3>
            {simulations.length === 0 ? (
              <p style={{ color: '#aaa', textAlign: 'center', padding: '20px' }}>
                暂无保存的模拟
              </p>
            ) : (
              simulations.map((sim) => (
                <div
                  key={sim.id}
                  style={selectedSim?.id === sim.id ? selectedItemStyle : itemStyle}
                  onClick={() => loadSimulation(sim.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 5px 0', fontSize: '14px' }}>{sim.name}</h4>
                      <p style={{ margin: 0, fontSize: '12px', color: '#aaa' }}>
                        帧数: {sim.frame_count} | {new Date(sim.created_at).toLocaleString()}
                      </p>
                      {sim.description && (
                        <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#888' }}>
                          {sim.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => deleteSimulation(sim.id, e)}
                      style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: '#d9534f',
                        cursor: 'pointer',
                        fontSize: '16px',
                        padding: '5px'
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ backgroundColor: '#2d2d44', padding: '15px', borderRadius: '8px' }}>
            <h4 style={{ marginBottom: '15px' }}>显示设置</h4>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#ccc' }}>
                场类型:
              </label>
              <select
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#1a1a2e',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px'
                }}
              >
                <option value="velocity">速度场</option>
                <option value="pressure">压力场</option>
                <option value="vorticity">涡量场</option>
              </select>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  checked={compareMode}
                  onChange={(e) => setCompareMode(e.target.checked)}
                />
                启用对比模式
              </label>
            </div>
            {compareMode && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#ccc' }}>
                  选择对比模拟:
                </label>
                <select
                  value={compareSim?.id || ''}
                  onChange={(e) => {
                    const sim = simulations.find(s => s.id === e.target.value);
                    if (sim) loadSimulation(sim.id).then(() => setCompareSim(sim));
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#1a1a2e',
                    color: '#fff',
                    border: '1px solid #444',
                    borderRadius: '4px'
                  }}
                >
                  <option value="">选择模拟...</option>
                  {simulations.map((sim) => (
                    <option key={sim.id} value={sim.id}>
                      {sim.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div style={mainContentStyle}>
          <div style={canvasContainerStyle}>
            {selectedSim && currentFrameData ? (
              <>
                <div>
                  <h4 style={{ textAlign: 'center', marginBottom: '10px' }}>
                    {selectedSim.name}
                  </h4>
                  <SimulationCanvas
                    data={currentFrameData}
                    fieldType={fieldType}
                    showVectors={false}
                    width={800}
                    height={400}
                  />
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '100px', color: '#aaa' }}>
                请从左侧选择一个模拟进行回放
              </div>
            )}
          </div>

          {selectedSim && (
            <div style={controlsStyle}>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                style={{
                  ...buttonStyle,
                  backgroundColor: isPlaying ? '#d9534f' : '#5ab96c',
                  color: '#fff'
                }}
              >
                {isPlaying ? '⏸ 暂停' : '▶ 播放'}
              </button>
              <button
                onClick={() => setCurrentFrame(Math.max(0, currentFrame - 1))}
                style={{ ...buttonStyle, backgroundColor: '#6c757d', color: '#fff' }}
              >
                ◀ 上一帧
              </button>
              <button
                onClick={() => setCurrentFrame(Math.min(selectedSim.frames.length - 1, currentFrame + 1))}
                style={{ ...buttonStyle, backgroundColor: '#6c757d', color: '#fff' }}
              >
                下一帧 ▶
              </button>
              <button
                onClick={() => setCurrentFrame(0)}
                style={{ ...buttonStyle, backgroundColor: '#6c757d', color: '#fff' }}
              >
                ↺ 从头开始
              </button>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ fontSize: '14px' }}>帧: {currentFrame + 1} / {selectedSim.frames.length}</span>
                <input
                  type="range"
                  min="0"
                  max={selectedSim.frames.length - 1}
                  value={currentFrame}
                  onChange={(e) => setCurrentFrame(parseInt(e.target.value))}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          )}

          {selectedSim && (
            <div style={{
              backgroundColor: '#2d2d44',
              padding: '20px',
              borderRadius: '8px',
              marginTop: '20px'
            }}>
              <h3 style={{ marginBottom: '15px' }}>模拟参数</h3>
              <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ color: '#aaa', fontSize: '12px' }}>名称</span>
                  <p style={{ fontSize: '18px', fontWeight: 'bold', margin: '5px 0 0 0' }}>
                    {selectedSim.name}
                  </p>
                </div>
                <div>
                  <span style={{ color: '#aaa', fontSize: '12px' }}>网格尺寸</span>
                  <p style={{ fontSize: '18px', fontWeight: 'bold', margin: '5px 0 0 0' }}>
                    {selectedSim.parameters?.nx || 'N/A'} × {selectedSim.parameters?.ny || 'N/A'}
                  </p>
                </div>
                <div>
                  <span style={{ color: '#aaa', fontSize: '12px' }}>粘度</span>
                  <p style={{ fontSize: '18px', fontWeight: 'bold', margin: '5px 0 0 0' }}>
                    {selectedSim.parameters?.viscosity || 'N/A'}
                  </p>
                </div>
                <div>
                  <span style={{ color: '#aaa', fontSize: '12px' }}>入口速度</span>
                  <p style={{ fontSize: '18px', fontWeight: 'bold', margin: '5px 0 0 0' }}>
                    {selectedSim.parameters?.inlet_velocity || 'N/A'}
                  </p>
                </div>
                <div>
                  <span style={{ color: '#aaa', fontSize: '12px' }}>总帧数</span>
                  <p style={{ fontSize: '18px', fontWeight: 'bold', margin: '5px 0 0 0' }}>
                    {selectedSim.frames?.length || 0}
                  </p>
                </div>
              </div>
              {selectedSim.description && (
                <div style={{ marginTop: '20px' }}>
                  <span style={{ color: '#aaa', fontSize: '12px' }}>描述</span>
                  <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>
                    {selectedSim.description}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReplayPage;
