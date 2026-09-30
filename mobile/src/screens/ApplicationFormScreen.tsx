import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useApi } from "../hooks/useApi";
import { getApplication, updateApplication } from "../api/applications";
import { apiErrorMessage } from "../api/client";
import { Button } from "../components/Button";
import { LoadingView, OfflineView, ErrorView } from "../components/StateViews";
import { colors, radius, spacing, touchTarget } from "../theme/theme";
import type { ApplicationDetail } from "../types";
import type { RootStackParamList } from "../navigation/types";

const EDITABLE_STATUSES = new Set(["DRAFT", "CORRECTION_REQUIRED"]);

// Field set mirrors the web app's ApplicationWizardPage steps 1-4 exactly —
// this is the real backend contract (personal_info/academic_info/
// financial_info/category_info free-form JSON), not an invented mobile-only
// shape. The scheme's *eligibility criteria* and *document checklist* are
// genuinely dynamic (rendered from scheme.rules / scheme.documents
// elsewhere); these underlying applicant-data buckets are fixed on both
// clients because that's what the backend actually stores.
export function ApplicationFormScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, "ApplicationForm">>();
  const navigation = useNavigation();
  const { status, data: application, errorMessage, refetch } = useApi<ApplicationDetail>(
    () => getApplication(params.applicationId),
    [params.applicationId],
  );

  const [personal, setPersonal] = useState<Record<string, any>>({});
  const [academic, setAcademic] = useState<Record<string, any>>({});
  const [financial, setFinancial] = useState<Record<string, any>>({});
  const [categoryInfo, setCategoryInfo] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (application) {
      setPersonal(application.personal_info ?? {});
      setAcademic(application.academic_info ?? {});
      setFinancial(application.financial_info ?? {});
      setCategoryInfo(application.category_info ?? {});
    }
  }, [application?.id]);

  if (status === "loading") return <LoadingView label="Loading form..." />;
  if (status === "offline") return <OfflineView onRetry={refetch} />;
  if (status === "error" || !application) return <ErrorView message={errorMessage} onRetry={refetch} />;

  const editable = EDITABLE_STATUSES.has(application.status);

  const handleSave = async () => {
    setSaveError(null);
    setSaved(false);
    setSaving(true);
    try {
      await updateApplication(application.id, {
        personal_info: personal,
        academic_info: academic,
        financial_info: financial,
        category_info: categoryInfo,
      });
      setSaved(true);
    } catch (e) {
      setSaveError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        <Section title="Personal information">
          <Field label="Full name" value={personal.full_name} onChangeText={(v) => setPersonal({ ...personal, full_name: v })} editable={editable} />
          <Field label="Date of birth (YYYY-MM-DD)" value={personal.dob} onChangeText={(v) => setPersonal({ ...personal, dob: v })} editable={editable} />
          <Field label="Gender" value={personal.gender} onChangeText={(v) => setPersonal({ ...personal, gender: v })} editable={editable} />
          <Field label="Phone" value={personal.phone} onChangeText={(v) => setPersonal({ ...personal, phone: v })} editable={editable} keyboardType="phone-pad" />
          <Field label="Address" value={personal.address} onChangeText={(v) => setPersonal({ ...personal, address: v })} editable={editable} />
          <Field label="State" value={personal.state} onChangeText={(v) => setPersonal({ ...personal, state: v })} editable={editable} />
        </Section>

        <Section title="Academic information">
          <Field label="Institution" value={academic.institution} onChangeText={(v) => setAcademic({ ...academic, institution: v })} editable={editable} />
          <Field label="Course" value={academic.course} onChangeText={(v) => setAcademic({ ...academic, course: v })} editable={editable} />
          <Field
            label="Education level"
            value={academic.education_level}
            onChangeText={(v) => setAcademic({ ...academic, education_level: v })}
            editable={editable}
          />
          <Field
            label="Latest marks (%)"
            value={academic.marks_percentage != null ? String(academic.marks_percentage) : ""}
            onChangeText={(v) => setAcademic({ ...academic, marks_percentage: v ? Number(v) : null })}
            editable={editable}
            keyboardType="numeric"
          />
        </Section>

        <Section title="Financial information">
          <Field
            label="Annual family income (₹)"
            value={financial.annual_income != null ? String(financial.annual_income) : ""}
            onChangeText={(v) => setFinancial({ ...financial, annual_income: v ? Number(v) : null })}
            editable={editable}
            keyboardType="numeric"
          />
          <Field
            label="Income certificate issue date (YYYY-MM-DD)"
            value={financial.certificate_issue_date}
            onChangeText={(v) => setFinancial({ ...financial, certificate_issue_date: v })}
            editable={editable}
          />
        </Section>

        <Section title="Category">
          <Field label="Category" value={categoryInfo.category} onChangeText={(v) => setCategoryInfo({ ...categoryInfo, category: v })} editable={editable} />
        </Section>

        {!editable && (
          <Text style={styles.notice}>
            This application is no longer editable in its current status ({application.status.replace(/_/g, " ").toLowerCase()}).
          </Text>
        )}

        {saveError && <Text style={styles.errorText}>{saveError}</Text>}
        {saved && <Text style={styles.savedText}>Saved.</Text>}

        {editable && <Button title="Save" onPress={handleSave} loading={saving} style={{ marginTop: spacing.md }} />}
        <Button title="Back to Overview" variant="ghost" onPress={() => navigation.goBack()} style={{ marginTop: spacing.sm }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  editable,
  keyboardType,
}: {
  label: string;
  value: any;
  onChangeText: (v: string) => void;
  editable: boolean;
  keyboardType?: "default" | "numeric" | "phone-pad";
}) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, !editable && styles.inputDisabled]}
        value={value != null ? String(value) : ""}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType={keyboardType ?? "default"}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  label: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginBottom: 4 },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    fontSize: 15,
    color: colors.text,
  },
  inputDisabled: { backgroundColor: "#F1F5F9", color: colors.textMuted },
  notice: { fontSize: 12, color: colors.warning, marginBottom: spacing.sm },
  errorText: { color: colors.danger, fontSize: 13, marginBottom: spacing.sm },
  savedText: { color: colors.success, fontSize: 13, marginBottom: spacing.sm },
});
