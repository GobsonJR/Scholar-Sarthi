import { useCallback } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";
import { listApplications } from "../api/applications";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { LoadingView, OfflineView, ErrorView } from "../components/StateViews";
import { colors, radius, spacing } from "../theme/theme";
import { STATUS_LABELS, STATUS_TONE, type Application } from "../types";
import type { RootStackParamList } from "../navigation/types";

export function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { status, data: applications, errorMessage, refetch } = useApi<Application[]>(() => listApplications(), []);

  useFocusEffect(useCallback(() => refetch(), [refetch]));

  if (status === "loading") return <LoadingView label="Loading your dashboard..." />;
  if (status === "offline") return <OfflineView onRetry={refetch} />;
  if (status === "error") return <ErrorView message={errorMessage} onRetry={refetch} />;

  const apps = applications ?? [];
  const actionRequired = apps.filter((a) => a.status === "CORRECTION_REQUIRED");
  const counts = {
    total: apps.length,
    underReview: apps.filter((a) => a.status === "UNDER_OFFICER_REVIEW" || a.status === "UNDER_VERIFICATION").length,
    approved: apps.filter((a) => a.status === "APPROVED").length,
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
    >
      <Text style={styles.greeting}>Welcome, {user?.full_name?.split(" ")[0] ?? "Applicant"}</Text>
      <Text style={styles.subtitle}>Here's where your scholarship applications stand.</Text>

      <View style={styles.statRow}>
        <StatCard label="Applications" value={counts.total} />
        <StatCard label="Under Review" value={counts.underReview} />
        <StatCard label="Approved" value={counts.approved} />
      </View>

      {actionRequired.length > 0 && (
        <Card style={styles.actionCard}>
          <Text style={styles.actionTitle}>Action required</Text>
          {actionRequired.map((a) => (
            <View key={a.id} style={styles.actionRow}>
              <Text style={styles.actionText}>
                {a.display_id} — {a.scheme?.name ?? "Scholarship"}
              </Text>
              <Text
                style={styles.link}
                onPress={() => navigation.navigate("ApplicationStatus", { applicationId: a.id })}
              >
                Review
              </Text>
            </View>
          ))}
        </Card>
      )}

      <Text style={styles.sectionTitle}>Recent applications</Text>
      {apps.length === 0 ? (
        <Card>
          <Text style={styles.muted}>No applications yet. Browse scholarships to get started.</Text>
        </Card>
      ) : (
        apps.slice(0, 5).map((a) => (
          <TouchableOpacity
            key={a.id}
            activeOpacity={0.7}
            onPress={() =>
              a.status === "DRAFT" || a.status === "CORRECTION_REQUIRED"
                ? navigation.navigate("ApplicationOverview", { applicationId: a.id })
                : navigation.navigate("ApplicationStatus", { applicationId: a.id })
            }
          >
            <Card style={{ marginBottom: spacing.sm }}>
              <View style={styles.appRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.appId}>{a.display_id}</Text>
                  <Text style={styles.appScheme}>{a.scheme?.name ?? "Scholarship"}</Text>
                </View>
                <Badge label={STATUS_LABELS[a.status]} tone={STATUS_TONE[a.status]} />
              </View>
            </Card>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md },
  greeting: { fontSize: 22, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  statRow: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "700", color: colors.primary },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2, textAlign: "center" },
  actionCard: { backgroundColor: colors.warningLight, borderColor: "#FDE68A" },
  actionTitle: { fontSize: 14, fontWeight: "700", color: colors.warning, marginBottom: spacing.xs },
  actionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.xs },
  actionText: { fontSize: 13, color: colors.text, flex: 1 },
  link: { fontSize: 13, fontWeight: "700", color: colors.primary },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: spacing.sm },
  muted: { fontSize: 13, color: colors.textSecondary },
  appRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  appId: { fontSize: 13, fontWeight: "700", color: colors.text },
  appScheme: { fontSize: 12, color: colors.textSecondary },
});
