import { useState, useRef, useEffect, useCallback } from 'react';
import Tesseract from 'tesseract.js';
import {
  loadImageWithOrientation,
  getCanvasCoordinates,
} from './utils/imageUtils';
import { WorkerPool, OCRTask } from './utils/workerPool';
import './App.css';

interface Selection {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface OCRResult {
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>;
}

interface BatchTask extends OCRTask {
  thumbnail?: string;
}

function App() {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [statusType, setStatusType] = useState<'info' | 'success' | 'error'>('info');
  const [canvasDisplaySize, setCanvasDisplaySize] = useState<{ width: number; height: number } | null>(null);

  const [batchTasks, setBatchTasks] = useState<BatchTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<BatchTask | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const workerPoolRef = useRef<WorkerPool | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    workerPoolRef.current = new WorkerPool(
      new URL('./workers/ocr.worker.ts', import.meta.url).href,
      4,
      (tasks) => {
        setBatchTasks((prev) => {
          const updated = [...prev];
          tasks.forEach((t) => {
            const index = updated.findIndex((u) => u.id === t.id);
            if (index !== -1) {
              updated[index] = { ...updated[index], ...t };
            }
          });
          return updated;
        });
      }
    );

    return () => {
      workerPoolRef.current?.terminate();
    };
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsLoading(true);
      showStatus('正在处理图片...', 'info');
      try {
        const img = await loadImageWithOrientation(file);
        setImage(img);
        setOcrResult(null);
        setSelection(null);
        showStatus('图片加载成功，现在可以在图片上框选文字区域', 'success');
      } catch (error) {
        console.error('Image load error:', error);
        showStatus('图片加载失败，请重试', 'error');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleBatchFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newTasks: BatchTask[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      try {
        const img = await loadImageWithOrientation(file);

        const canvas = document.createElement('canvas');
        const maxSize = 800;
        let width = img.width;
        let height = img.height;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const imageData = ctx?.getImageData(0, 0, width, height);

        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 100;
        thumbCanvas.height = 100;
        const thumbCtx = thumbCanvas.getContext('2d');
        if (thumbCtx) {
          thumbCtx.drawImage(img, 0, 0, 100, 100);
        }

        if (imageData) {
          const task: BatchTask = {
            id: `task-${Date.now()}-${i}`,
            imageData,
            fileName: file.name,
            status: 'pending',
            progress: 0,
            statusText: '等待中',
            thumbnail: thumbCanvas.toDataURL(),
          };
          newTasks.push(task);
        }
      } catch (error) {
        console.error('Error processing file:', file.name, error);
      }
    }

    setBatchTasks((prev) => [...prev, ...newTasks]);

    if (newTasks.length > 0 && workerPoolRef.current) {
      workerPoolRef.current.addTasks(newTasks);
    }
  };

  const handleBatchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleBatchFiles(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleBatchFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const showStatus = (message: string, type: 'info' | 'success' | 'error') => {
    setStatus(message);
    setStatusType(type);
  };

  const handleStart = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!image) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const coords = getCanvasCoordinates(e, canvas);
    setIsDrawing(true);
    setSelection({
      startX: coords.x,
      startY: coords.y,
      endX: coords.x,
      endY: coords.y,
    });
  };

