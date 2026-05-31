import React from 'react';
import { Card, Statistic, Row, Col } from 'antd';
import { UserOutlined, TeamOutlined, SafetyOutlined } from '@ant-design/icons';

const Home = () => {
  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>欢迎使用多租户权限管理系统</h2>
      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic
              title="用户管理"
              value="用户CRUD、角色分配"
              prefix={<UserOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="角色管理"
              value="角色CRUD、权限分配"
              prefix={<TeamOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="权限管理"
              value="基于RBAC的权限控制"
              prefix={<SafetyOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
      </Row>
      <div style={{ marginTop: 24, padding: 16, background: '#f5f5f5', borderRadius: 8 }}>
        <h3>系统特性</h3>
        <ul>
          <li>多租户架构：Schema级别的数据隔离</li>
          <li>RBAC权限模型：用户-角色-权限三级关联</li>
          <li>JWT身份认证：支持租户信息解析</li>
          <li>权限中间件：接口级别的权限控制</li>
        </ul>
      </div>
    </div>
  );
};

export default Home;
