import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  message,
  Row,
  Col,
  Statistic,
  Descriptions,
  Modal,
  List,
} from 'antd';
import { UserOutlined, ReloadOutlined, SearchOutlined, DownloadOutlined, TagsOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { analyticsApi } from '../services/api';

const { Option } = Select;

const UserProfiles = () => {
  const [tagSummary, setTagSummary] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [searchUserId, setSearchUserId] = useState('');

  useEffect(() => {
    loadTagSummary();
    searchUsers();
  }, []);

  const loadTagSummary = async () => {
    try {
      const res = await analyticsApi.getTagSummary();
      setTagSummary(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const searchUsers = async (filters = []) => {
    setLoading(true);
    try {
      const res = await analyticsApi.searchUsers(filters);
      setUsers(res.data);
    } catch (error) {
      message.error('搜索失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTags = async () => {
    try {
      const res = await analyticsApi.generateUserTags();
      message.success(`成功生成 ${res.data.tags_generated} 个标签`);
      loadTagSummary();
      searchUsers();
    } catch (error) {
      message.error('生成标签失败');
      console.error(error);
    }
  };

  const handleViewProfile = async (userId) => {
    try {
      const res = await analyticsApi.getUserProfile(userId);
      setSelectedUser(res.data);
      setProfileModalVisible(true);
    } catch (error) {
      message.error('获取用户画像失败');
      console.error(error);
    }
  };

  const getTagChartOption = () => {
    const categoryData = {};
    tagSummary.forEach(item => {
      if (!categoryData[item.tag_category]) {
        categoryData[item.tag_category] = {};
      }
      categoryData[item.tag_category][item.tag_value] = item.user_count;
    });

    const series = Object.entries(categoryData).map(([category, values], index) => ({
      name: category,
      type: 'bar',
      stack: 'total',
      data: Object.values(values),
    }));

    return {
      tooltip: { trigger: 'axis' },
      legend: { data: Object.keys(categoryData) },
      xAxis: {
        type: 'category',
        data: [...new Set(tagSummary.map(t => t.tag_name))],
      },
      yAxis: { type: 'value' },
      series,
    };
  };

  const columns = [
    {
      title: '用户ID',
      dataIndex: 'user_id',
      key: 'user_id',
      render: (text) => (
        <Button type="link" icon={<UserOutlined />} onClick={() => handleViewProfile(text)}>
          {text.substring(0, 16)}...
        </Button>
      ),
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      render: (tags) => (
        <Space wrap>
          {tags && tags.map((tag, idx) => (
            <Tag key={idx} color="blue">
              {tag.tag_name}: {tag.tag_value}
            </Tag>
          ))}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card>
            <Statistic
              title="带标签用户数"
              value={users.length}
              prefix={<TagsOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="标签类别数"
              value={[...new Set(tagSummary.map(t => t.tag_category))].length}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="标签总数"
              value={tagSummary.length}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Button type="primary" icon={<TagsOutlined />} onClick={handleGenerateTags} block>
              生成用户标签
            </Button>
          </Card>
        </Col>
      </Row>

      <Card title="标签分布统计">
        <ReactECharts option={getTagChartOption()} style={{ height: 350 }} />
      </Card>

      <Card
        title="用户列表"
        extra={
          <Space>
            <Input
              placeholder="输入用户ID搜索"
              prefix={<SearchOutlined />}
              style={{ width: 250 }}
              value={searchUserId}
              onChange={(e) => setSearchUserId(e.target.value)}
              onPressEnter={() => handleViewProfile(searchUserId)}
            />
            <Button icon={<ReloadOutlined />} onClick={() => searchUsers()}>
              刷新
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => analyticsApi.exportUserProfiles()}
            >
              导出用户画像
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={users}
          rowKey="user_id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="用户画像详情"
        open={profileModalVisible}
        onCancel={() => setProfileModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedUser && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions title="基本信息" bordered column={2}>
              <Descriptions.Item label="用户ID">{selectedUser.user_id}</Descriptions.Item>
              <Descriptions.Item label="总事件数">{selectedUser.stats.total_events}</Descriptions.Item>
              <Descriptions.Item label="会话数">{selectedUser.stats.total_sessions}</Descriptions.Item>
              <Descriptions.Item label="访问页面数">{selectedUser.stats.unique_pages}</Descriptions.Item>
              <Descriptions.Item label="首次访问">{selectedUser.stats.first_seen}</Descriptions.Item>
              <Descriptions.Item label="最后访问">{selectedUser.stats.last_seen}</Descriptions.Item>
            </Descriptions>

            <Card title="用户标签" size="small">
              <List
                grid={{ gutter: 8, column: 2 }}
                dataSource={selectedUser.tags}
                renderItem={(tag) => (
                  <List.Item>
                    <Card size="small" title={`${tag.tag_name}`}>
                      <Tag color="blue">{tag.tag_value}</Tag>
                      <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                        {tag.tag_category} | 置信度: {(tag.confidence * 100).toFixed(0)}%
                      </div>
                    </Card>
                  </List.Item>
                )}
              />
            </Card>

            <Card title="最近行为" size="small">
              <List
                dataSource={selectedUser.recent_events.slice(0, 10)}
                renderItem={(event) => (
                  <List.Item>
                    <Space>
                      <Tag color="green">{event.event_type}</Tag>
                      <span>{event.page_url}</span>
                      <span style={{ color: '#999', fontSize: 12 }}>{event.timestamp}</span>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          </Space>
        )}
      </Modal>
    </Space>
  );
};

export default UserProfiles;
