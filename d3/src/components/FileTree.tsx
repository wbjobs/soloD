import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react'
import { FileNode } from '../types'
import { useState } from 'react'

interface FileTreeProps {
  nodes: FileNode[]
  level?: number
  onSelectFile: (path: string) => void
  selectedFile?: string
  onToggleFolder?: (path: string) => void
  darkMode?: boolean
}

export function FileTree({ nodes, level = 0, onSelectFile, selectedFile, onToggleFolder, darkMode }: FileTreeProps) {
  return (
    <div className="select-none">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          level={level}
          onSelectFile={onSelectFile}
          selectedFile={selectedFile}
          onToggleFolder={onToggleFolder}
          darkMode={darkMode}
        />
      ))}
    </div>
  )
}

function FileTreeNode({ node, level, onSelectFile, selectedFile, onToggleFolder, darkMode }: FileTreeProps & { node: FileNode }) {
  const [isOpen, setIsOpen] = useState(node.isOpen || false)
  const isSelected = selectedFile === node.path

  const handleClick = () => {
    if (node.nodeType === 'directory') {
      setIsOpen(!isOpen)
      onToggleFolder?.(node.path)
    } else {
      onSelectFile(node.path)
    }
  }

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 px-2 cursor-pointer rounded transition-colors ${
          isSelected
            ? darkMode ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-700'
            : darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-800'
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        {node.nodeType === 'directory' && (
          <span className="w-4 h-4 flex items-center justify-center">
            {isOpen ? (
              <ChevronDown className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
            ) : (
              <ChevronRight className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
            )}
          </span>
        )}
        {node.nodeType === 'directory' ? (
          isOpen ? (
            <FolderOpen className="w-4 h-4 text-yellow-500" />
          ) : (
            <Folder className="w-4 h-4 text-yellow-500" />
          )
        ) : (
          <FileText className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-400'}`} />
        )}
        <span className="text-sm truncate">{node.name}</span>
      </div>
      {node.nodeType === 'directory' && isOpen && node.children && node.children.length > 0 && (
        <FileTree
          nodes={node.children}
          level={level + 1}
          onSelectFile={onSelectFile}
          selectedFile={selectedFile}
          onToggleFolder={onToggleFolder}
          darkMode={darkMode}
        />
      )}
    </div>
  )
}