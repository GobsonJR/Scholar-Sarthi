import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { colors, spacing } from "../theme/theme";

export function ProfileScreen() {
  const { user, logout } = useAuth();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Card>
        <Text style={styles.label}>Full name</Text>
        <Text style={styles.value}>{user?.full_name}</Text>

        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user?.email}</Text>

        <Text style={styles.label}>Phone</Text>
        <Text style={styles.value}>{user?.phone ?? "—"}</Text>

        <Text style={styles.label}>Role</Text>
        <Text style={styles.value}>{user?.role === "applicant" ? "Applicant" : user?.role}</Text>
      </Card>

      <View style={styles.noticeBox}>
        <Text style={styles.noticeText}>
          Profile editing is not yet available on mobile — update your details from the web application, or contact
          support.
        </Text>
      </View>

      <Button title="Log Out" variant="danger" onPress={logout} style={{ marginTop: spacing.lg }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },
  label: { fontSize: 11, color: colors.textSecondary, marginTop: spacing.sm },
  value: { fontSize: 15, fontWeight: "600", color: colors.text, marginTop: 2 },
  noticeBox: { marginTop: spacing.lg, padding: spacing.md, borderRadius: 12, backgroundColor: "#F1F5F9" },
  noticeText: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
});
