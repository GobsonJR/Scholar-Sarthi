import { StyleSheet, Text, View } from "react-native";
import { ActivityIndicator } from "react-native";
import { colors, spacing } from "../theme/theme";

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scholar Sarthi</Text>
      <Text style={styles.subtitle}>Scholarship & Fellowship Management</Text>
      <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  title: { fontSize: 28, fontWeight: "700", color: colors.primary },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs },
});
