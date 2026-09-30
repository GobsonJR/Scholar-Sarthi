import { useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useApi } from "../hooks/useApi";
import { api } from "../api/client";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { LoadingView, OfflineView, ErrorView } from "../components/StateViews";
import { colors, radius, spacing } from "../theme/theme";
import type { AppDocument, Tone } from "../types";
import type { RootStackParamList } from "../navigation/types";

const RESULT_META: Record<string, { tone: Tone; label: string }> = {
  VERIFIED: { tone: "success", label: "Verified" },
  NEEDS_REVIEW: { tone: "warning", label: "Needs Review" },
  INVALID: { tone: "danger", label: "Verification Failed" },
  PROCESSING: { tone: "neutral", label: "Processing" },
};

const RECOMMENDED_ACTION: Record<string, string> = {
  VERIFIED: "No action needed.",
  NEEDS_REVIEW: "Review this document. If anything looks incorrect, replace it with a clearer copy.",
  INVALID: "Please replace the document with a clearer copy.",
};

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function fetchDocument(documentId: string): Promise<AppDocument> {
  const { data } = await api.get<AppDocument>(`/documents/${documentId}/verification`);
  return data;
}

export function DocumentVerificationScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, "DocumentVerification">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { status, data: document, errorMessage, refetch } = useApi<AppDocument>(
    () => fetchDocument(params.documentId),
    [params.documentId],
  );

  useFocusEffect(useCallback(() => refetch(), [refetch]));

  if (status === "loading") return <LoadingView label="Loading verification status..." />;
  if (status === "offline") return <OfflineView onRetry={refetch} />;
  if (status === "error" || !document) return <ErrorView message={errorMessage} onRetry={refetch} />;

  const v = document.verification;
  const meta = RESULT_META[document.status] ?? RESULT_META.NEEDS_REVIEW;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.docName}>
            {titleCase(document.doc_type)}
            {document.version > 1 && <Text style={styles.version}> v{document.version}</Text>}
          </Text>
          <Text style={styles.filename}>{document.original_filename}</Text>
        </View>
        <Badge label={meta.label} tone={meta.tone} />
      </View>

      {document.status === "PROCESSING" && (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.body}>Your document is still being processed by the verification pipeline. Pull to refresh in a moment.</Text>
        </Card>
      )}

      {v && (
        <>
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Verification checklist</Text>
            <ChecklistItem label="Document received" done />
            <ChecklistItem label="Document type detected" done={v.document_type_match} />
            {v.document_type_match && (
              <>
                <ChecklistItem label="Text extracted" done={document.status !== "INVALID"} />
                <ChecklistItem label="Required fields found" done={v.expected_fields_missing.length === 0} />
                <ChecklistItem
                  label="Authenticity checked"
                  done={v.authenticity_risk === "LOW"}
                  warn={v.authenticity_risk === "MEDIUM"}
                />
              </>
            )}
          </Card>

          {v.reasons.length > 0 && (
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Reason</Text>
              <Text style={styles.body}>{v.reasons.join(" ")}</Text>
            </Card>
          )}

          {v.authenticity_notes.length > 0 && (
            <Card style={[styles.section, { backgroundColor: colors.warningLight }]}>
              <Text style={[styles.body, { color: colors.warning }]}>
                Additional verification is required because {v.authenticity_notes.join(" ").toLowerCase()}
              </Text>
            </Card>
          )}

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Recommended action</Text>
            <Text style={styles.body}>{RECOMMENDED_ACTION[document.status] ?? RECOMMENDED_ACTION.NEEDS_REVIEW}</Text>
          </Card>

          {document.extraction && Object.keys(document.extraction.extracted_fields).length > 0 && (
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Extracted information</Text>
              {Object.entries(document.extraction.extracted_fields).map(([key, value]) => (
                <View key={key} style={styles.fieldRow}>
                  <Text style={styles.fieldKey}>{titleCase(key)}</Text>
                  <Text style={styles.fieldValue}>{value === null || value === "" ? "—" : String(value)}</Text>
                </View>
              ))}
            </Card>
          )}

          <Text style={styles.disclaimer}>
            This is an AI-assisted verification/authenticity-risk signal for officer review, not a definitive
            forensic "document is genuine" certification.
          </Text>
        </>
      )}

      <Button
        title="Replace Document"
        variant="outline"
        onPress={() =>
          navigation.navigate("DocumentReplace", {
            documentId: document.id,
            docType: document.doc_type,
            documentName: titleCase(document.doc_type),
          })
        }
        style={{ marginTop: spacing.lg }}
      />
    </ScrollView>
  );
}

function ChecklistItem({ label, done, warn }: { label: string; done: boolean; warn?: boolean }) {
  const icon = done ? "check-circle" : warn ? "alert-triangle" : "x-circle";
  const color = done ? colors.success : warn ? colors.warning : colors.danger;
  return (
    <View style={styles.checklistRow}>
      <Feather name={icon as any} size={14} color={color} />
      <Text style={styles.checklistLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  docName: { fontSize: 16, fontWeight: "700", color: colors.text },
  version: { fontSize: 12, fontWeight: "400", color: colors.textSecondary },
  filename: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  section: { marginTop: spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  checklistRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: 3 },
  checklistLabel: { fontSize: 13, color: colors.text },
  fieldRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border },
  fieldKey: { fontSize: 12, color: colors.textSecondary },
  fieldValue: { fontSize: 13, fontWeight: "600", color: colors.text },
  disclaimer: { fontSize: 11, color: colors.textMuted, marginTop: spacing.md, fontStyle: "italic" },
});
