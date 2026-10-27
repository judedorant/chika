import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { router, usePathname } from "expo-router";
import { api } from "./api";
import { useAuth } from "../stores/auth";
import {
  notificationTarget,
  rememberTap,
  shouldShowNotification,
} from "./notificationPolicy";

let visibleConversation: number | null = null;
const seenTaps = new Set<string>();
const inFlightTaps = new Set<string>();
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const show = shouldShowNotification(
      notification.request.content.data,
      useAuth.getState().user?.id,
      AppState.currentState === "active",
      visibleConversation,
    );
    return {
      shouldShowBanner: show,
      shouldShowList: show,
      shouldPlaySound: show,
      shouldSetBadge: false,
    };
  },
});

async function registerPush(requestPermission: boolean) {
  const session = useAuth.getState().token;
  if (!session) throw new Error("Sign in before enabling notifications.");
  if (!Device.isDevice)
    throw new Error("Push notifications require a physical device.");
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      importance: Notifications.AndroidImportance.HIGH,
    });
  let permission = await Notifications.getPermissionsAsync();
  if (requestPermission && permission.status !== "granted")
    permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") {
    if (requestPermission)
      throw new Error("Notification permission was not granted.");
    else return;
  }
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId)
    throw new Error(
      "Configure your EAS project ID before enabling push notifications.",
    );
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  if (useAuth.getState().token !== session) return;
  await api.post(
    "/me/devices",
    { push_token: data, platform: Platform.OS },
    { headers: { Authorization: `Bearer ${session}` } },
  );
}
export async function enablePush() {
  await registerPush(true);
}
export function useNotificationRouting() {
  const token = useAuth((s) => s.token);
  const userId = useAuth((s) => s.user?.id);
  const pathname = usePathname();
  useEffect(() => {
    const match = /^\/chat\/(\d+)$/.exec(pathname);
    visibleConversation = match ? Number(match[1]) : null;
    return () => {
      visibleConversation = null;
    };
  }, [pathname]);
  useEffect(() => {
    if (!token || !userId) return;
    let cancelled = false;
    const route = async (
      response: Notifications.NotificationResponse | null,
    ) => {
      if (!response || cancelled || useAuth.getState().token !== token) return;
      const identifier = response.notification.request.identifier;
      if (inFlightTaps.has(identifier) || seenTaps.has(identifier)) return;
      const id = notificationTarget(
        response.notification.request.content.data,
        userId,
      );
      if (!id) {
        await Notifications.clearLastNotificationResponseAsync();
        return;
      }
      inFlightTaps.add(identifier);
      try {
        // A push payload cannot grant access after account switch or membership removal.
        await api.get(`/conversations/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled || useAuth.getState().token !== token) return;
        if (rememberTap(seenTaps, identifier) && visibleConversation !== id)
          router.push(`/chat/${id}`);
        const last = await Notifications.getLastNotificationResponseAsync();
        if (last?.notification.request.identifier === identifier)
          await Notifications.clearLastNotificationResponseAsync();
      } finally {
        inFlightTaps.delete(identifier);
      }
    };
    const resume = () => {
      void Notifications.getLastNotificationResponseAsync()
        .then(route)
        .catch(() => {});
      if (Device.isDevice) void registerPush(false).catch(() => {});
    };
    resume();
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void route(response).catch(() => {});
      },
    );
    const rotation = Notifications.addPushTokenListener(() => {
      void registerPush(false).catch(() => {});
    });
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") resume();
    });
    return () => {
      cancelled = true;
      sub.remove();
      rotation.remove();
      app.remove();
    };
  }, [token, userId]);
}
