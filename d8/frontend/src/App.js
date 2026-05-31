import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import SimulationPage from './pages/SimulationPage';
import ReplayPage from './pages/ReplayPage';
import ComparisonPage from './pages/ComparisonPage';

const App = () => {
  const [activeTab, setActiveTab] = useState('simulation');

  const appStyle = {
    minHeight: '100vh',
    backgroundColor: '#1a1a2e',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  };

  const navStyle = {
    backgroundColor: '#2d2d44',
    padding: '0 20px',
    borderBottom: '1px solid #444',
    display: 'flex',
    gap: '10px'
  };

  const navLinkStyle = {
    padding: '15px 25px',
    color: '#aaa',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
    borderBottom: '2px solid transparent',
    cursor: 'pointer'
  };

  const activeNavLinkStyle = {
    ...navLinkStyle,
    color: '#fff',
    borderBottomColor: '#4a90d9'
  };

  return (
    <Router>
      <div style={appStyle}>
        <nav style={navStyle}>
          <Link
            to="/"
            style={activeTab === 'simulation' ? activeNavLinkStyle : navLinkStyle}
            onClick={() => setActiveTab('simulation')}
          >
            🚀 实时模拟
          </Link>
          <Link
            to="/replay"
            style={activeTab === 'replay' ? activeNavLinkStyle : navLinkStyle}
            onClick={() => setActiveTab('replay')}
          >
            📼 回放
          </Link>
          <Link
            to="/comparison"
            style={activeTab === 'comparison' ? activeNavLinkStyle : navLinkStyle}
            onClick={() => setActiveTab('comparison')}
          >
            📊 多模拟对比
          </Link>
        </nav>

        <Routes>
          <Route path="/" element={<SimulationPage />} />
          <Route path="/replay" element={<ReplayPage />} />
          <Route path="/comparison" element={<ComparisonPage />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
