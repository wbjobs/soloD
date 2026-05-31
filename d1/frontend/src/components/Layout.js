import React, { useState } from 'react';
import { Layout as AntLayout, Menu, Avatar, Dropdown, Button } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  SafetyOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/auth';

const { Header, Sider, Content } = AntLayout;

const Layout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    {
      key: '/users',
      icon: <TeamOutlined />,
      label: '用户管理',
      permission: 'user:view'
    },
    {
      key: '/roles',
      icon: <SafetyOutlined />,
      label: '角色管理',
      permission: 'role:view'
    },
    {
      key: '/permissions',
      icon: <SafetyOutlined />,
      label: '权限列表',
      permission: 'permission:view'
    },
    {
      key: '/logs',
      icon: <FileTextOutlined />,
      label: '操作日志',
      permission: 'log:view'
    }
  ].filter(item => hasPermission(item.permission));

  const userMenu = {
    items: [
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        onClick: handleLogout
      }
    ]
  };

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="dark">
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: collapsed ? '14px' : '18px',
          fontWeight: 'bold'
        }}>
          {collapsed ? 'RBAC' : '权限管理系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <AntLayout>
        <Header style={{
          padding: '0 24px',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,21,41,.08)'
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: '16px', width: 64, height: 64 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>租户 {user?.tenant_id}: {user?.full_name || user?.username}</span>
            <Dropdown menu={userMenu} placement="bottomRight">
              <Avatar icon={<UserOutlined />} style={{ cursor: 'pointer' }} />
            </Dropdown>
          </div>
        </Header>
        <Content style={{
          margin: '24px',
          padding: 24,
          background: '#fff',
          borderRadius: 8,
          minHeight: 280
        }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
