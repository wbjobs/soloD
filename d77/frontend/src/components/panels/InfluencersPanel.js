import React, { useState } from 'react';
import { useQuery } from '@apollo/client';
import { GET_KEY_INFLUENCERS } from '../../graphql/queries';

const InfluencersPanel = () => {
  const [limit, setLimit] = useState(10);

  const { data, loading } = useQuery(GET_KEY_INFLUENCERS, {
    variables: { limit },
  });

  const influencers = data?.keyInfluencers || [];

  const maxDegree = influencers.length > 0 ? Math.max(...influencers.map(i => i.degree)) : 1;

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 bg-white border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">关键节点影响力</h3>
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">显示数量</label>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value={5}>5 个</option>
              <option value={10}>10 个</option>
              <option value={20}>20 个</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500">加载中...</p>
          </div>
        ) : influencers.length > 0 ? (
          <div className="space-y-4">
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <span className="font-semibold">说明：</span>
                影响力评分基于节点度中心性（Degree Centrality）计算，
                表示该用户拥有的好友数量。度数越高，影响力越大。
              </p>
            </div>

            <div className="space-y-3">
              {influencers.map((item, index) => {
                const percentage = (item.degree / maxDegree) * 100;
                return (
                  <div
                    key={item.user.id}
                    className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm"
                  >
                    <div className="flex items-center gap-4 mb-3">
                      <div className="w-8 h-8 flex items-center justify-center rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold text-sm">
                        {index + 1}
                      </div>
                      {item.user.avatar && (
                        <img
                          src={item.user.avatar}
                          alt={item.user.name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-800">{item.user.name}</h4>
                        <p className="text-sm text-gray-500">
                          好友数量: <span className="font-bold text-blue-600">{item.degree}</span>
                        </p>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-blue-400 to-purple-500 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="mt-1 text-right text-xs text-gray-500">
                      影响力: {percentage.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500">暂无数据，请先生成示例数据</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InfluencersPanel;
