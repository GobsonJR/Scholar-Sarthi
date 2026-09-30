import { useCallback } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useApi } from "../hooks/useApi";
import { getApplication } from "../api/applications";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { LoadingView, OfflineView, ErrorView } from "../components/StateViews";
import { colors, spacing } from "../theme/theme";
import type { ApplicationDetail } from "../types";
import type { RootStackParamList } from "../navigation/types";

const RESULT_META: Record<string, { tone: "success" | "warning" | "danger"; label: string; icon: keyof typeof Feather.glyphMap }> = {
  VERIFIED: { tone: "success", label: "Verified", icon: "check-circle" },
  NEEDS_REVIEW: { tone: "warning", label: "Needs Review", icon: "alert-triangle" },
  INVALID: { tone: "danger", label: "Action Required", icon: "x-circle" },
  PROCESSING: { tone: "neutral" as any, label: "Processing...", icon: "clock" },
};

export function DocumentChecklistScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, "DocumentChecklist">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { status, data: application, errorMessage, refetch } = useApi<ApplicationDetail>(
    () => getApplication(params.applicationId),
    [params.applicationId],
  );

  useFocusEffect(useCallback(() => refetch(), [refetch]));

  if (status === "loading") return <LoadingView label="Loading document checklist..." />;
  if (status === "offline") return <OfflineView onRetry={refetch} />;
  if (status === "error" || !application) return <ErrorView message={errorMessage} onRetry={refetch} />;

  const scheme = application.scheme;
  const schemeDocs = scheme?.documents ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.intro}>
        Documents required for {scheme?.name ?? "this scheme"}. Uploads are processed automatically through OCR and
        AI verification.
      </Text>
      {schemeDocs.map((sd) => {
        const doc = application.documents.find((d) => d.doc_type === sd.document_type);
        const meta = doc ? RESULT_META[doc.status] ?? RESULT_META.NEEDS_REVIEW : null;
        return (
          <TouchableOpacity
            key={sd.id}
            activeOpacity={0.7}
            onPress={() =>
              doc
                ? navigation.navigate("DocumentVerification", { documentId: doc.id })
                : navigation.navigate("DocumentUpload", {
                    applicationId: application.id,
                    docType: sd.document_type,
                    documentName: sd.document_name,
                  })
            }
          >
            <Card style={styles.docCard}>
              <View style={styles.docRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docName}>
                    {sd.document_name}
                    {!sd.required && " (optional)"}
                  </Text>
                  {sd.description && <Text style={styles.docDesc}>{sd.description}</Text>}
                </View>
                {doc && meta ? (
                  <Badge label={meta.label} tone={meta.tone as any} />
                ) : (
                  <Badge label="Upload" tone="neutral" />
                )}
              </View>
            </Card>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  intro: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 18 },
  docCard: { marginBottom: spacing.sm },
  docRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  docName: { fontSize: 14, fontWeight: "600", color: colors.text },
  docDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
