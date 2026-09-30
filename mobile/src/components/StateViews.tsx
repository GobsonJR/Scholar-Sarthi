import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, spacing } from "../theme/theme";
import { Button } from "./Button";

export function LoadingView({ label = "Loading..." }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function OfflineView({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <Feather name="wifi-off" size={40} color={colors.textMuted} />
      <Text style={styles.title}>Unable to connect to Scholar Sarthi</Text>
      <Text style={styles.muted}>Check your internet connection and try again.</Text>
      <Button title="Retry" onPress={onRetry} variant="outline" style={styles.retryButton} />
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Feather name="alert-circle" size={40} color={colors.danger} />
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.muted}>{message}</Text>
      {onRetry && <Button title="Retry" onPress={onRetry} variant="outline" style={styles.retryButton} />}
    </View>
  );
}

export function EmptyView({ title, message }: { title: string; message?: string }) {
  return (
    <View style={styles.center}>
      <Feather name="inbox" size={40} color={colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.muted}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.sm,
  },
  title: { fontSize: 16, fontWeight: "600", color: colors.text, textAlign: "center", marginTop: spacing.sm },
  muted: { fontSize: 13, color: colors.textSecondary, textAlign: "center" },
  retryButton: { marginTop: spacing.md, minWidth: 140 },
});
