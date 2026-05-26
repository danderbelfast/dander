/**
 * AuthContext.tsx — login / register / logout with token persistence.
 *
 * Both login and register are 2-step (email OTP). The context exposes the
 * raw step calls so screens can drive the flow; only `completeLogin` actually
 * sets the session, since that's the only response that includes an access
 * token. Register-verify only flips `is_verified` on the backend — the user
 * still has to log in afterwards.
 */

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  login             as loginApi,
  verifyLoginOtp    as verifyLoginOtpApi,
  register          as registerApi,
  verifyRegisterOtp as verifyRegisterOtpApi,
  LoginPayload, RegisterPayload, AuthUser,
} from '../api/auth';
import {
  setAccessToken, restoreAccessToken,
} from '../api/client';

interface AuthContextValue {
  user:    AuthUser | null;
  loading: boolean;
  isAuth:  boolean;

  /** Step 1 of login — verifies password, triggers OTP email, returns tempToken. */
  requestLoginOtp:   (p: LoginPayload) => Promise<{ tempToken: string }>;
  /** Step 2 of login — verifies OTP and persists the session. */
  completeLogin:     (tempToken: string, code: string) => Promise<void>;

  /** Step 1 of register — creates account, triggers OTP email, returns userId. */
  register:          (p: RegisterPayload) => Promise<{ userId: number }>;
  /** Step 2 of register — verifies OTP, marks account active, and persists the session. */
  verifyRegisterOtp: (userId: number, code: string) => Promise<void>;

  logout: () => Promise<void>;
}

const USER_KEY = 'dander_auth_user';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

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

  const requestLoginOtp = useCallback(async (p: LoginPayload) => {
    const data = await loginApi(p);
    return { tempToken: data.tempToken };
  }, []);

  const completeLogin = useCallback(async (tempToken: string, code: string) => {
    const data = await verifyLoginOtpApi(tempToken, code);
    await persistSession(data.accessToken, data.user);
  }, [persistSession]);

  const register = useCallback(async (p: RegisterPayload) => {
    const data = await registerApi(p);
    return { userId: data.userId };
  }, []);

  const verifyRegisterOtp = useCallback(async (userId: number, code: string) => {
    const data = await verifyRegisterOtpApi(userId, code);
    await persistSession(data.accessToken, data.user);
  }, [persistSession]);

  const logout = useCallback(async () => {
    setAccessToken(null);
    setUser(null);
    await AsyncStorage.removeItem(USER_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user, loading, isAuth: !!user,
    requestLoginOtp, completeLogin,
    register, verifyRegisterOtp,
    logout,
  }), [user, loading, requestLoginOtp, completeLogin, register, verifyRegisterOtp, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
