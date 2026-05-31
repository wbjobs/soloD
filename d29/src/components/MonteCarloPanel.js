import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell } from 'recharts';

function MonteCarloPanel({ monteCarloData, isRunning, onRunMonteCarlo, onCancel }) {
  const [numRuns, setNumRuns] = React.useState(100);
  const [tolerancePercent, setTolerancePercent] = React.useState(5);
  const [distribution, setDistribution] = React.useState('uniform');

  const handleRun = () => {
    onRunMonteCarlo({ numRuns, tolerancePercent, distribution });
  };

  if (!monteCarloData) {
    return (
      <div className="monte-carlo-panel" style={{ padding: '20px', borderTop: '1px solid #e0e0e0', background: '#fff' }}>
        <h3 style={{ marginBottom: '15px' }}>蒙特卡洛容差分析</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>运行次数</label>
            <input
              type="number"
              min="10"
              max="10000"
              value={numRuns}
              onChange={(e) => setNumRuns(parseInt(e.target.value) || 100)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              disabled={isRunning}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>容差 (%)</label>
            <input
              type="number"
              min="0.1"
              max="50"
              step="0.1"
              value={tolerancePercent}
              onChange={(e) => setTolerancePercent(parseFloat(e.target.value) || 5)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              disabled={isRunning}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>分布类型</label>
            <select
              value={distribution}
              onChange={(e) => setDistribution(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              disabled={isRunning}
            >
              <option value="uniform">均匀分布</option>
              <option value="gaussian">高斯分布</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleRun}
            disabled={isRunning}
            style={{
              flex: 1,
              padding: '10px',
              background: isRunning ? '#ccc' : '#9c27b0',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isRunning ? 'not-allowed' : 'pointer'
            }}
          >
            {isRunning ? '运行中...' : '开始蒙特卡洛分析'}
          </button>
        </div>
        {isRunning && (
          <div style={{ marginTop: '15px', padding: '10px', background: '#f5f5f5', borderRadius: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '20px', height: '20px', border: '3px solid #9c27b0', borderTop: '3px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span>正在执行蒙特卡洛模拟...</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  const meanBandData = monteCarloData.frequencies.map((freq, idx) => ({
    frequency: freq,
    mean: Math.sqrt(monteCarloData.statisticsByFrequency[idx].mean) * 1e9,
    upper: Math.sqrt(monteCarloData.statisticsByFrequency[idx].mean + monteCarloData.statisticsByFrequency[idx].stdDev) * 1e9,
    lower: Math.sqrt(Math.max(0, monteCarloData.statisticsByFrequency[idx].mean - monteCarloData.statisticsByFrequency[idx].stdDev)) * 1e9
  }));

  const histogramData = (() => {
    const values = monteCarloData.totalNoiseAtOutput;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = 20;
    const binWidth = (max - min) / binCount;
    const bins = Array(binCount).fill(0);
    
    values.forEach(v => {
      const binIdx = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
      bins[binIdx]++;
    });
    
    return bins.map((count, idx) => ({
      bin: (min + idx * binWidth + binWidth / 2).toFixed(2),
      count
    }));
  })();

  return (
    <div className="monte-carlo-panel" style={{ padding: '20px', borderTop: '1px solid #e0e0e0', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3>蒙特卡洛分析结果</h3>
        <button
          onClick={() => onCancel()}
          style={{
            padding: '6px 12px',
            background: '#f5f5f5',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          返回配置
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
        <div style={{ padding: '15px', background: '#f5f5f5', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>运行次数</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>{monteCarloData.numRuns}</div>
        </div>
        <div style={{ padding: '15px', background: '#f5f5f5', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>容差范围</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>±{monteCarloData.tolerancePercent}%</div>
        </div>
        <div style={{ padding: '15px', background: '#e3f2fd', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>平均噪声 (nV/√Hz)</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1976d2' }}>{monteCarloData.overallStats.mean.toFixed(2)}</div>
        </div>
        <div style={{ padding: '15px', background: '#ffebee', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>标准差 (nV/√Hz)</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#d32f2f' }}>{monteCarloData.overallStats.stdDev.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginBottom: '20px' }}>
        <div style={{ padding: '15px', background: '#fafafa', borderRadius: '8px' }}>
          <h4 style={{ marginBottom: '10px', color: '#333' }}>噪声分布统计</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '14px' }}>
            <div>最小值: {monteCarloData.overallStats.min.toFixed(2)} nV/√Hz</div>
            <div>最大值: {monteCarloData.overallStats.max.toFixed(2)} nV/√Hz</div>
            <div>中位数: {monteCarloData.overallStats.median.toFixed(2)} nV/√Hz</div>
            <div>25/75百分位: {monteCarloData.overallStats.p25.toFixed(2)} / {monteCarloData.overallStats.p75.toFixed(2)}</div>
          </div>
        </div>
        <div style={{ padding: '15px', background: '#fafafa', borderRadius: '8px' }}>
          <h4 style={{ marginBottom: '10px', color: '#333' }}>分布类型</h4>
          <div style={{ fontSize: '14px', color: '#666' }}>
            元件: 电阻、电容<br/>
            分布: {monteCarloData.distribution === 'uniform' ? '均匀分布' : '高斯分布'}<br/>
            变异系数: {((monteCarloData.overallStats.stdDev / monteCarloData.overallStats.mean) * 100).toFixed(2)}%
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
        <div style={{ background: '#fff', borderRadius: '8px', padding: '10px' }}>
          <h4 style={{ marginBottom: '10px', color: '#333' }}>噪声谱密度分布（均值±标准差）</h4>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={meanBandData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="frequency"
                scale="log"
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
              />
              <YAxis label={{ value: 'nV/√Hz', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                formatter={(value) => [`${value.toFixed(2)} nV/√Hz`, '']}
                labelFormatter={(v) => `${v.toFixed(0)} Hz`}
              />
              <Legend />
              <Area type="monotone" dataKey="upper" stroke="none" fill="#bbdefb" name="+1σ" />
              <Area type="monotone" dataKey="mean" stroke="#1976d2" strokeWidth={2} fill="none" name="均值" />
              <Area type="monotone" dataKey="lower" stroke="none" fill="#bbdefb" name="-1σ" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: '#fff', borderRadius: '8px', padding: '10px' }}>
          <h4 style={{ marginBottom: '10px', color: '#333' }}>输出噪声分布直方图</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={histogramData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="bin"
                tick={{ fontSize: 10 }}
                label={{ value: '噪声 (nV/√Hz)', position: 'insideBottom', offset: -5 }}
              />
              <YAxis label={{ value: '频数', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Bar dataKey="count" fill="#9c27b0">
                {histogramData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill="#9c27b0" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default MonteCarloPanel;
