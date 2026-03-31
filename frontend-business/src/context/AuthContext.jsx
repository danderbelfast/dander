import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setAccessToken, clearAccessToken } from '../api/client';
import { refreshAccessToken } from '../api/auth';

const AuthContext = createContext(null);

function decodeJWT(t) {
  try { return JSON.parse(atob(t.split('.')[1])); } catch { return {}; }
}

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null);
  const [business, setBusiness] = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const restore = async () => {
      const rt = localStorage.getItem('biz_refresh');
      if (!rt) { setLoading(false); return; }
      try {
        const data    = await refreshAccessToken(rt);
        const payload = decodeJWT(data.accessToken);
        setAccessToken(data.accessToken);
        setUser({ id: payload.sub, email: payload.email, role: payload.role });
      } catch {
        localStorage.removeItem('biz_refresh');
      } finally {
        setLoading(false);
      }
    };
    restore();

    const onLogout = () => logout();
    window.addEventListener('biz:logout', onLogout);
    return () => window.removeEventListener('biz:logout', onLogout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback((accessToken, refreshToken, userData) => {
    setAccessToken(accessToken);
    localStorage.setItem('biz_refresh', refreshToken);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    clearAccessToken();
    localStorage.removeItem('biz_refresh');
    setUser(null);
    setBusiness(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, business, setBusiness, loading, login, logout, isAuth: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
