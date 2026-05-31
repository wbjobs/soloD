import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../utils/auth';
import { Spin } from 'antd';

const ProtectedRoute = ({ children, permission }) => {
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
