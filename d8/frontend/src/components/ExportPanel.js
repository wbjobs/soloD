import React, { useState } from 'react';
import { simulationAPI } from '../services/api';

const ExportPanel = ({ simulationId }) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportData = async () => {
    if (!simulationId) return;
    setIsExporting(true);
    try {
      await simulationAPI.exportData(simulationId);
    } catch (error) {
      console.error('Export failed:', error);
      alert('导出失败: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    if (!simulationId) return;
    setIsExporting(true);
    try {
      await simulationAPI.exportCSV(simulationId);
    } catch (error) {
      console.error('Export failed:', error);
      alert('导出失败: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  const containerStyle = {
    padding: '15px',
    backgroundColor: '#2d2d44',
    borderRadius: '8px',
    color: '#fff',
    marginBottom: '15px'
  };

  const buttonStyle = {
    flex: 1,
    padding: '10px 15px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px'
  };

  return (
    <div style={containerStyle}>
      <h4 style={{ marginBottom: '15px', fontSize: '15px' }}>数据导出</h4>
      
      <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
        <button
          onClick={handleExportData}
          disabled={isExporting || !simulationId}
          style={{
            ...buttonStyle,
            backgroundColor: '#4a90d9',
            color: '#fff',
            opacity: isExporting ? 0.7 : 1
          }}
        >
          <span>📄</span> 导出 JSON 数据
        </button>
        
        <button
          onClick={handleExportCSV}
          disabled={isExporting || !simulationId}
          style={{
            ...buttonStyle,
            backgroundColor: '#5ab96c',
            color: '#fff',
            opacity: isExporting ? 0.7 : 1
          }}
        >
          <span>📊</span> 导出 CSV 表格
        </button>
      </div>
      
      <p style={{
        marginTop: '12px',
        fontSize: '11px',
        color: '#888',
        textAlign: 'center'
      }}>
        包含速度场、压力场、涡量等完整数据
      </p>
    </div>
  );
};

export default ExportPanel;
