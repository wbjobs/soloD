import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8080/api'
})

export const fetchGraph = async (platform, username, depth = 2) => {
  try {
    const response = await api.post('/graph/fetch', {
      platform,
      username,
      depth
    })
    return response.data
  } catch (error) {
    console.error('Error fetching graph:', error)
    throw error
  }
}

export const checkHealth = async () => {
  try {
    const response = await api.get('/health')
    return response.data
  } catch (error) {
    console.error('Health check failed:', error)
    throw error
  }
}

export default {
  fetchGraph,
  checkHealth
}
