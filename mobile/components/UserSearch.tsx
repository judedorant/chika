import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, errorText } from "../services/api";
import type { Page, User } from "../types/chat";
import {
  Avatar,
  Button,
  ErrorBox,
  Field,
  Label,
  Loading,
  useTheme,
} from "./ui";
export function UserSearch({
  select,
  selected = [],
}: {
  select: (user: User) => void;
  selected?: number[];
}) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const t = useTheme();
  useEffect(() => {
    const timeout = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(timeout);
  }, [text]);
  const query = useInfiniteQuery({
    queryKey: ["users", q],
    enabled: q.length >= 2,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (await api.get<Page<User>>("/users", { params: { q, page: pageParam } }))
        .data,
    getNextPageParam: (p) =>
      (p.meta.current_page ?? 1) < (p.meta.last_page ?? 1)
        ? (p.meta.current_page ?? 1) + 1
        : undefined,
  });
  return (
    <View style={{ gap: 12 }}>
      <Field
        placeholder="Search names (at least 2 characters)"
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
      />
      {query.isFetching && <Loading />}
      <ErrorBox
        message={query.isError ? errorText(query.error) : null}
        retry={() => void query.refetch()}
      />
      {query.data?.pages
        .flatMap((p) => p.data)
        .map((user) => (
          <Pressable
            key={user.id}
            onPress={() => select(user)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 12,
              borderRadius: 12,
              backgroundColor: t.surface,
            }}
          >
            <Avatar user={user} />
            <Label>
              {user.name}
              {selected.includes(user.id) ? " ✓" : ""}
            </Label>
          </Pressable>
        ))}
      {q.length >= 2 &&
        !query.isFetching &&
        query.data?.pages[0].data.length === 0 && (
          <Label muted>No people found.</Label>
        )}
      {query.hasNextPage && (
        <Button
          title="More people"
          onPress={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        />
      )}
    </View>
  );
}
