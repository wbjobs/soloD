import React, { useState } from 'react';
import { useMutation } from '@apollo/client';
import { GENERATE_SAMPLE_DATA, CLEAR_ALL_DATA, GET_USERS } from '../graphql/queries';

const Sidebar = ({ activeTab, setActiveTab }) => {
  const [userCount, setUserCount] = useState(20);
  const [friendshipCount, setFriendshipCount] = useState(50);

  const [generateSampleData] = useMutation(GENERATE_SAMPLE_DATA, {
    refetchQueries: [{ query: GET_USERS }],
  });

  const [clearAllData] = useMutation(CLEAR_ALL_DATA, {
    refetchQueries: [{ query: GET_USERS }],
  });

  const handleGenerateData = async () => {
    await generateSampleData({ variables: { userCount, friendshipCount } });
    alert('示例数据生成成功！');
  };

  const handleClearData = async () => {
    if (window.confirm('确定要清除所有数据吗？')) {
      await clearAllData();
      alert('数据已清除！');
    }
  };

  const tabs = [
    { id: 'subgraph', label: '子图查询' },
    { id: 'shortestPath', label: '最短路径' },
    { id: 'mutualFriends', label: '共同好友' },
    { id: 'influencers', label: '关键节点' },
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-800">社交网络分析</h2>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {tabs.map(tab => (
            <li key={tab.id}>
              <button
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-200 space-y-3">
        <h3 className="font-semibold text-gray-700 mb-2">数据管理</h3>
        <div>
          <label className="block text-sm text-gray-600 mb-1">用户数量</label>
          <input
            type="number"
            value={userCount}
            onChange={(e) => setUserCount(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">好友关系数</label>
          <input
            type="number"
            value={friendshipCount}
            onChange={(e) => setFriendshipCount(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <button
          onClick={handleGenerateData}
          className="w-full bg-green-500 text-white py-2 px-4 rounded-md hover:bg-green-600 transition-colors text-sm"
        >
          生成示例数据
        </button>
        <button
          onClick={handleClearData}
          className="w-full bg-red-500 text-white py-2 px-4 rounded-md hover:bg-red-600 transition-colors text-sm"
        >
          清除所有数据
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
