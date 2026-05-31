import React, { useState } from 'react';
import { Card, Input, Button, Table, message, Space } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { analyticsApi } from '../services/api';

const { TextArea } = Input;

const QueryPage = () => {
  const [sql, setSql] = useState('SELECT * FROM user_events LIMIT 10');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);

  const exampleQueries = [
    'SELECT event_type, count(*) as cnt FROM user_events GROUP BY event_type ORDER BY cnt DESC LIMIT 10',
    'SELECT user_id, count(*) as events FROM user_events GROUP BY user_id ORDER BY events DESC LIMIT 10',
    'SELECT toDate(timestamp) as day, count(*) as pv, uniqExact(user_id) as uv FROM user_events GROUP BY day ORDER BY day DESC LIMIT 7',
    'SELECT country, count(*) as count FROM user_events WHERE country != \'\' GROUP BY country ORDER BY count DESC LIMIT 10',
  ];

  const executeQuery = async () => {
    if (!sql.trim()) {
      message.warning('请输入SQL查询语句');
      return;
    }

    setLoading(true);
    try {
      const response = await analyticsApi.executeQuery(sql);
      const result = response.data.data || [];

      if (result.length > 0) {
        const cols = Object.keys(result[0]).map(key => ({
          title: key,
          dataIndex: key,
          key: key,
        }));
        setColumns(cols);
        setData(result);
        message.success(`查询成功，共 ${result.length} 条记录`);
      } else {
        setColumns([]);
        setData([]);
        message.info('查询结果为空');
      }
    } catch (error) {
      message.error('查询执行失败: ' + (error.response?.data?.detail || error.message));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="SQL查询工具">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <strong>示例查询：</strong>
            <Space wrap>
              {exampleQueries.map((q, idx) => (
                <Button key={idx} size="small" onClick={() => setSql(q)}>
                  示例 {idx + 1}
                </Button>
              ))}
            </Space>
          </div>

          <TextArea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={6}
            placeholder="输入SQL查询语句..."
            style={{ fontFamily: 'monospace' }}
          />

          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={executeQuery}
            loading={loading}
          >
            执行查询
          </Button>
        </Space>
      </Card>

      <Card title="查询结果">
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{ pageSize: 20 }}
          scroll={{ x: true }}
          size="small"
        />
      </Card>
    </Space>
  );
};

export default QueryPage;
