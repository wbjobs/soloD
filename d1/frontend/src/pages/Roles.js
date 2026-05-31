import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Space, message, Popconfirm, Tag, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import { roleAPI, permissionAPI } from '../services/api';
import { useAuth } from '../utils/auth';

const Roles = () => {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [form] = Form.useForm();
  const { hasPermission, refreshPermissions } = useAuth();

  useEffect(() => {
    loadRoles();
    loadPermissions();
  }, []);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const response = await roleAPI.getRoles();
      setRoles(response.data);
    } catch (error) {
      message.error('加载角色列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadPermissions = async () => {
    try {
      const response = await permissionAPI.getPermissions();
      setPermissions(response.data);
    } catch (error) {
      message.error('加载权限列表失败');
    }
  };

  const handleAdd = () => {
    setEditingRole(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (role) => {
    setEditingRole(role);
    form.setFieldsValue({
      name: role.name,
      description: role.description
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await roleAPI.deleteRole(id);
      message.success('删除成功');
      loadRoles();
    } catch (error) {
      message.error(error.response?.data?.message || '删除失败');
    }
  };

  const handleSubmit = async (values) => {
    try {
      if (editingRole) {
        await roleAPI.updateRole(editingRole.id, values);
        message.success('更新成功');
      } else {
        await roleAPI.createRole(values);
        message.success('创建成功');
      }
      setModalVisible(false);
      loadRoles();
    } catch (error) {
      message.error(error.response?.data?.message || '操作失败');
    }
  };

  const handleAssignPermissions = (role) => {
    setSelectedRole(role);
    const permissionIds = (role.permissions || []).map(p => p.id);
    setSelectedPermissions(permissionIds);
    setPermissionModalVisible(true);
  };

  const handleSavePermissions = async () => {
    try {
      await roleAPI.assignPermissions(selectedRole.id, selectedPermissions);
      message.success('权限分配成功');
      setPermissionModalVisible(false);
      loadRoles();
      await refreshPermissions();
    } catch (error) {
      message.error('权限分配失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    { title: '角色名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description' },
    {
      title: '权限',
      dataIndex: 'permissions',
      key: 'permissions',
      render: (permissions) => (
        <>
          {permissions && permissions.slice(0, 3).map(p => (
            <Tag key={p.id} color="green">{p.name}</Tag>
          ))}
          {permissions && permissions.length > 3 && (
            <Tag>等{permissions.length}个权限</Tag>
          )}
        </>
      )
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          {hasPermission('role:edit') && (
            <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
              编辑
            </Button>
          )}
          {hasPermission('permission:assign') && (
            <Button type="link" icon={<SettingOutlined />} onClick={() => handleAssignPermissions(record)}>
              分配权限
            </Button>
          )}
          {hasPermission('role:delete') && (
            <Popconfirm title="确定要删除此角色吗？" onConfirm={() => handleDelete(record.id)}>
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
        <h2 style={{ margin: 0 }}>角色管理</h2>
        {hasPermission('role:create') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加角色
          </Button>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={roles}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingRole ? '编辑角色' : '添加角色'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              提交
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="分配权限"
        open={permissionModalVisible}
        onOk={handleSavePermissions}
        onCancel={() => setPermissionModalVisible(false)}
        width={600}
      >
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="选择权限"
          value={selectedPermissions}
          onChange={setSelectedPermissions}
          options={permissions.map(p => ({
            label: `${p.name} (${p.code})`,
            value: p.id
          }))}
        />
      </Modal>
    </div>
  );
};

export default Roles;
