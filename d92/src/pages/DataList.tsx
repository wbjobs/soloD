import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Calendar, Clock, ChevronRight, Loader2, MapPin, Download, Archive } from 'lucide-react';
import { observationsApi, type ObservationMetadata } from '@/lib/api';
import { formatFileSize } from '@/lib/hash';

const DataList = () => {
  const [observations, setObservations] = useState<ObservationMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const response = await observationsApi.getObservations(page, pageSize);
        setObservations(response.data.data);
        setTotal(response.data.total);
      } catch (error) {
        console.error('Failed to load observations:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [page]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">数据列表</h1>
          <p className="text-nebula-400">查看所有已归档的射电望远镜观测数据</p>
        </div>
        <div className="text-sm text-nebula-300">
          共 <span className="text-cosmic-500 font-semibold">{total}</span> 条记录
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-space-800/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-nebula-400 uppercase tracking-wider">
                  文件名
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-nebula-400 uppercase tracking-wider">
                  压缩状态
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-nebula-400 uppercase tracking-wider">
                  文件大小
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-nebula-400 uppercase tracking-wider">
                  预估下载
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-nebula-400 uppercase tracking-wider">
                  天球坐标
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-nebula-400 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-space-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 text-cosmic-500 animate-spin mx-auto" />
                    <p className="text-nebula-400 mt-2">加载中...</p>
                  </td>
                </tr>
              ) : observations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <FileText className="w-12 h-12 text-nebula-500 mx-auto mb-3" />
                    <p className="text-nebula-400">暂无观测数据</p>
                  </td>
                </tr>
              ) : (
                observations.map((obs) => (
                  <tr key={obs.id} className="hover:bg-space-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-cosmic-500/20 rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-cosmic-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white truncate max-w-xs">
                            {obs.file_name}
                          </p>
                          <p className="text-xs text-nebula-500 font-mono truncate">
                            {obs.file_hash.substring(0, 16)}...
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {obs.is_compressed ? (
                        <div className="flex items-center space-x-2">
                          <Archive className="w-4 h-4 text-green-400" />
                          <span className="text-sm text-green-400">已压缩</span>
                          {obs.compression_ratio && (
                            <span className="text-xs text-nebula-500">
                              ({obs.compression_ratio.toFixed(2)}x)
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-nebula-500" />
                          <span className="text-sm text-nebula-400">原始</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-nebula-300">
                        {formatFileSize(obs.file_size)}
                      </div>
                      {obs.original_size && obs.compressed_size && (
                        <div className="text-xs text-green-400">
                          节省 {formatFileSize(obs.original_size - obs.compressed_size)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2 text-sm text-nebula-300">
                        <Download className="w-4 h-4 text-cosmic-500" />
                        <span>{obs.estimated_download_time_str}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2 text-sm text-nebula-300">
                        <MapPin className="w-4 h-4 text-cosmic-500" />
                        <span>RA: {obs.ra.toFixed(2)}°</span>
                      </div>
                      <div className="text-xs text-nebula-500 ml-6 mt-1">
                        Dec: {obs.dec.toFixed(2)}°
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        to={`/data/${obs.id}`}
                        className="inline-flex items-center space-x-1 px-3 py-1.5 bg-cosmic-500/10 hover:bg-cosmic-500/20 text-cosmic-500 rounded-lg text-sm font-medium transition-colors"
                      >
                        <span>查看</span>
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-space-700 flex items-center justify-between">
            <div className="text-sm text-nebula-400">
              第 {page} / {totalPages} 页
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 bg-space-800 hover:bg-space-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
              >
                上一页
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 bg-space-800 hover:bg-space-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataList;
