import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { router } from "expo-router";
import { api } from "./api";
import { useAuth } from "../stores/auth";

export async function enablePush() {
  if (!Device.isDevice)
    throw new Error("Push notifications require a physical device.");
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      importance: Notifications.AndroidImportance.HIGH,
    });
  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted")
    throw new Error("Notification permission was not granted.");
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId)
    throw new Error(
      "Configure your EAS project ID before enabling push notifications.",
    );
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.post("/me/devices", { push_token: data, platform: Platform.OS });
}
export function useNotificationRouting() {
  const token = useAuth((s) => s.token);
  useEffect(() => {
    if (!token) return;
    const route = (response: Notifications.NotificationResponse | null) => {
      const id = Number(
        response?.notification.request.content.data?.conversation_id,
      );
      if (Number.isSafeInteger(id) && id > 0) router.push(`/chat/${id}`);
    };
    void Notifications.getLastNotificationResponseAsync()
      .then(route)
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(route);
    return () => sub.remove();
  }, [token]);
}
