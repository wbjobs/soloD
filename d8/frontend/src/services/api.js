import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const simulationAPI = {
  create: async (config) => {
    const response = await api.post('/api/simulations', config);
    return response.data;
  },

  list: async () => {
    const response = await api.get('/api/simulations');
    return response.data;
  },

  get: async (simId) => {
    const response = await api.get(`/api/simulations/${simId}`);
    return response.data;
  },

  getState: async (simId) => {
    const response = await api.get(`/api/simulations/${simId}/state`);
    return response.data;
  },

  step: async (simId, steps = 10, record = false) => {
    const response = await api.post(`/api/simulations/${simId}/step?steps=${steps}&record=${record}`);
    return response.data;
  },

  reset: async (simId) => {
    const response = await api.post(`/api/simulations/${simId}/reset`);
    return response.data;
  },

  delete: async (simId) => {
    const response = await api.delete(`/api/simulations/${simId}`);
    return response.data;
  },

  updateParameters: async (simId, params) => {
    const queryString = new URLSearchParams(params).toString();
    const response = await api.post(`/api/simulations/${simId}/parameters?${queryString}`);
    return response.data;
  },

  updateBoundary: async (simId, boundaryConfig) => {
    const response = await api.post(`/api/simulations/${simId}/boundary`, boundaryConfig);
    return response.data;
  },

  save: async (simId, name, description = '') => {
    const response = await api.post(
      `/api/simulations/${simId}/save?name=${encodeURIComponent(name)}&description=${encodeURIComponent(description)}`
    );
    return response.data;
  },

  exportData: async (simId) => {
    window.open(`${API_BASE_URL}/api/simulations/${simId}/export/data`, '_blank');
  },

  exportCSV: async (simId) => {
    window.open(`${API_BASE_URL}/api/simulations/${simId}/export/csv`, '_blank');
  },
};

export const savedSimulationsAPI = {
  list: async () => {
    const response = await api.get('/api/saved');
    return response.data;
  },

  get: async (savedId) => {
    const response = await api.get(`/api/saved/${savedId}`);
    return response.data;
  },

  delete: async (savedId) => {
    const response = await api.delete(`/api/saved/${savedId}`);
    return response.data;
  },
};

export const algorithmAPI = {
  getLBMInfo: async () => {
    const response = await api.get('/api/algorithms/lbm');
    return response.data;
  },
};

export default api;
