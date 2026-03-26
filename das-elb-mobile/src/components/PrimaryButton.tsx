import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from "react-native";

import { theme } from "../constants/theme";

type PrimaryButtonProps = PressableProps & {
  label: string;
  busy?: boolean;
  variant?: "primary" | "secondary";
};

export function PrimaryButton({
  label,
  busy = false,
  variant = "primary",
  disabled,
  style,
  ...rest
}: PrimaryButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      disabled={busy || disabled}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.primary : styles.secondary,
        (busy || disabled) && styles.disabled,
        pressed && !(busy || disabled) ? styles.pressed : null,
        style,
      ]}
      {...rest}
    >
      {busy ? (
        <ActivityIndicator color={isPrimary ? theme.colors.background : theme.colors.text} />
      ) : (
        <Text style={[styles.label, isPrimary ? styles.primaryLabel : styles.secondaryLabel]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  primary: {
    backgroundColor: theme.colors.accent,
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.colors.panelBorder,
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
  },
  primaryLabel: {
    color: theme.colors.background,
  },
  secondaryLabel: {
    color: theme.colors.text,
  },
});
