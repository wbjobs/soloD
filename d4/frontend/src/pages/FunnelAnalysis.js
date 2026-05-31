import React, { useState, useEffect } from 'react';
import { Card, Button, Form, Input, Select, Space, message } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { analyticsApi } from '../services/api';

const FunnelAnalysis = () => {
  const [form] = Form.useForm();
  const [funnelData, setFunnelData] = useState([]);
  const [loading, setLoading] = useState(false);

  const defaultSteps = [
    { name: '访问首页', event_type: 'page_view', page_url: '/' },
    { name: '浏览商品', event_type: 'page_view', page_url: '/product' },
    { name: '加入购物车', event_type: 'add_to_cart', page_url: '' },
    { name: '结算支付', event_type: 'checkout', page_url: '' },
  ];

  useEffect(() => {
    form.setFieldsValue({ steps: defaultSteps });
    loadFunnelData(defaultSteps);
  }, [form]);

  const loadFunnelData = async (steps) => {
    setLoading(true);
    try {
      const response = await analyticsApi.getFunnelAnalysis(steps);
      setFunnelData(response.data);
    } catch (error) {
      message.error('加载漏斗数据失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (values) => {
    loadFunnelData(values.steps);
  };

  const getFunnelChartOption = () => {
    const names = funnelData.map(item => item.step_name);
    const values = funnelData.map(item => item.users);
    const rates = funnelData.map(item => item.conversion_rate);

    return {
      tooltip: {
        trigger: 'item',
        formatter: function(params) {
          const idx = params.dataIndex;
          return `${names[idx]}<br/>用户数: ${values[idx]}<br/>转化率: ${rates[idx]}%`;
        },
      },
      series: [
        {
          type: 'funnel',
          left: '10%',
          top: 60,
          bottom: 60,
          width: '80%',
          min: 0,
          max: Math.max(...values) * 1.1,
          minSize: '20%',
          maxSize: '100%',
          sort: 'descending',
          gap: 2,
          label: {
            show: true,
            position: 'inside',
            formatter: '{b}',
          },
          labelLine: { length: 10, lineStyle: { width: 1, type: 'solid' } },
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 1,
            color: function(params) {
              const colors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272'];
              return colors[params.dataIndex % colors.length];
            },
          },
          emphasis: {
            label: { fontSize: 20 },
          },
          data: names.map((name, idx) => ({
            value: values[idx],
            name: name,
          })),
        },
      ],
    };
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="漏斗配置">
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.List name="steps">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                    <Form.Item
                      {...restField}
                      name={[name, 'name']}
                      label="步骤名称"
                      rules={[{ required: true, message: '请输入步骤名称' }]}
                    >
                      <Input placeholder="步骤名称" style={{ width: 150 }} />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, 'event_type']}
                      label="事件类型"
                      rules={[{ required: true, message: '请选择事件类型' }]}
                    >
                      <Select style={{ width: 150 }}>
                        <Select.Option value="page_view">页面浏览</Select.Option>
                        <Select.Option value="click">点击事件</Select.Option>
                        <Select.Option value="add_to_cart">加入购物车</Select.Option>
                        <Select.Option value="checkout">结算支付</Select.Option>
                        <Select.Option value="purchase">购买成功</Select.Option>
                      </Select>
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'page_url']} label="页面URL">
                      <Input placeholder="可选：页面URL" style={{ width: 200 }} />
                    </Form.Item>
                    {fields.length > 2 ? (
                      <MinusCircleOutlined onClick={() => remove(name)} />
                    ) : null}
                  </Space>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    添加步骤
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              分析漏斗
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="漏斗分析图表">
        <ReactECharts option={getFunnelChartOption()} style={{ height: 500 }} />
      </Card>
    </Space>
  );
};

export default FunnelAnalysis;
