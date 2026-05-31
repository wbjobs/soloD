import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../utils/auth';
import Users from '../pages/Users';
import Roles from '../pages/Roles';
import Permissions from '../pages/Permissions';
import Logs from '../pages/Logs';

const routeConfig = [
  {
    path: 'users',
    element: <Users />,
    permission: 'user:view'
  },
  {
    path: 'roles',
    element: <Roles />,
    permission: 'role:view'
  },
  {
    path: 'permissions',
    element: <Permissions />,
    permission: 'permission:view'
  },
  {
    path: 'logs',
    element: <Logs />,
    permission: 'log:view'
  }
];

const DynamicRoutes = () => {
  const { hasPermission, loading } = useAuth();

  if (loading) {
    return null;
  }

  const availableRoutes = routeConfig.filter(route => 
    !route.permission || hasPermission(route.permission)
  );

  const defaultRoute = availableRoutes.length > 0 
    ? availableRoutes[0].path 
    : '/login';

  return (
    <Routes>
      <Route index element={<Navigate to={defaultRoute} replace />} />
      {availableRoutes.map(route => (
        <Route 
          key={route.path} 
          path={route.path} 
          element={route.element} 
        />
      ))}
      <Route path="*" element={<Navigate to={defaultRoute} replace />} />
    </Routes>
  );
};

export default DynamicRoutes;
