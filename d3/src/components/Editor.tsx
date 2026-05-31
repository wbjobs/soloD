import { useState, useEffect } from 'react'
import { Save, RotateCcw, Tag, Folder, Clock, Eye, Edit, X, Download, Moon, Sun, Link2 } from 'lucide-react'
import { Note, NoteVersion, Backlink } from '../types'
import { diffLines } from 'diff'

interface EditorProps {
  note: Note | null
  onSave: (content: string, title: string) => void
  versions: NoteVersion[]
  onRestoreVersion: (version: NoteVersion) => void
  darkMode: boolean
  onToggleDarkMode: () => void
  onExportPDF: () => void
  onExportHTML: () => void
  backlinks: Backlink[]
  onBacklinkClick: (path: string) => void
}

export function Editor({
  note,
  onSave,
  versions,
  onRestoreVersion,
  darkMode,
  onToggleDarkMode,
  onExportPDF,
  onExportHTML,
  backlinks,
  onBacklinkClick,
}: EditorProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showBacklinks, setShowBacklinks] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [category, setCategory] = useState('')
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [compareVersion, setCompareVersion] = useState<NoteVersion | null>(null)

  useEffect(() => {
    if (note) {
      setTitle(note.title)
      setContent(note.content)
      setTags(note.tags || [])
      setCategory(note.category || '')
    } else {
      setTitle('')
      setContent('')
      setTags([])
      setCategory('')
    }
  }, [note])

  const handleSave = () => {
    onSave(content, title)
  }

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
      setIsAddingTag(false)
    }
  }

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove))
  }

  const renderDiff = () => {
    if (!compareVersion) return null
    const diff = diffLines(compareVersion.content, content)
    return (
      <div className="font-mono text-sm">
        {diff.map((part, index) => (
          <div
            key={index}
            className={`${
              part.added ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 
              part.removed ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : ''
            } px-2`}
          >
            {part.value}
          </div>
        ))}
      </div>
    )
  }

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className={`text-lg mb-4 ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
            选择或创建一个笔记开始编辑
          </p>
          <button
            onClick={onToggleDarkMode}
            className={`p-3 rounded-full transition-colors ${
              darkMode ? 'bg-gray-700 text-yellow-400' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {darkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className={`border-b p-4 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between mb-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="笔记标题..."
            className={`text-xl font-semibold border-none focus:outline-none focus:ring-0 flex-1 bg-transparent ${
              darkMode ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'
            }`}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleDarkMode}
              className={`p-2 rounded-lg transition-colors ${
                darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
              }`}
              title={darkMode ? '亮色模式' : '暗色模式'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            
            <div className="relative group">
              <button
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                }`}
                title="导出"
              >
                <Download className="w-4 h-4" />
              </button>
              <div className={`absolute right-0 mt-2 w-32 rounded-md shadow-lg z-10 hidden group-hover:block ${
                darkMode ? 'bg-gray-700' : 'bg-white'
              } border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                <button
                  onClick={onExportPDF}
                  className={`block w-full text-left px-4 py-2 text-sm rounded-t-md ${
                    darkMode ? 'text-gray-200 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  导出 PDF
                </button>
                <button
                  onClick={onExportHTML}
                  className={`block w-full text-left px-4 py-2 text-sm rounded-b-md ${
                    darkMode ? 'text-gray-200 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  导出 HTML
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowBacklinks(!showBacklinks)}
              className={`p-2 rounded-lg transition-colors ${
                showBacklinks
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
              }`}
              title={`反向链接 (${backlinks.length})`}
            >
              <Link2 className="w-4 h-4" />
              {backlinks.length > 0 && (
                <span className="absolute -top-1 -right-1 text-xs bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                  {backlinks.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsPreviewMode(!isPreviewMode)}
              className={`p-2 rounded-lg transition-colors ${
                isPreviewMode
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
              }`}
              title={isPreviewMode ? '编辑模式' : '预览模式'}
            >
              {isPreviewMode ? <Edit className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowVersionHistory(!showVersionHistory)}
              className={`p-2 rounded-lg transition-colors ${
                showVersionHistory
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
              }`}
              title="版本历史"
            >
              <Clock className="w-4 h-4" />
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Tag className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-400'}`} />
            <div className="flex items-center gap-1 flex-wrap">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded-full text-xs"
                >
                  #{tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-blue-900 dark:hover:text-blue-100">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {isAddingTag ? (
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag()}
                  onBlur={() => {
                    addTag()
                    setIsAddingTag(false)
                  }}
                  placeholder="输入标签..."
                  className={`px-2 py-0.5 border rounded-full text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-800'
                  }`}
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => setIsAddingTag(true)}
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  + 添加标签
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Folder className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-400'}`} />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`border-none bg-transparent focus:outline-none cursor-pointer ${
                darkMode ? 'text-gray-300' : 'text-gray-600'
              }`}
            >
              <option value="">选择分类...</option>
              <option value="工作">工作</option>
              <option value="学习">学习</option>
              <option value="生活">生活</option>
              <option value="技术">技术</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {!isPreviewMode ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="开始输入 Markdown 内容... 输入 [[笔记标题]] 可以创建双向链接"
            className={`flex-1 p-6 font-mono text-sm resize-none focus:outline-none ${
              darkMode ? 'bg-gray-900 text-gray-200 placeholder-gray-600' : 'bg-gray-50 text-gray-800 placeholder-gray-400'
            }`}
          />
        ) : (
          <div className={`flex-1 overflow-auto ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
            <div className="p-6 h-full">
              <h1 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{title}</h1>
              <div className={`prose max-w-none ${darkMode ? 'prose-invert' : ''}`}>
                {content.split('\n').map((line, index) => (
                  <p key={index} className={`mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {showVersionHistory && (
          <div className={`w-80 border-l overflow-auto ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <h3 className={`font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>版本历史</h3>
            </div>
            <div className="p-2">
              {versions.length === 0 ? (
                <p className={`text-center text-sm py-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>暂无版本历史</p>
              ) : (
                versions.map((version) => (
                  <div
                    key={version.id}
                    className={`p-3 rounded-lg mb-2 cursor-pointer transition-colors ${
                      compareVersion?.id === version.id
                        ? darkMode ? 'bg-blue-900' : 'bg-blue-100'
                        : darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                    }`}
                    onClick={() =>
                      setCompareVersion(
                        compareVersion?.id === version.id ? null : version
                      )
                    }
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                        {new Date(version.timestamp).toLocaleString()}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onRestoreVersion(version)
                        }}
                        className={`p-1 rounded ${darkMode ? 'hover:bg-blue-800' : 'hover:bg-blue-200'}`}
                        title="恢复此版本"
                      >
                        <RotateCcw className={`w-3 h-3 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                      </button>
                    </div>
                    {version.message && (
                      <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{version.message}</p>
                    )}
                    {compareVersion?.id === version.id && (
                      <div className={`mt-2 pt-2 border-t max-h-48 overflow-auto ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                        {renderDiff()}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {showBacklinks && (
          <div className={`w-80 border-l overflow-auto ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <h3 className={`font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                反向链接 ({backlinks.length})
              </h3>
            </div>
            <div className="p-2">
              {backlinks.length === 0 ? (
                <p className={`text-center text-sm py-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>暂无反向链接</p>
              ) : (
                backlinks.map((backlink, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg mb-2 cursor-pointer transition-colors ${
                      darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                    }`}
                    onClick={() => onBacklinkClick(backlink.notePath)}
                  >
                    <div className={`text-sm font-medium mb-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                      [[{backlink.noteTitle}]]
                    </div>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {backlink.context}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}