import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Tag,
  message,
  Statistic,
  Row,
  Col,
} from 'antd';
import { BellOutlined, PlusOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { analyticsApi } from '../services/api';

const { Option } = Select;

const AlertManagement = () => {
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rulesRes, historyRes] = await Promise.all([
        analyticsApi.getAlertRules(),
        analyticsApi.getAlertHistory(),
      ]);
      setRules(rulesRes.data);
      setHistory(historyRes.data);
    } catch (error) {
      message.error('加载数据失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRule = async (values) => {
    try {
      await analyticsApi.createAlertRule(values);
      message.success('告警规则创建成功');
      setModalVisible(false);
      form.resetFields();
      loadData();
    } catch (error) {
      message.error('创建失败');
      console.error(error);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      await analyticsApi.deleteAlertRule(ruleId);
      message.success('删除成功');
      loadData();
    } catch (error) {
      message.error('删除失败');
      console.error(error);
    }
  };

  const handleCheckAnomalies = async () => {
    try {
      const res = await analyticsApi.checkAnomalies();
      if (res.data.count > 0) {
        message.warning(`发现 ${res.data.count} 个异常，已记录到告警历史`);
      } else {
        message.success('未发现异常');
      }
      loadData();
    } catch (error) {
      message.error('检测失败');
      console.error(error);
    }
  };

  const ruleColumns = [
    { title: '规则名称', dataIndex: 'rule_name', key: 'rule_name' },
    { title: '监控指标', dataIndex: 'metric', key: 'metric' },
    {
      title: '阈值',
      key: 'threshold',
      render: (_, record) => `${record.condition} ${record.threshold}`,
    },
    { title: '时间窗口', dataIndex: 'window_minutes', key: 'window_minutes', render: (val) => `${val} 分钟` },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled) => (
        <Tag color={enabled ? 'green' : 'default'}>{enabled ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDeleteRule(record.rule_id)}
        />
      ),
    },
  ];

  const historyColumns = [
    { title: '告警名称', dataIndex: 'rule_name', key: 'rule_name' },
    { title: '指标', dataIndex: 'metric', key: 'metric' },
    {
      title: '详情',
      key: 'detail',
      render: (_, record) => (
        <span>
          当前: {record.current_value} {record.condition} 阈值: {record.threshold}
        </span>
      ),
    },
    {
      title: '级别',
      dataIndex: 'severity',
      key: 'severity',
      render: (severity) => (
        <Tag color={severity === 'high' ? 'red' : 'orange'}>{severity === 'high' ? '高' : '中'}</Tag>
      ),
    },
    { title: '触发时间', dataIndex: 'triggered_at', key: 'triggered_at' },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Card>
            <Statistic
              title="告警规则数"
              value={rules.length}
              prefix={<BellOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="历史告警数"
              value={history.length}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="活跃告警"
              value={history.filter(h => h.status === 'triggered').length}
              valueStyle={{ color: '#f5222d' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="告警规则管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadData}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
              新建规则
            </Button>
            <Button onClick={handleCheckAnomalies}>检测异常</Button>
          </Space>
        }
      >
        <Table
          columns={ruleColumns}
          dataSource={rules}
          rowKey="rule_id"
          loading={loading}
          pagination={false}
        />
      </Card>

      <Card title="告警历史">
        <Table
          columns={historyColumns}
          dataSource={history}
          rowKey="alert_id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="新建告警规则"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateRule}>
          <Form.Item
            name="rule_name"
            label="规则名称"
            rules={[{ required: true, message: '请输入规则名称' }]}
          >
            <Input placeholder="例如：PV过高告警" />
          </Form.Item>
          <Form.Item
            name="metric"
            label="监控指标"
            rules={[{ required: true, message: '请选择监控指标' }]}
          >
            <Select>
              <Option value="pv">PV (页面浏览量)</Option>
              <Option value="uv">UV (独立用户数)</Option>
              <Option value="events_per_session">平均会话事件数</Option>
              <Option value="error_rate">错误率</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="condition"
            label="条件"
            rules={[{ required: true, message: '请选择条件' }]}
          >
            <Select>
              <Option value=">">大于</Option>
              <Option value=">=">大于等于</Option>
              <Option value="<">小于</Option>
              <Option value="<=">小于等于</Option>
              <Option value="=">等于</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="threshold"
            label="阈值"
            rules={[{ required: true, message: '请输入阈值' }]}
          >
            <Input type="number" />
          </Form.Item>
          <Form.Item
            name="window_minutes"
            label="时间窗口（分钟）"
            initialValue={5}
          >
            <Input type="number" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              创建规则
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default AlertManagement;
