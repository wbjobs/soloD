import React, { useState, useEffect } from 'react';
import SimulationCanvas from '../components/SimulationCanvas';
import { simulationAPI, savedSimulationsAPI } from '../services/api';

const ComparisonPage = () => {
  const [activeSimulations, setActiveSimulations] = useState([]);
  const [selectedSimIds, setSelectedSimIds] = useState([]);
  const [savedSimulations, setSavedSimulations] = useState([]);
  const [fieldType, setFieldType] = useState('velocity');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSimulations();
  }, []);

  const loadSimulations = async () => {
    setIsLoading(true);
    try {
      const [activeRes, savedRes] = await Promise.all([
        simulationAPI.list(),
        savedSimulationsAPI.list()
      ]);
      setActiveSimulations(activeRes.simulations || []);
      setSavedSimulations(savedRes.simulations || []);
    } catch (error) {
      console.error('Failed to load simulations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSimulation = (simId) => {
    setSelectedSimIds(prev => {
      if (prev.includes(simId)) {
        return prev.filter(id => id !== simId);
      } else if (prev.length < 4) {
        return [...prev, simId];
      }
      return prev;
    });
  };

  const getSimName = (sim) => {
    return sim.name || sim.id?.slice(0, 8) || 'Unnamed';
  };

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
    gap: '15px'
  };

  const mainContentStyle = {
    flex: 1,
    minWidth: '600px'
  };

  const panelStyle = {
    backgroundColor: '#2d2d44',
    padding: '15px',
    borderRadius: '8px'
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: selectedSimIds.length <= 2 ? '1fr 1fr' : '1fr 1fr',
    gap: '20px'
  };

  const canvasWrapperStyle = {
    backgroundColor: '#2d2d44',
    padding: '15px',
    borderRadius: '8px'
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: '28px' }}>📊 多模拟对比</h1>
        <p style={{ margin: '10px 0 0 0', color: '#aaa', fontSize: '14px' }}>
          同时对比最多4个流体模拟结果
        </p>
      </div>

      <div style={contentStyle}>
        <div style={sidebarStyle}>
          <div style={panelStyle}>
            <h4 style={{ marginBottom: '15px' }}>显示设置</h4>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#ccc' }}>
              场类型
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

          <div style={panelStyle}>
            <h4 style={{ marginBottom: '15px' }}>选择模拟 ({selectedSimIds.length}/4)</h4>
            
            {activeSimulations.length > 0 && (
              <div style={{ marginBottom: '15px' }}>
                <h5 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#aaa' }}>
                  🔴 进行中的模拟
                </h5>
                {activeSimulations.map(sim => (
                  <div
                    key={sim.id}
                    onClick={() => toggleSimulation(sim.id)}
                    style={{
                      padding: '10px',
                      marginBottom: '5px',
                      backgroundColor: selectedSimIds.includes(sim.id) ? '#4a90d9' : '#1a1a2e',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      border: selectedSimIds.includes(sim.id) ? '2px solid #4a90d9' : '2px solid transparent'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{getSimName(sim)}</span>
                      <span style={{ fontSize: '11px', color: '#aaa' }}>
                        Step: {sim.step}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {savedSimulations.length > 0 && (
              <div>
                <h5 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#aaa' }}>
                  💾 已保存的模拟
                </h5>
                {savedSimulations.map(sim => (
                  <div
                    key={sim.id}
                    onClick={() => toggleSimulation(sim.id)}
                    style={{
                      padding: '10px',
                      marginBottom: '5px',
                      backgroundColor: selectedSimIds.includes(sim.id) ? '#4a90d9' : '#1a1a2e',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      border: selectedSimIds.includes(sim.id) ? '2px solid #4a90d9' : '2px solid transparent'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{getSimName(sim)}</span>
                      <span style={{ fontSize: '11px', color: '#aaa' }}>
                        {sim.frame_count} 帧
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeSimulations.length === 0 && savedSimulations.length === 0 && !isLoading && (
              <p style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '20px' }}>
                暂无可用模拟，请先创建或保存模拟
              </p>
            )}
          </div>

          <button
            onClick={loadSimulations}
            style={{
              padding: '10px',
              backgroundColor: '#6c757d',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            🔄 刷新列表
          </button>
        </div>

        <div style={mainContentStyle}>
          {selectedSimIds.length === 0 ? (
            <div style={{
              backgroundColor: '#2d2d44',
              padding: '80px 20px',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '64px', marginBottom: '20px' }}>👈</div>
              <h3>请从左侧选择要对比的模拟</h3>
              <p style={{ color: '#aaa', marginTop: '10px' }}>
                最多可同时对比4个模拟结果
              </p>
            </div>
          ) : (
            <div style={gridStyle}>
              {selectedSimIds.map(simId => (
                <SimulationCompareCard
                  key={simId}
                  simId={simId}
                  fieldType={fieldType}
                  allSims={[...activeSimulations, ...savedSimulations]}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SimulationCompareCard = ({ simId, fieldType, allSims }) => {
  const [simData, setSimData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadState = async () => {
      setIsLoading(true);
      try {
        const data = await simulationAPI.getState(simId);
        setSimData(data);
      } catch (error) {
        console.error('Failed to load simulation state:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadState();
  }, [simId]);

  const sim = allSims.find(s => s.id === simId);
  const name = sim?.name || simId.slice(0, 8);

  if (isLoading) {
    return (
      <div style={{
        backgroundColor: '#2d2d44',
        padding: '60px 20px',
        borderRadius: '8px',
        textAlign: 'center',
        color: '#aaa'
      }}>
        加载中...
      </div>
    );
  }

  if (!simData) {
    return (
      <div style={{
        backgroundColor: '#2d2d44',
        padding: '60px 20px',
        borderRadius: '8px',
        textAlign: 'center',
        color: '#ff6b6b'
      }}>
        加载失败
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#2d2d44',
      padding: '15px',
      borderRadius: '8px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px'
      }}>
        <h4 style={{ margin: 0, fontSize: '14px' }}>{name}</h4>
        <span style={{ fontSize: '12px', color: '#aaa' }}>
          Step: {simData.step}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <SimulationCanvas
          data={simData}
          fieldType={fieldType}
          showVectors={false}
          width={360}
          height={180}
        />
      </div>
      {simData.nx && (
        <div style={{
          marginTop: '10px',
          fontSize: '12px',
          color: '#aaa',
          display: 'flex',
          justifyContent: 'space-around'
        }}>
          <span>网格: {simData.nx}×{simData.ny}</span>
        </div>
      )}
    </div>
  );
};

export default ComparisonPage;
