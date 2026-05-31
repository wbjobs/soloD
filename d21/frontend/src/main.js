import WeatherScene from './scene.js';
import { weatherWS } from './websocket.js';

class WeatherApp {
  constructor() {
    this.weatherData = [];
    this.historyData = [];
    this.isPlaybackMode = false;
    this.isPlaying = false;
    this.playbackIndex = 0;
    this.playbackInterval = null;
    this.init();
  }

  init() {
    const container = document.getElementById('canvas-container');
    this.scene = new WeatherScene(container);
    
    this.scene.onParticleClick = (stationId) => this.showParticleDetail(stationId);
    
    this.setupWebSocket();
    this.setupDetailPanel();
    this.setupTimelineControls();
  }

  setupWebSocket() {
    weatherWS.addListener((data) => this.handleWebSocketMessage(data));
    weatherWS.connect();
  }

  handleWebSocketMessage(data) {
    const statusIndicator = document.getElementById('status-indicator');
    
    if (data.type === 'connected') {
      statusIndicator.classList.remove('status-disconnected');
      statusIndicator.classList.add('status-connected');
    } else if (data.type === 'disconnected') {
      statusIndicator.classList.remove('status-connected');
      statusIndicator.classList.add('status-disconnected');
    } else if (data.type === 'weather_data') {
      this.weatherData = data.data;
      this.scene.updateWeatherData(data.data);
      
      if (!this.isPlaybackMode) {
        this.updateStationInfo(data.data);
      }
    }
  }

  updateStationInfo(stations) {
    const container = document.getElementById('stations-container');
    container.innerHTML = '';
    
    stations.forEach(station => {
      const stationDiv = document.createElement('div');
      stationDiv.className = 'station-info';
      stationDiv.innerHTML = `
        <h3>${station.name}</h3>
        <p>🌡️ 温度: <strong>${station.temperature}°C</strong></p>
        <p>💨 风速: <strong>${station.wind_speed} m/s</strong></p>
        <p>🧭 风向: <strong>${station.wind_direction}°</strong></p>
        <p>📊 气压: <strong>${station.pressure} hPa</strong></p>
      `;
      container.appendChild(stationDiv);
    });
  }

  showParticleDetail(stationId) {
    const station = this.weatherData.find(s => s.station_id === stationId);
    if (!station) return;
    
    const detailPanel = document.getElementById('particle-detail');
    const detailContent = document.getElementById('detail-content');
    
    detailContent.innerHTML = `
      <p><strong>📍 气象站:</strong> ${station.name}</p>
      <p><strong>🌐 坐标:</strong> ${station.lat}°N, ${station.lon}°E</p>
      <p><strong>🌡️ 温度:</strong> ${station.temperature}°C</p>
      <p><strong>💨 风速:</strong> ${station.wind_speed} m/s</p>
      <p><strong>🧭 风向:</strong> ${station.wind_direction}°</p>
      <p><strong>📊 气压:</strong> ${station.pressure} hPa</p>
      <p><em>${this.isPlaybackMode ? '【回放模式】' : '【实时模式】'} 点击的粒子属于该气象站</em></p>
    `;
    
    detailPanel.style.display = 'block';
  }

