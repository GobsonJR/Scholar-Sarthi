import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { apiErrorMessage } from "../api/client";
import { Button } from "../components/Button";
import { colors, radius, spacing, touchTarget } from "../theme/theme";

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      // Navigation reacts to AuthContext.user changing — no explicit navigate call needed.
    } catch (e) {
      setError(apiErrorMessage(e, "Invalid email or password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Scholar Sarthi</Text>
        <Text style={styles.tagline}>AI assists. Rules determine eligibility. Humans decide.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="applicant@demo.com"
            accessibilityLabel="Email"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            accessibilityLabel="Password"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Button title="Log In" onPress={handleLogin} loading={loading} disabled={!email || !password} style={{ marginTop: spacing.md }} />

          <View style={styles.demoBox}>
            <Text style={styles.demoTitle}>Demo applicant account</Text>
            <Text style={styles.demoText}>applicant@demo.com / Demo@123</Text>
            <Button
              title="Fill Demo Applicant"
              variant="outline"
              onPress={() => {
                setEmail("applicant@demo.com");
                setPassword("Demo@123");
              }}
              style={{ marginTop: spacing.sm }}
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: "center", padding: spacing.xl },
  brand: { fontSize: 30, fontWeight: "700", color: colors.primary, textAlign: "center" },
  tagline: { fontSize: 13, color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs, marginBottom: spacing.xl },
  form: { gap: spacing.xs },
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginTop: spacing.sm },
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
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  demoBox: {
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.infoLight,
  },
  demoTitle: { fontSize: 13, fontWeight: "600", color: colors.text },
  demoText: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
});
