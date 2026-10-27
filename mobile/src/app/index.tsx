import { FlatList, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, errorText } from "../../services/api";
import { useAuth } from "../../stores/auth";
import type { Conversation, Page } from "../../types/chat";
import {
  Avatar,
  Button,
  ErrorBox,
  Label,
  Loading,
  Screen,
  useTheme,
} from "../../components/ui";
export default function Conversations() {
  const user = useAuth((s) => s.user)!;
  const t = useTheme();
  const query = useInfiniteQuery({
    queryKey: ["conversations"],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<Page<Conversation>>("/conversations", {
          params: { page: pageParam },
        })
      ).data,
    getNextPageParam: (p) =>
      (p.meta.current_page ?? 1) < (p.meta.last_page ?? 1)
        ? (p.meta.current_page ?? 1) + 1
        : undefined,
    refetchInterval: 15000,
  });
  return (
    <Screen scroll={false}>
      <View style={{ padding: 16, flexDirection: "row", gap: 12 }}>
        <Button
          title="New chat"
          onPress={() => router.push("/new-conversation")}
        />
        <Button
          secondary
          title="Settings"
          onPress={() => router.push("/settings")}
        />
      </View>
      {query.isPending && <Loading />}
      <ErrorBox
        message={query.isError ? errorText(query.error) : null}
        retry={() => void query.refetch()}
      />
      <FlatList
        data={query.data?.pages.flatMap((p) => p.data) ?? []}
        keyExtractor={(c) => String(c.id)}
        onRefresh={() => void query.refetch()}
        refreshing={query.isRefetching}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage)
            void query.fetchNextPage();
        }}
        ListEmptyComponent={
          !query.isPending ? (
            <View style={{ padding: 24 }}>
              <Label muted>
                No conversations yet. Start a chat with someone you know.
              </Label>
            </View>
          ) : null
        }
        renderItem={({ item: c }) => {
          const other = c.participants.find((p) => p.id !== user.id);
          const name =
            c.type === "group"
              ? c.name || "Group"
              : other?.name || "Conversation";
          return (
            <Pressable
              onPress={() => router.push(`/chat/${c.id}`)}
              style={{
                marginHorizontal: 16,
                marginBottom: 10,
                padding: 16,
                borderRadius: 18,
                backgroundColor: t.surface,
                flexDirection: "row",
                gap: 12,
              }}
            >
              <Avatar
                user={{
                  name,
                  avatar: c.type === "private" ? other?.avatar || null : null,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: t.text, fontWeight: "700", fontSize: 17 }}
                >
                  {name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ color: t.muted, marginTop: 4 }}
                >
                  {c.latest_message?.deleted_at
                    ? "Message deleted"
                    : c.latest_message?.body ||
                      (c.latest_message?.message_type === "image"
                        ? "Photo"
                        : "Say hello")}
                </Text>
              </View>
              {c.unread_count > 0 && (
                <Text
                  style={{
                    color: "#fff",
                    backgroundColor: t.accent,
                    padding: 6,
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  {c.unread_count}
                </Text>
              )}
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
