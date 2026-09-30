import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useApi } from "../hooks/useApi";
import { listSchemes } from "../api/schemes";
import { Card } from "../components/Card";
import { LoadingView, OfflineView, ErrorView, EmptyView } from "../components/StateViews";
import { colors, radius, spacing, touchTarget } from "../theme/theme";
import type { Scheme } from "../types";
import type { RootStackParamList } from "../navigation/types";

export function ScholarshipsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [search, setSearch] = useState("");
  const { status, data: schemes, errorMessage, refetch } = useApi<Scheme[]>(() => listSchemes(), []);

  useFocusEffect(useCallback(() => refetch(), [refetch]));

  if (status === "loading") return <LoadingView label="Loading scholarships..." />;
  if (status === "offline") return <OfflineView onRetry={refetch} />;
  if (status === "error") return <ErrorView message={errorMessage} onRetry={refetch} />;

  const filtered = (schemes ?? []).filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || s.provider.toLowerCase().includes(q) || s.short_description.toLowerCase().includes(q);
  });

  return (
    <View style={styles.screen}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search scholarships..."
          value={search}
          onChangeText={setSearch}
          accessibilityLabel="Search scholarships"
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyView title="No scholarships found" message="Every scheme currently accepting applications is shown here." />}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => navigation.navigate("SchemeDetails", { schemeId: item.id })} activeOpacity={0.7}>
            <Card style={{ marginBottom: spacing.sm }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.provider}>{item.provider}</Text>
              <Text style={styles.description} numberOfLines={2}>
                {item.short_description}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.meta}>{item.benefit_amount}</Text>
                <Text style={styles.meta}>Deadline: {new Date(item.deadline).toLocaleDateString()}</Text>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchBar: { padding: spacing.md },
  searchInput: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    fontSize: 15,
  },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  provider: { fontSize: 12, color: colors.secondary, marginTop: 2 },
  description: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  meta: { fontSize: 12, color: colors.textMuted },
});
