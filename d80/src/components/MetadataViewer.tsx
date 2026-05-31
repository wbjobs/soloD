import React, { useState } from 'react';
import { FileJson, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { VideoMetadata } from '@/types/video';

interface MetadataViewerProps {
  metadata?: VideoMetadata;
  isLoading: boolean;
}

export function MetadataViewer({ metadata, isLoading }: MetadataViewerProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    format: true,
    streams: true,
  });

  const formatValue = (value: any): string => {
    if (typeof value === 'number') {
      if (value >= 1000000) {
        return (value / 1000000).toFixed(2) + ' Mbps';
      }
      if (value >= 1000) {
        return (value / 1000).toFixed(2) + ' kbps';
      }
      return value.toString();
    }
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopy = () => {
    if (!metadata) return;
    navigator.clipboard.writeText(JSON.stringify(metadata, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSection = (section: string) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const formatKey = (key: string): string => {
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <FileJson className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">元数据解析</h3>
            <p className="text-slate-400 text-sm">正在解析视频信息...</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-cyan-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <FileJson className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">元数据解析</h3>
            <p className="text-slate-400 text-sm">上传视频后自动解析</p>
          </div>
        </div>
        <div className="text-center py-12">
          <FileJson className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500">上传视频以查看元数据</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700 overflow-hidden">
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <FileJson className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">元数据解析</h3>
              <p className="text-slate-400 text-sm">视频详细信息</p>
            </div>
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-400" />
                <span className="text-green-400 text-sm">已复制</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-300" />
                <span className="text-slate-300 text-sm">复制</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="space-y-4">
          <div>
            <button
              onClick={() => toggleSection('format')}
              className="flex items-center gap-2 w-full text-left"
            >
              {expanded.format ? (
                <ChevronDown className="w-5 h-5 text-cyan-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-cyan-400" />
              )}
              <span className="text-white font-medium">格式信息</span>
            </button>
            {expanded.format && (
              <div className="mt-3 ml-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(metadata.format).map(([key, value]) => (
                  <div key={key} className="bg-slate-900/50 rounded-lg p-3">
                    <span className="text-slate-500 text-xs uppercase tracking-wider">
                      {formatKey(key)}
                    </span>
                    <p className="text-white mt-1 font-mono text-sm">
                      {key === 'size'
                        ? formatFileSize(value as number)
                        : key === 'duration'
                        ? formatDuration(value as number)
                        : key === 'bit_rate'
                        ? formatValue(value)
                        : String(value)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <button
              onClick={() => toggleSection('streams')}
              className="flex items-center gap-2 w-full text-left"
            >
              {expanded.streams ? (
                <ChevronDown className="w-5 h-5 text-cyan-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-cyan-400" />
              )}
              <span className="text-white font-medium">流信息</span>
              <span className="text-slate-500 text-sm">
                ({metadata.streams.length} 个流)
              </span>
            </button>
            {expanded.streams && (
              <div className="mt-3 ml-7 space-y-4">
                {metadata.streams.map((stream, index) => (
                  <div key={index} className="bg-slate-900/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          stream.codec_type === 'video'
                            ? 'bg-cyan-500/20 text-cyan-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {stream.codec_type?.toUpperCase()}
                      </span>
                      <span className="text-white font-medium">
                        {stream.codec_name}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.entries(stream)
                        .filter(([_, v]) => v !== undefined && v !== null)
                        .map(([key, value]) => (
                          <div key={key}>
                            <span className="text-slate-500 text-xs uppercase tracking-wider">
                              {formatKey(key)}
                            </span>
                            <p className="text-slate-300 mt-1 font-mono text-sm truncate">
                              {formatValue(value)}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
