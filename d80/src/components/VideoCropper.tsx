import React, { useState, useRef, useEffect } from 'react';
import { Scissors, Download, Play, Pause } from 'lucide-react';

interface VideoCropperProps {
  file: File;
  duration: number;
  onCrop: (startTime: number, endTime: number) => Promise<string>;
  isLoading: boolean;
}

export function VideoCropper({ file, duration, onCrop, isLoading }: VideoCropperProps) {
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(duration);
  const [croppedVideoUrl, setCroppedVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setEndTime(duration);
    setStartTime(0);
    setCroppedVideoUrl(null);
  }, [file, duration]);

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (value < endTime) {
      setStartTime(value);
    }
  };

  const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (value > startTime) {
      setEndTime(value);
    }
  };

  const handleCrop = async () => {
    try {
      const url = await onCrop(startTime, endTime);
      setCroppedVideoUrl(url);
    } catch (error) {
      console.error('裁剪失败:', error);
    }
  };

  const handleDownload = () => {
    if (!croppedVideoUrl) return;
    const a = document.createElement('a');
    a.href = croppedVideoUrl;
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    a.download = `${baseName}_cropped_${formatTime(startTime).replace(/:/g, '-')}_${formatTime(endTime).replace(/:/g, '-')}.mp4`;
    a.click();
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleVideoTimeUpdate = () => {
    if (videoRef.current && videoRef.current.currentTime >= endTime) {
      videoRef.current.currentTime = startTime;
    }
  };

  const handleSeekStart = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
    }
  };

  const handleSeekEnd = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = endTime;
    }
  };

  const selectedDuration = endTime - startTime;

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20 flex items-center justify-center">
          <Scissors className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold">视频裁剪</h3>
          <p className="text-slate-400 text-sm">选择起止时间点进行裁剪</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-700 group">
          <video
            ref={videoRef}
            src={URL.createObjectURL(file)}
            className="w-full h-full object-contain"
            onTimeUpdate={handleVideoTimeUpdate}
            onClick={togglePlay}
          />
          {!croppedVideoUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 text-white" />
                ) : (
                  <Play className="w-8 h-8 text-white ml-1" />
                )}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-cyan-400 font-medium">起点</span>
                <span className="text-white font-mono text-sm">{formatTime(startTime)}</span>
              </div>
              <button
                onClick={handleSeekStart}
                className="text-xs text-slate-400 hover:text-cyan-400 transition-colors"
              >
                跳转到
              </button>
            </div>
            <input
              type="range"
              min="0"
              max={duration}
              step="0.1"
              value={startTime}
              onChange={handleStartTimeChange}
              disabled={isLoading}
              className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-teal-400 font-medium">终点</span>
                <span className="text-white font-mono text-sm">{formatTime(endTime)}</span>
              </div>
              <button
                onClick={handleSeekEnd}
                className="text-xs text-slate-400 hover:text-teal-400 transition-colors"
              >
                跳转到
              </button>
            </div>
            <input
              type="range"
              min="0"
              max={duration}
              step="0.1"
              value={endTime}
              onChange={handleEndTimeChange}
              disabled={isLoading}
              className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-teal-500 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl">
          <div className="text-center">
            <p className="text-slate-400 text-xs mb-1">选中时长</p>
            <p className="text-white font-mono text-lg font-semibold">{formatTime(selectedDuration)}</p>
          </div>
          <div className="h-8 w-px bg-slate-700" />
          <div className="text-center">
            <p className="text-slate-400 text-xs mb-1">总时长</p>
            <p className="text-white font-mono text-lg font-semibold">{formatTime(duration)}</p>
          </div>
          <div className="h-8 w-px bg-slate-700" />
          <div className="text-center">
            <p className="text-slate-400 text-xs mb-1">文件大小</p>
            <p className="text-white font-mono text-lg font-semibold">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCrop}
            disabled={isLoading || startTime >= endTime}
            className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-medium rounded-xl hover:from-cyan-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Scissors className="w-5 h-5" />
            {isLoading ? '裁剪中...' : '开始裁剪'}
          </button>
          {croppedVideoUrl && (
            <button
              onClick={handleDownload}
              className="py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-colors flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              <span className="hidden sm:inline">下载</span>
            </button>
          )}
        </div>

        {croppedVideoUrl && (
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h4 className="text-white font-medium mb-4">裁剪预览</h4>
            <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-700">
              <video
                src={croppedVideoUrl}
                controls
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
