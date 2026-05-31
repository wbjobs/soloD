import React, { useState } from 'react';
import axios from 'axios';

function TrackItem({ track, index, onUpdate, onRemove }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.1)',
      borderRadius: '8px',
      padding: '15px',
      marginBottom: '10px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontWeight: 'bold' }}>音轨 {index + 1}: {track.file.name}</span>
        <button
          onClick={() => onRemove(index)}
          style={{
            background: '#ef4444',
            padding: '5px 10px',
            fontSize: '0.85rem'
          }}
        >
          移除
        </button>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>
            音量: {track.volume.toFixed(1)}x
          </label>
          <input
            type="range"
            min="0"
            max="3"
            step="0.1"
            value={track.volume}
            onChange={(e) => onUpdate(index, { volume: parseFloat(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>
            声像: {track.pan === 0 ? '居中' : track.pan < 0 ? `左${Math.abs(track.pan).toFixed(1)}` : `右${track.pan.toFixed(1)}`}
          </label>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.1"
            value={track.pan}
            onChange={(e) => onUpdate(index, { pan: parseFloat(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>
            延迟: {track.delay_ms}ms
          </label>
          <input
            type="number"
            min="0"
            max="5000"
            value={track.delay_ms}
            onChange={(e) => onUpdate(index, { delay_ms: parseInt(e.target.value) || 0 })}
            style={{
              width: '100%',
              padding: '8px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '4px',
              color: '#fff'
            }}
          />
        </div>
      </div>
    </div>
  );
}

function MultiTrackMixer({ onMixStart }) {
  const [tracks, setTracks] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [normalization, setNormalization] = useState(true);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    const newTracks = files.map(file => ({
      file,
      volume: 1.0,
      pan: 0.0,
      delay_ms: 0
    }));
    setTracks([...tracks, ...newTracks].slice(0, 16));
  };

  const updateTrack = (index, updates) => {
    const newTracks = [...tracks];
    newTracks[index] = { ...newTracks[index], ...updates };
    setTracks(newTracks);
  };

  const removeTrack = (index) => {
    setTracks(tracks.filter((_, i) => i !== index));
  };

  const handleMix = async () => {
    if (tracks.length < 2) {
      alert('至少需要2个音轨');
      return;
    }

    setIsProcessing(true);
    try {
      const formData = new FormData();
      
      tracks.forEach(track => {
        formData.append('files', track.file);
      });

      const config = {
        normalization,
        tracks: tracks.map((track, index) => ({
          track_index: index,
          volume: track.volume,
          pan: track.pan,
          delay_ms: track.delay_ms
        }))
      };
      formData.append('config', JSON.stringify(config));

      await axios.post('/api/mix', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setTracks([]);
      if (onMixStart) onMixStart();
    } catch (error) {
      console.error('混音失败:', error);
      alert('混音提交失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="upload-section">
      <h2>多轨混音</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <input
          type="file"
          accept="audio/*"
          multiple
          onChange={handleFileSelect}
          disabled={isProcessing || tracks.length >= 16}
          style={{ width: '100%', padding: '15px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
        />
        <p style={{ marginTop: '10px', fontSize: '0.9rem', color: '#94a3b8' }}>
          已选择 {tracks.length}/16 个音轨
        </p>
      </div>

      {tracks.length > 0 && (
        <>
          <div style={{ marginBottom: '20px' }}>
            {tracks.map((track, index) => (
              <TrackItem
                key={index}
                track={track}
                index={index}
                onUpdate={updateTrack}
                onRemove={removeTrack}
              />
            ))}
          </div>

          <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              id="normalization"
              checked={normalization}
              onChange={(e) => setNormalization(e.target.checked)}
              disabled={isProcessing}
            />
            <label htmlFor="normalization">启用响度标准化 (导出更均衡的音量)</label>
          </div>

          <button onClick={handleMix} disabled={isProcessing || tracks.length < 2}>
            {isProcessing ? '提交中...' : '开始混音'}
          </button>
        </>
      )}
    </div>
  );
}

export default MultiTrackMixer;
