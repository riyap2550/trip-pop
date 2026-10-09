import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as api from '../lib/api';
import { ApiError, setRefreshHandler, setTokenGetter } from '../lib/api';

type AuthUser = { id: string; email: string; display_name: string; avatar_url: string | null };

type AuthStatus =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: AuthUser };

type AuthContextValue = AuthStatus & {
  /** Current access token, for requests made outside `api` (e.g. image headers). Rotates every refresh. */
  accessToken: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const REFRESH_TOKEN_KEY = 'refresh_token';

/** Only a 401 from /auth/refresh means the session is gone. A network error or 5xx is worth retrying later. */
const isSessionRejected = (e: unknown) => e instanceof ApiError && e.status === 401;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ status: 'loading' });
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);

  const setAuthenticated = useCallback((user: AuthUser, accessToken: string, refreshToken: string) => {
    accessTokenRef.current = accessToken;
    refreshTokenRef.current = refreshToken;
    setAccessToken(accessToken);
    setAuthStatus({ status: 'authenticated', user });
  }, []);

  useEffect(() => {
    setTokenGetter(async () => accessTokenRef.current);
    // Called by api.ts when a request gets a 401. It only swaps tokens, so it doesn't touch
    // authStatus unless the server rejects the refresh token; that would re-render the whole tree for nothing.
    // On a network error or 5xx it keeps the tokens, so the original request fails normally and the next one retries.
    setRefreshHandler(async () => {
      const rt = refreshTokenRef.current;
      if (!rt) return null;
      try {
        const res = await api.authRefresh(rt);
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, res.refresh_token);
        accessTokenRef.current = res.access_token;
        refreshTokenRef.current = res.refresh_token;
        setAccessToken(res.access_token);
        return res.access_token;
      } catch (e) {
        if (!isSessionRejected(e)) return null;
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        accessTokenRef.current = null;
        refreshTokenRef.current = null;
        setAccessToken(null);
        setAuthStatus({ status: 'unauthenticated' });
        return null;
      }
    });

    (async () => {
      try {
        const storedRefresh = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (!storedRefresh) { setAuthStatus({ status: 'unauthenticated' }); return; }
        const res = await api.authRefresh(storedRefresh);
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, res.refresh_token);
        setAuthenticated(res.user, res.access_token, res.refresh_token);
      } catch (e) {
        // If the server was unreachable at launch, keep the stored token so the next launch can restore the session.
        if (isSessionRejected(e)) await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
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
    setAccessToken(null);
    setAuthStatus({ status: 'unauthenticated' });
  }, []);

  const value: AuthContextValue = {
    ...authStatus,
    accessToken,
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
