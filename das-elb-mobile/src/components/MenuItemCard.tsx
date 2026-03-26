import { Pressable, StyleSheet, Text, View } from "react-native";

import { theme } from "../constants/theme";
import type { MenuItem } from "../domain/guest-order";

type MenuItemCardProps = {
  item: MenuItem;
  quantity: number;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
};

export function MenuItemCard({
  item,
  quantity,
  onAdd,
  onIncrement,
  onDecrement,
}: MenuItemCardProps) {
  return (
    <View style={[styles.card, quantity > 0 ? styles.cardActive : null]}>
      <View style={styles.row}>
        <View style={styles.content}>
          <Text style={styles.name}>{item.name}</Text>
          {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
          <View style={styles.metaRow}>
            <Text style={styles.price}>EUR {item.price.toFixed(2)}</Text>
            <Text style={styles.meta}>Prep {item.prep_time_min} min</Text>
          </View>
          {item.dietary_tags.length > 0 ? (
            <View style={styles.badgeRow}>
              {item.dietary_tags.map((tag) => (
                <View key={tag} style={styles.badge}>
                  <Text style={styles.badgeText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {quantity > 0 ? (
          <View style={styles.counter}>
            <Pressable onPress={onDecrement} style={styles.counterButton}>
              <Text style={styles.counterButtonLabel}>-</Text>
            </Pressable>
            <Text style={styles.counterValue}>{quantity}</Text>
            <Pressable onPress={onIncrement} style={[styles.counterButton, styles.counterPrimary]}>
              <Text style={[styles.counterButtonLabel, styles.counterPrimaryLabel]}>+</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={onAdd} style={styles.addButton}>
            <Text style={styles.addButtonLabel}>Add</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.panel,
    borderWidth: 1,
    borderColor: theme.colors.panelBorder,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
  cardActive: {
    borderColor: theme.colors.accent,
  },
  row: {
    flexDirection: "row",
    gap: 16,
  },
  content: {
    flex: 1,
    gap: 6,
  },
  name: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  description: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  price: {
    color: theme.colors.accentStrong,
    fontWeight: "700",
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  badgeText: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  addButton: {
    alignSelf: "center",
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  addButtonLabel: {
    color: theme.colors.background,
    fontWeight: "700",
  },
  counter: {
    alignSelf: "center",
    alignItems: "center",
    gap: 8,
  },
  counterButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.panelBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.backgroundSoft,
  },
  counterPrimary: {
    backgroundColor: theme.colors.accent,
  },
  counterButtonLabel: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  counterPrimaryLabel: {
    color: theme.colors.background,
  },
  counterValue: {
    color: theme.colors.text,
    fontWeight: "700",
  },
});
