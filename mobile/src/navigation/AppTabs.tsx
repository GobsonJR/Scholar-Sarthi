import { useEffect, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { HomeScreen } from "../screens/HomeScreen";
import { ScholarshipsScreen } from "../screens/ScholarshipsScreen";
import { ApplicationsScreen } from "../screens/ApplicationsScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { listNotifications } from "../api/notifications";
import { colors } from "../theme/theme";
import type { TabParamList } from "./types";

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<keyof TabParamList, keyof typeof Feather.glyphMap> = {
  Home: "home",
  Scholarships: "award",
  Applications: "file-text",
  Notifications: "bell",
  Profile: "user",
};

export function AppTabs() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const poll = () => {
      listNotifications()
        .then((list) => {
          if (mounted) setUnreadCount(list.filter((n) => !n.is_read).length);
        })
        .catch(() => {
          // Silently skip — the Notifications tab itself surfaces
          // connectivity errors when opened directly.
        });
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ color, size }) => <Feather name={ICONS[route.name as keyof TabParamList]} color={color} size={size} />,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Dashboard" }} />
      <Tab.Screen name="Scholarships" component={ScholarshipsScreen} options={{ title: "Scholarships" }} />
      <Tab.Screen name="Applications" component={ApplicationsScreen} options={{ title: "My Applications" }} />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
