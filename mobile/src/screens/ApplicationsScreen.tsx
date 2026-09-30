import { useCallback } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useApi } from "../hooks/useApi";
import { listApplications } from "../api/applications";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { LoadingView, OfflineView, ErrorView, EmptyView } from "../components/StateViews";
import { colors, spacing } from "../theme/theme";
import { STATUS_LABELS, STATUS_TONE, type Application } from "../types";
import type { RootStackParamList } from "../navigation/types";

export function ApplicationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { status, data: applications, errorMessage, refetch } = useApi<Application[]>(() => listApplications(), []);

  useFocusEffect(useCallback(() => refetch(), [refetch]));

  if (status === "loading") return <LoadingView label="Loading your applications..." />;
  if (status === "offline") return <OfflineView onRetry={refetch} />;
  if (status === "error") return <ErrorView message={errorMessage} onRetry={refetch} />;

  const openApplication = (a: Application) => {
    if (a.status === "DRAFT" || a.status === "CORRECTION_REQUIRED") {
      navigation.navigate("ApplicationOverview", { applicationId: a.id });
    } else {
      navigation.navigate("ApplicationStatus", { applicationId: a.id });
    }
  };

  return (
    <FlatList
      style={styles.screen}
      data={applications ?? []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<EmptyView title="No applications yet" message="Start one from the Scholarships tab." />}
      renderItem={({ item }) => (
        <TouchableOpacity onPress={() => openApplication(item)} activeOpacity={0.7}>
          <Card style={{ marginBottom: spacing.sm }}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.id}>{item.display_id}</Text>
                <Text style={styles.scheme}>{item.scheme?.name ?? "Scholarship"}</Text>
                <Text style={styles.date}>Updated {new Date(item.updated_at).toLocaleDateString()}</Text>
              </View>
              <Badge label={STATUS_LABELS[item.status]} tone={STATUS_TONE[item.status]} />
            </View>
          </Card>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, flexGrow: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  id: { fontSize: 14, fontWeight: "700", color: colors.text },
  scheme: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  date: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
});
