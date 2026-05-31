import { useState, useEffect, useMemo } from 'react'
import { Sidebar } from './components/Sidebar'
import { FileTree } from './components/FileTree'
import { Editor } from './components/Editor'
import { MarkdownPreview } from './components/MarkdownPreview'
import { AppState, FileNode, Note, NoteVersion, Backlink } from './types'
import * as tauri from './services/tauri'
import { extractWikiLinks } from './components/MarkdownPreview'

function App() {
  const [state, setState] = useState<AppState>({
    notes: [],
    versions: [],
    currentNote: null,
    fileTree: [],
    selectedFolder: null,
    searchQuery: '',
    searchResults: [],
    tags: [],
    categories: ['工作', '学习', '生活', '技术'],
    backlinks: [],
    darkMode: false,
  })

  const [showFileTree, setShowFileTree] = useState(true)
  const [showPreview, setShowPreview] = useState(true)
  const [selectedTag, setSelectedTag] = useState<string | undefined>()
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>()

  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode')
    if (savedDarkMode === 'true') {
      setState((prev) => ({ ...prev, darkMode: true }))
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('darkMode', state.darkMode.toString())
  }, [state.darkMode])

  const loadFolder = async () => {
    try {
      const folder = await tauri.selectFolder()
      if (folder) {
        setState((prev) => ({ ...prev, selectedFolder: folder }))
        await refreshFileTree(folder)
        await loadAllNotes(folder)
      }
    } catch (error) {
      console.error('Failed to select folder:', error)
    }
  }

  const refreshFileTree = async (folder: string) => {
    try {
      const tree = await tauri.readDirectory(folder)
      setState((prev) => ({ ...prev, fileTree: tree }))
    } catch (error) {
      console.error('Failed to read directory:', error)
    }
  }

  const loadAllNotes = async (folder: string) => {
    try {
      const notes = await tauri.getNotesFromFolder(folder)
      setState((prev) => ({ ...prev, notes }))
    } catch (error) {
      console.error('Failed to load notes:', error)
    }
  }

  const backlinks = useMemo(() => {
    if (!state.currentNote || state.notes.length === 0) return []

    const currentTitle = state.currentNote.title
    const foundBacklinks: Backlink[] = []

    state.notes.forEach((note) => {
      if (note.id === state.currentNote!.id) return

      const links = extractWikiLinks(note.content)
      if (links.includes(currentTitle)) {
        const lines = note.content.split('\n')
        const contextLine = lines.find((line) => line.includes(`[[${currentTitle}]]`)) || ''
        foundBacklinks.push({
          noteId: note.id,
          noteTitle: note.title,
          notePath: note.path,
          context: contextLine.trim(),
        })
      }
    })

    return foundBacklinks
  }, [state.currentNote, state.notes])

  const handleSelectFile = async (path: string) => {
    if (path.endsWith('.md')) {
      try {
        const content = await tauri.readFile(path)
        const note: Note = {
          id: path,
          title: path.split('\\').pop()?.replace('.md', '') || 'Untitled',
          content,
          path,
          tags: [],
          category: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        setState((prev) => ({ ...prev, currentNote: note }))
        loadVersions(path)
      } catch (error) {
        console.error('Failed to read file:', error)
      }
    }
  }

  const loadVersions = async (noteId: string) => {
    try {
      const versions = await tauri.getVersions(noteId)
      setState((prev) => ({ ...prev, versions }))
    } catch (error) {
      console.error('Failed to load versions:', error)
    }
  }

  const handleSave = async (content: string, title: string) => {
    if (!state.currentNote) return

    try {
      await tauri.writeFile(state.currentNote.path, content)
      await tauri.saveVersion(state.currentNote.id, title, content, '自动保存')

      setState((prev) => ({
        ...prev,
        currentNote: {
          ...prev.currentNote!,
          content,
          title,
          updatedAt: Date.now(),
        },
        notes: prev.notes.map((n) =>
          n.id === prev.currentNote!.id ? { ...n, content, title, updatedAt: Date.now() } : n
        ),
      }))

      await loadVersions(state.currentNote.id)
    } catch (error) {
      console.error('Failed to save note:', error)
    }
  }

  const handleRestoreVersion = async (version: NoteVersion) => {
    if (!state.currentNote) return

    try {
      await tauri.restoreVersion(state.currentNote.id, state.currentNote.path, version)

      setState((prev) => ({
        ...prev,
        currentNote: {
          ...prev.currentNote!,
          content: version.content,
          title: version.title,
          updatedAt: Date.now(),
        },
        notes: prev.notes.map((n) =>
          n.id === prev.currentNote!.id ? { ...n, content: version.content, title: version.title, updatedAt: Date.now() } : n
        ),
      }))

      await loadVersions(state.currentNote.id)
    } catch (error) {
      console.error('Failed to restore version:', error)
    }
  }

  const handleToggleDarkMode = () => {
    setState((prev) => ({ ...prev, darkMode: !prev.darkMode }))
  }

  const handleExportHTML = async () => {
    if (!state.currentNote) return
    try {
      const htmlContent = generateHTML(state.currentNote.content, state.currentNote.title)
      const defaultPath = state.currentNote.path.replace('.md', '.html')
      await tauri.writeFile(defaultPath, htmlContent)
      alert(`HTML 已导出到: ${defaultPath}`)
    } catch (error) {
      console.error('Failed to export HTML:', error)
      alert('导出失败')
    }
  }

  const handleExportPDF = async () => {
    if (!state.currentNote) return
    try {
      const htmlContent = generateHTML(state.currentNote.content, state.currentNote.title)
      const defaultPath = state.currentNote.path.replace('.md', '.pdf')
      
      await tauri.writeFile(defaultPath + '.html', htmlContent)
      alert(`已导出 HTML 文件，请使用浏览器打开并打印为 PDF: ${defaultPath}.html`)
    } catch (error) {
      console.error('Failed to export PDF:', error)
      alert('导出失败')
    }
  }

  const generateHTML = (content: string, title: string): string => {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      line-height: 1.8;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
    }
    h1 {
      font-size: 2em;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 0.3em;
    }
    h2 {
      font-size: 1.5em;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 0.3em;
    }
    code {
      background-color: #f3f4f6;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 0.9em;
    }
    pre {
      background-color: #1e293b;
      color: #e2e8f0;
      padding: 1em;
      border-radius: 6px;
      overflow-x: auto;
    }
    pre code {
      background-color: transparent;
      padding: 0;
    }
    blockquote {
      border-left: 4px solid #3b82f6;
      padding-left: 1em;
      margin: 1em 0;
      color: #64748b;
      background-color: #eff6ff;
      padding: 0.5em 1em;
      border-radius: 0 6px 6px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 0.5em 1em;
    }
    th {
      background-color: #f9fafb;
      font-weight: 600;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
    }
    a {
      color: #3b82f6;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    ul, ol {
      padding-left: 2em;
    }
    hr {
      border: none;
      border-top: 2px solid #e5e7eb;
      margin: 2em 0;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${contentToHTML(content)}
</body>
</html>`
  }

  const contentToHTML = (content: string): string => {
    let html = content
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^\[(.*?)\]$/gm, '<li>$1</li>')

    return `<p>${html}</p>`
  }

  const handleSearch = async () => {
    if (!state.selectedFolder || !state.searchQuery) return

    try {
      const results = await tauri.searchNotes(state.searchQuery, state.selectedFolder)
      setState((prev) => ({ ...prev, searchResults: results }))
    } catch (error) {
      console.error('Failed to search notes:', error)
    }
  }

  const handleCreateNote = async () => {
    if (!state.selectedFolder) {
      await loadFolder()
      return
    }

    const title = `新建笔记 ${new Date().toLocaleDateString()}.md`
    const path = `${state.selectedFolder}\\${title}`
    
    try {
      await tauri.createFile(path, '# 新建笔记\n\n开始编写你的内容...\n\n提示: 使用 [[笔记标题]] 可以创建双向链接')
      await refreshFileTree(state.selectedFolder)
      await loadAllNotes(state.selectedFolder)
      await handleSelectFile(path)
    } catch (error) {
      console.error('Failed to create note:', error)
    }
  }

  const handleCreateFolder = async () => {
    if (!state.selectedFolder) {
      await loadFolder()
      return
    }

    const name = prompt('输入文件夹名称:')
    if (!name) return

    try {
      await tauri.createDirectory(`${state.selectedFolder}\\${name}`)
      await refreshFileTree(state.selectedFolder)
    } catch (error) {
      console.error('Failed to create folder:', error)
    }
  }

  const handleWikiLinkClick = async (title: string) => {
    if (!state.selectedFolder) return

    const foundNote = state.notes.find(
      (n) => n.title.toLowerCase() === title.toLowerCase()
    )

    if (foundNote) {
      await handleSelectFile(foundNote.path)
    } else {
      const shouldCreate = confirm(`笔记 "${title}" 不存在，是否创建？`)
      if (shouldCreate) {
        const path = `${state.selectedFolder}\\${title}.md`
        try {
          await tauri.createFile(path, `# ${title}\n\n`)
          await refreshFileTree(state.selectedFolder)
          await loadAllNotes(state.selectedFolder)
          await handleSelectFile(path)
        } catch (error) {
          console.error('Failed to create note from wiki link:', error)
        }
      }
    }
  }

  const handleBacklinkClick = (path: string) => {
    handleSelectFile(path)
  }

  return (
    <div className={`h-screen flex overflow-hidden ${state.darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <Sidebar
        searchQuery={state.searchQuery}
        onSearchChange={(query) => setState((prev) => ({ ...prev, searchQuery: query }))}
        onSearch={handleSearch}
        tags={state.tags}
        selectedTag={selectedTag}
        onSelectTag={setSelectedTag}
        categories={state.categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        onCreateNote={handleCreateNote}
        onCreateFolder={handleCreateFolder}
        onOpenFolder={loadFolder}
        darkMode={state.darkMode}
        onToggleDarkMode={handleToggleDarkMode}
      />

      {showFileTree && (
        <div className={`w-64 flex flex-col border-r ${state.darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className={`p-4 border-b ${state.darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <h2 className={`font-semibold ${state.darkMode ? 'text-gray-200' : 'text-gray-700'}`}>文件目录</h2>
          </div>
          <div className="flex-1 overflow-auto scrollbar-thin">
            <FileTree
              nodes={state.fileTree}
              onSelectFile={handleSelectFile}
              selectedFile={state.currentNote?.path}
              darkMode={state.darkMode}
            />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col">
        <div className={`h-12 border-b flex items-center justify-between px-4 ${state.darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFileTree(!showFileTree)}
              className={`p-2 rounded-lg transition-colors ${
                showFileTree
                  ? state.darkMode ? 'bg-gray-700 text-gray-300' : 'bg-blue-100 text-blue-700'
                  : state.darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
              }`}
              title="切换文件目录"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`p-2 rounded-lg transition-colors ${
                showPreview
                  ? state.darkMode ? 'bg-gray-700 text-gray-300' : 'bg-blue-100 text-blue-700'
                  : state.darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
              }`}
              title="切换预览"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
          </div>
          <span className={`text-sm ${state.darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {state.selectedFolder || '未选择文件夹'}
          </span>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <Editor
            note={state.currentNote}
            onSave={handleSave}
            versions={state.versions}
            onRestoreVersion={handleRestoreVersion}
            darkMode={state.darkMode}
            onToggleDarkMode={handleToggleDarkMode}
            onExportPDF={handleExportPDF}
            onExportHTML={handleExportHTML}
            backlinks={backlinks}
            onBacklinkClick={handleBacklinkClick}
          />

          {showPreview && state.currentNote && (
            <div className={`w-1/2 border-l overflow-auto ${state.darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <MarkdownPreview
                content={state.currentNote.content}
                searchQuery={state.searchQuery}
                darkMode={state.darkMode}
                onWikiLinkClick={handleWikiLinkClick}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App