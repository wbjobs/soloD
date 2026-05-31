import { useState } from 'react'
import Editor from './components/Editor'
import Header from './components/Header'
import StatusBar from './components/StatusBar'
import { YjsProvider } from './contexts/YjsContext'
import './App.css'

function App() {
  const [docId, setDocId] = useState('my-markdown-doc')
  const [showPreview, setShowPreview] = useState(true)

  return (
    <YjsProvider docId={docId}>
      <div className="app">
        <Header 
          docId={docId} 
          setDocId={setDocId}
          showPreview={showPreview}
          setShowPreview={setShowPreview}
        />
        <Editor showPreview={showPreview} />
        <StatusBar />
      </div>
    </YjsProvider>
  )
}

export default App