import { useState, useEffect, useRef } from 'preact/hooks'

function App() {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewContent, setPreviewContent] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [successMessage, setSuccessMessage] = useState(null)
  const [isDuplicateFile, setIsDuplicateFile] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  
  const fileInputRef = useRef(null)
  const eventSourceRef = useRef(null)

  useEffect(() => {
    fetchFiles()
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/files')
      const data = await response.json()
      if (data.success) {
        setFiles(data.files)
      }
    } catch (error) {
      console.error('Failed to fetch files:', error)
    }
  }

  const handleFileUpload = async (file) => {
    if (!file) return

    setUploading(true)
    setUploadProgress(0)
    setErrorMessage(null)
    setSuccessMessage(null)
    setIsDuplicateFile(false)

    const uploadId = Date.now().toString()

    try {
      const eventSource = new EventSource(`/api/progress/${uploadId}`)
      eventSourceRef.current = eventSource

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.progress !== undefined) {
          setUploadProgress(data.progress)
        }
        if (data.completed) {
          eventSource.close()
          setIsDuplicateFile(!!data.duplicate)
          if (data.duplicate) {
            setSuccessMessage(`📋 文件已存在，无需重复上传！CID: ${data.cid}`)
          } else {
            setSuccessMessage(`✅ 文件上传成功！CID: ${data.cid}`)
          }
          fetchFiles()
          setUploading(false)
          setUploadProgress(0)
        }
        if (data.error) {
          eventSource.close()
          setIsDuplicateFile(false)
          setErrorMessage(`上传失败: ${data.error}`)
          setUploading(false)
          setUploadProgress(0)
        }
      }

      eventSource.onerror = () => {
        eventSource.close()
      }

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/upload?uploadId=${uploadId}`, {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.success) {
        if (!eventSource.readyState || eventSource.readyState === EventSource.CLOSED) {
          setIsDuplicateFile(!!data.duplicate)
          if (data.duplicate) {
            setSuccessMessage(`📋 ${data.message}！CID: ${data.cid}`)
          } else {
            setSuccessMessage(`✅ 文件上传成功！CID: ${data.cid}`)
          }
          fetchFiles()
          setUploading(false)
          setUploadProgress(0)
        }
      } else {
        setIsDuplicateFile(false)
        setErrorMessage(data.error || '上传失败')
        setUploading(false)
        setUploadProgress(0)
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
        }
      }
    } catch (error) {
      setIsDuplicateFile(false)
      setErrorMessage('上传失败: ' + error.message)
      setUploading(false)
      setUploadProgress(0)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleFileClick = async (file) => {
    if (!file || !file.cid) {
      setErrorMessage('无效的文件信息')
      return
    }
    
    setSelectedFile(file)
    setShowPreview(true)
    setPreviewContent(null)

    try {
      const response = await fetch(`/api/file/${encodeURIComponent(file.cid)}`)
      
      if (response.ok) {
        const content = await response.text()
        setPreviewContent(content)
      } else {
        try {
          const errorData = await response.json()
          setPreviewContent(`加载失败: ${errorData.error || '未知错误'}`)
        } catch {
          setPreviewContent(`加载失败: HTTP ${response.status}`)
        }
      }
    } catch (error) {
      setPreviewContent(`加载失败: ${error.message}`)
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleString('zh-CN')
  }

  const getFileExtension = (filename) => {
    if (!filename) return 'FILE'
    const ext = filename.split('.').pop()
    return ext.toUpperCase().slice(0, 3)
  }

  return (
    <div class="container">
      <div class="header">
        <h1>📁 IPFS 网关</h1>
        <p>去中心化文件存储 - 上传文件并获取内容哈希 (CID)</p>
      </div>

      <div class="upload-section">
        {successMessage && (
          <div class={`success-message ${isDuplicateFile ? 'warning' : ''}`}>
            <span>{isDuplicateFile ? '📋' : '✅'}</span>
            <span>{successMessage}</span>
          </div>
        )}
        
        {errorMessage && (
          <div class="error-message">{errorMessage}</div>
        )}

        <div 
          class={`upload-area ${isDragging ? 'dragover' : ''}`}
          onClick={() => !uploading && fileInputRef.current.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {uploading ? (
            <div class="uploading-container">
              <div class="upload-icon">⏳</div>
              <div class="uploading-text">正在上传到 IPFS 网络...</div>
              <div class="progress-container">
                <div class="progress-bar">
                  <div 
                    class="progress-fill" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <div class="progress-text">{uploadProgress}%</div>
              </div>
            </div>
          ) : (
            <>
              <div class="upload-icon">📤</div>
              <div class="upload-text">点击或拖拽文件到此处上传</div>
              <div class="upload-subtext">支持二进制文件、图片、文档等任意格式</div>
            </>
          )}
        </div>
        <input 
          ref={fileInputRef}
          type="file" 
          class="file-input" 
          onChange={handleFileSelect}
          disabled={uploading}
        />
      </div>

      <div class="files-section">
        <div class="files-header">
          <h2>已上传文件</h2>
          <span class="file-count">{files.length} 个文件</span>
        </div>

        {files.length === 0 ? (
          <div class="empty-state">
            <div class="empty-icon">📂</div>
            <div class="empty-text">暂无上传的文件</div>
          </div>
        ) : (
          <div class="file-list">
            {files.slice().reverse().map((file, index) => (
              <div 
                key={index}
                class="file-item"
                onClick={() => handleFileClick(file)}
              >
                <div class="file-icon">
                  {getFileExtension(file.filename)}
                </div>
                <div class="file-info">
                  <div class="file-name">{file.filename}</div>
                  <div class="file-cid">{file.cid}</div>
                </div>
                <div class="file-meta">
                  <span class="file-size">{formatFileSize(file.size)}</span>
                  <span class="file-date">{formatDate(file.uploadedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showPreview && (
        <div class="preview-modal" onClick={(e) => e.target === e.currentTarget && setShowPreview(false)}>
          <div class="preview-content">
            <div class="preview-header">
              <span class="preview-title">📄 {selectedFile?.filename}</span>
              <button class="preview-close" onClick={() => setShowPreview(false)}>×</button>
            </div>
            <div class="preview-body">
              {previewContent === null ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  正在加载内容...
                </div>
              ) : (
                <>
                  <div class="preview-text">{previewContent}</div>
                  <div class="preview-cid">
                    <strong>CID:</strong> {selectedFile?.cid}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
