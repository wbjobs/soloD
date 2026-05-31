import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout, Menu, Button, Space, Dropdown } from 'antd';
import {
  DashboardOutlined,
  BarChartOutlined,
  UserOutlined,
  DatabaseOutlined,
  BellOutlined,
  TagOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import FunnelAnalysis from './pages/FunnelAnalysis';
import UserPaths from './pages/UserPaths';
import QueryPage from './pages/QueryPage';
import AlertManagement from './pages/AlertManagement';
import UserProfiles from './pages/UserProfiles';
import { analyticsApi } from './services/api';

const { Header, Content, Sider } = Layout;

function App() {
  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: <Link to="/">数据看板</Link>,
    },
    {
      key: '/funnel',
      icon: <BarChartOutlined />,
      label: <Link to="/funnel">漏斗分析</Link>,
    },
    {
      key: '/paths',
      icon: <UserOutlined />,
      label: <Link to="/paths">用户路径</Link>,
    },
    {
      key: '/alerts',
      icon: <BellOutlined />,
      label: <Link to="/alerts">告警管理</Link>,
    },
    {
      key: '/profiles',
      icon: <TagOutlined />,
      label: <Link to="/profiles">用户画像</Link>,
    },
    {
      key: '/query',
      icon: <DatabaseOutlined />,
      label: <Link to="/query">SQL查询</Link>,
    },
  ];

  const exportMenuItems = [
    {
      key: 'events',
      label: '导出用户事件',
      onClick: () => analyticsApi.exportEvents(),
    },
    {
      key: 'profiles',
      label: '导出用户画像',
      onClick: () => analyticsApi.exportUserProfiles(),
    },
  ];

  return (
    <Router>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider theme="dark" width={200}>
          <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
            行为分析平台
          </div>
          <Menu
            theme="dark"
            mode="inline"
            defaultSelectedKeys={['/']}
            items={menuItems}
          />
        </Sider>
        <Layout>
          <Header style={{ background: '#fff', padding: '0 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
            <Dropdown menu={{ items: exportMenuItems }} placement="bottomRight">
              <Button icon={<DownloadOutlined />}>数据导出</Button>
            </Dropdown>
          </Header>
          <Content style={{ margin: '24px', overflow: 'initial' }}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/funnel" element={<FunnelAnalysis />} />
              <Route path="/paths" element={<UserPaths />} />
              <Route path="/alerts" element={<AlertManagement />} />
              <Route path="/profiles" element={<UserProfiles />} />
              <Route path="/query" element={<QueryPage />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </Router>
  );
}

export default App;
