import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import SpectrumVisualizer from './SpectrumVisualizer';
import MultiTrackMixer from './MultiTrackMixer';

function Dashboard() {
  const [file, setFile] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('denoise');
  const pollingRef = useRef(null);

  useEffect(() => {
    fetchTasks();
    startPolling();
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await axios.get('/api/tasks');
      setTasks(response.data);
    } catch (error) {
      console.error('获取任务列表失败:', error);
    }
  };

  const startPolling = () => {
    pollingRef.current = setInterval(fetchTasks, 3000);
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsProcessing(true);
    try {
      await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await fetchTasks();
      setFile(null);
    } catch (error) {
      console.error('上传失败:', error);
      alert('上传失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async (taskId) => {
    try {
      await axios.delete(`/api/tasks/${taskId}`);
      await fetchTasks();
    } catch (error) {
      console.error('取消任务失败:', error);
    }
  };

  const handleDownload = async (taskId) => {
    try {
      const response = await axios.get(`/api/download/${taskId}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `processed_${taskId}.wav`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('下载失败:', error);
      alert('下载失败');
    }
  };

  const getStatusClass = (status) => {
    const statusMap = {
      'pending': 'status-pending',
      'processing': 'status-processing',
      'completed': 'status-completed',
      'failed': 'status-failed',
      'cancelled': 'status-failed'
    };
    return statusMap[status] || 'status-pending';
  };

  const getTaskTypeLabel = (taskType) => {
    return taskType === 'mix' ? '🎵 混音' : '🔇 降噪';
  };

  return (
    <div>
      <SpectrumVisualizer />

      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <button
          onClick={() => setActiveTab('denoise')}
          style={{
            background: activeTab === 'denoise' ? 'linear-gradient(90deg, #00d4ff, #7b2cbf)' : 'rgba(255,255,255,0.1)',
            padding: '10px 20px',
            fontSize: '1rem'
          }}
        >
          🔇 音频降噪
        </button>
        <button
          onClick={() => setActiveTab('mix')}
          style={{
            background: activeTab === 'mix' ? 'linear-gradient(90deg, #00d4ff, #7b2cbf)' : 'rgba(255,255,255,0.1)',
            padding: '10px 20px',
            fontSize: '1rem'
          }}
        >
          🎵 多轨混音
        </button>
      </div>

      {activeTab === 'denoise' ? (
        <div className="upload-section">
          <h2>音频降噪</h2>
          <div className="file-input">
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              disabled={isProcessing}
            />
          </div>
          <button onClick={handleUpload} disabled={!file || isProcessing}>
            {isProcessing ? '处理中...' : '上传并降噪'}
          </button>
        </div>
      ) : (
        <MultiTrackMixer onMixStart={fetchTasks} />
      )}

      <div className="task-list">
        <h2>任务列表</h2>
        {tasks.length === 0 ? (
          <p>暂无任务</p>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="task-item">
              <div>
                <p><strong>{task.filename}</strong></p>
                <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
                  {getTaskTypeLabel(task.task_type)} | 创建时间: {new Date(task.created_at).toLocaleString('zh-CN')}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span className={`task-status ${getStatusClass(task.status)}`}>
                  {task.status === 'pending' ? '等待中' :
                   task.status === 'processing' ? '处理中' :
                   task.status === 'completed' ? '已完成' :
                   task.status === 'cancelled' ? '已取消' : '失败'}
                </span>
                {task.status === 'completed' && (
                  <button
                    onClick={() => handleDownload(task.id)}
                    style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                  >
                    下载
                  </button>
                )}
                {task.status === 'pending' && (
                  <button
                    onClick={() => handleCancel(task.id)}
                    style={{ padding: '8px 16px', fontSize: '0.9rem', background: '#ef4444' }}
                  >
                    取消
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Dashboard;
