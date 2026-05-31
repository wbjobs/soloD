import React from 'react';
import { RendererType } from '@/utils/rendererDetector';

interface StatusBarProps {
  fps: number;
  totalPoints: number;
  visiblePoints: number;
  cullingTime: number;
  memoryUsage: number;
  rendererType?: RendererType;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  fps,
  totalPoints,
  visiblePoints,
  cullingTime,
  memoryUsage,
  rendererType,
}) => {
  const getRendererColor = (type?: RendererType): string => {
    switch (type) {
      case 'webgpu':
        return 'text-emerald-400';
      case 'webgl2':
        return 'text-cyan-400';
      case 'webgl':
        return 'text-amber-400';
      default:
        return 'text-zinc-500';
    }
  };

  const getRendererName = (type?: RendererType): string => {
    switch (type) {
      case 'webgpu':
        return 'WebGPU';
      case 'webgl2':
        return 'WebGL 2.0';
      case 'webgl':
        return 'WebGL 1.0';
      default:
        return '检测中...';
    }
  };
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const getFpsColor = (fps: number): string => {
    if (fps >= 50) return 'text-emerald-400';
    if (fps >= 30) return 'text-amber-400';
    return 'text-red-400';
  };

  const visibilityRate = totalPoints > 0 ? ((visiblePoints / totalPoints) * 100).toFixed(1) : '0';

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-zinc-900/90 backdrop-blur-sm border-t border-zinc-700/50 px-4 py-2">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-xs font-mono">FPS</span>
            <span className={`font-mono font-bold text-sm ${getFpsColor(fps)}`}>
              {fps.toFixed(0)}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-xs font-mono">总点数</span>
            <span className="text-cyan-400 font-mono font-bold text-sm">
              {formatNumber(totalPoints)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-xs font-mono">可见点</span>
            <span className="text-emerald-400 font-mono font-bold text-sm">
              {formatNumber(visiblePoints)}
            </span>
            <span className="text-zinc-500 text-xs">({visibilityRate}%)</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-xs font-mono">剔除耗时</span>
            <span className="text-amber-400 font-mono font-bold text-sm">
              {cullingTime.toFixed(2)}ms
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-xs font-mono">显存</span>
            <span className="text-blue-400 font-mono font-bold text-sm">
              {memoryUsage.toFixed(1)}MB
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full animate-pulse ${
              rendererType === 'webgpu' ? 'bg-emerald-500' : 
              rendererType === 'webgl2' ? 'bg-cyan-500' : 'bg-amber-500'
            }`} />
            <span className={`text-xs font-mono ${getRendererColor(rendererType)}`}>
              {getRendererName(rendererType)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
