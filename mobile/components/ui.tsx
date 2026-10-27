import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useColorScheme,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../stores/auth";
import { authHeaders } from "../services/api";
import type { User } from "../types/chat";

export function useTheme() {
  const dark = useColorScheme() === "dark";
  return {
    bg: dark ? "#101721" : "#f5f7fb",
    surface: dark ? "#1c2735" : "#ffffff",
    text: dark ? "#f2f5fb" : "#18243a",
    muted: dark ? "#a7b8cc" : "#53657d",
    accent: "#4d65e8",
    border: dark ? "#344154" : "#dce2ed",
  };
}
export function Screen({
  children,
  scroll = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const t = useTheme();
  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: t.bg }}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, gap: 16, flexGrow: 1 }}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}
export function Label({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  const t = useTheme();
  return (
    <Text
      style={{ color: muted ? t.muted : t.text, fontSize: 16, lineHeight: 23 }}
    >
      {children}
    </Text>
  );
}
export function Title({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 30, fontWeight: "800", color: t.text }}>
      {children}
    </Text>
  );
}
export function Field(props: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.muted}
      accessibilityLabel={props.placeholder}
      {...props}
      style={[
        {
          padding: 15,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: t.surface,
          color: t.text,
          fontSize: 16,
        },
        props.style,
      ]}
    />
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={{
        padding: 14,
        borderRadius: 14,
        backgroundColor: secondary ? t.surface : t.accent,
        opacity: disabled ? 0.5 : 1,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: secondary ? t.text : "white",
          fontWeight: "700",
          fontSize: 16,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function ErrorBox({
  message,
  retry,
}: {
  message?: string | null;
  retry?: () => void;
}) {
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        padding: 14,
        gap: 8,
        borderRadius: 12,
        backgroundColor: "#ffe3e3",
      }}
    >
      <Text style={{ color: "#8c1825" }}>{message}</Text>
      {retry && <Button title="Retry" onPress={retry} />}
    </View>
  );
}
export function Loading() {
  return <ActivityIndicator size="large" style={{ margin: 30 }} />;
}
export function Avatar({ user }: { user: Pick<User, "name" | "avatar"> }) {
  const token = useAuth((s) => s.token);
  return user.avatar ? (
    <Image
      source={{ uri: user.avatar, headers: authHeaders(token) }}
      style={{ width: 46, height: 46, borderRadius: 23 }}
    />
  ) : (
    <View
      style={{
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: "#dce3ff",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#344cad", fontWeight: "800", fontSize: 20 }}>
        {user.name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}
