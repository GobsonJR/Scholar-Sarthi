import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme/theme";
import type { Tone } from "../types";

const toneStyles: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: "#F1F5F9", fg: colors.textSecondary },
  info: { bg: colors.infoLight, fg: colors.info },
  warning: { bg: colors.warningLight, fg: colors.warning },
  success: { bg: colors.successLight, fg: colors.success },
  danger: { bg: colors.dangerLight, fg: colors.danger },
};

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const t = toneStyles[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.label, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  label: { fontSize: 12, fontWeight: "600" },
});
