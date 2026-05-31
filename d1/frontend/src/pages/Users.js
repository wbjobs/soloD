import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Switch, Space, message, Popconfirm, Tag, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import { userAPI, roleAPI } from '../services/api';
import { useAuth } from '../utils/auth';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [form] = Form.useForm();
  const { hasPermission, refreshPermissions } = useAuth();

  useEffect(() => {
    loadUsers();
    loadRoles();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await userAPI.getUsers();
      setUsers(response.data);
    } catch (error) {
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadRoles = async () => {
    try {
      const response = await roleAPI.getRoles();
      setRoles(response.data);
    } catch (error) {
      message.error('加载角色列表失败');
    }
  };

  const handleAdd = () => {
    setEditingUser(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    form.setFieldsValue({
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      isActive: user.is_active
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await userAPI.deleteUser(id);
      message.success('删除成功');
      loadUsers();
    } catch (error) {
      message.error(error.response?.data?.message || '删除失败');
    }
  };

  const handleSubmit = async (values) => {
    try {
      if (editingUser) {
        await userAPI.updateUser(editingUser.id, values);
        message.success('更新成功');
      } else {
        await userAPI.createUser(values);
        message.success('创建成功');
      }
      setModalVisible(false);
      loadUsers();
    } catch (error) {
      message.error(error.response?.data?.message || '操作失败');
    }
  };

  const handleAssignRoles = (user) => {
    setSelectedUser(user);
    const userRoleIds = (user.roles || []).map(r => r.id);
    setSelectedRoles(userRoleIds);
    setRoleModalVisible(true);
  };

  const handleSaveRoles = async () => {
    try {
      await userAPI.assignRoles(selectedUser.id, selectedRoles);
      message.success('角色分配成功');
      setRoleModalVisible(false);
      loadUsers();
      await refreshPermissions();
    } catch (error) {
      message.error('角色分配失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    { title: '姓名', dataIndex: 'full_name', key: 'full_name' },
    {
      title: '角色',
      dataIndex: 'roles',
      key: 'roles',
      render: (roles) => (
        <>
          {roles && roles.map(role => (
            <Tag key={role.id} color="blue">{role.name}</Tag>
          ))}
        </>
      )
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active) => (
        <Tag color={active ? 'green' : 'red'}>{active ? '启用' : '禁用'}</Tag>
      )
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          {hasPermission('user:edit') && (
            <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
              编辑
            </Button>
          )}
          {hasPermission('role:assign') && (
            <Button type="link" icon={<SettingOutlined />} onClick={() => handleAssignRoles(record)}>
              分配角色
            </Button>
          )}
          {hasPermission('user:delete') && (
            <Popconfirm title="确定要删除此用户吗？" onConfirm={() => handleDelete(record.id)}>
              <Button type="link" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>用户管理</h2>
        {hasPermission('user:create') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加用户
          </Button>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingUser ? '编辑用户' : '添加用户'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          {!editingUser && (
            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input />
            </Form.Item>
          )}
          <Form.Item
            name="email"
            label="邮箱"
            rules={[{ required: true, type: 'email', message: '请输入正确的邮箱' }]}
          >
            <Input />
          </Form.Item>
          {!editingUser && (
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="fullName" label="姓名">
            <Input />
          </Form.Item>
          {editingUser && (
            <Form.Item name="isActive" label="启用状态" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              提交
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="分配角色"
        open={roleModalVisible}
        onOk={handleSaveRoles}
        onCancel={() => setRoleModalVisible(false)}
      >
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="选择角色"
          value={selectedRoles}
          onChange={setSelectedRoles}
          options={roles.map(role => ({
            label: role.name,
            value: role.id
          }))}
        />
      </Modal>
    </div>
  );
};

export default Users;
