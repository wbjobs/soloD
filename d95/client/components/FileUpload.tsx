'use client';

import React, { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isAnalyzing: boolean;
  error?: string;
}

export function FileUpload({ onFileSelect, isAnalyzing, error }: FileUploadProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.xml')) {
        setSelectedFile(file);
        onFileSelect(file);
      }
    }
  }, [onFileSelect]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="w-full">
      <div
        className={`drop-zone relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${
          isDragActive ? 'drop-zone-active' : 'border-dark-600 hover:border-primary-500 hover:bg-dark-800/50'
        } ${isAnalyzing ? 'opacity-60 cursor-not-allowed' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !isAnalyzing && document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".xml"
          onChange={handleFileChange}
          className="hidden"
          disabled={isAnalyzing}
        />
        
        <div className="flex flex-col items-center gap-4">
          <div className={`p-4 rounded-full transition-all duration-300 ${
            isDragActive ? 'bg-primary-500/20 text-primary-400' : 'bg-dark-700 text-dark-400'
          }`}>
            <Upload className="w-8 h-8" />
          </div>
          
          <div>
            <p className="text-lg font-semibold text-dark-100">
              拖放Nmap XML扫描文件到这里
            </p>
            <p className="text-sm text-dark-400 mt-1">
              或点击选择文件
            </p>
          </div>

          {selectedFile && (
            <div className="mt-4 flex items-center gap-3 px-4 py-2 bg-dark-700/50 rounded-lg">
              <FileText className="w-5 h-5 text-primary-400" />
              <div className="text-left">
                <p className="text-sm font-medium text-dark-100">{selectedFile.name}</p>
                <p className="text-xs text-dark-400">{formatFileSize(selectedFile.size)}</p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-green-400 ml-2" />
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-dark-500">
        <FileText className="w-4 h-4" />
        <span>支持 .xml 格式的Nmap扫描结果文件</span>
      </div>
    </div>
  );
}
