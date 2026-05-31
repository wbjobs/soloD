import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 120000
})

export const uploadDocument = (file, onUploadProgress) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    onUploadProgress
  })
}

export const updateDocument = (sourceId, file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.put(`/documents/${sourceId}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}

export const getDocuments = () => {
  return api.get('/documents')
}

export const getDocumentStats = () => {
  return api.get('/documents/stats')
}

export const deleteDocument = (sourceId) => {
  return api.delete(`/documents/${sourceId}`)
}

export const chat = (question, sessionId = 'default', chatHistory = null) => {
  return api.post('/chat', {
    question,
    session_id: sessionId,
    chat_history: chatHistory
  })
}

export const submitFeedback = (feedback) => {
  return api.post('/feedback', feedback)
}

export const getFeedbackStats = () => {
  return api.get('/feedback/stats')
}

export const setMemoryWindowSize = (size) => {
  return api.post('/memory/window-size', { window_size: size })
}

export const clearConversation = (sessionId) => {
  return api.delete(`/memory/${sessionId}`)
}

export const clearAll = () => {
  return api.delete('/clear-all')
}

export default api
