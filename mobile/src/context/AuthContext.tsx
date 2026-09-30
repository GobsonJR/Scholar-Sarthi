import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "../types";
import * as authApi from "../api/auth";
import { clearToken, loadPersistedToken, registerUnauthorizedHandler, setToken } from "../api/client";

interface AuthContextValue {
  user: User | null;
  isBootstrapping: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const logout = async () => {
    await clearToken();
    setUser(null);
  };

  useEffect(() => {
    // Any 401 from the API (expired/invalid token, per Phase 8 spec section
    // 4/16) forces a logout back to the login screen — the backend, not the
    // client, is the source of truth on token validity.
    registerUnauthorizedHandler(() => {
      setUser(null);
      clearToken().catch(() => {});
    });

    (async () => {
      try {
        const token = await loadPersistedToken();
        if (!token) return;
        try {
          const me = await authApi.fetchMe();
          setUser(me);
        } catch {
          // Token present but rejected (expired/invalid) — clear it silently
          // and fall through to the login screen rather than looping.
          await clearToken().catch(() => {});
        }
      } catch {
        // Reading the secure store itself failed (e.g. no secure storage
        // backend available on this runtime) — treat as logged-out rather
        // than hanging on the splash screen forever.
      } finally {
        setIsBootstrapping(false);
      }
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isBootstrapping,
      login: async (email, password) => {
        const res = await authApi.login(email, password);
        await setToken(res.access_token);
        setUser(res.user);
        return res.user;
      },
      logout,
    }),
    [user, isBootstrapping],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
