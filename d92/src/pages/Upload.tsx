import ChunkUploader from '@/components/ChunkUploader';
import type { ObservationMetadata } from '@/lib/api';

const Upload = () => {
  const handleUploadComplete = (metadata: ObservationMetadata) => {
    console.log('Upload complete:', metadata);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">数据上传</h1>
        <p className="text-nebula-400">
          支持FITS格式文件的分块上传，自动提取元数据并存档
        </p>
      </div>

      <ChunkUploader onUploadComplete={handleUploadComplete} />

      <div className="mt-8 glass-card rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">上传说明</h3>
        <ul className="space-y-3 text-sm text-nebula-300">
          <li className="flex items-start space-x-3">
            <div className="w-5 h-5 bg-cosmic-500/20 rounded flex items-center justify-center mt-0.5">
              <span className="text-cosmic-500 text-xs">1</span>
            </div>
            <span>选择FITS格式文件 (.fits 或 .fit)</span>
          </li>
          <li className="flex items-start space-x-3">
            <div className="w-5 h-5 bg-cosmic-500/20 rounded flex items-center justify-center mt-0.5">
              <span className="text-cosmic-500 text-xs">2</span>
            </div>
            <span>系统自动计算文件 SHA-256 哈希值进行完整性校验</span>
          </li>
          <li className="flex items-start space-x-3">
            <div className="w-5 h-5 bg-cosmic-500/20 rounded flex items-center justify-center mt-0.5">
              <span className="text-cosmic-500 text-xs">3</span>
            </div>
            <span>文件按 5MB 分块并行上传，支持断点续传</span>
          </li>
          <li className="flex items-start space-x-3">
            <div className="w-5 h-5 bg-cosmic-500/20 rounded flex items-center justify-center mt-0.5">
              <span className="text-cosmic-500 text-xs">4</span>
            </div>
            <span>上传完成后自动提取元数据（观测时间、频率、坐标等）</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default Upload;
