import { useState, useEffect, useCallback } from 'react';
import { Video, Zap, Shield, Sparkles, XCircle, AlertTriangle, Image as ImageIcon, Scissors } from 'lucide-react';
import { VideoUploader } from '@/components/VideoUploader';
import { ThumbnailExtractor } from '@/components/ThumbnailExtractor';
import { VideoCropper } from '@/components/VideoCropper';
import { MetadataViewer } from '@/components/MetadataViewer';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { useFFmpeg } from '@/hooks/useFFmpeg';
import { VideoMetadata } from '@/types/video';

type TabType = 'thumbnail' | 'crop';

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | undefined>();
  const [activeTab, setActiveTab] = useState<TabType>('thumbnail');
  const [isProcessingMetadata, setIsProcessingMetadata] = useState(false);
  const [isProcessingThumbnail, setIsProcessingThumbnail] = useState(false);
  const [isProcessingCrop, setIsProcessingCrop] = useState(false);

  const { state, extractMetadata: ffmpegExtractMetadata, extractThumbnail, cropVideo, isFormatSupported, cancelOperation, cleanupObjectUrls } = useFFmpeg();

  useEffect(() => {
    return () => {
      cleanupObjectUrls();
    };
  }, [cleanupObjectUrls]);

  useEffect(() => {
    if (!selectedFile) {
      setMetadata(undefined);
      return;
    }

    const processVideo = async () => {
      setIsProcessingMetadata(true);
      try {
        const data = await ffmpegExtractMetadata(selectedFile);
        setMetadata(data);
      } catch (error) {
        console.error('Failed to extract metadata:', error);
      } finally {
        setIsProcessingMetadata(false);
      }
    };

    processVideo();
  }, [selectedFile, ffmpegExtractMetadata]);

  const handleExtractThumbnail = useCallback(
    async (time: number) => {
      if (!selectedFile) return;
      setIsProcessingThumbnail(true);
      try {
        await extractThumbnail(selectedFile, time);
      } catch (error) {
        console.error('Failed to extract thumbnail:', error);
      } finally {
        setIsProcessingThumbnail(false);
      }
    },
    [selectedFile, extractThumbnail]
  );

  const handleCropVideo = useCallback(
    async (startTime: number, endTime: number) => {
      if (!selectedFile) throw new Error('No file selected');
      setIsProcessingCrop(true);
      try {
        const url = await cropVideo(selectedFile, startTime, endTime);
        return url;
      } finally {
        setIsProcessingCrop(false);
      }
    },
    [selectedFile, cropVideo]
  );

  const handleFileSelect = (file: File | null) => {
    setSelectedFile(file);
    setMetadata(undefined);
  };

  const handleCancel = () => {
    cancelOperation();
    setIsProcessingMetadata(false);
    setIsProcessingThumbnail(false);
    setIsProcessingCrop(false);
  };

  const isProcessing = isProcessingMetadata || isProcessingThumbnail || isProcessingCrop;

  const tabs = [
    { id: 'thumbnail' as TabType, icon: ImageIcon, label: '缩略图' },
    { id: 'crop' as TabType, icon: Scissors, label: '视频裁剪' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:60px_60px]" />

      <div className="relative">
        <header className="border-b border-slate-700/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                  <Video className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">Video Analyzer</h1>
                  <p className="text-slate-400 text-sm">纯前端视频分析工具</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 text-sm font-medium rounded-full">
                  最大支持 200MB
                </span>
              </div>
            </div>
          </div>
        </header>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-full border border-slate-700 mb-6">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-slate-300 text-sm">无需上传服务器 · 隐私保护</span>
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
              快速分析您的
              <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">
                {' '}视频文件
              </span>
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              利用 WebAssembly 技术在浏览器本地处理视频，无需上传到服务器，
              安全、快速、高效
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
            {[
              { icon: Zap, title: '极速处理', desc: 'WebAssembly 技术，本地处理无需等待' },
              { icon: Shield, title: '隐私安全', desc: '所有操作在浏览器内完成，数据不上传' },
              { icon: Video, title: '功能强大', desc: '提取缩略图、视频裁剪、查看编码信息' },
            ].map((feature, index) => (
              <div key={index} className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 hover:border-cyan-500/50 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-cyan-400" />
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-slate-400">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <div className="space-y-6">
            <div className="relative">
              <VideoUploader
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
                isFormatSupported={isFormatSupported}
              />
              {isProcessing && (
                <button
                  onClick={handleCancel}
                  className="absolute top-4 right-4 flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  <span className="text-sm">取消</span>
                </button>
              )}
            </div>

            {state.error && (
              <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-red-400">{state.error}</p>
              </div>
            )}

            <ProcessingStatus state={state} />

            {selectedFile && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div className="flex gap-2 p-1 bg-slate-800/50 rounded-xl">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${activeTab === tab.id ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-lg shadow-cyan-500/25' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                      >
                        <tab.icon className="w-5 h-5" />
                        <span>{tab.label}</span>
                      </button>
                    ))}
                  </div>

                  {activeTab === 'thumbnail' && (
                    <ThumbnailExtractor
                      file={selectedFile}
                      onExtract={handleExtractThumbnail}
                      duration={metadata?.format?.duration || 0}
                      isLoading={isProcessingThumbnail}
                    />
                  )}

                  {activeTab === 'crop' && (
                    <VideoCropper
                      file={selectedFile}
                      duration={metadata?.format?.duration || 0}
                      onCrop={handleCropVideo}
                      isLoading={isProcessingCrop}
                    />
                  )}
                </div>

                <MetadataViewer
                  metadata={metadata}
                  isLoading={isProcessingMetadata}
                />
              </div>
            )}
          </div>
        </section>

        <footer className="border-t border-slate-700/50 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-slate-500 text-sm">
              基于 FFmpeg.wasm 构建 · 支持 MP4, WebM, AVI, MOV, MKV 等格式
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
