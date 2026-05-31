import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

export const checkBackendHealth = async () => {
  const response = await api.get('/health')
  return response.data
}

export const sendInspection = async (imageBlob, frontendResult, options = {}) => {
  const formData = new FormData()
  
  if (imageBlob instanceof Blob) {
    formData.append('image', imageBlob, 'capture.jpg')
  } else {
    const blob = await (await fetch(imageBlob)).blob()
    formData.append('image', blob, 'capture.jpg')
  }
  
  formData.append('frontend_result', frontendResult)
  if (options.workstation) formData.append('workstation', options.workstation)
  if (options.position_x !== undefined) formData.append('position_x', options.position_x)
  if (options.position_y !== undefined) formData.append('position_y', options.position_y)
  
  const response = await api.post('/inspect', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
  return response.data
}

export const getInspections = async () => {
  const response = await api.get('/inspections')
  return response.data
}

export default api
