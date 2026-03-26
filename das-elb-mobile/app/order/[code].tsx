import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { fetchMenuForCode, submitQrOrder } from "../../src/api/restaurant";
import { CartSheet } from "../../src/components/CartSheet";
import { MenuItemCard } from "../../src/components/MenuItemCard";
import { PrimaryButton } from "../../src/components/PrimaryButton";
import { theme } from "../../src/constants/theme";
import { useGuestOrder } from "../../src/context/guest-order-context";
import {
  buildOrderSubmission,
  type MenuCategory,
  type MenuItem,
} from "../../src/domain/guest-order";

export default function OrderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const rawCode = Array.isArray(params.code) ? params.code[0] : params.code ?? "";
  const code = decodeURIComponent(rawCode);

  const {
    hydrated,
    state,
    cartCount,
    cartTotal,
    startGuestSession,
    setTableInfo,
    setGuestName,
    setOrderNotes,
    addItem,
    setItemQuantity,
    markSubmitted,
    resetSubmitted,
  } = useGuestOrder();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [showCart, setShowCart] = useState(false);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    try {
      startGuestSession(code, state.guestName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid table code.");
      setLoading(false);
    }
  }, [code, hydrated, startGuestSession, state.guestName]);

  useEffect(() => {
    if (!hydrated || !code) {
      return;
    }
    let active = true;
    setLoading(true);
    setError("");

    fetchMenuForCode(code)
      .then((payload) => {
        if (!active) {
          return;
        }
        setCategories(payload.categories);
        setTableInfo(payload.table);
        setSelectedCategoryId(payload.categories[0]?.id ?? null);
      })
      .catch((cause) => {
        if (!active) {
          return;
        }
        setError(cause instanceof Error ? cause.message : "Unable to load this table.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [code, hydrated, setTableInfo]);

  const activeItems = useMemo<MenuItem[]>(() => {
    if (!selectedCategoryId) {
      return [];
    }
    return categories.find((category) => category.id === selectedCategoryId)?.items ?? [];
  }, [categories, selectedCategoryId]);

  const handleSubmit = async () => {
    if (state.cart.length === 0) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await submitQrOrder(
        buildOrderSubmission({
          tableCode: code,
          guestName: state.guestName,
          cart: state.cart,
          orderNotes: state.orderNotes,
        }),
      );
      markSubmitted(response);
      setShowCart(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Order submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (state.lastSubmittedOrder) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.confirmation}>
          <Text style={styles.eyebrow}>Order sent</Text>
          <Text style={styles.title}>Kitchen ticket created.</Text>
          <Text style={styles.copy}>{state.lastSubmittedOrder.message}</Text>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLine}>Order #{state.lastSubmittedOrder.order_id}</Text>
            <Text style={styles.summaryLine}>Table {state.lastSubmittedOrder.table_number}</Text>
            <Text style={styles.summaryLine}>Status {state.lastSubmittedOrder.status}</Text>
            <Text style={styles.summaryLine}>Total EUR {state.lastSubmittedOrder.total.toFixed(2)}</Text>
          </View>
          <View style={styles.actions}>
            <PrimaryButton
              label="Order more"
              onPress={() => {
                resetSubmitted();
              }}
            />
            <PrimaryButton label="Back to start" variant="secondary" onPress={() => router.replace("/")} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Guest ordering</Text>
          <Text style={styles.headerTitle}>
            {state.tableInfo
              ? `Table ${state.tableInfo.table_number} · ${state.tableInfo.section_name}`
              : "Resolving table"}
          </Text>
        </View>
        <Pressable onPress={() => router.replace("/")} style={styles.headerAction}>
          <Text style={styles.headerActionLabel}>Change table</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.accentStrong} />
          <Text style={styles.copy}>Loading the live menu for this table...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <PrimaryButton label="Back" variant="secondary" onPress={() => router.replace("/")} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.infoBanner}>
              <Text style={styles.infoText}>
                Guest session: {state.guestName || "Guest"} · Table code {state.tableCode}
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {categories.map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() => setSelectedCategoryId(category.id)}
                  style={[
                    styles.categoryChip,
                    selectedCategoryId === category.id ? styles.categoryChipActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipLabel,
                      selectedCategoryId === category.id ? styles.categoryChipLabelActive : null,
                    ]}
                  >
                    {category.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.menuList}>
              {activeItems.map((item) => {
                const cartEntry = state.cart.find((entry) => entry.item.id === item.id);
                return (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    quantity={cartEntry?.quantity ?? 0}
                    onAdd={() => addItem(item)}
                    onIncrement={() => setItemQuantity(item.id, (cartEntry?.quantity ?? 0) + 1)}
                    onDecrement={() => setItemQuantity(item.id, (cartEntry?.quantity ?? 0) - 1)}
                  />
                );
              })}
            </View>
          </ScrollView>

          {cartCount > 0 ? (
            <View style={styles.cartFooter}>
              <PrimaryButton
                label={`View cart · ${cartCount} item${cartCount === 1 ? "" : "s"} · EUR ${cartTotal.toFixed(2)}`}
                onPress={() => setShowCart(true)}
              />
            </View>
          ) : null}

          <CartSheet
            visible={showCart}
            cart={state.cart}
            guestName={state.guestName}
            orderNotes={state.orderNotes}
            cartTotal={cartTotal}
            submitting={submitting}
            onClose={() => setShowCart(false)}
            onSetGuestName={setGuestName}
            onSetOrderNotes={setOrderNotes}
            onSetQuantity={setItemQuantity}
            onSubmit={() => void handleSubmit()}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: {
    color: theme.colors.accentStrong,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontSize: 12,
    fontWeight: "700",
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginTop: 4,
  },
  headerAction: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.panelBorder,
  },
  headerActionLabel: {
    color: theme.colors.textMuted,
    fontWeight: "600",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 120,
    gap: theme.spacing.md,
  },
  infoBanner: {
    backgroundColor: theme.colors.panel,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.panelBorder,
    padding: theme.spacing.md,
  },
  infoText: {
    color: theme.colors.textMuted,
  },
  categoryRow: {
    gap: theme.spacing.sm,
  },
  categoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.panelBorder,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.backgroundSoft,
  },
  categoryChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  categoryChipLabel: {
    color: theme.colors.text,
    fontWeight: "600",
  },
  categoryChipLabelActive: {
    color: theme.colors.background,
  },
  menuList: {
    gap: theme.spacing.md,
  },
  cartFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    backgroundColor: "rgba(7,18,26,0.94)",
  },
  error: {
    color: theme.colors.danger,
    fontSize: 16,
    textAlign: "center",
  },
  copy: {
    color: theme.colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  confirmation: {
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: "800",
  },
  summaryCard: {
    backgroundColor: theme.colors.panel,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.panelBorder,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  summaryLine: {
    color: theme.colors.text,
    fontWeight: "600",
  },
  actions: {
    gap: theme.spacing.sm,
  },
});
