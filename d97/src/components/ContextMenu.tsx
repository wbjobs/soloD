import React from 'react';
import { ContextMenuState } from '../types';

interface ContextMenuProps {
  menu: ContextMenuState | null;
  onAddNode: () => void;
  onEditNode: () => void;
  onDeleteNode: () => void;
  onEditEdge: () => void;
  onDeleteEdge: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  menu,
  onAddNode,
  onEditNode,
  onDeleteNode,
  onEditEdge,
  onDeleteEdge,
}) => {
  if (!menu) return null;

  return (
    <div
      className="fixed bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-2 z-50 min-w-[160px]"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.type === 'canvas' && (
        <button
          className="w-full px-4 py-2 text-left text-white hover:bg-cyan-600 transition-colors flex items-center gap-2"
          onClick={onAddNode}
        >
          <span className="text-cyan-400">+</span>
          添加节点
        </button>
      )}

      {menu.type === 'node' && (
        <>
          <button
            className="w-full px-4 py-2 text-left text-white hover:bg-cyan-600 transition-colors flex items-center gap-2"
            onClick={onEditNode}
          >
            <span className="text-cyan-400">✏️</span>
            编辑节点
          </button>
          <button
            className="w-full px-4 py-2 text-left text-white hover:bg-red-600 transition-colors flex items-center gap-2"
            onClick={onDeleteNode}
          >
            <span className="text-red-400">🗑️</span>
            删除节点
          </button>
        </>
      )}

      {menu.type === 'edge' && (
        <>
          <button
            className="w-full px-4 py-2 text-left text-white hover:bg-cyan-600 transition-colors flex items-center gap-2"
            onClick={onEditEdge}
          >
            <span className="text-cyan-400">✏️</span>
            编辑关系
          </button>
          <button
            className="w-full px-4 py-2 text-left text-white hover:bg-red-600 transition-colors flex items-center gap-2"
            onClick={onDeleteEdge}
          >
            <span className="text-red-400">🗑️</span>
            删除关系
          </button>
        </>
      )}
    </div>
  );
};

export default ContextMenu;
