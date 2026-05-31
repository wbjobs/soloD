import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileVideo, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoUploaderProps {
  onFileSelect: (file: File) => void;
  isFormatSupported: (fileName: string) => boolean;
  selectedFile?: File | null;
  maxFileSize?: number;
}

const DEFAULT_MAX_SIZE = 200 * 1024 * 1024;

export function VideoUploader({ onFileSelect, isFormatSupported, selectedFile, maxFileSize = DEFAULT_MAX_SIZE }: VideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const validateFile = (file: File): string | null => {
    if (!file.type.startsWith('video/') && !isFormatSupported(file.name)) {
      return '不支持的文件格式。请上传视频文件（MP4, WebM, AVI, MOV, MKV 等）';
    }

    if (file.size > maxFileSize) {
      return `文件过大 (${(file.size / 1024 / 1024).toFixed(2)}MB)，最大支持 ${maxFileSize / 1024 / 1024}MB`;
    }

    return null;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      onFileSelect(file);
    }
  }, [isFormatSupported, onFileSelect, maxFileSize]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      onFileSelect(file);
    }
  }, [isFormatSupported, onFileSelect, maxFileSize]);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  return (
    <div className="w-full">
      <div
        className={cn(
          'relative border-2 border-dashed rounded-2xl p-8 transition-all duration-300 cursor-pointer',
          'bg-slate-800/50 backdrop-blur-sm',
          isDragging ? 'border-cyan-400 bg-cyan-500/10 scale-[1.02]' : 'border-slate-600 hover:border-cyan-500 hover:bg-slate-700/50',
          error ? 'border-red-500 bg-red-500/10' : ''
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {selectedFile ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <FileVideo className="w-7 h-7 text-cyan-400" />
              </div>
              <div>
                <p className="text-white font-medium truncate max-w-[200px] md:max-w-[400px]">
                  {selectedFile.name}
                </p>
                <p className="text-slate-400 text-sm">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.value && (inputRef.current.value = '');
                onFileSelect(null as unknown as File);
              }}
              className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400 hover:text-red-400" />
            </button>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20 flex items-center justify-center">
              <Upload className={cn('w-10 h-10 transition-transform duration-300', isDragging ? 'text-cyan-400 scale-110' : 'text-cyan-500')} />
            </div>
            <p className="text-white font-medium mb-2">
              {isDragging ? '释放文件以上传' : '拖拽视频文件到这里'}
            </p>
            <p className="text-slate-400 text-sm mb-4">或点击选择文件</p>
            <div className="flex flex-wrap justify-center gap-2">
              {['MP4', 'WebM', 'AVI', 'MOV', 'MKV'].map((format) => (
                <span key={format} className="px-3 py-1 text-xs font-medium bg-slate-700 text-slate-300 rounded-full">
                  {format}
                </span>
              ))}
              <span className="px-3 py-1 text-xs font-medium bg-cyan-500/20 text-cyan-400 rounded-full">
                最大 {maxFileSize / 1024 / 1024}MB
              </span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
