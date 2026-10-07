import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as api from '../lib/api';
import { setTokenGetter } from '../lib/api';

type AuthUser = { id: string; email: string; display_name: string; avatar_url: string | null };

type AuthStatus =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: AuthUser };

type AuthContextValue = AuthStatus & {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const REFRESH_TOKEN_KEY = 'refresh_token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ status: 'loading' });
  const accessTokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);

  const setAuthenticated = useCallback((user: AuthUser, accessToken: string, refreshToken: string) => {
    accessTokenRef.current = accessToken;
    refreshTokenRef.current = refreshToken;
    setAuthStatus({ status: 'authenticated', user });
  }, []);

  useEffect(() => {
    setTokenGetter(async () => accessTokenRef.current);

    (async () => {
      try {
        const storedRefresh = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (!storedRefresh) { setAuthStatus({ status: 'unauthenticated' }); return; }
        const res = await api.authRefresh(storedRefresh);
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, res.refresh_token);
        setAuthenticated(res.user, res.access_token, res.refresh_token);
      } catch {
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        setAuthStatus({ status: 'unauthenticated' });
      }
    })();
  }, [setAuthenticated]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.authLogin(email, password);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, res.refresh_token);
    setAuthenticated(res.user, res.access_token, res.refresh_token);
  }, [setAuthenticated]);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const res = await api.authRegister(email, password, displayName);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, res.refresh_token);
    setAuthenticated(res.user, res.access_token, res.refresh_token);
  }, [setAuthenticated]);

  const signOut = useCallback(async () => {
    const rt = refreshTokenRef.current;
    if (rt) {
      try { await api.authLogout(rt); } catch { /* best effort */ }
    }
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    accessTokenRef.current = null;
    refreshTokenRef.current = null;
    setAuthStatus({ status: 'unauthenticated' });
  }, []);

  const value: AuthContextValue = {
    ...authStatus,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
