import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Space, Button, Select, message } from 'antd';
import ReactECharts from 'echarts-for-react';
import { analyticsApi } from '../services/api';

const UserPaths = () => {
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadUserPaths();
  }, []);

  const loadUserPaths = async () => {
    setLoading(true);
    try {
      const response = await analyticsApi.getUserPaths(100);
      setPaths(response.data);
    } catch (error) {
      message.error('加载用户路径失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getPathNodes = () => {
    const nodeMap = {};
    const linkMap = {};

    paths.forEach(session => {
      session.path.forEach((page, idx) => {
        const shortName = page.split('/').pop() || 'home';
        nodeMap[shortName] = (nodeMap[shortName] || 0) + 1;

        if (idx < session.path.length - 1) {
          const nextPage = session.path[idx + 1];
          const nextShort = nextPage.split('/').pop() || 'home';
          const key = `${shortName}->${nextShort}`;
          linkMap[key] = (linkMap[key] || 0) + 1;
        }
      });
    });

    const nodes = Object.entries(nodeMap).map(([name, value]) => ({
      name,
      value,
    }));

    const links = Object.entries(linkMap).map(([key, value]) => {
      const [source, target] = key.split('->');
      return { source, target, value };
    });

    return { nodes, links };
  };

  const getSankeyOption = () => {
    const { nodes, links } = getPathNodes();

    return {
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
      },
      series: [
        {
          type: 'sankey',
          layout: 'none',
          emphasis: { focus: 'adjacency' },
          data: nodes,
          links: links,
          lineStyle: {
            color: 'gradient',
            curveness: 0.5,
          },
        },
      ],
    };
  };

  const columns = [
    {
      title: '用户ID',
      dataIndex: 'user_id',
      key: 'user_id',
      width: 150,
      render: (text) => <Tag color="blue">{text.substring(0, 8)}...</Tag>,
    },
    {
      title: '会话ID',
      dataIndex: 'session_id',
      key: 'session_id',
      width: 150,
      render: (text) => <Tag color="green">{text.substring(0, 8)}...</Tag>,
    },
    {
      title: '访问路径',
      dataIndex: 'path',
      key: 'path',
      render: (path) => (
        <Space size={[0, 4]} wrap>
          {path.map((p, idx) => (
            <React.Fragment key={idx}>
              <Tag color="blue" style={{ margin: 2 }}>
                {p || 'home'}
              </Tag>
              {idx < path.length - 1 && <span>→</span>}
            </React.Fragment>
          ))}
        </Space>
      ),
    },
    {
      title: '路径长度',
      dataIndex: 'path',
      key: 'length',
      width: 100,
      render: (path) => <Tag color="purple">{path.length} 步</Tag>,
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title="用户路径桑基图"
        extra={
          <Button onClick={loadUserPaths} loading={loading}>
            刷新数据
          </Button>
        }
      >
        <ReactECharts option={getSankeyOption()} style={{ height: 500 }} />
      </Card>

      <Card title="会话路径明细">
        <Table
          columns={columns}
          dataSource={paths}
          loading={loading}
          pagination={{ pageSize: 10 }}
          rowKey={(record) => record.session_id}
        />
      </Card>
    </Space>
  );
};

export default UserPaths;
