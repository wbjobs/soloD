import React, { useState, useEffect } from 'react';
import { EditModalState } from '../types';

interface EditModalProps {
  modal: EditModalState;
  onSave: (label: string) => void;
  onClose: () => void;
}

const EditModal: React.FC<EditModalProps> = ({ modal, onSave, onClose }) => {
  const [label, setLabel] = useState('');

  useEffect(() => {
    setLabel(modal.currentLabel);
  }, [modal.currentLabel, modal.isOpen]);

  if (!modal.isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (label.trim()) {
      onSave(label.trim());
    }
  };

  const title = modal.type === 'node' ? '编辑节点' : '编辑关系';
  const placeholder = modal.type === 'node' ? '输入节点名称...' : '输入关系描述...';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl shadow-2xl p-6 w-[400px] border border-slate-600">
        <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
        
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={placeholder}
            className="w-full px-4 py-3 bg-slate-700 border border-slate-500 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-4"
            autoFocus
          />
          
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-500 transition-colors"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditModal;
