import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useState } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

import { theme } from "../src/constants/theme";
import { extractGuestCode } from "../src/domain/guest-order";
import { useGuestOrder } from "../src/context/guest-order-context";
import { PrimaryButton } from "../src/components/PrimaryButton";

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanError, setScanError] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const { state, startGuestSession } = useGuestOrder();

  if (!permission) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.title}>Loading camera permissions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.panel}>
          <Text style={styles.title}>Camera access required</Text>
          <Text style={styles.copy}>
            Das ELB Mobile needs camera access to scan table QR codes for guest ordering.
          </Text>
          <PrimaryButton label="Grant permission" onPress={() => void requestPermission()} />
          <PrimaryButton label="Back" variant="secondary" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={
            isLocked
              ? undefined
              : ({ data }) => {
                  const code = extractGuestCode(data);
                  if (!code) {
                    setScanError("The scanned QR code did not contain a valid table code.");
                    setIsLocked(true);
                    return;
                  }
                  try {
                    const resolvedCode = startGuestSession(code, state.guestName);
                    setIsLocked(true);
                    router.replace(`/order/${encodeURIComponent(resolvedCode)}`);
                  } catch (cause) {
                    setScanError(
                      cause instanceof Error ? cause.message : "The scanned QR code could not be used.",
                    );
                    setIsLocked(true);
                  }
                }
          }
        />
        <View style={styles.overlay}>
          <Text style={styles.title}>Scan table QR</Text>
          <Text style={styles.copy}>
            Point the camera at a restaurant table QR code to enter the guest ordering flow.
          </Text>
          <View style={styles.scannerFrame} />
          {scanError ? <Text style={styles.error}>{scanError}</Text> : null}
          <View style={styles.actions}>
            {isLocked ? (
              <PrimaryButton
                label="Scan again"
                onPress={() => {
                  setScanError("");
                  setIsLocked(false);
                }}
              />
            ) : null}
            <PrimaryButton label="Enter code manually" variant="secondary" onPress={() => router.replace("/")} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  cameraWrap: {
    flex: 1,
    backgroundColor: "#000",
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  panel: {
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  copy: {
    color: theme.colors.textMuted,
    lineHeight: 22,
  },
  scannerFrame: {
    alignSelf: "center",
    width: 240,
    height: 240,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: theme.colors.accentStrong,
    backgroundColor: "transparent",
    marginVertical: theme.spacing.md,
  },
  error: {
    color: theme.colors.danger,
  },
  actions: {
    gap: theme.spacing.sm,
  },
});
