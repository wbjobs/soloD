import { Search, Tag, Folder, FilePlus, FolderPlus, Moon, Sun } from 'lucide-react'
import { useState } from 'react'

interface SidebarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  onSearch: () => void
  tags: string[]
  selectedTag?: string
  onSelectTag: (tag: string | undefined) => void
  categories: string[]
  selectedCategory?: string
  onSelectCategory: (category: string | undefined) => void
  onCreateNote: () => void
  onCreateFolder: () => void
  onOpenFolder: () => void
  darkMode: boolean
  onToggleDarkMode: () => void
}

export function Sidebar({
  searchQuery,
  onSearchChange,
  onSearch,
  tags,
  selectedTag,
  onSelectTag,
  categories,
  selectedCategory,
  onSelectCategory,
  onCreateNote,
  onCreateFolder,
  onOpenFolder,
  darkMode,
  onToggleDarkMode,
}: SidebarProps) {
  const [showTags, setShowTags] = useState(true)
  const [showCategories, setShowCategories] = useState(true)

  return (
    <div className={`w-64 flex flex-col h-full ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-r`}>
      <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
          <input
            type="text"
            placeholder="搜索笔记..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            className={`w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              darkMode
                ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500'
                : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
            }`}
          />
        </div>
      </div>

      <div className={`p-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex gap-2">
          <button
            onClick={onCreateNote}
            className="flex-1 flex items-center justify-center gap-1 py-2 px-3 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
          >
            <FilePlus className="w-4 h-4" />
            新建笔记
          </button>
          <button
            onClick={onCreateFolder}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title="新建文件夹"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenFolder}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title="打开文件夹"
          >
            <Folder className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleDarkMode}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title={darkMode ? '亮色模式' : '暗色模式'}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin">
        <div className="p-2">
          <button
            onClick={() => setShowTags(!showTags)}
            className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
            }`}
          >
            <span className={`flex items-center gap-2 text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <Tag className="w-4 h-4" />
              标签
            </span>
            <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>{tags.length}</span>
          </button>
          {showTags && (
            <div className="mt-1 space-y-1">
              {tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => onSelectTag(selectedTag === tag ? undefined : tag)}
                  className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    selectedTag === tag
                      ? darkMode ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-700'
                      : darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-2">
          <button
            onClick={() => setShowCategories(!showCategories)}
            className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
            }`}
          >
            <span className={`flex items-center gap-2 text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <Folder className="w-4 h-4" />
              分类
            </span>
            <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>{categories.length}</span>
          </button>
          {showCategories && (
            <div className="mt-1 space-y-1">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => onSelectCategory(selectedCategory === category ? undefined : category)}
                  className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    selectedCategory === category
                      ? darkMode ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-700'
                      : darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}