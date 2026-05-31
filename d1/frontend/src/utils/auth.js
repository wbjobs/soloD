import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      loadUser();
    } else {
      setLoading(false);
    }
  }, []);

  const loadUser = async () => {
    try {
      const response = await authAPI.getCurrentUser();
      setUser(response.data.user);
      setPermissions(response.data.permissions);
      setRoles(response.data.roles);
    } catch (error) {
      console.error('加载用户信息失败:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (tenantId, username, password) => {
    logout();
    const response = await authAPI.login({ tenantId, username, password });
    localStorage.setItem('token', response.data.token);
    setUser(response.data.user);
    setPermissions(response.data.permissions);
    setRoles(response.data.roles);
    return response.data;
  };

  const refreshPermissions = async () => {
    if (localStorage.getItem('token')) {
      await loadUser();
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setPermissions([]);
    setRoles([]);
  };

  const hasPermission = (permission) => {
    return permissions.includes(permission);
  };

  return (
    <AuthContext.Provider value={{ user, permissions, roles, login, logout, hasPermission, loading, refreshPermissions, loadUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
