import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { theme } from "../constants/theme";
import type { CartItem } from "../domain/guest-order";
import { PrimaryButton } from "./PrimaryButton";

type CartSheetProps = {
  visible: boolean;
  cart: CartItem[];
  guestName: string;
  orderNotes: string;
  cartTotal: number;
  submitting: boolean;
  onClose: () => void;
  onSetGuestName: (value: string) => void;
  onSetOrderNotes: (value: string) => void;
  onSetQuantity: (itemId: number, quantity: number) => void;
  onSubmit: () => void;
};

export function CartSheet({
  visible,
  cart,
  guestName,
  orderNotes,
  cartTotal,
  submitting,
  onClose,
  onSetGuestName,
  onSetOrderNotes,
  onSetQuantity,
  onSubmit,
}: CartSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Current order</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {cart.length === 0 ? (
              <Text style={styles.empty}>Your cart is empty.</Text>
            ) : (
              cart.map((entry) => (
                <View key={entry.item.id} style={styles.cartRow}>
                  <View style={styles.cartCopy}>
                    <Text style={styles.cartName}>{entry.item.name}</Text>
                    <Text style={styles.cartMeta}>EUR {entry.item.price.toFixed(2)} each</Text>
                  </View>
                  <View style={styles.cartControls}>
                    <Pressable
                      style={styles.stepper}
                      onPress={() => onSetQuantity(entry.item.id, entry.quantity - 1)}
                    >
                      <Text style={styles.stepperLabel}>-</Text>
                    </Pressable>
                    <Text style={styles.quantity}>{entry.quantity}</Text>
                    <Pressable
                      style={[styles.stepper, styles.stepperPrimary]}
                      onPress={() => onSetQuantity(entry.item.id, entry.quantity + 1)}
                    >
                      <Text style={[styles.stepperLabel, styles.stepperPrimaryLabel]}>+</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Guest name</Text>
              <TextInput
                value={guestName}
                onChangeText={onSetGuestName}
                placeholder="Guest"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Order notes</Text>
              <TextInput
                value={orderNotes}
                onChangeText={onSetOrderNotes}
                placeholder="Allergies, pacing, special requests"
                placeholderTextColor={theme.colors.textMuted}
                multiline
                style={[styles.input, styles.notes]}
              />
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <View>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.total}>EUR {cartTotal.toFixed(2)}</Text>
            </View>
            <View style={styles.footerActions}>
              <PrimaryButton label="Close" variant="secondary" onPress={onClose} />
              <PrimaryButton
                label="Place order"
                busy={submitting}
                onPress={onSubmit}
                disabled={cart.length === 0}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.panelBorder,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  close: {
    color: theme.colors.textMuted,
    fontWeight: "600",
  },
  content: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  empty: {
    color: theme.colors.textMuted,
  },
  cartRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.panelBorder,
    paddingBottom: theme.spacing.sm,
  },
  cartCopy: {
    flex: 1,
    gap: 4,
  },
  cartName: {
    color: theme.colors.text,
    fontWeight: "700",
  },
  cartMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  cartControls: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  stepper: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.panelBorder,
    backgroundColor: theme.colors.backgroundSoft,
  },
  stepperPrimary: {
    backgroundColor: theme.colors.accent,
  },
  stepperLabel: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: 18,
  },
  stepperPrimaryLabel: {
    color: theme.colors.background,
  },
  quantity: {
    color: theme.colors.text,
    fontWeight: "700",
    minWidth: 18,
    textAlign: "center",
  },
  formGroup: {
    gap: 8,
  },
  formLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.panelBorder,
    backgroundColor: theme.colors.panel,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  notes: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.panelBorder,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.md,
  },
  totalLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  total: {
    color: theme.colors.accentStrong,
    fontSize: 28,
    fontWeight: "800",
  },
  footerActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
});