  setupDetailPanel() {
    const closeBtn = document.getElementById('close-detail');
    const detailPanel = document.getElementById('particle-detail');
    
    closeBtn.addEventListener('click', () => {
      detailPanel.style.display = 'none';
    });
    
    detailPanel.addEventListener('click', (e) => {
      if (e.target === detailPanel) {
        detailPanel.style.display = 'none';
      }
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        detailPanel.style.display = 'none';
      }
    });
  }

  setupTimelineControls() {
    const btnLoad = document.getElementById('btn-load');
    const btnToggle = document.getElementById('btn-toggle');
    const slider = document.getElementById('timeline-slider');
    
    btnLoad.addEventListener('click', () => this.loadHistoryData());
    btnToggle.addEventListener('click', () => this.togglePlayback());
    
    slider.addEventListener('input', (e) => {
      if (this.historyData.length > 0) {
        this.playbackIndex = parseInt(e.target.value);
        this.updatePlaybackFrame();
      }
    });
  }

  async loadHistoryData() {
    const btnLoad = document.getElementById('btn-load');
    const btnToggle = document.getElementById('btn-toggle');
    const slider = document.getElementById('timeline-slider');
    
    btnLoad.disabled = true;
    btnLoad.textContent = '加载中...';
    
    try {
      const response = await fetch('/api/history');
      const result = await response.json();
      
      this.historyData = result.history || [];
      
      document.getElementById('frame-count').textContent = this.historyData.length;
      
      if (this.historyData.length > 0) {
        slider.max = this.historyData.length - 1;
        slider.disabled = false;
        btnToggle.disabled = false;
        
        this.scene.setPlaybackData(this.historyData);
        this.updateTimeDisplay();
      }
      
      btnLoad.textContent = '重新加载';
    } catch (error) {
      console.error('加载历史数据失败:', error);
      btnLoad.textContent = '加载失败';
    }
    
    btnLoad.disabled = false;
  }

  togglePlayback() {
    const btnToggle = document.getElementById('btn-toggle');
    const slider = document.getElementById('timeline-slider');
    const modeBadge = document.getElementById('mode-badge');
    
    if (!this.isPlaybackMode) {
      this.isPlaybackMode = true;
      this.scene.setPlaybackMode(true);
      this.isPlaying = true;
      btnToggle.textContent = '暂停回放';
      modeBadge.textContent = '回放模式';
      modeBadge.classList.remove('mode-live');
      modeBadge.classList.add('mode-playback');
      slider.disabled = false;
      
      this.startPlayback();
    } else {
      if (this.isPlaying) {
        this.isPlaying = false;
        this.stopPlayback();
        btnToggle.textContent = '继续回放';
      } else {
        this.isPlaying = true;
        btnToggle.textContent = '暂停回放';
        this.startPlayback();
      }
    }
    
    if (this.playbackIndex >= this.historyData.length - 1) {
      this.playbackIndex = 0;
      slider.value = 0;
      this.updatePlaybackFrame();
    }
  }

  startPlayback() {
    const slider = document.getElementById('timeline-slider');
    const btnToggle = document.getElementById('btn-toggle');
    const modeBadge = document.getElementById('mode-badge');
    
    this.playbackInterval = setInterval(() => {
      if (this.playbackIndex >= this.historyData.length - 1) {
        this.stopPlayback();
        this.isPlaying = false;
        this.isPlaybackMode = false;
        this.scene.setPlaybackMode(false);
        btnToggle.textContent = '开始回放';
        btnToggle.disabled = true;
        slider.disabled = true;
        modeBadge.textContent = '实时模式';
        modeBadge.classList.remove('mode-playback');
        modeBadge.classList.add('mode-live');
        return;
      }
      
      this.playbackIndex++;
      slider.value = this.playbackIndex;
      this.updatePlaybackFrame();
    }, 40);
  }

  stopPlayback() {
    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
      this.playbackInterval = null;
    }
  }

  updatePlaybackFrame() {
    const slider = document.getElementById('timeline-slider');
    const progressFill = document.getElementById('progress-fill');
    
    this.scene.setPlaybackIndex(this.playbackIndex);
    
    const frameData = this.historyData[this.playbackIndex];
    if (frameData && frameData.data) {
      this.weatherData = frameData.data;
      this.updateStationInfo(frameData.data);
    }
    
    const progress = (this.playbackIndex / (this.historyData.length - 1)) * 100;
    progressFill.style.width = `${progress}%`;
    
    this.updateTimeDisplay();
  }

  updateTimeDisplay() {
    const timeDisplay = document.getElementById('time-display');
    
    const currentSeconds = Math.floor(this.playbackIndex * 0.2);
    const totalSeconds = Math.floor((this.historyData.length - 1) * 0.2);
    
    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };
    
    timeDisplay.textContent = `${formatTime(currentSeconds)} / ${formatTime(totalSeconds)}`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new WeatherApp();
});
