import React, { useState } from 'react';
import { useQuery } from '@apollo/client';
import { GET_USERS, GET_SHORTEST_PATH, GET_SUBGRAPH } from '../../graphql/queries';
import GraphVisualization from '../GraphVisualization';

const ShortestPathPanel = () => {
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');

  const { data: usersData } = useQuery(GET_USERS);
  const { data: pathData, loading: pathLoading } = useQuery(GET_SHORTEST_PATH, {
    variables: { fromId, toId },
    skip: !fromId || !toId,
  });

  const { data: subgraphData } = useQuery(GET_SUBGRAPH, {
    variables: { centerId: fromId, depth: 3 },
    skip: !fromId,
  });

  const users = usersData?.users || [];
  const pathNodes = pathData?.shortestPath.nodes || [];
  const pathNodeIds = pathNodes.map(n => n.id);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 bg-white border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">最短路径查询</h3>
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">起点用户</label>
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md min-w-40"
            >
              <option value="">请选择...</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">终点用户</label>
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md min-w-40"
            >
              <option value="">请选择...</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4">
        {pathLoading ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500">加载中...</p>
          </div>
        ) : pathData ? (
          <div className="h-full">
            {pathData.shortestPath.length === -1 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-red-500">两个用户之间没有连接路径</p>
              </div>
            ) : (
              <>
                <div className="mb-3">
                  <p className="text-sm text-gray-600 mb-2">
                    路径长度: <span className="font-semibold text-blue-600">{pathData.shortestPath.length}</span> 步
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {pathNodes.map((node, idx) => (
                      <React.Fragment key={node.id}>
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm">
                          {node.name}
                        </span>
                        {idx < pathNodes.length - 1 && (
                          <span className="text-gray-400">→</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                {subgraphData && (
                  <div className="h-[calc(100%-80px)]">
                    <GraphVisualization
                      nodes={subgraphData.getSubGraph.nodes}
                      links={subgraphData.getSubGraph.links}
                      highlightNodes={pathNodeIds}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500">请选择起点和终点用户查询最短路径</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShortestPathPanel;
