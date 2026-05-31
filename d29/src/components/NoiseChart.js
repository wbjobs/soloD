import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function NoiseChart({ data }) {
  const chartData = data.frequencies.map((freq, index) => ({
    frequency: freq,
    totalNoise: Math.sqrt(data.totalNoiseSpectralDensity[index]) * 1e9,
    resistorNoise: Math.sqrt(data.resistorNoiseSpectralDensity?.[index] || 0) * 1e9,
    opampVoltageNoise: Math.sqrt(data.opampVoltageNoiseSpectralDensity?.[index] || 0) * 1e9,
    opampCurrentNoise: Math.sqrt(data.opampCurrentNoiseSpectralDensity?.[index] || 0) * 1e9
  }));

  const formatFrequency = (value) => {
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)} MHz`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)} kHz`;
    return `${value} Hz`;
  };

  return (
    <div className="noise-chart-panel">
      <h3>噪声谱密度</h3>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="frequency"
            scale="log"
            tickFormatter={formatFrequency}
            label={{ value: '频率', position: 'insideBottomRight', offset: -5 }}
          />
          <YAxis
            label={{ value: '噪声密度 (nV/√Hz)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            formatter={(value) => [`${value.toFixed(3)} nV/√Hz`, '']}
            labelFormatter={formatFrequency}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="totalNoise"
            name="总噪声"
            stroke="#ff5722"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="resistorNoise"
            name="电阻热噪声"
            stroke="#4caf50"
            strokeWidth={1.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="opampVoltageNoise"
            name="运放电压噪声"
            stroke="#2196f3"
            strokeWidth={1.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="opampCurrentNoise"
            name="运放电流噪声"
            stroke="#9c27b0"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default NoiseChart;
