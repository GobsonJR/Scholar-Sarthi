import axios, { AxiosError } from "axios";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL, API_TIMEOUT_MS } from "../config/env";

// JWTs are the one thing worth protecting on-device here (session hijack
// risk) — expo-secure-store uses the Keychain on iOS / Keystore-backed
// EncryptedSharedPreferences on Android, unlike plain AsyncStorage which is
// unencrypted. See Phase 8 spec section 16.
const TOKEN_KEY = "scholar_sarthi_access_token";

// The request interceptor needs the token synchronously on every request, so
// it's cached in memory rather than re-reading SecureStore (an async native
// call) per request. SecureStore itself is only used to persist it across
// app restarts, and only ever read once, at bootstrap (see
// AuthContext/loadPersistedToken). SecureStore's native module is also only
// implemented on iOS/Android — calling it on an unsupported runtime throws
// rather than rejecting gracefully, so every call site here is defensive:
// a missing secure-storage backend degrades to "session works, doesn't
// persist across restarts" instead of silently killing every request
// (which is exactly what happened before this was cached — the interceptor
// re-read SecureStore per call, and a failed persisted write meant every
// request after login still had no token attached).
let memoryToken: string | null = null;

export function getToken(): string | null {
  return memoryToken;
}

/** Reads whatever was persisted from a previous session — called once, by
 * AuthContext on mount, never by the request interceptor. */
export async function loadPersistedToken(): Promise<string | null> {
  try {
    memoryToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    memoryToken = null;
  }
  return memoryToken;
}

export async function setToken(token: string): Promise<void> {
  memoryToken = token;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // Best-effort: on a runtime with no secure-storage backend, the session
    // simply won't persist across restarts — not fatal for the current
    // session, which already has the token cached in memory above.
  }
}

export async function clearToken(): Promise<void> {
  memoryToken = null;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // See setToken — best-effort.
  }
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Set by AuthContext on mount so the interceptor can force a logout on 401
// without importing React context state into this plain module.
let onUnauthorized: (() => void) | null = null;
export function registerUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (axios.isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === "string") return detail;
    if (!error.response) {
      return "Unable to connect to Scholar Sarthi. Check your internet connection and try again.";
    }
  }
  return fallback;
}

/** True when the error indicates the API is unreachable (no response at all) —
 * distinct from a reachable API returning an error status. Screens use this
 * to show a dedicated "offline" state per Phase 8 spec section 14. */
export function isNetworkError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}
