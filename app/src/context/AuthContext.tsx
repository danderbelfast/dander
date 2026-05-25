/**
 * AuthContext.tsx — login / register / logout, with token persistence.
 *
 * Holds the access token in memory and mirrors it to AsyncStorage so it
 * survives app restarts. Refresh-token rotation isn't wired up yet —
 * Chris can layer that on top once the auth flow has UI.
 */

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  login    as loginApi,
  register as registerApi,
  LoginPayload, RegisterPayload,
} from '../api/auth';
import {
  setAccessToken, restoreAccessToken,
} from '../api/client';

interface AuthUser {
  id:    number;
  email: string;
  [k: string]: unknown;
}

interface AuthContextValue {
  user:     AuthUser | null;
  loading:  boolean;
  isAuth:   boolean;
  login:    (p: LoginPayload) => Promise<void>;
  register: (p: RegisterPayload) => Promise<void>;
  logout:   () => Promise<void>;
}

const USER_KEY = 'dander_auth_user';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on boot.
  useEffect(() => {
    (async () => {
      try {
        const token = await restoreAccessToken();
        const raw   = await AsyncStorage.getItem(USER_KEY);
        if (token && raw) setUser(JSON.parse(raw));
      } catch {
        // ignore — user just lands logged-out
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persistSession = useCallback(async (token: string, u: AuthUser) => {
    setAccessToken(token);
    setUser(u);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
  }, []);

  const login = useCallback(async (p: LoginPayload) => {
    const data = await loginApi(p);
    // Expected backend shape: { accessToken, user, ... }
    await persistSession(data.accessToken, data.user);
  }, [persistSession]);

  const register = useCallback(async (p: RegisterPayload) => {
    const data = await registerApi(p);
    if (data?.accessToken && data?.user) {
      await persistSession(data.accessToken, data.user);
    }
  }, [persistSession]);

  const logout = useCallback(async () => {
    setAccessToken(null);
    setUser(null);
    await AsyncStorage.removeItem(USER_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user, loading, isAuth: !!user,
    login, register, logout,
  }), [user, loading, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
