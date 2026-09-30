import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useApi } from "../hooks/useApi";
import { getScheme } from "../api/schemes";
import { createApplication } from "../api/applications";
import { apiErrorMessage } from "../api/client";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { LoadingView, OfflineView, ErrorView } from "../components/StateViews";
import { colors, spacing } from "../theme/theme";
import type { Scheme } from "../types";
import type { RootStackParamList } from "../navigation/types";

export function SchemeDetailsScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, "SchemeDetails">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { status, data: scheme, errorMessage, refetch } = useApi<Scheme>(() => getScheme(params.schemeId), [params.schemeId]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  if (status === "loading") return <LoadingView label="Loading scheme details..." />;
  if (status === "offline") return <OfflineView onRetry={refetch} />;
  if (status === "error" || !scheme) return <ErrorView message={errorMessage} onRetry={refetch} />;

  const handleStartApplication = async () => {
    setStartError(null);
    setStarting(true);
    try {
      const application = await createApplication(scheme.id);
      navigation.navigate("ApplicationOverview", { applicationId: application.id });
    } catch (e) {
      setStartError(apiErrorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.name}>{scheme.name}</Text>
      <Text style={styles.provider}>{scheme.provider}</Text>
      <View style={styles.row}>
        <Badge label={scheme.category} tone="info" />
        <Badge label={scheme.education_level} tone="neutral" />
      </View>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Overview</Text>
        <Text style={styles.body}>{scheme.overview}</Text>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Benefits</Text>
        <Text style={styles.body}>{scheme.benefits}</Text>
        <Text style={styles.highlight}>{scheme.benefit_amount}</Text>
        {scheme.benefit_duration && <Text style={styles.muted}>Duration: {scheme.benefit_duration}</Text>}
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Eligibility criteria</Text>
        {scheme.rules.length === 0 && <Text style={styles.muted}>No specific criteria configured for this scheme.</Text>}
        {scheme.rules.map((rule) => (
          <Text key={rule.id} style={styles.body}>
            • {rule.label}
          </Text>
        ))}
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Required documents</Text>
        {scheme.documents.map((doc) => (
          <Text key={doc.id} style={styles.body}>
            • {doc.document_name}
            {!doc.required && " (optional)"}
          </Text>
        ))}
      </Card>

      {scheme.faqs.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>FAQs</Text>
          {scheme.faqs.map((f, i) => (
            <View key={i} style={{ marginBottom: spacing.sm }}>
              <Text style={styles.faqQ}>{f.question}</Text>
              <Text style={styles.body}>{f.answer}</Text>
            </View>
          ))}
        </Card>
      )}

      <Text style={styles.muted}>Application deadline: {new Date(scheme.deadline).toLocaleDateString()}</Text>

      {startError && <Text style={styles.error}>{startError}</Text>}

      <Button
        title="Check Your Eligibility"
        variant="outline"
        onPress={() => navigation.navigate("Eligibility", { schemeId: scheme.id })}
        style={{ marginTop: spacing.md }}
      />
      <Button
        title="Start Application"
        onPress={handleStartApplication}
        loading={starting}
        disabled={!scheme.is_active}
        style={{ marginTop: spacing.sm }}
      />
      {!scheme.is_active && <Text style={styles.muted}>This scheme is not currently accepting new applications.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  name: { fontSize: 20, fontWeight: "700", color: colors.text },
  provider: { fontSize: 13, color: colors.secondary, marginTop: 2 },
  row: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.sm },
  section: { marginTop: spacing.xs },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  highlight: { fontSize: 15, fontWeight: "700", color: colors.primary, marginTop: spacing.xs },
  muted: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  faqQ: { fontSize: 13, fontWeight: "600", color: colors.text },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
});
