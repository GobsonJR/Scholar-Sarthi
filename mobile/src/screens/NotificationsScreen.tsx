import { useCallback } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useApi } from "../hooks/useApi";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { LoadingView, OfflineView, ErrorView, EmptyView } from "../components/StateViews";
import { colors, spacing } from "../theme/theme";
import type { Notification } from "../types";

export function NotificationsScreen() {
  const { status, data: notifications, errorMessage, refetch, setData } = useApi<Notification[]>(
    () => listNotifications(),
    [],
  );

  useFocusEffect(useCallback(() => refetch(), [refetch]));

  if (status === "loading") return <LoadingView label="Loading notifications..." />;
  if (status === "offline") return <OfflineView onRetry={refetch} />;
  if (status === "error") return <ErrorView message={errorMessage} onRetry={refetch} />;

  const items = notifications ?? [];
  const unreadCount = items.filter((n) => !n.is_read).length;

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    setData(items.map((n) => ({ ...n, is_read: true })));
  };

  const handleTap = async (n: Notification) => {
    if (!n.is_read) {
      const updated = await markNotificationRead(n.id);
      setData(items.map((i) => (i.id === n.id ? updated : i)));
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <Text style={styles.headerText}>{unreadCount} unread</Text>
        {unreadCount > 0 && <Button title="Mark all read" variant="ghost" onPress={handleMarkAll} />}
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyView title="No notifications" message="Updates about your applications will appear here." />}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => handleTap(item)} activeOpacity={0.7}>
            <Card style={[styles.card, !item.is_read && styles.unreadCard]}>
              <View style={styles.row}>
                {!item.is_read && <View style={styles.dot} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.message}>{item.message}</Text>
                  <Text style={styles.date}>{new Date(item.created_at).toLocaleString()}</Text>
                </View>
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
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md },
  headerText: { fontSize: 13, color: colors.textSecondary },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  card: { marginBottom: spacing.sm },
  unreadCard: { backgroundColor: colors.infoLight, borderColor: "#BFDBFE" },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.info, marginTop: 6 },
  title: { fontSize: 14, fontWeight: "700", color: colors.text },
  message: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  date: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
});
