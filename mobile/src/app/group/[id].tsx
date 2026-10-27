import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, errorText } from "../../../services/api";
import { queryClient } from "../../../services/query";
import { useAuth } from "../../../stores/auth";
import type { Conversation } from "../../../types/chat";
import { UserSearch } from "../../../components/UserSearch";
import {
  Button,
  ErrorBox,
  Field,
  Label,
  Loading,
  Screen,
} from "../../../components/ui";
export default function Group() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useAuth((s) => s.user);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["conversation", Number(id)],
    queryFn: async () =>
      (await api.get<{ data: Conversation }>(`/conversations/${id}`)).data.data,
  });
  const owner = query.data?.created_by === me?.id;
  const change = async (
    path: string,
    method: "post" | "patch" | "delete",
    data?: object,
  ) => {
    setBusy(true);
    setError("");
    try {
      await api.request({ url: path, method, data });
      await query.refetch();
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      {query.isPending && <Loading />}
      <ErrorBox
        message={error || (query.isError ? errorText(query.error) : "")}
      />
      <Label>{query.data?.name}</Label>
      {owner && (
        <>
          <Field
            placeholder="New group name"
            value={name}
            onChangeText={setName}
          />
          <Button
            title="Rename group"
            disabled={busy || !name.trim()}
            onPress={() =>
              void change(`/conversations/${id}`, "patch", { name })
            }
          />
        </>
      )}
      {query.data?.participants.map((p) => (
        <View key={p.id} style={{ gap: 8 }}>
          <Label>
            {p.name} · {p.role || "member"}
          </Label>
          {owner && p.id !== me?.id && (
            <Button
              secondary
              title="Remove"
              disabled={busy}
              onPress={() =>
                void change(
                  `/conversations/${id}/participants/${p.id}`,
                  "delete",
                )
              }
            />
          )}
        </View>
      ))}
      {owner && (
        <>
          <Label>Add a member</Label>
          <UserSearch
            selected={query.data?.participants.map((p) => p.id)}
            select={(p) => {
              if (!busy)
                void change(`/conversations/${id}/participants`, "post", {
                  user_id: p.id,
                });
            }}
          />
        </>
      )}
      <Button secondary title="Back to chat" onPress={() => router.back()} />
    </Screen>
  );
}
