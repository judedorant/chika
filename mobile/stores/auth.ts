import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { api, setToken } from "../services/api";
import type { User } from "../types/chat";

type Auth = {
  token: string | null;
  user: User | null;
  ready: boolean;
  bootstrapError: string | null;
  restore: () => Promise<void>;
  authenticate: (
    mode: "login" | "register",
    fields: Record<string, string>,
  ) => Promise<void>;
  clear: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
};
export const useAuth = create<Auth>((set, get) => ({
  token: null,
  user: null,
  ready: false,
  bootstrapError: null,
  restore: async () => {
    set({ ready: false, bootstrapError: null });
    try {
      const token = await SecureStore.getItemAsync("rchat.token");
      if (token) {
        setToken(token);
        const { data } = await api.get("/me");
        set({ token, user: data.data });
      }
    } catch (error) {
      const status = (error as { response?: { status: number } }).response
        ?.status;
      if (status === 401) await get().clear();
      else
        set({
          bootstrapError:
            "Unable to restore your session. Check your connection and retry.",
        });
    } finally {
      set({ ready: true });
    }
  },
  authenticate: async (mode, fields) => {
    const { data } = await api.post(`/auth/${mode}`, {
      ...fields,
      device_name: "RChat Android",
    });
    await SecureStore.setItemAsync("rchat.token", data.token);
    setToken(data.token);
    set({ token: data.token, user: data.user, bootstrapError: null });
  },
  clear: async () => {
    await SecureStore.deleteItemAsync("rchat.token");
    setToken(null);
    set({ token: null, user: null });
  },
  logout: async () => {
    await api.post("/auth/logout");
    await get().clear();
  },
  updateUser: (user) => set({ user }),
}));
