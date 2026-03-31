import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { setAccessToken, clearAccessToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const refresh = localStorage.getItem('admin_refresh');
    if (refresh) {
      axios.post('/api/auth/refresh', { refreshToken: refresh })
        .then((r) => {
          setAccessToken(r.data.accessToken);
          const p = decodeJWT(r.data.accessToken);
          if (p.role !== 'admin') throw new Error('not admin');
          setUser({ id: p.sub, email: p.email, role: p.role,
            firstName: r.data.user?.firstName, lastName: r.data.user?.lastName });
        })
        .catch(() => { localStorage.removeItem('admin_refresh'); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    function onLogout() { logout(); }
    window.addEventListener('admin:logout', onLogout);
    return () => window.removeEventListener('admin:logout', onLogout);
  }, []);

  function login(accessToken, refreshToken, userData) {
    setAccessToken(accessToken);
    localStorage.setItem('admin_refresh', refreshToken);
    setUser(userData);
  }

  function logout() {
    clearAccessToken();
    localStorage.removeItem('admin_refresh');
    setUser(null);
  }

  const isAuth = !!user;

  return (
    <AuthContext.Provider value={{ user, isAuth, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

function decodeJWT(t) {
  try { return JSON.parse(atob(t.split('.')[1])); } catch { return {}; }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
