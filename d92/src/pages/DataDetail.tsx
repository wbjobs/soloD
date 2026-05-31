import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Calendar, Clock, MapPin, Hash, Download, Loader2, Archive, TrendingDown } from 'lucide-react';
import { observationsApi, type ObservationMetadata } from '@/lib/api';
import { formatFileSize } from '@/lib/hash';

const DataDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [observation, setObservation] = useState<ObservationMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const response = await observationsApi.getObservation(id);
        setObservation(response.data);
      } catch (error) {
        console.error('Failed to load observation:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-12 h-12 text-cosmic-500 animate-spin mb-4" />
        <p className="text-nebula-400">加载中...</p>
      </div>
    );
  }

  if (!observation) {
    return (
      <div className="text-center py-20">
        <FileText className="w-16 h-16 text-nebula-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">数据不存在</h2>
        <p className="text-nebula-400 mb-6">未找到该观测数据记录</p>
        <Link
          to="/data"
          className="inline-flex items-center space-x-2 px-4 py-2 bg-cosmic-500 hover:bg-cosmic-400 text-space-950 font-semibold rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回列表</span>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Link
            to="/data"
            className="p-2 bg-space-800 hover:bg-space-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-nebula-300" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-white">观测数据详情</h1>
            <p className="text-nebula-400 mt-1">{observation.file_name}</p>
          </div>
        </div>
        <button className="flex items-center space-x-2 px-4 py-2 bg-cosmic-500 hover:bg-cosmic-400 text-space-950 font-semibold rounded-lg transition-colors">
          <Download className="w-4 h-4" />
          <span>下载文件</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <FileText className="w-5 h-5 text-cosmic-500 mr-2" />
              文件信息
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-nebula-400 mb-1">文件名</p>
                <p className="text-white font-mono">{observation.file_name}</p>
              </div>
              <div>
                <p className="text-sm text-nebula-400 mb-1">文件大小</p>
                <p className="text-white">{formatFileSize(observation.file_size)}</p>
              </div>
              <div>
                <p className="text-sm text-nebula-400 mb-1">SHA-256 哈希</p>
                <p className="text-white font-mono text-sm break-all bg-space-800/50 p-3 rounded-lg">
                  {observation.file_hash}
                </p>
              </div>
              <div>
                <p className="text-sm text-nebula-400 mb-1">预估下载时间</p>
                <div className="flex items-center space-x-2">
                  <Download className="w-4 h-4 text-cosmic-500" />
                  <p className="text-white font-semibold">
                    {observation.estimated_download_time_str}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Archive className="w-5 h-5 text-cosmic-500 mr-2" />
              压缩信息
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-nebula-400 mb-1">压缩状态</p>
                <div className="flex items-center space-x-2">
                  {observation.is_compressed ? (
                    <>
                      <Archive className="w-4 h-4 text-green-400" />
                      <span className="text-green-400 font-semibold">已压缩 (FITS.fz)</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 text-nebula-400" />
                      <span className="text-nebula-300">原始格式</span>
                    </>
                  )}
                </div>
              </div>
              {observation.compression_ratio && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-space-800/50 rounded-lg">
                    <p className="text-xs text-nebula-400 mb-1">压缩比</p>
                    <p className="text-xl font-semibold text-cosmic-500">
                      {observation.compression_ratio.toFixed(2)}x
                    </p>
                  </div>
                  <div className="p-3 bg-space-800/50 rounded-lg">
                    <p className="text-xs text-nebula-400 mb-1">节省空间</p>
                    <div className="flex items-center space-x-1">
                      <TrendingDown className="w-4 h-4 text-green-400" />
                      <p className="text-xl font-semibold text-green-400">
                        {observation.original_size && observation.compressed_size
                          ? formatFileSize(observation.original_size - observation.compressed_size)
                          : '-'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {observation.original_size && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-space-700">
                  <div>
                    <p className="text-xs text-nebula-400 mb-1">原始大小</p>
                    <p className="text-white">{formatFileSize(observation.original_size)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-nebula-400 mb-1">压缩后大小</p>
                    <p className="text-white">{formatFileSize(observation.compressed_size || observation.file_size)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="glass-card rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <MapPin className="w-5 h-5 text-cosmic-500 mr-2" />
              天球坐标
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-space-800/50 rounded-lg">
                <p className="text-sm text-nebula-400 mb-1">赤经 (RA)</p>
                <p className="text-2xl font-semibold text-cosmic-500">
                  {observation.ra.toFixed(6)}°
                </p>
              </div>
              <div className="p-4 bg-space-800/50 rounded-lg">
                <p className="text-sm text-nebula-400 mb-1">赤纬 (Dec)</p>
                <p className="text-2xl font-semibold text-cosmic-500">
                  {observation.dec.toFixed(6)}°
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Calendar className="w-5 h-5 text-cosmic-500 mr-2" />
              观测时间
            </h3>
            <div className="p-4 bg-space-800/50 rounded-lg">
              <p className="text-sm text-nebula-400 mb-1">观测日期</p>
              <p className="text-xl font-semibold text-white">
                {new Date(observation.observation_time).toLocaleDateString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
              <div className="flex items-center space-x-2 mt-3 text-nebula-300">
                <Clock className="w-4 h-4" />
                <span>{new Date(observation.observation_time).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Hash className="w-5 h-5 text-cosmic-500 mr-2" />
              频率范围
            </h3>
            <div className="p-4 bg-space-800/50 rounded-lg">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-sm text-nebula-400 mb-1">起始频率</p>
                  <p className="text-xl font-semibold text-white">{observation.frequency_start} MHz</p>
                </div>
                <div className="text-2xl text-cosmic-500 mx-4">—</div>
                <div className="text-right">
                  <p className="text-sm text-nebula-400 mb-1">终止频率</p>
                  <p className="text-xl font-semibold text-white">{observation.frequency_end} MHz</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-space-700">
                <p className="text-sm text-nebula-400 mb-1">带宽</p>
                <p className="text-lg font-semibold text-cosmic-500">
                  {(observation.frequency_end - observation.frequency_start).toFixed(2)} MHz
                </p>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">记录信息</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-nebula-400">记录 ID</span>
                <span className="text-white font-mono text-sm">{observation.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-nebula-400">归档时间</span>
                <span className="text-white">
                  {new Date(observation.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataDetail;
