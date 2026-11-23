import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type Icon = ComponentProps<typeof Ionicons>["name"];
export const colors = {
  background: "#F5F5FF",
  panel: "#FAFAFF",
  white: "#FFFFFF",
  ink: "#171B36",
  muted: "#616782",
  blue: "#6554EA",
  line: "#DFDCF5",
  lavender: "#7364F5",
  success: "#168455",
  danger: "#CA375E",
  dark: "#20242C",
};

export function Glyph({
  name,
  size = 24,
  color = colors.blue,
}: {
  name: Icon;
  size?: number;
  color?: string;
}) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Button({
  label,
  icon,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  icon?: Icon;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        pressed && styles.pressed,
        disabled && { opacity: 0.5 },
      ]}
    >
      {icon && (
        <Glyph
          name={icon}
          size={20}
          color={primary ? colors.white : colors.blue}
        />
      )}
      <Text style={[styles.buttonText, primary && styles.primaryText]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  label,
  icon,
  onPress,
  primary = false,
}: {
  label: string;
  icon: Icon;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        primary && styles.primary,
        pressed && styles.pressed,
      ]}
    >
      <Glyph name={icon} color={primary ? colors.white : colors.ink} />
    </Pressable>
  );
}

export function Empty({
  icon,
  title,
  detail,
}: {
  icon: Icon;
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.symbol}>
        <Glyph name={icon} size={32} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{detail}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, flexGrow: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  heading: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  title: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  card: {
    backgroundColor: colors.panel,
    padding: 16,
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.white,
    elevation: 2,
    shadowColor: "#51438B",
  },
  button: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: "#EEEBFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.blue },
  pressed: { opacity: 0.7 },
  buttonText: {
    color: colors.ink,
    textAlign: "center",
    fontWeight: "700",
    flexShrink: 1,
  },
  primaryText: { color: colors.white },
  empty: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 8,
    gap: 8,
  },
  symbol: {
    backgroundColor: "#E8E3FF",
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 12,
    color: colors.ink,
    backgroundColor: colors.white,
  },
});
