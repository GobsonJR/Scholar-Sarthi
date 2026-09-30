import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useApi } from "../hooks/useApi";
import { getApplication, submitApplication } from "../api/applications";
import { apiErrorMessage } from "../api/client";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { LoadingView, OfflineView, ErrorView } from "../components/StateViews";
import { colors, spacing } from "../theme/theme";
import { STATUS_LABELS, STATUS_TONE, type ApplicationDetail } from "../types";
import type { RootStackParamList } from "../navigation/types";

const EDITABLE_STATUSES = new Set(["DRAFT", "CORRECTION_REQUIRED"]);

export function ApplicationOverviewScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, "ApplicationOverview">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { status, data: application, errorMessage, refetch } = useApi<ApplicationDetail>(
    () => getApplication(params.applicationId),
    [params.applicationId],
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => refetch(), [refetch]));

  if (status === "loading") return <LoadingView label="Loading application..." />;
  if (status === "offline") return <OfflineView onRetry={refetch} />;
  if (status === "error" || !application) return <ErrorView message={errorMessage} onRetry={refetch} />;

  const scheme = application.scheme;
  const requiredDocs = scheme?.required_documents ?? [];
  const uploadedTypes = new Set(application.documents.map((d) => d.doc_type));
  const missingDocs = requiredDocs.filter((d) => !uploadedTypes.has(d));
  const editable = EDITABLE_STATUSES.has(application.status);
  const readyToSubmit = application.status === "DRAFT" && missingDocs.length === 0;

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitApplication(application.id);
      navigation.navigate("ApplicationStatus", { applicationId: application.id });
    } catch (e) {
      setSubmitError(apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.id}>{application.display_id}</Text>
          <Text style={styles.scheme}>{scheme?.name ?? "Scholarship"}</Text>
        </View>
        <Badge label={STATUS_LABELS[application.status]} tone={STATUS_TONE[application.status]} />
      </View>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Application details</Text>
        <Text style={styles.body}>
          Personal, academic, financial and category information you've provided so far. Tap below to view or edit.
        </Text>
        <Button
          title={editable ? "Edit Application Details" : "View Application Details"}
          variant="outline"
          onPress={() => navigation.navigate("ApplicationForm", { applicationId: application.id })}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Documents</Text>
        <Text style={styles.body}>
          {application.documents.length} / {requiredDocs.length} required documents uploaded.
        </Text>
        {missingDocs.length > 0 && <Text style={styles.warning}>Missing: {missingDocs.join(", ")}</Text>}
        <Button
          title="Manage Documents"
          variant="outline"
          onPress={() => navigation.navigate("DocumentChecklist", { applicationId: application.id })}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      {application.eligibility && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Preliminary eligibility</Text>
          <Badge
            label={application.eligibility.eligible ? "Eligible" : "Not Currently Eligible"}
            tone={application.eligibility.eligible ? "success" : "danger"}
          />
        </Card>
      )}

      {submitError && <Text style={styles.errorText}>{submitError}</Text>}

      {application.status === "DRAFT" && (
        <Button
          title="Submit Application"
          onPress={handleSubmit}
          loading={submitting}
          disabled={!readyToSubmit}
          style={{ marginTop: spacing.lg }}
        />
      )}
      {application.status === "DRAFT" && !readyToSubmit && (
        <Text style={styles.warning}>Upload all required documents before submitting.</Text>
      )}
      {application.status === "CORRECTION_REQUIRED" && (
        <Button
          title="View Correction & Status"
          onPress={() => navigation.navigate("ApplicationStatus", { applicationId: application.id })}
          style={{ marginTop: spacing.lg }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  id: { fontSize: 16, fontWeight: "700", color: colors.text },
  scheme: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  section: {},
  sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  warning: { fontSize: 12, color: colors.warning, marginTop: spacing.xs },
  errorText: { color: colors.danger, fontSize: 13 },
});
