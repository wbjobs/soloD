import React, { useState } from 'react';
import { useQuery } from '@apollo/client';
import { GET_USERS, GET_MUTUAL_FRIENDS } from '../../graphql/queries';

const MutualFriendsPanel = () => {
  const [userId1, setUserId1] = useState('');
  const [userId2, setUserId2] = useState('');

  const { data: usersData } = useQuery(GET_USERS);
  const { data: mutualData, loading } = useQuery(GET_MUTUAL_FRIENDS, {
    variables: { userId1, userId2 },
    skip: !userId1 || !userId2,
  });

  const users = usersData?.users || [];
  const mutualFriends = mutualData?.mutualFriends || [];

  const user1 = users.find(u => u.id === userId1);
  const user2 = users.find(u => u.id === userId2);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 bg-white border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">共同好友查询</h3>
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">用户 A</label>
            <select
              value={userId1}
              onChange={(e) => setUserId1(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md min-w-40"
            >
              <option value="">请选择...</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">用户 B</label>
            <select
              value={userId2}
              onChange={(e) => setUserId2(e.target.value)}
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

      <div className="flex-1 p-4 overflow-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500">加载中...</p>
          </div>
        ) : mutualData ? (
          <div>
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                <span className="font-semibold">{user1?.name}</span> 和 
                <span className="font-semibold"> {user2?.name}</span> 共有 
                <span className="font-bold text-green-600"> {mutualFriends.length}</span> 位共同好友
              </p>
            </div>
            {mutualFriends.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {mutualFriends.map(friend => (
                  <div
                    key={friend.id}
                    className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      {friend.avatar && (
                        <img
                          src={friend.avatar}
                          alt={friend.name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      )}
                      <div>
                        <h4 className="font-semibold text-gray-800">{friend.name}</h4>
                        <p className="text-sm text-gray-500">{friend.email}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">这两个用户没有共同好友</p>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500">请选择两个用户查询共同好友</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MutualFriendsPanel;
