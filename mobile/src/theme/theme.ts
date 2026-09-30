// Professional blue/indigo/neutral palette — matches the intent of the web
// app's design language (see frontend/src/index.css) without importing
// Tailwind config directly (different build toolchains).
export const colors = {
  primary: "#1E3A8A",
  primaryLight: "#EFF4FF",
  secondary: "#4338CA",
  text: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  border: "#E2E8F0",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  success: "#15803D",
  successLight: "#F0FDF4",
  warning: "#B45309",
  warningLight: "#FFFBEB",
  danger: "#B91C1C",
  dangerLight: "#FEF2F2",
  info: "#1D4ED8",
  infoLight: "#EFF6FF",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, full: 999 };

export const fontSize = { xs: 12, sm: 13, base: 15, md: 16, lg: 18, xl: 22, xxl: 26 };

export const touchTarget = 44;