  const handleMove = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing || !image) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const coords = getCanvasCoordinates(e, canvas);
    setSelection((prev) =>
      prev
        ? {
            ...prev,
            endX: coords.x,
            endY: coords.y,
          }
        : null
    );
  };

  const handleEnd = () => {
    setIsDrawing(false);
  };

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const container = containerRef.current;
    const maxWidth = container ? container.clientWidth - 40 : 800;

    let displayWidth = image.width;
    let displayHeight = image.height;

    if (image.width > maxWidth) {
      const ratio = maxWidth / image.width;
      displayWidth = maxWidth;
      displayHeight = image.height * ratio;
    }

    setCanvasDisplaySize({ width: displayWidth, height: displayHeight });

    const dpr = window.devicePixelRatio || 1;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    ctx.drawImage(image, 0, 0, displayWidth, displayHeight);

    if (selection) {
      const x = Math.min(selection.startX, selection.endX);
      const y = Math.min(selection.startY, selection.endY);
      const width = Math.abs(selection.endX - selection.startX);
      const height = Math.abs(selection.endY - selection.startY);

      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x, y, width, height);

      ctx.fillStyle = 'rgba(255, 68, 68, 0.1)';
      ctx.fillRect(x, y, width, height);

      ctx.setLineDash([]);
    }
  }, [image, selection]);

  useEffect(() => {
    if (image && mode === 'single') {
      drawCanvas();
    }
  }, [drawCanvas, image, mode]);

  useEffect(() => {
    const handleResize = () => {
      if (image && mode === 'single') {
        drawCanvas();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawCanvas, image, mode]);

  const performOCR = async () => {
    if (!image) return;

    setIsLoading(true);
    setOcrResult(null);
    showStatus('正在加载OCR引擎并识别文字，请稍候...', 'info');

    try {
      let targetImage: string | HTMLImageElement | HTMLCanvasElement = image;

      if (selection && canvasDisplaySize) {
        const scaleX = image.width / canvasDisplaySize.width;
        const scaleY = image.height / canvasDisplaySize.height;

        const x = Math.min(selection.startX, selection.endX) * scaleX;
        const y = Math.min(selection.startY, selection.endY) * scaleY;
        const width = Math.abs(selection.endX - selection.startX) * scaleX;
        const height = Math.abs(selection.endY - selection.startY) * scaleY;

        if (width > 10 && height > 10) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = width;
          tempCanvas.height = height;
          const tempCtx = tempCanvas.getContext('2d');
          if (tempCtx) {
            tempCtx.drawImage(image, x, y, width, height, 0, 0, width, height);
            targetImage = tempCanvas;
          }
        }
      }

      const result = await Tesseract.recognize(targetImage, 'eng+chi_sim', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            showStatus(`正在识别: ${Math.round(m.progress * 100)}%`, 'info');
          } else if (m.status === 'loading tesseract core') {
            showStatus('正在加载Tesseract核心...', 'info');
          } else if (m.status === 'initializing tesseract') {
            showStatus('正在初始化OCR引擎...', 'info');
          } else if (m.status === 'loading language traineddata') {
            showStatus('正在加载语言包...', 'info');
          }
        },
      });

      const words = result.data.words.map((word) => ({
        text: word.text,
        confidence: word.confidence,
        bbox: word.bbox,
      }));

      setOcrResult({
        text: result.data.text,
        confidence: result.data.confidence,
        words,
      });

      showStatus('识别完成！', 'success');
    } catch (error) {
      console.error('OCR Error:', error);
      showStatus('识别失败，请重试', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const clearSelection = () => {
    setSelection(null);
  };

  const clearAll = () => {
    setImage(null);
    setSelection(null);
    setOcrResult(null);
    setStatus('');
    setCanvasDisplaySize(null);
  };

  const cancelAllTasks = () => {
    workerPoolRef.current?.cancelAll();
  };

  const clearCompletedTasks = () => {
    setBatchTasks((prev) =>
      prev.filter((t) => t.status === 'pending' || t.status === 'processing')
    );
  };

  const exportAllResults = () => {
    const completedTasks = batchTasks.filter((t) => t.status === 'completed' && t.result);
    if (completedTasks.length === 0) return;

    const results = completedTasks.map((t) => ({
      fileName: t.fileName,
      text: t.result?.text,
      confidence: t.result?.confidence,
      words: t.result?.words,
    }));

    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-ocr-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToJSON = () => {
    if (!ocrResult) return;

    const data = {
      text: ocrResult.text,
      confidence: ocrResult.confidence,
      words: ocrResult.words,
      exportTime: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-result-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToCSV = () => {
    if (!ocrResult) return;

    const headers = ['文字', '置信度', 'x0', 'y0', 'x1', 'y1'];
    const rows = ocrResult.words.map((word) => [
      `"${word.text}"`,
      word.confidence.toFixed(2),
      word.bbox.x0.toFixed(0),
      word.bbox.y0.toFixed(0),
      word.bbox.x1.toFixed(0),
      word.bbox.y1.toFixed(0),
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-result-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const overallProgress =
    batchTasks.length > 0
      ? batchTasks.reduce((acc, t) => acc + t.progress, 0) / batchTasks.length
      : 0;

  const pendingCount = batchTasks.filter((t) => t.status === 'pending').length;
  const processingCount = batchTasks.filter((t) => t.status === 'processing').length;
  const completedCount = batchTasks.filter((t) => t.status === 'completed').length;
  const errorCount = batchTasks.filter((t) => t.status === 'error').length;

  return (
    <div className="app">
      <header className="app-header">
        <h1>📷 OCR 文字识别</h1>
        <p>在浏览器本地完成文字识别，无需后端API</p>
      </header>

      <div className="mode-toggle">
        <button
          className={`mode-btn ${mode === 'single' ? 'active' : ''}`}
          onClick={() => setMode('single')}
        >
          🖼️ 单张处理
        </button>
        <button
          className={`mode-btn ${mode === 'batch' ? 'active' : ''}`}
          onClick={() => setMode('batch')}
        >
          📦 批量处理
        </button>
      </div>

      <div className="main-content">
        {mode === 'single' ? (
          <>
            <div className="card" ref={containerRef}>
              <h2>图片上传与区域选择</h2>
              <div className="upload-section">
                <label className="file-input-label">
                  <input type="file" accept="image/*" onChange={handleImageUpload} />
                  选择图片
                </label>
              </div>

              {image && (
                <>
                  <div className="canvas-container">
                    <canvas
                      ref={canvasRef}
                      onMouseDown={handleStart}
                      onMouseMove={handleMove}
                      onMouseUp={handleEnd}
                      onMouseLeave={handleEnd}
                      onTouchStart={handleStart}
                      onTouchMove={handleMove}
                      onTouchEnd={handleEnd}
                    />
                  </div>

                  <div className="controls">
                    <button className="btn btn-primary" onClick={performOCR} disabled={isLoading}>
                      {isLoading ? '识别中...' : '开始识别'}
                    </button>
                    <button className="btn btn-secondary" onClick={clearSelection}>
                      清除选区
                    </button>
                    <button className="btn btn-secondary" onClick={clearAll}>
                      清除全部
                    </button>
                  </div>
                </>
              )}

              {status && <div className={`status-message ${statusType}`}>{status}</div>}
            </div>

            <div className="card">
              <h2>识别结果</h2>

              {isLoading && (
                <div className="loading">
                  <div className="spinner"></div>
                  <p>{status}</p>
                </div>
              )}

              {!isLoading && !ocrResult && (
                <div className="info-text">
                  <p>使用说明：</p>
                  <ol>
                    <li>点击"选择图片"上传图片</li>
                    <li>在图片上拖动鼠标框选需要识别的区域（可选）</li>
                    <li>点击"开始识别"进行OCR识别</li>
                    <li>识别完成后可导出为JSON或CSV</li>
                  </ol>
                </div>
              )}

              {ocrResult && (
                <>
                  <p className="info-text">
                    整体置信度: {(ocrResult.confidence * 100).toFixed(1)}%
                  </p>
                  <div className="text-result">{ocrResult.text}</div>

                  <div className="export-buttons">
                    <button className="btn btn-success" onClick={exportToJSON}>
                      导出 JSON
                    </button>
                    <button className="btn btn-success" onClick={exportToCSV}>
                      导出 CSV
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="card">
              <h2>批量上传图片</h2>

              <div
                className={`batch-upload-area ${isDragging ? 'dragover' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="batch-upload-icon">📁</div>
                <p>点击或拖拽图片到此处上传</p>
                <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '5px' }}>
                  支持多图上传，自动并行处理
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleBatchUpload}
                  style={{ display: 'none' }}
                />
              </div>

              {batchTasks.length > 0 && (
                <>
                  <div className="overall-progress">
                    <div className="overall-progress-stats">
                      <span>总体进度</span>
                      <span>{Math.round(overallProgress * 100)}%</span>
                    </div>
                    <div className="overall-progress-bar">
                      <div
                        className="overall-progress-fill"
                        style={{ width: `${overallProgress * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="batch-stats-bar">
                    <div className="batch-stat pending">
                      <span className="batch-stat-icon">⏳</span>
                      <span>等待中: {pendingCount}</span>
                    </div>
                    <div className="batch-stat processing">
                      <span className="batch-stat-icon">⚙️</span>
                      <span>处理中: {processingCount}</span>
                    </div>
                    <div className="batch-stat completed">
                      <span className="batch-stat-icon">✅</span>
                      <span>已完成: {completedCount}</span>
                    </div>
                    <div className="batch-stat error">
                      <span className="batch-stat-icon">❌</span>
                      <span>失败: {errorCount}</span>
                    </div>
                  </div>

                  <div className="task-list">
                    {batchTasks.map((task) => (
                      <div key={task.id} className="task-item">
                        {task.thumbnail ? (
                          <img src={task.thumbnail} alt="" className="task-thumbnail" />
                        ) : (
                          <div className="thumbnail-placeholder">🖼️</div>
                        )}
                        <div className="task-info">
                          <div className="task-filename">{task.fileName}</div>
                          <div className={`task-status ${task.status}`}>
                            {task.statusText}
                          </div>
                          {(task.status === 'processing' || task.status === 'pending') && (
                            <div className="progress-bar">
                              <div
                                className="progress-fill"
                                style={{ width: `${task.progress * 100}%` }}
                              />
                            </div>
                          )}
                          {task.result && (
                            <>
                              <div className="task-confidence">
                                置信度: {(task.result.confidence * 100).toFixed(1)}%
                              </div>
                              <div className="task-result-preview">
                                {task.result.text}
                              </div>
                            </>
                          )}
                        </div>
                        {task.result && (
                          <button
                            className="view-result-btn"
                            onClick={() => setSelectedTask(task)}
                          >
                            查看
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="batch-controls">
                    <button
                      className="btn btn-primary"
                      onClick={exportAllResults}
                      disabled={completedCount === 0}
                    >
                      导出全部结果
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={cancelAllTasks}
                      disabled={processingCount === 0 && pendingCount === 0}
                    >
                      取消全部
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={clearCompletedTasks}
                      disabled={completedCount === 0 && errorCount === 0}
                    >
                      清除已完成
                    </button>
                  </div>
                </>
              )}

              {batchTasks.length === 0 && (
                <div className="info-text" style={{ marginTop: '20px', textAlign: 'center' }}>
                  <p>批量处理模式支持：</p>
                  <ul style={{ textAlign: 'left', marginTop: '10px', paddingLeft: '20px' }}>
                    <li>同时上传多张图片</li>
                    <li>Web Worker 多线程并行处理</li>
                    <li>实时显示每个任务的处理进度</li>
                    <li>完成后一键导出所有结果</li>
                  </ul>
                </div>
              )}
            </div>

            <div className="card">
              <h2>结果预览</h2>
              {selectedTask?.result ? (
                <>
                  <p className="info-text">
                    <strong>{selectedTask.fileName}</strong>
                    <br />
                    置信度: {(selectedTask.result.confidence * 100).toFixed(1)}%
                  </p>
                  <div className="text-result">{selectedTask.result.text}</div>
                  <div className="export-buttons">
                    <button
                      className="btn btn-success"
                      onClick={() => {
                        const data = {
                          fileName: selectedTask.fileName,
                          text: selectedTask.result?.text,
                          confidence: selectedTask.result?.confidence,
                          words: selectedTask.result?.words,
                          exportTime: new Date().toISOString(),
                        };
                        const blob = new Blob([JSON.stringify(data, null, 2)], {
                          type: 'application/json',
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `ocr-${selectedTask.fileName}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      导出 JSON
                    </button>
                  </div>
                </>
              ) : (
                <div className="info-text" style={{ textAlign: 'center', padding: '40px' }}>
                  <p>点击任务列表中的"查看"按钮</p>
                  <p>查看识别结果详情</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {selectedTask?.result && (
        <div
          className="result-modal-overlay"
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="result-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="result-modal-header">
              <h3>{selectedTask.fileName}</h3>
              <button
                className="close-modal-btn"
                onClick={() => setSelectedTask(null)}
              >
                ×
              </button>
            </div>
            <div className="result-modal-body">
              <p style={{ marginBottom: '15px', color: '#10b981', fontWeight: '500' }}>
                置信度: {(selectedTask.result.confidence * 100).toFixed(1)}%
              </p>
              <div className="result-modal-text">
                {selectedTask.result.text}
              </div>
            </div>
            <div className="result-modal-footer">
              <button
                className="btn btn-success"
                onClick={() => {
                  const data = {
                    fileName: selectedTask.fileName,
                    text: selectedTask.result?.text,
                    confidence: selectedTask.result?.confidence,
                    words: selectedTask.result?.words,
                    exportTime: new Date().toISOString(),
                  };
                  const blob = new Blob([JSON.stringify(data, null, 2)], {
                    type: 'application/json',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `ocr-${selectedTask.fileName}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                导出 JSON
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setSelectedTask(null)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
