import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import ProteinViewer from './components/ProteinViewer';
import Heatmap from './components/Heatmap';

const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
const VERY_LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB

function App() {
  const [file, setFile] = useState(null);
  const [atoms, setAtoms] = useState(null);
  const [atomsBackbone, setAtomsBackbone] = useState(null);
  const [residues, setResidues] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [filename, setFilename] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [colorMode, setColorMode] = useState('element');
  const [heatmapType, setHeatmapType] = useState('hydrophobicity');
  const [selectedResidue, setSelectedResidue] = useState(null);
  const [stats, setStats] = useState(null);
  const [renderQuality, setRenderQuality] = useState('auto');
  const [showLargeFileWarning, setShowLargeFileWarning] = useState(false);
  
  // Molecular dynamics simulation state
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationSessionId, setSimulationSessionId] = useState(null);
  const [temperature, setTemperature] = useState(300);
  const [simulationStep, setSimulationStep] = useState(0);
  const [simulationUpdate, setSimulationUpdate] = useState(null);
  const eventSourceRef = useRef(null);
  const originalAtomsRef = useRef(null);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError('');
      setShowLargeFileWarning(selectedFile.size > LARGE_FILE_THRESHOLD);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a PDB file');
      return;
    }

    setLoading(true);
    setError('');
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadResponse = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
        timeout: 600000 // 10 minutes timeout for large files
      });

      if (uploadResponse.data.success) {
        const { atoms: sampledAtoms, atoms_backbone, residues: resData, filename: fname, stats: fileStats } = uploadResponse.data;
        
        setAtoms(sampledAtoms);
        setAtomsBackbone(atoms_backbone);
        setResidues(resData);
        setFilename(fname);
        setStats(fileStats);

        if (fileStats?.was_sampled) {
          console.log(`Large file detected: sampled ${fileStats.rendered_atoms} atoms from ${fileStats.total_atoms}`);
        }

        const analyzeResponse = await axios.post('/api/analyze', {
          atoms: sampledAtoms,
          residues: resData
        });

        if (analyzeResponse.data.success) {
          setAnalysis(analyzeResponse.data.analysis);
        }
      }
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        setError('Request timed out. Please try with a smaller file.');
      } else if (err.response?.status === 413) {
        setError('File too large. Maximum allowed size is 200MB.');
      } else {
        setError(err.response?.data?.error || 'Error processing file. Please try again.');
      }
      console.error('Upload error:', err);
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  const getRenderAtoms = () => {
    switch (renderQuality) {
      case 'backbone':
        return atomsBackbone || atoms;
      case 'full':
        return atoms;
      default:
        return atoms;
    }
  };

  // Molecular dynamics simulation functions
  const startSimulation = useCallback(async () => {
    if (!atoms || !residues) return;
    
    try {
      originalAtomsRef.current = JSON.parse(JSON.stringify(atoms));
      
      const response = await axios.post('/api/simulation/start', {
        atoms: atoms,
        residues: residues,
        temperature: temperature
      });
      
      if (response.data.success) {
        setSimulationSessionId(response.data.session_id);
        setSimulationRunning(true);
        
        // Connect to SSE stream
        const eventSource = new EventSource(`/api/simulation/stream/${response.data.session_id}`);
        eventSourceRef.current = eventSource;
        
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (!data.heartbeat) {
            setSimulationStep(data.step);
            setSimulationUpdate(data);
          }
        };
        
        eventSource.onerror = (error) => {
          console.error('SSE error:', error);
          eventSource.close();
        };
      }
    } catch (err) {
      setError('Failed to start simulation: ' + (err.response?.data?.error || err.message));
      console.error('Simulation error:', err);
    }
  }, [atoms, residues, temperature]);

  const stopSimulation = useCallback(async () => {
    if (!simulationSessionId) return;
    
    try {
      await axios.post(`/api/simulation/stop/${simulationSessionId}`);
      
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      setSimulationRunning(false);
      setSimulationUpdate(null);
      
      // Restore original positions
      if (originalAtomsRef.current) {
        setAtoms(originalAtomsRef.current);
      }
    } catch (err) {
      console.error('Stop simulation error:', err);
    }
  }, [simulationSessionId]);

  const updateTemperature = useCallback(async (newTemp) => {
    setTemperature(newTemp);
    
    if (simulationRunning && simulationSessionId) {
      try {
        await axios.post(`/api/simulation/temperature/${simulationSessionId}`, {
          temperature: newTemp
        });
      } catch (err) {
        console.error('Temperature update error:', err);
      }
    }
  }, [simulationRunning, simulationSessionId]);

  const resetSimulation = useCallback(async () => {
    if (!simulationSessionId) return;
    
    try {
      await axios.post(`/api/simulation/reset/${simulationSessionId}`, {
        temperature: temperature
      });
    } catch (err) {
      console.error('Reset simulation error:', err);
    }
  }, [simulationSessionId, temperature]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (simulationRunning && simulationSessionId) {
        axios.post(`/api/simulation/stop/${simulationSessionId}`).catch(console.error);
      }
    };
  }, [simulationRunning, simulationSessionId]);

  return (
    <div className="app">
      <header className="header">
        <h1>🧬 Protein Structure Visualizer</h1>
      </header>

      <div className="main-content">
        <div className="sidebar">
          <div className="panel">
            <h2>Upload PDB File</h2>
            <div className="file-upload">
              <label className="file-label">
                <span>📁 Select PDB File</span>
                <input
                  type="file"
                  accept=".pdb"
                  onChange={handleFileChange}
                />
              </label>
              {file && (
                <div className="file-info">
                  <div><strong>File:</strong> {file.name}</div>
                  <div><strong>Size:</strong> {formatFileSize(file.size)}</div>
                </div>
              )}
              
              {showLargeFileWarning && (
                <div className="warning-panel">
                  <strong>⚠️ Large File Warning</strong>
                  <p>
                    This file is large and may take longer to process. 
                    Performance optimizations will be applied automatically.
                  </p>
                </div>
              )}

              {loading && (
                <div className="progress-container">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <div className="progress-text">
                    {uploadProgress < 100 ? `Uploading: ${uploadProgress}%` : 'Processing...'}
                  </div>
                </div>
              )}

              <button
                className="file-label"
                onClick={handleUpload}
                disabled={loading || !file}
                style={{ opacity: loading || !file ? 0.5 : 1 }}
              >
                {loading ? '⏳ Processing...' : '🚀 Upload & Analyze'}
              </button>
            </div>
            {error && <div className="error">{error}</div>}
          </div>

          {stats && (
            <div className="panel">
              <h2>File Statistics</h2>
              <div className="stats">
                <div className="stat-item">
                  <div className="label">File Size</div>
                  <div className="value">{stats.file_size_mb} MB</div>
                </div>
                <div className="stat-item">
                  <div className="label">Total Atoms</div>
                  <div className="value">{stats.total_atoms.toLocaleString()}</div>
                </div>
                <div className="stat-item">
                  <div className="label">Rendered Atoms</div>
                  <div className="value">{stats.rendered_atoms.toLocaleString()}</div>
                </div>
                <div className="stat-item">
                  <div className="label">Residues</div>
                  <div className="value">{stats.total_residues.toLocaleString()}</div>
                </div>
                <div className="stat-item full-width">
                  <div className="label">Processing Time</div>
                  <div className="value">{stats.processing_time}s</div>
                </div>
                {stats.was_sampled && (
                  <div className="stat-item full-width">
                    <div className="sampling-notice">
                      ℹ️ Smart sampling applied for optimal performance
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {analysis && (
            <div className="panel">
              <h2>Analysis</h2>
              <div className="stats">
                <div className="stat-item">
                  <div className="label">Avg Hydro</div>
                  <div className="value">{analysis.hydrophobicity.avg.toFixed(2)}</div>
                </div>
                <div className="stat-item">
                  <div className="label">Avg Charge</div>
                  <div className="value">{analysis.electrostatic.avg.toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}

          {atoms && (
            <div className="panel">
              <h2>Display Options</h2>
              <div className="control-group">
                <label>Color Mode</label>
                <div className="controls">
                  <button
                    className={`control-btn ${colorMode === 'element' ? 'active' : ''}`}
                    onClick={() => setColorMode('element')}
                  >
                    Element
                  </button>
                  <button
                    className={`control-btn ${colorMode === 'hydrophobicity' ? 'active' : ''}`}
                    onClick={() => setColorMode('hydrophobicity')}
                  >
                    Hydrophobicity
                  </button>
                  <button
                    className={`control-btn ${colorMode === 'charge' ? 'active' : ''}`}
                    onClick={() => setColorMode('charge')}
                  >
                    Charge
                  </button>
                </div>
              </div>
              
              {atomsBackbone && (
                <div className="control-group">
                  <label>Render Quality</label>
                  <div className="controls">
                    <button
                      className={`control-btn ${renderQuality === 'backbone' ? 'active' : ''}`}
                      onClick={() => setRenderQuality('backbone')}
                    >
                      Backbone (Fast)
                    </button>
                    <button
                      className={`control-btn ${renderQuality === 'auto' ? 'active' : ''}`}
                      onClick={() => setRenderQuality('auto')}
                    >
                      Smart (Balanced)
                    </button>
                    <button
                      className={`control-btn ${renderQuality === 'full' ? 'active' : ''}`}
                      onClick={() => setRenderQuality('full')}
                    >
                      Full (Slow)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {atoms && (
            <div className="panel">
              <h2>🧬 Molecular Dynamics Simulation</h2>
              
              <div className="control-group">
                <div className="temperature-display">
                  <span className="temperature-label">Temperature</span>
                  <span className="temperature-value">{temperature} K</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="1000"
                  value={temperature}
                  onChange={(e) => updateTemperature(Number(e.target.value))}
                  className="temperature-slider"
                  disabled={!simulationRunning}
                />
                <div className="temperature-labels">
                  <span>50K (Cold)</span>
                  <span>300K (Room)</span>
                  <span>1000K (Hot)</span>
                </div>
              </div>

              {simulationRunning && (
                <div className="simulation-stats">
                  <div className="stat-item">
                    <span className="label">Step</span>
                    <span className="value">{simulationStep}</span>
                  </div>
                </div>
              )}

              <div className="controls simulation-controls">
                {!simulationRunning ? (
                  <button
                    className="control-btn sim-start-btn"
                    onClick={startSimulation}
                  >
                    ▶ Start Simulation
                  </button>
                ) : (
                  <>
                    <button
                      className="control-btn sim-stop-btn"
                      onClick={stopSimulation}
                    >
                      ⏹ Stop
                    </button>
                    <button
                      className="control-btn sim-reset-btn"
                      onClick={resetSimulation}
                    >
                      🔄 Reset
                    </button>
                  </>
                )}
              </div>

              <div className="simulation-info">
                <p>
                  {simulationRunning 
                    ? '⚡ Simulation running - watch the molecule vibrate!'
                    : 'Start the simulation to see molecular motion based on temperature.'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="viewer-section">
          <ProteinViewer
            atoms={getRenderAtoms()}
            residues={residues}
            colorMode={colorMode}
            selectedResidue={selectedResidue}
            onResidueSelect={setSelectedResidue}
            renderMode={renderQuality}
            simulationUpdate={simulationUpdate}
          />
          
          {analysis && (
            <div className="heatmap-section">
              <div className="controls" style={{ marginBottom: '10px' }}>
                <button
                  className={`control-btn ${heatmapType === 'hydrophobicity' ? 'active' : ''}`}
                  onClick={() => setHeatmapType('hydrophobicity')}
                >
                  Hydrophobicity Heatmap
                </button>
                <button
                  className={`control-btn ${heatmapType === 'charge' ? 'active' : ''}`}
                  onClick={() => setHeatmapType('charge')}
                >
                  Electrostatic Heatmap
                </button>
              </div>
              <Heatmap
                residues={residues}
                analysis={analysis}
                heatmapType={heatmapType}
                onCellHover={setSelectedResidue}
                onCellClick={setSelectedResidue}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
