import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useApi } from "../hooks/useApi";
import { getApplication, listCorrections, resubmitApplication } from "../api/applications";
import { apiErrorMessage } from "../api/client";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { LoadingView, OfflineView, ErrorView } from "../components/StateViews";
import { colors, spacing } from "../theme/theme";
import { STATUS_LABELS, STATUS_TONE, type ApplicationDetail, type CorrectionRequest } from "../types";
import type { RootStackParamList } from "../navigation/types";

const TIMELINE_ORDER = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_VERIFICATION",
  "UNDER_OFFICER_REVIEW",
  "APPROVED",
] as const;

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function ApplicationStatusScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, "ApplicationStatus">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { status, data: application, errorMessage, refetch } = useApi<ApplicationDetail>(
    () => getApplication(params.applicationId),
    [params.applicationId],
  );
  const { data: corrections } = useApi<CorrectionRequest[]>(
    () => listCorrections(params.applicationId),
    [params.applicationId],
  );
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => refetch(), [refetch]));

  if (status === "loading") return <LoadingView label="Loading status..." />;
  if (status === "offline") return <OfflineView onRetry={refetch} />;
  if (status === "error" || !application) return <ErrorView message={errorMessage} onRetry={refetch} />;

  const isRejected = application.status === "REJECTED";
  const isCorrectionFlow = application.status === "CORRECTION_REQUIRED" || application.status === "RESUBMITTED";
  const openCorrections = (corrections ?? []).filter((c) => c.status === "OPEN");
  const currentIndex = isRejected
    ? TIMELINE_ORDER.length - 1
    : TIMELINE_ORDER.indexOf(application.status as (typeof TIMELINE_ORDER)[number]);

  const handleResubmit = async () => {
    setResubmitError(null);
    setResubmitting(true);
    try {
      await resubmitApplication(application.id);
      refetch();
    } catch (e) {
      setResubmitError(apiErrorMessage(e));
    } finally {
      setResubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.id}>{application.display_id}</Text>
          <Text style={styles.scheme}>{application.scheme?.name ?? "Scholarship"}</Text>
        </View>
        <Badge label={STATUS_LABELS[application.status]} tone={STATUS_TONE[application.status]} />
      </View>

      {!isCorrectionFlow && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Progress</Text>
          {TIMELINE_ORDER.map((step, i) => {
            const done = i <= currentIndex && !isRejected;
            const failed = isRejected && step === "APPROVED";
            return (
              <View key={step} style={styles.timelineRow}>
                <Feather
                  name={failed ? "x-circle" : done ? "check-circle" : "circle"}
                  size={16}
                  color={failed ? colors.danger : done ? colors.success : colors.textMuted}
                />
                <Text style={[styles.timelineLabel, done && styles.timelineLabelDone]}>
                  {failed ? "Rejected" : titleCase(step)}
                </Text>
              </View>
            );
          })}
        </Card>
      )}

      {isCorrectionFlow && openCorrections.length > 0 && (
        <Card style={[styles.section, { backgroundColor: colors.warningLight }]}>
          <Text style={[styles.sectionTitle, { color: colors.warning }]}>Action required</Text>
          {openCorrections.map((c) => (
            <View key={c.id} style={styles.correctionItem}>
              <Text style={styles.correctionIssue}>{c.issue}</Text>
              <Text style={styles.correctionComment}>{c.comment}</Text>
              {c.document_id && (
                <Button
                  title="Replace Document"
                  variant="outline"
                  onPress={() =>
                    navigation.navigate("DocumentReplace", {
                      documentId: c.document_id!,
                      docType: "",
                      documentName: "flagged document",
                    })
                  }
                  style={{ marginTop: spacing.sm }}
                />
              )}
            </View>
          ))}
          {resubmitError && <Text style={styles.errorText}>{resubmitError}</Text>}
          <Button
            title="Resubmit Application"
            onPress={handleResubmit}
            loading={resubmitting}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      )}

      {application.eligibility && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Eligibility result</Text>
          <Badge
            label={application.eligibility.eligible ? "Eligible" : "Not Eligible"}
            tone={application.eligibility.eligible ? "success" : "danger"}
          />
          <Text style={styles.body}>{application.eligibility.explanation}</Text>
        </Card>
      )}

      {application.mismatches.some((m) => m.is_mismatch) && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Cross-document check</Text>
          {application.mismatches
            .filter((m) => m.is_mismatch)
            .map((m, i) => (
              <Text key={i} style={styles.body}>
                • {m.explanation}
              </Text>
            ))}
        </Card>
      )}

      <Button
        title="View Documents"
        variant="ghost"
        onPress={() => navigation.navigate("DocumentChecklist", { applicationId: application.id })}
        style={{ marginTop: spacing.md }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  id: { fontSize: 16, fontWeight: "700", color: colors.text },
  scheme: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  section: { marginTop: spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  timelineRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
  timelineLabel: { fontSize: 13, color: colors.textMuted },
  timelineLabelDone: { color: colors.text, fontWeight: "600" },
  correctionItem: { marginBottom: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: "#FDE68A" },
  correctionIssue: { fontSize: 13, fontWeight: "700", color: colors.text },
  correctionComment: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  body: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18 },
  errorText: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
});
