import React, { useState, useEffect, useCallback, useRef } from 'react';
import SimulationCanvas from '../components/SimulationCanvas';
import ControlPanel from '../components/ControlPanel';
import ParameterPanel from '../components/ParameterPanel';
import BoundaryConfigPanel from '../components/BoundaryConfigPanel';
import ExportPanel from '../components/ExportPanel';
import { simulationAPI } from '../services/api';

const SimulationPage = () => {
  const [simulationId, setSimulationId] = useState(null);
  const [simulationData, setSimulationData] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [stepSize, setStepSize] = useState(20);
  const [fieldType, setFieldType] = useState('velocity');
  const [showVectors, setShowVectors] = useState(false);
  const [parameters, setParameters] = useState({
    nx: 200,
    ny: 100,
    viscosity: 0.02,
    inlet_velocity: 0.1
  });
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');

  const isRunningRef = useRef(false);
  const requestRef = useRef(null);
  const lastUpdateRef = useRef(0);

  const createSimulation = useCallback(async () => {
    try {
      setIsRunning(false);
      isRunningRef.current = false;
      const response = await simulationAPI.create(parameters);
      setSimulationId(response.simulation_id);
      
      const state = await simulationAPI.getState(response.simulation_id);
      setSimulationData(state);
    } catch (error) {
      console.error('Failed to create simulation:', error);
    }
  }, [parameters]);

  useEffect(() => {
    createSimulation();
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  const runSimulation = useCallback(async () => {
    if (!simulationId || !isRunningRef.current) return;

    const now = Date.now();
    if (now - lastUpdateRef.current < 50) {
      requestRef.current = requestAnimationFrame(runSimulation);
      return;
    }

    try {
      const state = await simulationAPI.step(simulationId, stepSize);
      setSimulationData(state);
      lastUpdateRef.current = Date.now();
      
      if (isRunningRef.current) {
        requestRef.current = requestAnimationFrame(runSimulation);
      }
    } catch (error) {
      console.error('Failed to step simulation:', error);
      isRunningRef.current = false;
      setIsRunning(false);
    }
  }, [simulationId, stepSize]);

  useEffect(() => {
    isRunningRef.current = isRunning;
    if (isRunning && simulationId) {
      requestRef.current = requestAnimationFrame(runSimulation);
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isRunning, simulationId, runSimulation]);

  const handleStep = async () => {
    if (!simulationId || isRunning) return;
    try {
      const state = await simulationAPI.step(simulationId, stepSize);
      setSimulationData(state);
    } catch (error) {
      console.error('Failed to step simulation:', error);
    }
  };

  const handleReset = async () => {
    if (!simulationId) return;
    setIsRunning(false);
    isRunningRef.current = false;
    try {
      const state = await simulationAPI.reset(simulationId);
      setSimulationData(state);
    } catch (error) {
      console.error('Failed to reset simulation:', error);
    }
  };

  const handleParametersChange = async (newParams) => {
    if (!simulationId) return;
    try {
      await simulationAPI.updateParameters(simulationId, {
        viscosity: newParams.viscosity,
        inlet_velocity: newParams.inlet_velocity
      });
      setParameters(newParams);
    } catch (error) {
      console.error('Failed to update parameters:', error);
    }
  };

  const handleSave = async () => {
    if (!simulationId || !saveName) return;
    try {
      await simulationAPI.save(simulationId, saveName, saveDescription);
      setSaveModalVisible(false);
      setSaveName('');
      setSaveDescription('');
      alert('模拟保存成功！');
    } catch (error) {
      console.error('Failed to save simulation:', error);
      alert('保存失败：' + error.message);
    }
  };

  const handleBoundaryChange = async (newBoundaryConfig) => {
    if (!simulationId) return;
    try {
      await simulationAPI.updateBoundary(simulationId, newBoundaryConfig);
      const state = await simulationAPI.getState(simulationId);
      setSimulationData(state);
      alert('边界配置已更新！');
    } catch (error) {
      console.error('Failed to update boundary:', error);
      alert('边界配置更新失败：' + error.message);
    }
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

  const mainContentStyle = {
    flex: 1,
    minWidth: '800px'
  };

  const sidebarStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    minWidth: '280px'
  };

  const canvasContainerStyle = {
    backgroundColor: '#2d2d44',
    padding: '20px',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
  };

  const modalStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  };

  const modalContentStyle = {
    backgroundColor: '#2d2d44',
    padding: '30px',
    borderRadius: '8px',
    minWidth: '400px'
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: '28px' }}>🌊 流体力学模拟可视化平台</h1>
        <p style={{ margin: '10px 0 0 0', color: '#aaa', fontSize: '14px' }}>
          基于格子玻尔兹曼方法 (Lattice Boltzmann Method) 的实时流体模拟
        </p>
      </div>

      <div style={contentStyle}>
        <div style={mainContentStyle}>
          <div style={canvasContainerStyle}>
            <SimulationCanvas
              data={simulationData}
              fieldType={fieldType}
              showVectors={showVectors}
              width={800}
              height={400}
            />
          </div>
          
          {simulationData && (
            <div style={{
              marginTop: '20px',
              backgroundColor: '#2d2d44',
              padding: '15px',
              borderRadius: '8px',
              display: 'flex',
              gap: '30px',
              flexWrap: 'wrap'
            }}>
              <div>
                <span style={{ color: '#aaa', fontSize: '12px' }}>当前步数</span>
                <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '5px 0 0 0' }}>
                  {simulationData.step}
                </p>
              </div>
              <div>
                <span style={{ color: '#aaa', fontSize: '12px' }}>网格尺寸</span>
                <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '5px 0 0 0' }}>
                  {simulationData.nx} × {simulationData.ny}
                </p>
              </div>
              <div>
                <span style={{ color: '#aaa', fontSize: '12px' }}>粘度</span>
                <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '5px 0 0 0' }}>
                  {parameters.viscosity}
                </p>
              </div>
              <div>
                <span style={{ color: '#aaa', fontSize: '12px' }}>入口速度</span>
                <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '5px 0 0 0' }}>
                  {parameters.inlet_velocity}
                </p>
              </div>
            </div>
          )}
        </div>

        <div style={sidebarStyle}>
          <ControlPanel
            isRunning={isRunning}
            onStart={() => setIsRunning(true)}
            onPause={() => setIsRunning(false)}
            onStep={handleStep}
            onReset={handleReset}
            onSave={() => setSaveModalVisible(true)}
            stepSize={stepSize}
            onStepSizeChange={setStepSize}
            fieldType={fieldType}
            onFieldTypeChange={setFieldType}
            showVectors={showVectors}
            onShowVectorsChange={setShowVectors}
          />
          
          <BoundaryConfigPanel
            boundaryConfig={simulationData?.boundary_config}
            onBoundaryChange={handleBoundaryChange}
            nx={parameters.nx}
            ny={parameters.ny}
          />
          
          <ParameterPanel
            parameters={parameters}
            onParametersChange={handleParametersChange}
            onCreateSimulation={createSimulation}
          />
          
          <ExportPanel simulationId={simulationId} />
        </div>
      </div>

      {saveModalVisible && (
        <div style={modalStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ marginBottom: '20px' }}>保存模拟</h3>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>
                名称:
              </label>
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="输入模拟名称"
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#1a1a2e',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px'
                }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>
                描述:
              </label>
              <textarea
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                placeholder="输入模拟描述（可选）"
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#1a1a2e',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  resize: 'vertical'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setSaveModalVisible(false)}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#4a90d9',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationPage;
