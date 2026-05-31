import { useState, useCallback } from 'react';
import { PointCloudViewer, ColorMode } from '@/components/PointCloudViewer';
import { ControlPanel } from '@/components/ControlPanel';
import { StatusBar } from '@/components/StatusBar';
import { RendererInfo } from '@/utils/rendererDetector';

interface Stats {
  fps: number;
  totalPoints: number;
  visiblePoints: number;
  cullingTime: number;
  memoryUsage: number;
}

function Home() {
  const [stats, setStats] = useState<Stats>({
    fps: 0,
    totalPoints: 0,
    visiblePoints: 0,
    cullingTime: 0,
    memoryUsage: 0,
  });
  const [pointSize, setPointSize] = useState(2.0);
  const [frustumCullingEnabled, setFrustumCullingEnabled] = useState(true);
  const [rendererInfo, setRendererInfo] = useState<RendererInfo | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>('heatmap');

  const handleStatsUpdate = useCallback((newStats: Stats) => {
    setStats(newStats);
  }, []);

  const handleRendererDetected = useCallback((info: RendererInfo) => {
    setRendererInfo(info);
  }, []);

  const handleResetCamera = useCallback(() => {
    if ((window as any).resetPointCloudCamera) {
      (window as any).resetPointCloudCamera();
    }
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  return (
    <div className="w-screen h-screen bg-zinc-950 overflow-hidden relative">
      <div className="absolute top-4 left-4 z-10">
        <div className="bg-zinc-900/80 backdrop-blur-md rounded-xl border border-zinc-700/50 px-4 py-3">
          <h1 className="text-white font-bold text-lg flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full animate-pulse ${
              rendererInfo?.type === 'webgpu' ? 'bg-emerald-500' : 
              rendererInfo?.type === 'webgl2' ? 'bg-cyan-500' : 'bg-amber-500'
            }`} />
            3D 点云渲染器
          </h1>
          <p className="text-zinc-400 text-xs mt-1">
            基于 {rendererInfo?.name || '检测中...'} 的高性能地形点云可视化
          </p>
        </div>
      </div>

      <PointCloudViewer
        onStatsUpdate={handleStatsUpdate}
        onRendererDetected={handleRendererDetected}
        pointSize={pointSize}
        frustumCullingEnabled={frustumCullingEnabled}
        colorMode={colorMode}
      />

      <ControlPanel
        pointSize={pointSize}
        onPointSizeChange={setPointSize}
        frustumCullingEnabled={frustumCullingEnabled}
        onFrustumCullingChange={setFrustumCullingEnabled}
        onResetCamera={handleResetCamera}
        onToggleFullscreen={handleToggleFullscreen}
        colorMode={colorMode}
        onColorModeChange={setColorMode}
      />

      <StatusBar
        fps={stats.fps}
        totalPoints={stats.totalPoints}
        visiblePoints={stats.visiblePoints}
        cullingTime={stats.cullingTime}
        memoryUsage={stats.memoryUsage}
        rendererType={rendererInfo?.type}
      />
    </div>
  );
}

export default Home;
