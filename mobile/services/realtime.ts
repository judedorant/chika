import { useEffect } from "react";
import { AppState } from "react-native";
import Echo from "laravel-echo";
import Pusher from "pusher-js/react-native";
import { api } from "./api";
import { queryClient } from "./query";
import { useAuth } from "../stores/auth";
import { useOutbox } from "../stores/outbox";
import { environment } from "./environment";

export type ChatEvent = {
  conversation_id: number;
  kind: string;
  data: { user_id?: number; name?: string };
};
const listeners = new Set<(event: ChatEvent) => void>();
// pusher-js 8.6 ships a named CommonJS export while its declarations retain default.
const PusherClient =
  (Pusher as unknown as { Pusher?: typeof Pusher }).Pusher ?? Pusher;
export function onChatEvent(listener: (event: ChatEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useRealtime() {
  const token = useAuth((s) => s.token);
  const id = useAuth((s) => s.user?.id);
  useEffect(() => {
    if (!token || !id) return;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
      void queryClient.invalidateQueries({ queryKey: ["conversation"] });
    };
    const heartbeat = () => {
      if (AppState.currentState === "active")
        void api.post("/me/heartbeat").catch(() => {});
    };
    heartbeat();
    const timer = setInterval(heartbeat, 30000);
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        heartbeat();
        refresh();
      }
    });
    const key = environment.reverbKey;
    let echo: Echo<"reverb"> | undefined;
    if (key) {
      const tls = environment.reverbScheme === "https";
      const port = environment.reverbPort;
      const client = new PusherClient(key, {
        wsHost: environment.reverbHost,
        wsPort: port,
        wssPort: port,
        forceTLS: tls,
        enabledTransports: ["ws", "wss"],
        cluster: "mt1",
        channelAuthorization: {
          endpoint: `${api.defaults.baseURL}/broadcasting/auth`,
          transport: "ajax",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      });
      echo = new Echo({ broadcaster: "reverb", client });
      client.connection.bind("connected", refresh);
      echo
        .private(`users.${id}`)
        .listen(".chat.changed", (event: ChatEvent) => {
          if (event.kind === "removed") {
            queryClient.removeQueries({
              queryKey: ["messages", event.conversation_id],
            });
            queryClient.removeQueries({
              queryKey: ["conversation", event.conversation_id],
            });
            useOutbox
              .getState()
              .drafts.filter((d) => d.conversation_id === event.conversation_id)
              .forEach((d) => useOutbox.getState().remove(d.client_message_id));
          }
          if (event.kind !== "typing") refresh();
          listeners.forEach((listener) => listener(event));
        });
    }
    return () => {
      clearInterval(timer);
      app.remove();
      echo?.disconnect();
    };
  }, [token, id]);
}
