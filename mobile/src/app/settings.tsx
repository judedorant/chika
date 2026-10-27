import { useState } from "react";
import { router } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, errorText } from "../../services/api";
import { enablePush } from "../../services/notifications";
import { queryClient } from "../../services/query";
import { useAuth } from "../../stores/auth";
import { useOutbox } from "../../stores/outbox";
import type { Page, User } from "../../types/chat";
import { Button, ErrorBox, Field, Label, Screen } from "../../components/ui";
export default function Settings() {
  const { user, logout, clear } = useAuth();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const blocks = useInfiniteQuery({
    queryKey: ["blocks"],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (await api.get<Page<User>>("/me/blocks", { params: { page: pageParam } }))
        .data,
    getNextPageParam: (p) =>
      (p.meta.current_page ?? 1) < (p.meta.last_page ?? 1)
        ? (p.meta.current_page ?? 1) + 1
        : undefined,
  });
  const run = async (fn: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      if (message) setNotice(message);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const wipe = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    useOutbox.getState().clear();
  };
  return (
    <Screen>
      <Label>{user?.name}</Label>
      <Label muted>Appearance follows your device’s light or dark mode.</Label>
      <Button
        secondary
        title="Edit profile"
        onPress={() => router.push("/edit-profile")}
      />
      <Button
        title="Enable push notifications"
        disabled={busy}
        onPress={() =>
          void run(enablePush, "Notifications enabled on this device.")
        }
      />
      <ErrorBox message={error} />
      {!!notice && <Label>{notice}</Label>}
      <Label>Change password</Label>
      <Field
        placeholder="Current password"
        value={current}
        onChangeText={setCurrent}
        secureTextEntry
      />
      <Field
        placeholder="New password (12+ characters)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Field
        placeholder="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
      />
      <Button
        title="Change password and revoke all sessions"
        disabled={busy || !current || !password || !confirm}
        onPress={() =>
          void run(async () => {
            await api.put("/me/password", {
              current_password: current,
              password,
              password_confirmation: confirm,
            });
            await wipe();
            await clear();
          })
        }
      />
      <Label>Blocked users</Label>
      <ErrorBox
        message={blocks.isError ? errorText(blocks.error) : null}
        retry={() => void blocks.refetch()}
      />
      {blocks.data?.pages
        .flatMap((p) => p.data)
        .map((p) => (
          <Button
            key={p.id}
            secondary
            title={`Unblock ${p.name}`}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await api.delete(`/users/${p.id}/block`);
                await blocks.refetch();
              })
            }
          />
        ))}
      {blocks.hasNextPage && (
        <Button
          secondary
          title="More blocked users"
          onPress={() => void blocks.fetchNextPage()}
        />
      )}
      <Button
        secondary
        title="Sign out"
        disabled={busy}
        onPress={() =>
          void run(async () => {
            await logout();
            await wipe();
          })
        }
      />
      <Button
        secondary
        title="Revoke all sessions"
        disabled={busy}
        onPress={() =>
          void run(async () => {
            await api.delete("/auth/tokens");
            await wipe();
            await clear();
          })
        }
      />
    </Screen>
  );
}
