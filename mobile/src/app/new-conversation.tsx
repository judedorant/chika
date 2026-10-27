import { useState } from "react";
import { Link, router } from "expo-router";
import { api, errorText } from "../../services/api";
import { queryClient } from "../../services/query";
import type { Conversation, User } from "../../types/chat";
import { UserSearch } from "../../components/UserSearch";
import { Button, ErrorBox, Field, Label, Screen } from "../../components/ui";
export default function NewConversation() {
  const [group, setGroup] = useState(false);
  const [name, setName] = useState("");
  const [people, setPeople] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post<{ data: Conversation }>(
        "/conversations",
        {
          type: group ? "group" : "private",
          name: group ? name : null,
          participant_ids: people.map((p) => p.id),
        },
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
      <Button
        secondary
        title={
          group
            ? "Group chat · switch to private"
            : "Private chat · switch to group"
        }
        onPress={() => {
          setGroup(!group);
          setPeople([]);
        }}
      />
      {group && (
        <Field
          placeholder="Group name"
          value={name}
          onChangeText={setName}
          maxLength={100}
        />
      )}
      <Label muted>
        {people.length
          ? `Selected: ${people.map((p) => p.name).join(", ")}`
          : "Choose someone to start talking."}
      </Label>
      <UserSearch
        selected={people.map((p) => p.id)}
        select={(user) =>
          setPeople((old) =>
            old.some((p) => p.id === user.id)
              ? old.filter((p) => p.id !== user.id)
              : group
                ? [...old, user].slice(0, 49)
                : [user],
          )
        }
      />
      <ErrorBox message={error} />
      <Button
        title={busy ? "Creating…" : "Start conversation"}
        disabled={busy || !people.length || (group && !name.trim())}
        onPress={() => void create()}
      />
      <Link href="/search" style={{ color: "#4d65e8" }}>
        Search user profiles
      </Link>
    </Screen>
  );
}
