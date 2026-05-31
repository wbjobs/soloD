import React, { useState, useEffect } from 'react';
import { Table, Tag, message } from 'antd';
import { permissionAPI } from '../services/api';

const Permissions = () => {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    setLoading(true);
    try {
      const response = await permissionAPI.getPermissions();
      setPermissions(response.data);
    } catch (error) {
      message.error('加载权限列表失败');
    } finally {
      setLoading(false);
    }
  };

  const getPermissionColor = (code) => {
    if (code.startsWith('user:')) return 'blue';
    if (code.startsWith('role:')) return 'green';
    if (code.startsWith('permission:')) return 'orange';
    return 'default';
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    { title: '权限名称', dataIndex: 'name', key: 'name' },
    {
      title: '权限代码',
      dataIndex: 'code',
      key: 'code',
      render: (code) => (
        <Tag color={getPermissionColor(code)}>{code}</Tag>
      )
    },
    { title: '描述', dataIndex: 'description', key: 'description' }
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>权限列表</h2>
      <Table
        columns={columns}
        dataSource={permissions}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
};

export default Permissions;
