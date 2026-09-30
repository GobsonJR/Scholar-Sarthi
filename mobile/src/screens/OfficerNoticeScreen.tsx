import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/Button";
import { colors, spacing } from "../theme/theme";

// Per Phase 8 spec section 23: officer/admin functionality is not
// reproduced on mobile. Rather than exposing an incomplete officer
// dashboard, an officer who logs in here is told plainly to use the web app.
export function OfficerNoticeScreen() {
  const { logout, user } = useAuth();
  return (
    <View style={styles.container}>
      <Feather name="monitor" size={48} color={colors.primary} />
      <Text style={styles.title}>Officer dashboard is web-only</Text>
      <Text style={styles.body}>
        Hi {user?.full_name ?? "there"} — the officer review queue, scheme management and audit log tools are only
        available on the Scholar Sarthi web application. Please log in there to continue your work.
      </Text>
      <Button title="Log Out" variant="outline" onPress={logout} style={{ marginTop: spacing.xl, minWidth: 160 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, backgroundColor: colors.background, gap: spacing.sm },
  title: { fontSize: 18, fontWeight: "700", color: colors.text, textAlign: "center", marginTop: spacing.md },
  body: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
});
