import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { previewEligibility } from "../api/schemes";
import { apiErrorMessage } from "../api/client";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { colors, radius, spacing, touchTarget } from "../theme/theme";
import type { EligibilityPreview } from "../types";
import type { RootStackParamList } from "../navigation/types";

export function EligibilityScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, "Eligibility">>();
  const [dob, setDob] = useState("");
  const [income, setIncome] = useState("");
  const [marks, setMarks] = useState("");
  const [category, setCategory] = useState("");
  const [result, setResult] = useState<EligibilityPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    setError(null);
    setLoading(true);
    try {
      const preview = await previewEligibility(params.schemeId, {
        dob: dob || undefined,
        annual_income: income ? Number(income) : undefined,
        marks_percentage: marks ? Number(marks) : undefined,
        category: category || undefined,
      });
      setResult(preview);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Quick Eligibility Preview</Text>
      <Text style={styles.muted}>
        This is a preliminary check using the scheme's real, currently-configured rules. Formal eligibility is
        determined after document verification once you apply.
      </Text>

      <Text style={styles.label}>Date of birth (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={dob} onChangeText={setDob} placeholder="2003-06-15" />

      <Text style={styles.label}>Annual family income (₹)</Text>
      <TextInput style={styles.input} value={income} onChangeText={setIncome} keyboardType="numeric" placeholder="250000" />

      <Text style={styles.label}>Latest marks (%)</Text>
      <TextInput style={styles.input} value={marks} onChangeText={setMarks} keyboardType="numeric" placeholder="75" />

      <Text style={styles.label}>Category</Text>
      <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="General / OBC / SC / ST / Minority" />

      {error && <Text style={styles.error}>{error}</Text>}

      <Button title="Check Eligibility" onPress={handleCheck} loading={loading} style={{ marginTop: spacing.md }} />

      {result && (
        <Card style={{ marginTop: spacing.lg }}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>
              {result.likely_eligible === null ? "No criteria configured" : result.likely_eligible ? "Likely Eligible" : "Not Currently Eligible"}
            </Text>
            {result.likely_eligible !== null && (
              <Badge label={result.likely_eligible ? "Likely Eligible" : "Not Eligible"} tone={result.likely_eligible ? "success" : "danger"} />
            )}
          </View>
          {result.criteria.map((c, i) => (
            <View key={i} style={styles.criterionRow}>
              <Text style={styles.criterionName}>{c.name}</Text>
              <Badge
                label={c.status === "passed" ? "Passed" : c.status === "needs_review" ? "Needs Info" : "Failed"}
                tone={c.status === "passed" ? "success" : c.status === "needs_review" ? "warning" : "danger"}
              />
            </View>
          ))}
          <Text style={styles.note}>{result.note}</Text>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  muted: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md, lineHeight: 17 },
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginTop: spacing.sm },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    fontSize: 15,
    marginTop: spacing.xs,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  resultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  resultTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  criterionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  criterionName: { fontSize: 13, color: colors.text, flex: 1 },
  note: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
});
