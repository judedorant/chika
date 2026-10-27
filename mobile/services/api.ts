import axios from "axios";

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:8000/api/v1",
  timeout: 15000,
  headers: { Accept: "application/json" },
});
export function setToken(token: string | null) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}
export function errorText(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    const messages = data?.errors && Object.values(data.errors).flat();
    return messages?.length
      ? messages.join("\n")
      : data?.message || "Connection failed. Check your network and try again.";
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
export const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {};
