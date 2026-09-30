// Expo only inlines env vars prefixed EXPO_PUBLIC_ into the JS bundle.
// See .env.example for what value to use per test target (Android emulator,
// iOS simulator, physical device, production) — there is no safe universal
// default, so this deliberately has no hardcoded "localhost" fallback for
// the base URL itself.
const FALLBACK_API_URL = "http://10.0.2.2:8000";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? FALLBACK_API_URL;

export const API_TIMEOUT_MS = 20000;
