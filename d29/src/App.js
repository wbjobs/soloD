import React, { useState, useRef, useEffect } from 'react';
import CircuitEditor from './components/CircuitEditor';
import ComponentLibrary from './components/ComponentLibrary';
import PropertiesPanel from './components/PropertiesPanel';
import NoiseChart from './components/NoiseChart';
import MonteCarloPanel from './components/MonteCarloPanel';

const { ipcRenderer } = window.require('electron');

function App() {
  const [elements, setElements] = useState([]);
  const [wires, setWires] = useState([]);
  const [selectedElement, setSelectedElement] = useState(null);
  const [noiseData, setNoiseData] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [monteCarloData, setMonteCarloData] = useState(null);
  const [isRunningMonteCarlo, setIsRunningMonteCarlo] = useState(false);

  const handleAddElement = (element) => {
    setElements([...elements, { ...element, id: Date.now() }]);
  };

  const handleUpdateElement = (updatedElement) => {
    setElements(elements.map(el => 
      el.id === updatedElement.id ? updatedElement : el
    ));
  };

  const handleDeleteElement = (elementId) => {
    setElements(elements.filter(el => el.id !== elementId));
    setWires(wires.filter(w => 
      w.from.elementId !== elementId && w.to.elementId !== elementId
    ));
    if (selectedElement && selectedElement.id === elementId) {
      setSelectedElement(null);
    }
  };

  const handleAddWire = (wire) => {
    setWires([...wires, { ...wire, id: Date.now() }]);
  };

  const sanitizeNoiseData = (data) => {
    if (!data || !data.frequencies || !data.totalNoiseSpectralDensity) {
      return null;
    }

    const sanitizeArray = (arr) => {
      if (!Array.isArray(arr)) return [];
      return arr.map(val => {
        if (val === null || val === undefined || isNaN(val) || !isFinite(val)) {
          return 0;
        }
        return Math.max(0, Math.min(1e-3, val));
      });
    };

    return {
      frequencies: data.frequencies.map(f => {
        if (isNaN(f) || !isFinite(f)) return 1;
        return Math.max(0.01, Math.min(1e12, f));
      }),
      totalNoiseSpectralDensity: sanitizeArray(data.totalNoiseSpectralDensity),
      resistorNoiseSpectralDensity: sanitizeArray(data.resistorNoiseSpectralDensity),
      opampVoltageNoiseSpectralDensity: sanitizeArray(data.opampVoltageNoiseSpectralDensity),
      opampCurrentNoiseSpectralDensity: sanitizeArray(data.opampCurrentNoiseSpectralDensity)
    };
  };

  const handleCalculateNoise = async () => {
    if (elements.length === 0) {
      alert('请先添加电路元件');
      return;
    }

    setIsCalculating(true);
    try {
      const sanitizedElements = elements.map(el => {
        const safeValue = el.value === null || el.value === undefined || isNaN(el.value) || !isFinite(el.value)
          ? 0
          : Math.max(0, Math.min(1e12, el.value));
        
        let safeParams = {};
        if (el.params && typeof el.params === 'object') {
          Object.keys(el.params).forEach(key => {
            const val = el.params[key];
            safeParams[key] = (val === null || val === undefined || isNaN(val) || !isFinite(val))
              ? 0
              : Math.max(-1e6, Math.min(1e6, val));
          });
        }

        return {
          type: el.type || 'unknown',
          value: safeValue,
          params: safeParams
        };
      });

      const circuitData = {
        elements: sanitizedElements,
        frequencyRange: {
          start: 1,
          end: 1e6,
          points: 100
        }
      };

      const result = await ipcRenderer.invoke('calculate-noise', circuitData);
      const sanitizedResult = sanitizeNoiseData(result);
      
      if (sanitizedResult) {
        setNoiseData(sanitizedResult);
      } else {
        throw new Error('无效的计算结果');
      }
    } catch (error) {
      console.error('噪声计算错误:', error);
      alert('计算失败: ' + (error.message || '未知错误'));
    } finally {
      setIsCalculating(false);
    }
  };

  const handleClearCircuit = () => {
    setElements([]);
    setWires([]);
    setSelectedElement(null);
    setNoiseData(null);
    setMonteCarloData(null);
  };

  const handleRunMonteCarlo = async (options) => {
    if (elements.length === 0) {
      alert('请先添加电路元件');
      return;
    }

    setIsRunningMonteCarlo(true);
    setMonteCarloData(null);
    
    try {
      const sanitizedElements = elements.map(el => {
        const safeValue = el.value === null || el.value === undefined || isNaN(el.value) || !isFinite(el.value)
          ? 0
          : Math.max(0, Math.min(1e12, el.value));
        
        let safeParams = {};
        if (el.params && typeof el.params === 'object') {
          Object.keys(el.params).forEach(key => {
            const val = el.params[key];
            safeParams[key] = (val === null || val === undefined || isNaN(val) || !isFinite(val))
              ? 0
              : Math.max(-1e6, Math.min(1e6, val));
          });
        }

        return {
          type: el.type || 'unknown',
          value: safeValue,
          params: safeParams
        };
      });

      const circuitData = {
        elements: sanitizedElements,
        frequencyRange: {
          start: 1,
          end: 1e6,
          points: 100
        }
      };

      const result = await ipcRenderer.invoke('monte-carlo-analysis', circuitData, options);
      setMonteCarloData(result);
    } catch (error) {
      console.error('蒙特卡洛分析错误:', error);
      alert('分析失败: ' + (error.message || '未知错误'));
    } finally {
      setIsRunningMonteCarlo(false);
    }
  };

  return (
    <div className="app-container">
      <ComponentLibrary onAddElement={handleAddElement} />
      
      <div className="main-content">
        <div className="toolbar">
          <button 
            className="btn-primary" 
            onClick={handleCalculateNoise}
            disabled={isCalculating || isRunningMonteCarlo}
          >
            {isCalculating ? '计算中...' : '计算噪声'}
          </button>
          <button 
            style={{ background: '#9c27b0' }}
            onClick={() => setMonteCarloData(null)}
            disabled={isRunningMonteCarlo}
          >
            蒙特卡洛分析
          </button>
          <button className="btn-secondary" onClick={handleClearCircuit}>
            清空电路
          </button>
        </div>
        
        <CircuitEditor
          elements={elements}
          wires={wires}
          selectedElement={selectedElement}
          onSelectElement={setSelectedElement}
          onUpdateElement={handleUpdateElement}
          onDeleteElement={handleDeleteElement}
          onAddWire={handleAddWire}
        />
        
        {noiseData && !monteCarloData && <NoiseChart data={noiseData} />}
        
        <MonteCarloPanel
          monteCarloData={monteCarloData}
          isRunning={isRunningMonteCarlo}
          onRunMonteCarlo={handleRunMonteCarlo}
          onCancel={() => setMonteCarloData(null)}
        />
      </div>
      
      <PropertiesPanel
        selectedElement={selectedElement}
        onUpdateElement={handleUpdateElement}
        onDeleteElement={handleDeleteElement}
      />
    </div>
  );
}

export default App;
