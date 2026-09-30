import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { SplashScreen } from "../screens/SplashScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { OfficerNoticeScreen } from "../screens/OfficerNoticeScreen";
import { AppTabs } from "./AppTabs";
import { SchemeDetailsScreen } from "../screens/SchemeDetailsScreen";
import { EligibilityScreen } from "../screens/EligibilityScreen";
import { ApplicationOverviewScreen } from "../screens/ApplicationOverviewScreen";
import { ApplicationFormScreen } from "../screens/ApplicationFormScreen";
import { DocumentChecklistScreen } from "../screens/DocumentChecklistScreen";
import { DocumentUploadScreen } from "../screens/DocumentUploadScreen";
import { DocumentVerificationScreen } from "../screens/DocumentVerificationScreen";
import { DocumentReplaceScreen } from "../screens/DocumentReplaceScreen";
import { ApplicationStatusScreen } from "../screens/ApplicationStatusScreen";
import { colors } from "../theme/theme";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: "700" as const },
};

export function RootNavigator() {
  const { user, isBootstrapping } = useAuth();

  if (isBootstrapping) return <SplashScreen />;

  if (!user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  if (user.role === "officer") {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="OfficerNotice" component={OfficerNoticeScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Tabs" component={AppTabs} options={{ headerShown: false }} />
      <Stack.Screen name="SchemeDetails" component={SchemeDetailsScreen} options={{ title: "Scheme Details" }} />
      <Stack.Screen name="Eligibility" component={EligibilityScreen} options={{ title: "Eligibility" }} />
      <Stack.Screen name="ApplicationOverview" component={ApplicationOverviewScreen} options={{ title: "Application" }} />
      <Stack.Screen name="ApplicationForm" component={ApplicationFormScreen} options={{ title: "Application Details" }} />
      <Stack.Screen name="DocumentChecklist" component={DocumentChecklistScreen} options={{ title: "Documents" }} />
      <Stack.Screen name="DocumentUpload" component={DocumentUploadScreen} options={{ title: "Upload Document" }} />
      <Stack.Screen name="DocumentVerification" component={DocumentVerificationScreen} options={{ title: "Verification Status" }} />
      <Stack.Screen name="DocumentReplace" component={DocumentReplaceScreen} options={{ title: "Replace Document" }} />
      <Stack.Screen name="ApplicationStatus" component={ApplicationStatusScreen} options={{ title: "Application Status" }} />
    </Stack.Navigator>
  );
}
