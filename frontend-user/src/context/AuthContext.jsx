import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setAccessToken, clearAccessToken } from '../api/client';
import { refreshAccessToken } from '../api/auth';
import { getAnonId } from '../services/anonId';
import { stitchActivations } from '../api/offers';

const AuthContext = createContext(null);

function decodeJWT(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from refresh token in localStorage on app mount
  useEffect(() => {
    const restore = async () => {
      const stored = localStorage.getItem('tapprove_refresh');
      if (!stored) { setLoading(false); return; }

      try {
        const data    = await refreshAccessToken(stored);
        const payload = decodeJWT(data.accessToken);
        setAccessToken(data.accessToken);
        // data.user carries firstName, lastName, avatarUrl if the refresh endpoint returns it
        setUser({
          id:        payload.sub,
          email:     payload.email,
          role:      payload.role,
          firstName: data.user?.firstName ?? null,
          lastName:  data.user?.lastName  ?? null,
          avatarUrl: data.user?.avatarUrl ?? null,
        });
      } catch {
        localStorage.removeItem('tapprove_refresh');
      } finally {
        setLoading(false);
      }
    };

    restore();

    // Handle forced logout from the axios interceptor
    const onLogout = () => logout();
    window.addEventListener('tapprove:logout', onLogout);
    return () => window.removeEventListener('tapprove:logout', onLogout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback((accessToken, refreshToken, userData) => {
    setAccessToken(accessToken);
    localStorage.setItem('tapprove_refresh', refreshToken);
    setUser(userData);
    // Claim any anon offer activations made on this device before sign-in.
    stitchActivations(getAnonId()).catch(() => {});
  }, []);

  const logout = useCallback(() => {
    clearAccessToken();
    localStorage.removeItem('tapprove_refresh');
    setUser(null);
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((prev) => prev ? { ...prev, ...patch } : prev);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser, isAuth: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
