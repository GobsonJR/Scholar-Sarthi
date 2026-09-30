import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { uploadDocument, type PickedFile } from "../api/documents";
import { apiErrorMessage } from "../api/client";
import { Button } from "../components/Button";
import { colors, radius, spacing } from "../theme/theme";
import type { RootStackParamList } from "../navigation/types";

const LANGUAGE_OPTIONS: { code: string | undefined; label: string }[] = [
  { code: undefined, label: "English / Auto" },
  { code: "tam_Taml", label: "Tamil" },
  { code: "hin_Deva", label: "Hindi" },
];

export function DocumentUploadScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, "DocumentUpload">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFromCamera = async () => {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is required to take a photo of your document.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPicked({ uri: asset.uri, name: asset.fileName ?? `document_${Date.now()}.jpg`, mimeType: asset.mimeType ?? "image/jpeg" });
    }
  };

  const pickFromLibrary = async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library permission is required to select an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, mediaTypes: ["images"] });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPicked({ uri: asset.uri, name: asset.fileName ?? `document_${Date.now()}.jpg`, mimeType: asset.mimeType ?? "image/jpeg" });
    }
  };

  const pickFile = async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"] });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPicked({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? "application/octet-stream" });
    }
  };

  const handleUpload = async () => {
    if (!picked) return;
    setError(null);
    setUploading(true);
    try {
      const document = await uploadDocument(params.applicationId, params.docType, picked, language);
      navigation.replace("DocumentVerification", { documentId: document.id });
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>{params.documentName}</Text>
      <Text style={styles.muted}>
        Accepted formats: PDF, JPG, PNG. Your document is sent to the backend and processed through the real
        OCR/verification pipeline — nothing is simulated on this screen.
      </Text>

      <View style={styles.pickerRow}>
        <Button title="Camera" variant="outline" onPress={pickFromCamera} style={styles.pickerButton} />
        <Button title="Photo Library" variant="outline" onPress={pickFromLibrary} style={styles.pickerButton} />
        <Button title="Files" variant="outline" onPress={pickFile} style={styles.pickerButton} />
      </View>

      {picked && (
        <View style={styles.selectedBox}>
          <Text style={styles.selectedLabel}>Selected file</Text>
          <Text style={styles.selectedName}>{picked.name}</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>Document language (optional)</Text>
      <Text style={styles.muted}>
        If this document is in Tamil or Hindi, selecting it here lets the backend pick the matching OCR engine
        up front — this materially improves extraction accuracy for non-English documents.
      </Text>
      <View style={styles.languageButtonsRow}>
        {LANGUAGE_OPTIONS.map((opt) => (
          <Button
            key={opt.label}
            title={opt.label}
            variant={language === opt.code ? "primary" : "ghost"}
            onPress={() => setLanguage(opt.code)}
            style={styles.languageButton}
          />
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Button title="Upload & Verify" onPress={handleUpload} loading={uploading} disabled={!picked} style={{ marginTop: spacing.lg }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 17, fontWeight: "700", color: colors.text },
  muted: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md, lineHeight: 17 },
  pickerRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  pickerButton: { flex: 1, minWidth: 100 },
  selectedBox: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.infoLight },
  selectedLabel: { fontSize: 11, color: colors.textSecondary },
  selectedName: { fontSize: 13, fontWeight: "600", color: colors.text, marginTop: 2 },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: colors.text, marginTop: spacing.lg },
  languageButtonsRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  languageButton: { flex: 1 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.md },
});
