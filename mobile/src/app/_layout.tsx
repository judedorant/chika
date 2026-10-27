import { useEffect } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "../../stores/auth";
import { useOutbox } from "../../stores/outbox";
import { api } from "../../services/api";
import { queryClient } from "../../services/query";
import { useRealtime } from "../../services/realtime";
import { useNotificationRouting } from "../../services/notifications";
import {
  Button,
  ErrorBox,
  Loading,
  Screen,
  useTheme,
} from "../../components/ui";

export default function Layout() {
  const { ready, token, bootstrapError, restore, clear } = useAuth();
  const t = useTheme();
  useRealtime();
  useNotificationRouting();
  useEffect(() => {
    void restore();
    const focus = AppState.addEventListener("change", (state) =>
      focusManager.setFocused(state === "active"),
    );
    const interceptor = api.interceptors.response.use(
      (r) => r,
      async (error) => {
        if (
          error.response?.status === 401 &&
          useAuth.getState().token &&
          error.config?.headers?.Authorization ===
            api.defaults.headers.common.Authorization
        ) {
          await queryClient.cancelQueries();
          queryClient.clear();
          useOutbox.getState().clear();
          await clear();
        }
        return Promise.reject(error);
      },
    );
    return () => {
      focus.remove();
      api.interceptors.response.eject(interceptor);
    };
  }, [restore, clear]);
  if (!ready)
    return (
      <SafeAreaProvider>
        <Screen>
          <Loading />
        </Screen>
      </SafeAreaProvider>
    );
  if (bootstrapError)
    return (
      <SafeAreaProvider>
        <Screen>
          <ErrorBox message={bootstrapError} retry={() => void restore()} />
          <Button
            title="Sign in again"
            onPress={() => {
              void clear().then(restore);
            }}
          />
        </Screen>
      </SafeAreaProvider>
    );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: t.surface },
            headerTintColor: t.text,
            contentStyle: { backgroundColor: t.bg },
          }}
        >
          <Stack.Protected guard={!token}>
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen
              name="register"
              options={{ title: "Create account" }}
            />
          </Stack.Protected>
          <Stack.Protected guard={!!token}>
            <Stack.Screen name="index" options={{ title: "RChat" }} />
            <Stack.Screen
              name="chat/[id]"
              options={{ title: "Conversation" }}
            />
            <Stack.Screen
              name="new-conversation"
              options={{ title: "New conversation" }}
            />
            <Stack.Screen name="search" options={{ title: "Find people" }} />
            <Stack.Screen name="profile/[id]" options={{ title: "Profile" }} />
            <Stack.Screen
              name="edit-profile"
              options={{ title: "Edit profile" }}
            />
            <Stack.Screen
              name="group/[id]"
              options={{ title: "Group settings" }}
            />
            <Stack.Screen name="settings" options={{ title: "Settings" }} />
          </Stack.Protected>
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
