import React, { useState, useEffect, useRef, useCallback } from 'react';

let wasmModule = null;
let wasmInitPromise = null;

async function loadWasm() {
  if (wasmModule) {
    return wasmModule;
  }
  if (wasmInitPromise) {
    return wasmInitPromise;
  }
  
  wasmInitPromise = (async () => {
    try {
      const wasm = await import('wasm-audio');
      
      if (wasm.default && typeof wasm.default === 'function') {
        await wasm.default();
      }
      
      if (wasm.init && typeof wasm.init === 'function') {
        await wasm.init();
      }
      
      wasmModule = wasm;
      return wasm;
    } catch (err) {
      console.error('WASM加载失败:', err);
      wasmInitPromise = null;
      throw err;
    }
  })();
  
  return wasmInitPromise;
}

function SpectrumVisualizer() {
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const processorRef = useRef(null);
  const animationRef = useRef(null);
  const sourceRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [wasmLoaded, setWasmLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadWasm()
      .then(() => {
        setWasmLoaded(true);
        setError(null);
      })
      .catch(err => {
        console.error('WASM加载失败:', err);
        setError('WASM模块加载失败，请刷新页面重试');
      });
  }, []);

  const initAudio = useCallback(async () => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('您的浏览器不支持Web Audio API');
      }
      
      audioContextRef.current = new AudioContextClass();
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;

      const wasm = await loadWasm();
      processorRef.current = new wasm.AudioProcessor(2048);
    } else if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  }, []);

  const startRecording = async () => {
    setError(null);
    
    try {
      await initAudio();
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } 
      });
      
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);
      setIsRecording(true);
      visualize();
    } catch (error) {
      console.error('获取麦克风权限失败:', error);
      setError('无法获取麦克风权限，请允许麦克风访问并确保浏览器支持');
    }
  };

  const stopRecording = () => {
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current.mediaStream.getTracks().forEach(track => track.stop());
      sourceRef.current = null;
    }
    setIsRecording(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  const drawVisualization = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current || !processorRef.current || !wasmModule) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    const draw = () => {
      if (!isRecording) return;
      
      animationRef.current = requestAnimationFrame(draw);
      analyserRef.current.getFloatTimeDomainData(dataArray);

      try {
        const spectrum = processorRef.current.compute_spectrum(dataArray);
        const normalized = wasmModule.normalize_spectrum(spectrum, -80, 0);

        ctx.fillStyle = 'rgb(0, 0, 0)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / normalized.length) * 2.5;
        let x = 0;

        for (let i = 0; i < normalized.length; i++) {
          const barHeight = normalized[i] * canvas.height;

          const hue = (i / normalized.length) * 360;
          ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
          ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

          x += barWidth + 1;
        }
      } catch (e) {
        console.error('频谱计算错误:', e);
      }
    };

    draw();
  }, [isRecording]);

  const visualize = useCallback(() => {
    if (wasmModule) {
      drawVisualization();
    } else {
      loadWasm().then(() => {
        drawVisualization();
      });
    }
  }, [drawVisualization]);

  useEffect(() => {
    return () => {
      stopRecording();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <div className="spectrum-visualizer">
      <h2>实时频谱可视化</h2>
      <canvas ref={canvasRef} width={800} height={200} />
      {error && (
        <p style={{ color: '#ef4444', margin: '10px 0', fontSize: '0.9rem' }}>
          {error}
        </p>
      )}
      <div className="controls">
        {!isRecording ? (
          <button onClick={startRecording} disabled={!wasmLoaded}>
            {wasmLoaded ? '开始录音' : '加载中...'}
          </button>
        ) : (
          <button onClick={stopRecording}>停止录音</button>
        )}
      </div>
    </div>
  );
}

export default SpectrumVisualizer;
