import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, errorText } from "../../../services/api";
import { useAuth } from "../../../stores/auth";
import { queryClient } from "../../../services/query";
import type { Conversation, User } from "../../../types/chat";
import {
  Avatar,
  Button,
  ErrorBox,
  Label,
  Loading,
  Screen,
  Title,
} from "../../../components/ui";
export default function Profile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useAuth((s) => s.user);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const profile = useQuery({
    queryKey: ["profile", id],
    queryFn: async () =>
      (
        await api.get<{ data: User }>(
          Number(id) === me?.id ? "/me" : `/users/${id}`,
        )
      ).data.data,
  });
  const action = async (block: boolean) => {
    setBusy(true);
    setError("");
    try {
      if (block) {
        await api.post(`/users/${id}/block`);
        void queryClient.invalidateQueries({ queryKey: ["blocks"] });
        router.back();
      } else {
        const { data } = await api.post<{ data: Conversation }>(
          "/conversations",
          { type: "private", participant_ids: [Number(id)] },
        );
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        router.replace(`/chat/${data.data.id}`);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      {profile.isPending && <Loading />}
      <ErrorBox
        message={error || (profile.isError ? errorText(profile.error) : "")}
      />
      {profile.data && (
        <>
          <Avatar user={profile.data} />
          <Title>{profile.data.name}</Title>
          {profile.data.email && <Label muted>{profile.data.email}</Label>}
          {Number(id) === me?.id ? (
            <Button
              title="Edit profile"
              onPress={() => router.push("/edit-profile")}
            />
          ) : (
            <>
              <Button
                title="Send message"
                disabled={busy}
                onPress={() => void action(false)}
              />
              <Button
                secondary
                title="Block user"
                disabled={busy}
                onPress={() => void action(true)}
              />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
