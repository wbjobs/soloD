import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, CheckCircle, XCircle, Loader2, File } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadApi, type ObservationMetadata } from '@/lib/api';
import { calculateFileSHA256, formatFileSize } from '@/lib/hash';

interface ChunkUploaderProps {
  onUploadComplete?: (metadata: ObservationMetadata) => void;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_CONCURRENT = 3;

const ChunkUploader = ({ onUploadComplete }: ChunkUploaderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'hashing' | 'uploading' | 'processing' | 'complete' | 'error'>('idle');
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [chunkProgress, setChunkProgress] = useState<boolean[]>([]);
  const [fileHash, setFileHash] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [metadata, setMetadata] = useState<ObservationMetadata | null>(null);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const abortRef = useRef(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const totalChunks = file ? Math.ceil(file.size / CHUNK_SIZE) : 0;
  const completedChunks = chunkProgress.filter(Boolean).length;
  const progress = totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0;

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const pollTaskStatus = async (taskUploadId: string) => {
    try {
      const response = await uploadApi.getUploadStatus(taskUploadId);
      const { status, progress: taskProgress, error: taskError, result } = response.data;
      
      setProcessingProgress(taskProgress || 0);

      if (status === 'completed') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        setUploadStatus('complete');
        
        if (result?.metadata) {
          setMetadata({
            id: result.observation_id,
            file_hash: result.file_hash,
            file_name: file?.name || '',
            file_size: file?.size || 0,
            observation_time: result.metadata.observation_time,
            frequency_start: result.metadata.frequency_start || 0,
            frequency_end: result.metadata.frequency_end || 0,
            ra: result.metadata.ra,
            dec: result.metadata.dec,
            created_at: new Date().toISOString(),
          } as ObservationMetadata);
        }
      } else if (status === 'failed') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        setUploadStatus('error');
        setError(taskError || '处理失败');
      }
    } catch (err) {
      console.error('Polling failed:', err);
    }
  };

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.fits')) {
      setError('请选择FITS格式文件');
      return;
    }
    setFile(selectedFile);
    setError('');
    setUploadStatus('idle');
    setChunkProgress([]);
    setFileHash('');
    setMetadata(null);
    setProcessingProgress(0);
  }, []);

  const startUpload = async () => {
    if (!file) return;

    abortRef.current = false;
    setUploadStatus('hashing');
    setError('');

    try {
      const hash = await calculateFileSHA256(file);
      setFileHash(hash);

      setUploadStatus('uploading');

      const initResponse = await uploadApi.initUpload({
        file_name: file.name,
        file_size: file.size,
        total_chunks: totalChunks,
      });

      const { upload_id } = initResponse.data;
      setUploadId(upload_id);
      setChunkProgress(new Array(totalChunks).fill(false));

      let currentChunk = 0;
      const activeWorkers: Promise<void>[] = [];

      while (currentChunk < totalChunks && !abortRef.current) {
        while (activeWorkers.length < MAX_CONCURRENT && currentChunk < totalChunks) {
          const chunkIndex = currentChunk;
          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);

          const worker = (async () => {
            const formData = new FormData();
            formData.append('upload_id', upload_id);
            formData.append('chunk_index', chunkIndex.toString());
            formData.append('chunk', chunk);

            try {
              await uploadApi.uploadChunk(formData);
              setChunkProgress((prev) => {
                const next = [...prev];
                next[chunkIndex] = true;
                return next;
              });
            } catch (err) {
              console.error(`Chunk ${chunkIndex} failed:`, err);
            }
          })();

          activeWorkers.push(worker);
          currentChunk++;
        }

        await Promise.race(activeWorkers);
        const index = activeWorkers.findIndex((w) => w !== undefined);
        if (index > -1) {
          activeWorkers.splice(index, 1);
        }
      }

      await Promise.all(activeWorkers);

      if (abortRef.current) return;

      await uploadApi.completeUpload({
        upload_id,
        file_hash: hash,
      });

      setUploadStatus('processing');
      setProcessingProgress(0);
      
      pollIntervalRef.current = setInterval(() => {
        pollTaskStatus(upload_id);
      }, 1000);

    } catch (err) {
      console.error('Upload failed:', err);
      setUploadStatus('error');
      setError('上传失败，请重试');
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div className="space-y-6">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300',
          isDragging
            ? 'border-cosmic-500 bg-cosmic-500/10'
            : 'border-space-700 hover:border-space-600 bg-space-900/50',
          uploadStatus !== 'idle' && 'pointer-events-none opacity-60'
        )}
      >
        <input
          type="file"
          accept=".fits,.fit"
          onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          disabled={uploadStatus !== 'idle'}
        />
        <Upload className="w-12 h-12 mx-auto mb-4 text-nebula-400" />
        <p className="text-lg font-medium text-white mb-2">
          拖拽FITS文件到此处或点击上传
        </p>
        <p className="text-sm text-nebula-400">支持 .fits 或 .fit 格式</p>
      </div>

      {file && (
        <div className="glass-card rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-cosmic-500/20 rounded-lg flex items-center justify-center">
                <File className="w-5 h-5 text-cosmic-500" />
              </div>
              <div>
                <p className="font-medium text-white">{file.name}</p>
                <p className="text-sm text-nebula-400">{formatFileSize(file.size)}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {uploadStatus === 'hashing' && (
                <>
                  <Loader2 className="w-5 h-5 text-cosmic-500 animate-spin" />
                  <span className="text-sm text-nebula-300">计算哈希...</span>
                </>
              )}
              {uploadStatus === 'uploading' && (
                <>
                  <Loader2 className="w-5 h-5 text-cosmic-500 animate-spin" />
                  <span className="text-sm text-nebula-300">上传中 {completedChunks}/{totalChunks}</span>
                </>
              )}
              {uploadStatus === 'processing' && (
                <>
                  <Loader2 className="w-5 h-5 text-cosmic-500 animate-spin" />
                  <span className="text-sm text-nebula-300">处理中 {processingProgress}%</span>
                </>
              )}
              {uploadStatus === 'complete' && (
                <>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-sm text-green-500">上传完成</span>
                </>
              )}
              {uploadStatus === 'error' && (
                <>
                  <XCircle className="w-5 h-5 text-red-500" />
                  <span className="text-sm text-red-500">上传失败</span>
                </>
              )}
            </div>
          </div>

          {(uploadStatus === 'uploading' || uploadStatus === 'processing') && (
            <div className="mb-4">
              <div className="h-2 bg-space-800 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full upload-progress-bar transition-all duration-300"
                  style={{ 
                    width: `${uploadStatus === 'uploading' ? progress : processingProgress}%` 
                  }}
                />
              </div>
              {uploadStatus === 'uploading' && (
                <div className="flex flex-wrap gap-1">
                  {chunkProgress.map((done, i) => (
                    <div
                      key={i}
                      className={cn(
                        'w-3 h-3 rounded transition-colors',
                        done ? 'bg-cosmic-500' : 'bg-space-700'
                      )}
                      title={`Chunk ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {fileHash && (
            <div className="mb-4 p-3 bg-space-800/50 rounded-lg">
              <p className="text-xs text-nebula-400 mb-1">SHA-256 哈希</p>
              <p className="text-sm font-mono text-nebula-200 truncate">{fileHash}</p>
            </div>
          )}

          {uploadStatus === 'idle' && (
            <button
              onClick={startUpload}
              className="w-full py-3 bg-cosmic-500 hover:bg-cosmic-400 text-space-950 font-semibold rounded-lg transition-colors"
            >
              开始上传
            </button>
          )}

          {uploadStatus === 'error' && (
            <button
              onClick={startUpload}
              className="w-full py-3 bg-cosmic-500 hover:bg-cosmic-400 text-space-950 font-semibold rounded-lg transition-colors"
            >
              重试上传
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {metadata && (
        <div className="glass-card rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
            <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
            元数据提取完成
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-space-800/50 rounded-lg">
              <p className="text-xs text-nebula-400 mb-1">观测时间</p>
              <p className="text-sm text-white">{new Date(metadata.observation_time).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-space-800/50 rounded-lg">
              <p className="text-xs text-nebula-400 mb-1">频率范围</p>
              <p className="text-sm text-white">{metadata.frequency_start} - {metadata.frequency_end} MHz</p>
            </div>
            <div className="p-3 bg-space-800/50 rounded-lg">
              <p className="text-xs text-nebula-400 mb-1">赤经 (RA)</p>
              <p className="text-sm text-white">{metadata.ra.toFixed(4)}°</p>
            </div>
            <div className="p-3 bg-space-800/50 rounded-lg">
              <p className="text-xs text-nebula-400 mb-1">赤纬 (Dec)</p>
              <p className="text-sm text-white">{metadata.dec.toFixed(4)}°</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChunkUploader;
