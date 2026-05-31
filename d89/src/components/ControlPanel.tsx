import React from 'react';
import { Settings, RotateCcw, Eye, EyeOff, Maximize2, Palette } from 'lucide-react';

export type ColorMode = 'original' | 'heatmap';

interface ControlPanelProps {
  pointSize: number;
  onPointSizeChange: (value: number) => void;
  frustumCullingEnabled: boolean;
  onFrustumCullingChange: (enabled: boolean) => void;
  onResetCamera: () => void;
  onToggleFullscreen: () => void;
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  pointSize,
  onPointSizeChange,
  frustumCullingEnabled,
  onFrustumCullingChange,
  onResetCamera,
  onToggleFullscreen,
  colorMode,
  onColorModeChange,
}) => {
  return (
    <div className="fixed top-4 right-4 bg-zinc-900/80 backdrop-blur-md rounded-xl border border-zinc-700/50 p-4 w-72 shadow-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-4 h-4 text-cyan-400" />
        <h2 className="text-white font-semibold text-sm">渲染控制</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="flex items-center justify-between text-zinc-400 text-xs mb-2">
            <span>点大小</span>
            <span className="text-cyan-400 font-mono">{pointSize.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.1"
            value={pointSize}
            onChange={(e) => onPointSizeChange(parseFloat(e.target.value))}
            className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-cyan-500"
          />
        </div>

        <div className="flex items-center justify-between p-2 bg-zinc-800/50 rounded-lg">
          <div className="flex items-center gap-2">
            {frustumCullingEnabled ? (
              <Eye className="w-4 h-4 text-emerald-400" />
            ) : (
              <EyeOff className="w-4 h-4 text-zinc-500" />
            )}
            <span className="text-zinc-300 text-xs">视锥剔除</span>
          </div>
          <button
            onClick={() => onFrustumCullingChange(!frustumCullingEnabled)}
            className={`w-10 h-5 rounded-full transition-colors duration-200 relative ${
              frustumCullingEnabled ? 'bg-emerald-500' : 'bg-zinc-600'
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                frustumCullingEnabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div className="mt-3 p-2 bg-zinc-800/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Palette className="w-4 h-4 text-cyan-400" />
            <span className="text-zinc-300 text-xs">着色模式</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onColorModeChange('original')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 ${
                colorMode === 'original'
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                  : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
              }`}
            >
              原始颜色
            </button>
            <button
              onClick={() => onColorModeChange('heatmap')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 ${
                colorMode === 'heatmap'
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                  : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
              }`}
            >
              高度热力图
            </button>
          </div>
          {colorMode === 'heatmap' && (
            <div className="mt-2 pt-2 border-t border-zinc-700">
              <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                <span>低</span>
                <span>高</span>
              </div>
              <div
                className="h-2 rounded-full"
                style={{
                  background:
                    'linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)',
                }}
              />
              <div className="flex justify-between text-[9px] text-zinc-500 mt-1">
                <span>蓝色</span>
                <span>青色</span>
                <span>绿色</span>
                <span>黄色</span>
                <span>红色</span>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-700/50 pt-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onResetCamera}
              className="flex items-center justify-center gap-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs transition-colors duration-200"
            >
              <RotateCcw className="w-3 h-3" />
              重置视角
            </button>
            <button
              onClick={onToggleFullscreen}
              className="flex items-center justify-center gap-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs transition-colors duration-200"
            >
              <Maximize2 className="w-3 h-3" />
              全屏
            </button>
          </div>
        </div>

        <div className="border-t border-zinc-700/50 pt-4">
          <div className="text-zinc-500 text-xs space-y-1">
            <p className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500" />
              左键拖动：旋转视角
            </p>
            <p className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              右键拖动：平移
            </p>
            <p className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              滚轮：缩放
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
