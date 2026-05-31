import React, { useState, useEffect } from 'react';
import { Table, Card, Select, DatePicker, Input, Space, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { logAPI } from '../services/api';
import { useAuth } from '../utils/auth';

const { RangePicker } = DatePicker;

const Logs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    actionType: '',
    username: '',
    dateRange: null
  });
  const { user } = useAuth();

  useEffect(() => {
    loadLogs();
  }, [filters]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const response = await logAPI.getLogs(filters);
      setLogs(response.data);
    } catch (error) {
      console.error('加载日志失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionTypeColor = (actionType) => {
    const colors = {
      'login': 'green',
      'logout': 'orange',
      'user:create': 'blue',
      'user:update': 'cyan',
      'user:delete': 'red',
      'role:create': 'purple',
      'role:update': 'magenta',
      'role:delete': 'red',
      'role:assign': 'gold',
      'permission:assign': 'lime'
    };
    return colors[actionType] || 'default';
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80
    },
    {
      title: '操作时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text) => new Date(text).toLocaleString('zh-CN')
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 120
    },
    {
      title: '租户ID',
      dataIndex: 'tenant_id',
      key: 'tenant_id',
      width: 100
    },
    {
      title: '操作类型',
      dataIndex: 'action_type',
      key: 'action_type',
      width: 150,
      render: (text) => (
        <Tag color={getActionTypeColor(text)}>{text}</Tag>
      )
    },
    {
      title: '操作描述',
      dataIndex: 'description',
      key: 'description'
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 130
    }
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>操作日志</h2>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="操作类型"
            style={{ width: 150 }}
            allowClear
            value={filters.actionType || undefined}
            onChange={(value) => setFilters({ ...filters, actionType: value || '' })}
          >
            <Select.Option value="login">登录</Select.Option>
            <Select.Option value="logout">登出</Select.Option>
            <Select.Option value="user:create">创建用户</Select.Option>
            <Select.Option value="user:update">更新用户</Select.Option>
            <Select.Option value="user:delete">删除用户</Select.Option>
            <Select.Option value="role:create">创建角色</Select.Option>
            <Select.Option value="role:update">更新角色</Select.Option>
            <Select.Option value="role:delete">删除角色</Select.Option>
            <Select.Option value="role:assign">分配角色</Select.Option>
            <Select.Option value="permission:assign">分配权限</Select.Option>
          </Select>
          <Input
            placeholder="用户名"
            prefix={<SearchOutlined />}
            style={{ width: 150 }}
            value={filters.username}
            onChange={(e) => setFilters({ ...filters, username: e.target.value })}
          />
          <RangePicker
            style={{ width: 280 }}
            value={filters.dateRange}
            onChange={(dates) => setFilters({ ...filters, dateRange: dates })}
          />
        </Space>
      </Card>
      <Table
        columns={columns}
        dataSource={logs}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
};

export default Logs;
