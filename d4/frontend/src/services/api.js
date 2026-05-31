import axios from 'axios';

const API_BASE_URL = '';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

class WebSocketManager {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.isConnected = false;
  }

  connect() {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
      const wsUrl = `${protocol}//${host}/ws/realtime`;
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notify('connected', {});
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.notify(message.type, message.data);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.isConnected = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (e) {
      console.error('Failed to create WebSocket:', e);
      this.scheduleReconnect();
    }
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connect(), delay);
    } else {
      console.error('Max reconnect attempts reached');
    }
  }

  subscribe(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);
    
    if (!this.ws) {
      this.connect();
    }
    
    return () => this.unsubscribe(type, callback);
  }

  unsubscribe(type, callback) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).delete(callback);
    }
  }

  notify(type, data) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          console.error('Listener error:', e);
        }
      });
    }
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
  }
}

export const wsManager = new WebSocketManager();

export const analyticsApi = {
  getRealtimeStats: () => api.get('/api/stats/realtime'),
  getHourlyTrend: (hours = 24) => api.get(`/api/stats/hourly?hours=${hours}`),
  getDailyPvUv: (days = 7) => api.get(`/api/stats/daily?days=${days}`),
  getTopPages: (limit = 10) => api.get(`/api/stats/top-pages?limit=${limit}`),
  getCountries: () => api.get('/api/stats/countries'),
  getDevices: () => api.get('/api/stats/devices'),
  getFunnelAnalysis: (steps) => api.post('/api/analysis/funnel', steps),
  getRetentionAnalysis: (days = 7) => api.get(`/api/analysis/retention?days=${days}`),
  getUserPaths: (limit = 1000) => api.get(`/api/analysis/user-paths?limit=${limit}`),
  executeQuery: (sql) => api.post('/api/query', { sql }),
  sendEvent: (event) => api.post('/api/events', [event]),
  sendEvents: (events) => api.post('/api/events', events),
  getAlertRules: () => api.get('/api/alerts/rules'),
  createAlertRule: (rule) => api.post('/api/alerts/rules', rule),
  deleteAlertRule: (ruleId) => api.delete(`/api/alerts/rules/${ruleId}`),
  checkAnomalies: () => api.get('/api/alerts/check'),
  getAlertHistory: (limit = 100) => api.get(`/api/alerts/history?limit=${limit}`),
  generateUserTags: () => api.post('/api/user-profiles/generate-tags'),
  getUserProfile: (userId) => api.get(`/api/user-profiles/${userId}`),
  searchUsers: (filters, limit = 100) => api.post('/api/user-profiles/search', filters, { params: { limit } }),
  getTagSummary: () => api.get('/api/user-profiles/tags/summary'),
  exportEvents: (startDate, endDate, limit = 10000) => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    params.append('limit', limit);
    window.open(`/api/export/events?${params.toString()}`, '_blank');
  },
  exportUserProfiles: (limit = 10000) => {
    window.open(`/api/export/user-profiles?limit=${limit}`, '_blank');
  },
};

export default api;
