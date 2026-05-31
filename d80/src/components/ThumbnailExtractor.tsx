import React, { useState, useEffect } from 'react';
import { Image, Download, Clock } from 'lucide-react';

interface ThumbnailExtractorProps {
  file: File;
  thumbnail?: string;
  onExtract: (time: number) => void;
  duration?: number;
  isLoading: boolean;
}

export function ThumbnailExtractor({
  file,
  thumbnail,
  onExtract,
  duration = 0,
  isLoading,
}: ThumbnailExtractorProps) {
  const [selectedTime, setSelectedTime] = useState(1);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDownload = () => {
    if (!thumbnail) return;
    const a = document.createElement('a');
    a.href = thumbnail;
    a.download = `thumbnail_${file.name.replace(/\.[^/.]+$/, '')}_${selectedTime}s.png`;
    a.click();
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
          <Image className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold">缩略图提取</h3>
          <p className="text-slate-400 text-sm">选择时间点提取视频帧</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-700">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt="Video thumbnail"
              className="w-full h-full object-contain"
            />
          ) : isLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-cyan-500 border-t-transparent" />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Image className="w-16 h-16 text-slate-600" />
            </div>
          )}
        </div>

        {duration > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Clock className="w-4 h-4" />
                <span>选择时间点</span>
              </div>
              <span className="text-cyan-400 font-mono text-sm">
                {formatTime(selectedTime)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max={Math.max(0, duration - 1)}
              value={selectedTime}
              onChange={(e) => setSelectedTime(Number(e.target.value))}
              disabled={isLoading}
              className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed accent-cyan-500"
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>00:00</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => onExtract(selectedTime)}
            disabled={isLoading}
            className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-medium rounded-xl hover:from-cyan-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '提取中...' : '提取缩略图'}
          </button>
          {thumbnail && (
            <button
              onClick={handleDownload}
              className="py-3 px-4 bg-slate-700 text-white font-medium rounded-xl hover:bg-slate-600 transition-colors flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              <span className="hidden sm:inline">下载</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
