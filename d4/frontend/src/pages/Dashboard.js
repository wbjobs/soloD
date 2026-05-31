import React, { useEffect, useState, useCallback } from 'react';
import { Row, Col, Card, Table, Badge } from 'antd';
import ReactECharts from 'echarts-for-react';
import { analyticsApi, wsManager } from '../services/api';

const Dashboard = () => {
  const [realtimeStats, setRealtimeStats] = useState({ pv: 0, uv: 0, sessions: 0 });
  const [hourlyData, setHourlyData] = useState([]);
  const [dailyData, setDailyData] = useState([]);
  const [topPages, setTopPages] = useState([]);
  const [countries, setCountries] = useState([]);
  const [devices, setDevices] = useState([]);
  const [isWsConnected, setIsWsConnected] = useState(false);

  const handleRealtimeStats = useCallback((data) => {
    setRealtimeStats(data);
  }, []);

  useEffect(() => {
    loadAllData();
    
    const unsubscribe = wsManager.subscribe('realtime_stats', handleRealtimeStats);
    const unsubscribeConnected = wsManager.subscribe('connected', () => setIsWsConnected(true));
    
    return () => {
      unsubscribe();
      unsubscribeConnected();
    };
  }, [handleRealtimeStats]);

  const loadAllData = async () => {
    try {
      const [stats, hourly, daily, pages, countryList, deviceList] = await Promise.all([
        analyticsApi.getRealtimeStats(),
        analyticsApi.getHourlyTrend(24),
        analyticsApi.getDailyPvUv(7),
        analyticsApi.getTopPages(10),
        analyticsApi.getCountries(),
        analyticsApi.getDevices(),
      ]);
      setRealtimeStats(stats.data);
      setHourlyData(hourly.data);
      setDailyData(daily.data);
      setTopPages(pages.data);
      setCountries(countryList.data);
      setDevices(deviceList.data);
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  };

  const getLineChartOption = () => ({
    tooltip: { trigger: 'axis' },
    legend: { data: ['PV', 'UV'] },
    xAxis: {
      type: 'category',
      data: hourlyData.map(item => item.hour.split('T')[1].substring(0, 5)),
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: 'PV',
        type: 'line',
        smooth: true,
        data: hourlyData.map(item => item.pv),
        itemStyle: { color: '#1890ff' },
        areaStyle: { color: 'rgba(24, 144, 255, 0.2)' },
      },
      {
        name: 'UV',
        type: 'line',
        smooth: true,
        data: hourlyData.map(item => item.uv),
        itemStyle: { color: '#52c41a' },
        areaStyle: { color: 'rgba(82, 196, 26, 0.2)' },
      },
    ],
  });

  const getDailyChartOption = () => ({
    tooltip: { trigger: 'axis' },
    legend: { data: ['PV', 'UV'] },
    xAxis: {
      type: 'category',
      data: dailyData.map(item => item.day),
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: 'PV',
        type: 'bar',
        data: dailyData.map(item => item.pv),
        itemStyle: { color: '#1890ff' },
      },
      {
        name: 'UV',
        type: 'bar',
        data: dailyData.map(item => item.uv),
        itemStyle: { color: '#52c41a' },
      },
    ],
  });

  const getPieChartOption = () => ({
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        data: devices.map(item => ({
          value: item.count,
          name: item.device_type,
        })),
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      },
    ],
  });

  const getMapOption = () => ({
    tooltip: { trigger: 'item' },
    xAxis: {
      type: 'category',
      data: countries.slice(0, 10).map(item => item.country),
      axisLabel: { rotate: 45, fontSize: 11 },
    },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'bar',
        data: countries.slice(0, 10).map(item => item.users),
        itemStyle: { 
          color: '#722ed1',
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
  });

  const pageColumns = [
    { title: '页面URL', dataIndex: 'page_url', key: 'page_url' },
    { title: '访问量', dataIndex: 'views', key: 'views', sorter: (a, b) => a.views - b.views },
    { title: '独立用户', dataIndex: 'unique_users', key: 'unique_users', sorter: (a, b) => a.unique_users - b.unique_users },
  ];

  const StatCard = ({ title, value, color, prefix = '' }) => (
    <Card>
      <div className="stat-title">{title}</div>
      <div className="stat-value" style={{ color }}>
        {prefix}{value.toLocaleString()}
      </div>
    </Card>
  );

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>数据看板</h2>
        <Badge status={isWsConnected ? 'success' : 'warning'} text={isWsConnected ? '实时连接' : '连接中...'} />
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <StatCard title="近1分钟 PV" value={realtimeStats.pv} color="#1890ff" />
        </Col>
        <Col span={8}>
          <StatCard title="近1分钟 UV" value={realtimeStats.uv} color="#52c41a" />
        </Col>
        <Col span={8}>
          <StatCard title="近1分钟 会话数" value={realtimeStats.sessions} color="#722ed1" />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card title="24小时流量趋势">
            <ReactECharts option={getLineChartOption()} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="7天流量统计">
            <ReactECharts option={getDailyChartOption()} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Card title="设备分布">
            <ReactECharts option={getPieChartOption()} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="Top10国家/地区用户">
            <ReactECharts option={getMapOption()} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="热门页面">
            <Table
              columns={pageColumns}
              dataSource={topPages}
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
