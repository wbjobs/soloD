import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { generateTerrainPointCloud } from '../utils/pointCloudGenerator';
import { FrustumCulling } from '../utils/frustumCulling';
import { detectBestRenderer, RendererInfo } from '../utils/rendererDetector';
import { createHeightHeatmapMaterial, updateHeatmapMaterial } from '../utils/webgpuPointCloud';

export type ColorMode = 'original' | 'heatmap';

interface PointCloudViewerProps {
  onStatsUpdate: (stats: {
    fps: number;
    totalPoints: number;
    visiblePoints: number;
    cullingTime: number;
    memoryUsage: number;
  }) => void;
  pointSize: number;
  frustumCullingEnabled: boolean;
  onRendererDetected?: (info: RendererInfo) => void;
  colorMode: ColorMode;
}

export const PointCloudViewer: React.FC<PointCloudViewerProps> = ({
  onStatsUpdate,
  pointSize,
  frustumCullingEnabled,
  onRendererDetected,
  colorMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const frustumCullingRef = useRef<FrustumCulling | null>(null);
  const animationIdRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const totalPointsRef = useRef<number>(0);
  const rendererInfoRef = useRef<RendererInfo | null>(null);
  const heatmapMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const originalMaterialRef = useRef<THREE.PointsMaterial | null>(null);
  const heightBoundsRef = useRef<{ min: number; max: number }>({ min: 0, max: 0 });

  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const resetCamera = useCallback(() => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(150, 100, 150);
      cameraRef.current.lookAt(0, 0, 0);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, []);

  useEffect(() => {
    if (resetCamera) {
      (window as any).resetPointCloudCamera = resetCamera;
    }
    return () => {
      delete (window as any).resetPointCloudCamera;
    };
  }, [resetCamera]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    let renderer: THREE.WebGLRenderer | null = null;

    const init = async () => {
      try {
        const rendererInfo = await detectBestRenderer();
        rendererInfoRef.current = rendererInfo;
        onRendererDetected?.(rendererInfo);

        if (!rendererInfo.supported) {
          setError('您的浏览器不支持 WebGL，请升级浏览器或启用硬件加速');
          setIsLoading(false);
          return;
        }

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a0f);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(
          60,
          container.clientWidth / container.clientHeight,
          0.1,
          1000
        );
        camera.position.set(150, 100, 150);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        try {
          renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
            failIfMajorPerformanceCaveat: false,
          });
        } catch (e) {
          console.warn('WebGL with antialias failed, trying without antialias:', e);
          renderer = new THREE.WebGLRenderer({
            antialias: false,
            powerPreference: 'high-performance',
            failIfMajorPerformanceCaveat: false,
          });
        }

        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 10;
        controls.maxDistance = 500;
        controlsRef.current = controls;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);

        const gridHelper = new THREE.GridHelper(200, 50, 0x333333, 0x222222);
        scene.add(gridHelper);

        const axesHelper = new THREE.AxesHelper(50);
        scene.add(axesHelper);

        setLoadingProgress(30);

        setTimeout(() => {
          try {
            const pointCloudData = generateTerrainPointCloud(1000000);
            setLoadingProgress(60);
            totalPointsRef.current = pointCloudData.pointCount;
            heightBoundsRef.current = {
              min: pointCloudData.boundingBox.min.y,
              max: pointCloudData.boundingBox.max.y,
            };

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(pointCloudData.positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(pointCloudData.colors, 3));

            const originalMaterial = new THREE.PointsMaterial({
              size: pointSize,
              vertexColors: true,
              sizeAttenuation: true,
              transparent: true,
              opacity: 0.9,
            });
            originalMaterialRef.current = originalMaterial;

            const heatmapMaterial = createHeightHeatmapMaterial({
              minHeight: pointCloudData.boundingBox.min.y,
              maxHeight: pointCloudData.boundingBox.max.y,
              pointSize: pointSize,
            });
            heatmapMaterialRef.current = heatmapMaterial;

            const points = new THREE.Points(
              geometry,
              colorMode === 'heatmap' ? heatmapMaterial : originalMaterial
            );
            scene.add(points);
            pointsRef.current = points;

            const frustumCulling = new FrustumCulling(
              pointCloudData.positions,
              pointCloudData.pointCount
            );
            frustumCulling.buildOctree(6, 1000);
            frustumCullingRef.current = frustumCulling;

            setLoadingProgress(100);
            setIsLoading(false);
          } catch (e) {
            console.error('Error generating point cloud:', e);
            setError('点云数据生成失败，请刷新页面重试');
            setIsLoading(false);
          }
        }, 500);

        const handleResize = () => {
          if (!container || !camera || !renderer) return;
          camera.aspect = container.clientWidth / container.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(container.clientWidth, container.clientHeight);
        };
        window.addEventListener('resize', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
        };
      } catch (e) {
        console.error('Error initializing renderer:', e);
        setError('渲染器初始化失败，请确保浏览器支持 WebGL 并启用硬件加速');
        setIsLoading(false);
      }
    };

    init();

    return () => {
      cancelAnimationFrame(animationIdRef.current);
      if (renderer) {
        if (container && renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
        renderer.dispose();
      }
    };
  }, [onRendererDetected, pointSize]);

  useEffect(() => {
    if (!pointsRef.current) return;

    if (colorMode === 'heatmap' && heatmapMaterialRef.current) {
      updateHeatmapMaterial(heatmapMaterialRef.current, {
        pointSize: pointSize,
        minHeight: heightBoundsRef.current.min,
        maxHeight: heightBoundsRef.current.max,
      });
      pointsRef.current.material = heatmapMaterialRef.current;
    } else if (originalMaterialRef.current) {
      originalMaterialRef.current.size = pointSize;
      pointsRef.current.material = originalMaterialRef.current;
    }
  }, [colorMode, pointSize]);

  useEffect(() => {
    if (isLoading || !pointsRef.current || !frustumCullingRef.current || !rendererRef.current) return;

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);

      if (controlsRef.current) {
        controlsRef.current.update();
      }

      const cullingStartTime = performance.now();
      let visiblePoints = totalPointsRef.current;

      try {
        if (frustumCullingEnabled && cameraRef.current && pointsRef.current) {
          const result = frustumCullingRef.current!.update(cameraRef.current);
          visiblePoints = result.visibleCount;

          const geometry = pointsRef.current.geometry;
          const index = geometry.getIndex();
          
          if (index) {
            const indexArray = index.array as Uint32Array;
            const count = Math.min(visiblePoints, indexArray.length);
            for (let i = 0; i < count; i++) {
              indexArray[i] = result.visibleIndices[i];
            }
            index.count = count;
            index.needsUpdate = true;
          } else {
            geometry.setIndex(new THREE.BufferAttribute(result.visibleIndices.slice(0, visiblePoints), 1));
          }
        } else if (pointsRef.current) {
          const geometry = pointsRef.current.geometry;
          if (geometry.getIndex()) {
            geometry.setIndex(null);
          }
          visiblePoints = totalPointsRef.current;
        }
      } catch (e) {
        console.warn('Frustum culling error:', e);
      }

      const cullingTime = performance.now() - cullingStartTime;

      try {
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      } catch (e) {
        console.error('Render error:', e);
      }

      frameCountRef.current++;
      const currentTime = performance.now();
      if (currentTime - lastTimeRef.current >= 1000) {
        const fps = (frameCountRef.current * 1000) / (currentTime - lastTimeRef.current);
        const memoryUsage = (totalPointsRef.current * (12 + 12)) / (1024 * 1024);

        onStatsUpdate({
          fps,
          totalPoints: totalPointsRef.current,
          visiblePoints,
          cullingTime,
          memoryUsage,
        });

        frameCountRef.current = 0;
        lastTimeRef.current = currentTime;
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(animationIdRef.current);
    };
  }, [isLoading, frustumCullingEnabled, onStatsUpdate]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {isLoading && !error && (
        <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-4 mx-auto" />
            <p className="text-zinc-400 text-sm mb-3">初始化渲染器...</p>
            <div className="w-48 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <p className="text-cyan-400 text-xs mt-2 font-mono">{loadingProgress}%</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center z-20">
          <div className="text-center max-w-md px-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">渲染初始化失败</h3>
            <p className="text-zinc-400 text-sm mb-6">{error}</p>
            <div className="text-left bg-zinc-800 rounded-lg p-4 mb-4">
              <p className="text-zinc-300 text-xs mb-2 font-semibold">可能的解决方案：</p>
              <ul className="text-zinc-400 text-xs space-y-1">
                <li>• 升级到最新版本的 Chrome、Firefox 或 Edge 浏览器</li>
                <li>• 在浏览器设置中启用硬件加速</li>
                <li>• 更新显卡驱动程序</li>
                <li>• Safari 用户请尝试使用 Chrome 或 Edge 浏览器</li>
              </ul>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              刷新页面重试
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
