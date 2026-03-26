import { useRouter } from "expo-router";
import { useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { theme } from "../src/constants/theme";
import { useGuestOrder } from "../src/context/guest-order-context";
import { PrimaryButton } from "../src/components/PrimaryButton";

export default function HomeScreen() {
  const router = useRouter();
  const { state, startGuestSession, setGuestName, hydrated } = useGuestOrder();
  const [rawCode, setRawCode] = useState(state.tableCode);
  const [error, setError] = useState("");

  const handleContinue = () => {
    try {
      const resolvedCode = startGuestSession(rawCode, state.guestName);
      setError("");
      router.push(`/order/${encodeURIComponent(resolvedCode)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enter a valid QR or table code.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Phase 1 native scaffold</Text>
          <Text style={styles.title}>Restaurant ordering without changing the backend contract.</Text>
          <Text style={styles.copy}>
            Scan a table QR code or paste a code manually to enter the guest menu flow powered by
            the shared FastAPI backend.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Guest session</Text>
          <Text style={styles.cardCopy}>
            Phase 1 uses a guest session instead of a login. Your name and the active table are
            stored locally on the device.
          </Text>
          <TextInput
            value={state.guestName}
            onChangeText={setGuestName}
            placeholder="Guest name"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            autoCapitalize="words"
          />
          <TextInput
            value={rawCode}
            onChangeText={setRawCode}
            placeholder="Paste QR link or table code"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <PrimaryButton label="Continue to menu" onPress={handleContinue} disabled={!hydrated} />
            <PrimaryButton label="Scan QR code" variant="secondary" onPress={() => router.push("/scan")} />
          </View>
          {state.tableCode ? (
            <Text style={styles.resume}>
              Last table session: {state.tableCode}. You can resume it or scan a new table code.
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Contract in use</Text>
          <Text style={styles.cardCopy}>This mobile scaffold uses the existing QR endpoints only:</Text>
          <Text style={styles.endpoint}>GET /api/qr/menu/{`{code}`}</Text>
          <Text style={styles.endpoint}>POST /api/qr/order</Text>
          <Text style={styles.endpoint}>GET /api/qr/order/{`{order_id}`}/status</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  hero: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  eyebrow: {
    color: theme.colors.accentStrong,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontWeight: "700",
  },
  title: {
    color: theme.colors.text,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
  },
  copy: {
    color: theme.colors.textMuted,
    lineHeight: 22,
  },
  card: {
    backgroundColor: theme.colors.panel,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.panelBorder,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  cardCopy: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.panelBorder,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.backgroundSoft,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  actions: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  error: {
    color: theme.colors.danger,
  },
  resume: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  endpoint: {
    color: theme.colors.accentStrong,
    fontFamily: "Courier",
    fontSize: 13,
  },
});
