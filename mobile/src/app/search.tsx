import { router } from "expo-router";
import { useState } from "react";
import { UserSearch } from "../../components/UserSearch";
import { ErrorBox, Label, Loading, Screen } from "../../components/ui";
import { api, errorText } from "../../services/api";
import { queryClient } from "../../services/query";
import type { Conversation } from "../../types/chat";
export default function Search() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const start = async (id: number) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post<{ data: Conversation }>(
        "/conversations",
        { type: "private", participant_ids: [id] },
      );
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.replace(`/chat/${data.data.id}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Label muted>Select a person to start a private conversation.</Label>
      <ErrorBox message={error} />
      {busy && <Loading />}
      <UserSearch select={(user) => void start(user.id)} />
    </Screen>
  );
}
