import React, { useState } from 'react';
import { useQuery } from '@apollo/client';
import { GET_USERS, GET_SUBGRAPH } from '../../graphql/queries';
import GraphVisualization from '../GraphVisualization';

const SubgraphPanel = () => {
  const [centerId, setCenterId] = useState('');
  const [depth, setDepth] = useState(2);

  const { data: usersData } = useQuery(GET_USERS);
  const { data: subgraphData, loading } = useQuery(GET_SUBGRAPH, {
    variables: { centerId, depth },
    skip: !centerId,
  });

  const users = usersData?.users || [];

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 bg-white border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">子图查询</h3>
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">选择中心用户</label>
            <select
              value={centerId}
              onChange={(e) => setCenterId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md min-w-48"
            >
              <option value="">请选择...</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">查询深度</label>
            <select
              value={depth}
              onChange={(e) => setDepth(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value={1}>1 层</option>
              <option value={2}>2 层</option>
              <option value={3}>3 层</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500">加载中...</p>
          </div>
        ) : subgraphData ? (
          <div className="h-full">
            <div className="mb-3 text-sm text-gray-600">
              节点数: {subgraphData.getSubGraph.nodes.length} | 
              边数: {subgraphData.getSubGraph.links.length}
            </div>
            <div className="h-[calc(100%-30px)]">
              <GraphVisualization
                nodes={subgraphData.getSubGraph.nodes}
                links={subgraphData.getSubGraph.links}
                highlightNodes={[centerId]}
              />
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500">请选择一个中心用户查看子图</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubgraphPanel;
