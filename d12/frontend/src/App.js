import React, { useState, useEffect, useCallback } from 'react';

function App() {
  const [events, setEvents] = useState([]);
  const [lastId, setLastId] = useState('$');
  const [isPolling, setIsPolling] = useState(true);
  const [stats, setStats] = useState({ total: 0, openat: 0, read: 0 });
  const [isInitialized, setIsInitialized] = useState(false);

  const [alerts, setAlerts] = useState([]);
  const [alertLastId, setAlertLastId] = useState('$');
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [latestAlert, setLatestAlert] = useState(null);
  const [alertStats, setAlertStats] = useState({ total: 0, critical: 0, high: 0, medium: 0 });

  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [rules, setRules] = useState([]);

  const fetchEvents = useCallback(async () => {
    try {
      const response = await fetch(`/api/events?last_id=${lastId}&count=50`);
      const data = await response.json();
      
      if (data.events && data.events.length > 0) {
        setEvents(prev => [...data.events, ...prev].slice(0, 200));
        setLastId(data.last_id);
        
        setStats(prev => {
          const newOpenat = data.events.filter(e => e.syscall_name === 'openat').length;
          const newRead = data.events.filter(e => e.syscall_name === 'read').length;
          return {
            total: prev.total + data.events.length,
            openat: prev.openat + newOpenat,
            read: prev.read + newRead
          };
        });
      }
      
      if (!isInitialized) {
        setIsInitialized(true);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  }, [lastId, isInitialized]);

  const fetchAlerts = useCallback(async () => {
    try {
      const response = await fetch(`/api/alerts?last_id=${alertLastId}&count=20`);
      const data = await response.json();
      
      if (data.alerts && data.alerts.length > 0) {
        setAlerts(prev => [...data.alerts, ...prev].slice(0, 50));
        setAlertLastId(data.last_id);
        
        const newCritical = data.alerts.filter(a => a.severity === 'critical').length;
        const newHigh = data.alerts.filter(a => a.severity === 'high').length;
        const newMedium = data.alerts.filter(a => a.severity === 'medium').length;
        
        setAlertStats(prev => ({
          total: prev.total + data.alerts.length,
          critical: prev.critical + newCritical,
          high: prev.high + newHigh,
          medium: prev.medium + newMedium
        }));

        const criticalAlert = data.alerts.find(a => a.severity === 'critical');
        const highAlert = data.alerts.find(a => a.severity === 'high');
        if (criticalAlert || highAlert) {
          setLatestAlert(criticalAlert || highAlert);
          setShowAlertModal(true);
        }
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  }, [alertLastId]);

  const fetchRules = useCallback(async () => {
    try {
      const response = await fetch('/api/rules');
      const data = await response.json();
      if (data.rules) {
        setRules(data.rules);
      }
    } catch (error) {
      console.error('Error fetching rules:', error);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    let interval;
    if (isPolling) {
      interval = setInterval(() => {
        fetchEvents();
        fetchAlerts();
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isPolling, fetchEvents, fetchAlerts]);

  const clearEvents = async () => {
    try {
      await fetch('/api/events', { method: 'DELETE' });
      setEvents([]);
      setLastId('$');
      setStats({ total: 0, openat: 0, read: 0 });
      setIsInitialized(false);
    } catch (error) {
      console.error('Error clearing events:', error);
    }
  };

  const clearAlerts = async () => {
    try {
      await fetch('/api/alerts', { method: 'DELETE' });
      setAlerts([]);
      setAlertLastId('$');
      setAlertStats({ total: 0, critical: 0, high: 0, medium: 0 });
    } catch (error) {
      console.error('Error clearing alerts:', error);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(Number(timestamp) / 1e6);
    return date.toLocaleTimeString();
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return '#dc2626';
      case 'high': return '#ea580c';
      case 'medium': return '#ca8a04';
      default: return '#6b7280';
    }
  };

  const getSeverityLabel = (severity) => {
    switch (severity) {
      case 'critical': return 'CRITICAL';
      case 'high': return 'HIGH';
      case 'medium': return 'MEDIUM';
      default: return severity.toUpperCase();
    }
  };

  return (
    <div className="App">
      {showAlertModal && latestAlert && (
        <div className="alert-modal-overlay" onClick={() => setShowAlertModal(false)}>
          <div className="alert-modal" onClick={e => e.stopPropagation()}>
            <div className="alert-modal-header" style={{ backgroundColor: getSeverityColor(latestAlert.severity) }}>
              <span className="alert-modal-icon">⚠️</span>
              <h2>SECURITY ALERT</h2>
              <span className="alert-severity-badge">{getSeverityLabel(latestAlert.severity)}</span>
            </div>
            <div className="alert-modal-body">
              <div className="alert-rule-name">{latestAlert.rule_name}</div>
              <div className="alert-details-grid">
                <div className="alert-detail-item">
                  <span className="alert-detail-label">Process</span>
                  <span className="alert-detail-value">{latestAlert.process_name}</span>
                </div>
                <div className="alert-detail-item">
                  <span className="alert-detail-label">PID</span>
                  <span className="alert-detail-value">{latestAlert.pid}</span>
                </div>
                <div className="alert-detail-item">
                  <span className="alert-detail-label">Syscall</span>
                  <span className="alert-detail-value">{latestAlert.syscall_name}</span>
                </div>
                <div className="alert-detail-item">
                  <span className="alert-detail-label">Time</span>
                  <span className="alert-detail-value">{formatTime(latestAlert.timestamp)}</span>
                </div>
              </div>
              <div className="alert-args-section">
                <span className="alert-args-label">File/Arguments:</span>
                <div className="alert-args-value">{latestAlert.args}</div>
              </div>
            </div>
            <div className="alert-modal-footer">
              <button className="btn-acknowledge" onClick={() => setShowAlertModal(false)}>
                ACKNOWLEDGE
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="header">
        <h1>🔍 Syscall Monitor</h1>
        <p>Real-time monitoring of process system calls using eBPF</p>
      </header>

      <div className="controls">
        <button 
          className="btn-primary"
          onClick={() => setIsPolling(!isPolling)}
        >
          {isPolling ? '⏸ Pause' : '▶ Resume'}
        </button>
        <button 
          className="btn-secondary"
          onClick={clearEvents}
        >
          🗑 Clear Events
        </button>
        <button 
          className="btn-danger"
          onClick={clearAlerts}
        >
          🚨 Clear Alerts
        </button>
        <button 
          className="btn-info"
          onClick={() => setShowRulesPanel(!showRulesPanel)}
        >
          📋 Rules {showRulesPanel ? '▼' : '▶'}
        </button>
        <div className="status">
          <span className="status-dot" style={{ backgroundColor: isPolling ? '#4caf50' : '#ff9800' }}></span>
          <span>{isPolling ? 'Monitoring' : 'Paused'}</span>
        </div>
      </div>

      {showRulesPanel && (
        <div className="rules-panel">
          <h3>📋 Alert Rules</h3>
          <div className="rules-list">
            {rules.map(rule => (
              <div key={rule.id} className="rule-item" style={{ borderLeftColor: getSeverityColor(rule.severity) }}>
                <div className="rule-header">
                  <span className="rule-name">{rule.name}</span>
                  <span className="rule-enabled-badge" style={{ backgroundColor: rule.enabled ? '#4caf50' : '#6b7280' }}>
                    {rule.enabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                <p className="rule-description">{rule.description}</p>
                <div className="rule-conditions">
                  {rule.process_name && <span className="rule-condition">Process: {rule.process_name}</span>}
                  {rule.syscall_name && <span className="rule-condition">Syscall: {rule.syscall_name}</span>}
                  {rule.args_pattern && <span className="rule-condition">Pattern: {rule.args_pattern}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="event-stats">
        <div className="stat-item">
          <span className="stat-label">Total Events</span>
          <span className="stat-value">{stats.total}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">openat()</span>
          <span className="stat-value">{stats.openat}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">read()</span>
          <span className="stat-value">{stats.read}</span>
        </div>
        <div className="stat-item alert-stat-critical">
          <span className="stat-label">CRITICAL Alerts</span>
          <span className="stat-value" style={{ color: '#dc2626' }}>{alertStats.critical}</span>
        </div>
        <div className="stat-item alert-stat-high">
          <span className="stat-label">HIGH Alerts</span>
          <span className="stat-value" style={{ color: '#ea580c' }}>{alertStats.high}</span>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="alerts-container">
          <h3>🚨 Recent Alerts</h3>
          <div className="alerts-list">
            {alerts.slice(0, 5).map(alert => (
              <div 
                key={alert.id} 
                className="alert-item"
                style={{ borderLeftColor: getSeverityColor(alert.severity) }}
              >
                <div className="alert-item-header">
                  <span className="alert-item-severity" style={{ backgroundColor: getSeverityColor(alert.severity) }}>
                    {getSeverityLabel(alert.severity)}
                  </span>
                  <span className="alert-item-rule">{alert.rule_name}</span>
                  <span className="alert-item-time">{formatTime(alert.timestamp)}</span>
                </div>
                <div className="alert-item-details">
                  <span>{alert.process_name} (PID: {alert.pid})</span>
                  <span className="alert-item-args">{alert.args}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="events-container">
        {events.length === 0 ? (
          <div className="empty-state">
            <h3>No events yet</h3>
            <p>Start the Go agent to monitor a process and see its system calls here.</p>
          </div>
        ) : (
          <div className="event-list">
            {events.map((event) => (
              <div key={event.id} className="event-item">
                <div className="event-header">
                  <span className="event-syscall">{event.syscall_name}()</span>
                  <span className="event-time">{formatTime(event.timestamp)}</span>
                </div>
                <div className="event-details">
                  <div className="event-detail">
                    <span className="event-detail-label">PID:</span>
                    <span className="event-detail-value">{event.pid}</span>
                  </div>
                  <div className="event-detail">
                    <span className="event-detail-label">Process:</span>
                    <span className="event-detail-value">{event.process_name}</span>
                  </div>
                </div>
                <div className="event-args">
                  {event.args}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
