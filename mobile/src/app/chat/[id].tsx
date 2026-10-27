import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
  type ViewToken,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { api, authHeaders, errorText } from "../../../services/api";
import { queryClient } from "../../../services/query";
import { onChatEvent } from "../../../services/realtime";
import { useAuth } from "../../../stores/auth";
import { useOutbox } from "../../../stores/outbox";
import type { Conversation, Draft, Message, Page } from "../../../types/chat";
import {
  Button,
  ErrorBox,
  Field,
  Label,
  Loading,
  Screen,
  useTheme,
} from "../../../components/ui";

export default function Chat() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const { user, token } = useAuth();
  const t = useTheme();
  const [body, setBody] = useState("");
  const [reply, setReply] = useState<Message | null>(null);
  const [edit, setEdit] = useState<Message | null>(null);
  const [error, setError] = useState("");
  const [typing, setTyping] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === "active");
  const [visibleIds, setVisibleIds] = useState<number[]>([]);
  const [image, setImage] = useState<Draft["image"]>();
  const outbox = useOutbox((s) => s.drafts);
  const drafts = outbox.filter((d) => d.conversation_id === id);
  const sending = useRef(new Set<string>());
  const acknowledged = useRef(new Set<string>());
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastTyping = useRef(0);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => sub.remove();
  }, []);
  const conversation = useQuery({
    queryKey: ["conversation", id],
    queryFn: async () =>
      (await api.get<{ data: Conversation }>(`/conversations/${id}`)).data.data,
  });
  const messages = useInfiniteQuery({
    queryKey: ["messages", id],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<Page<Message>>(`/conversations/${id}/messages`, {
          params: pageParam ? { cursor: pageParam } : {},
        })
      ).data,
    getNextPageParam: (p) => p.meta.next_cursor || undefined,
    refetchInterval: focused && active ? 10000 : false,
  });
  const all = messages.data?.pages.flatMap((p) => p.data) ?? [];
  const unique = [...new Map(all.map((m) => [m.id, m])).values()].sort(
    (a, b) => b.id - a.id,
  );
  const idsKey = unique
    .map(
      (m) =>
        `${m.id}:${m.receipts?.find((r) => r.user_id === user?.id)?.read_at}`,
    )
    .join(",");
  useEffect(() => {
    if (!focused || !active) return;
    const loaded = messages.data?.pages.flatMap((p) => p.data) ?? [];
    for (const m of loaded) {
      if (m.sender_id === user?.id) {
        useOutbox.getState().remove(m.client_message_id);
        continue;
      }
      if (m.deleted_at) continue;
      const receipt = m.receipts?.find((r) => r.user_id === user?.id);
      if (!receipt) continue;
      const kind = visibleIds.includes(m.id) ? "read" : "delivered";
      if (kind === "read" ? receipt.read_at : receipt.delivered_at) continue;
      const key = `${m.id}:${kind}`;
      if (acknowledged.current.has(key)) continue;
      acknowledged.current.add(key);
      void api
        .post(`/messages/${m.id}/${kind}`)
        .then(() => {
          if (kind === "read")
            void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        })
        .catch(() => {
          acknowledged.current.delete(key);
        });
    }
  }, [messages.data, idsKey, visibleIds, user?.id, focused, active]);
  useEffect(() => {
    const unsubscribe = onChatEvent((event) => {
      if (event.conversation_id !== id) return;
      if (event.kind === "removed") {
        router.replace("/");
        return;
      }
      if (event.kind === "typing" && event.data.user_id !== user?.id) {
        setTyping(`${event.data.name || "Someone"} is typing…`);
        clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => setTyping(""), 3500);
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(typingTimeout.current);
    };
  }, [id, user?.id]);
  const send = async (draft: Draft) => {
    if (sending.current.has(draft.client_message_id)) return;
    sending.current.add(draft.client_message_id);
    useOutbox.getState().put({ ...draft, status: "sending", error: undefined });
    try {
      const form = new FormData();
      form.append("client_message_id", draft.client_message_id);
      if (draft.body) form.append("body", draft.body);
      if (draft.reply_to_message_id)
        form.append("reply_to_message_id", String(draft.reply_to_message_id));
      if (draft.image) form.append("image", draft.image as unknown as Blob);
      const result = await api.post<{ data: Message }>(
        `/conversations/${id}/messages`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      if (useAuth.getState().token !== token) return;
      queryClient.setQueryData(
        ["messages", id],
        (old: { pages: Page<Message>[]; pageParams: unknown[] } | undefined) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page, i) =>
                  i === 0
                    ? {
                        ...page,
                        data: [
                          result.data.data,
                          ...page.data.filter(
                            (m) => m.id !== result.data.data.id,
                          ),
                        ],
                      }
                    : page,
                ),
              }
            : old,
      );
      useOutbox.getState().remove(draft.client_message_id);
      void queryClient.invalidateQueries({ queryKey: ["messages", id] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      if (useAuth.getState().token === token)
        useOutbox
          .getState()
          .put({ ...draft, status: "failed", error: errorText(e) });
    } finally {
      sending.current.delete(draft.client_message_id);
    }
  };
  const submit = async () => {
    setError("");
    if (edit) {
      try {
        await api.patch(`/messages/${edit.id}`, { body });
        setEdit(null);
        setBody("");
        await messages.refetch();
      } catch (e) {
        setError(errorText(e));
      }
      return;
    }
    const draft: Draft = {
      client_message_id: Crypto.randomUUID(),
      conversation_id: id,
      body: body.trim(),
      reply_to_message_id: reply?.id,
      image,
      status: "sending",
    };
    setBody("");
    setReply(null);
    setImage(undefined);
    await send(draft);
  };
  const pick = async () => {
    try {
      const selected = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (!selected.canceled) {
        const asset = selected.assets[0];
        setImage({
          uri: asset.uri,
          name: asset.fileName || "photo.jpg",
          type: asset.mimeType || "image/jpeg",
        });
      }
    } catch (e) {
      setError(errorText(e));
    }
  };
  const actions = (m: Message) => {
    if (m.deleted_at) return;
    Alert.alert("Message", m.body || "Photo", [
      {
        text: "Reply",
        onPress: () => {
          setEdit(null);
          setReply(m);
        },
      },
      ...(m.sender_id === user?.id
        ? [
            {
              text: "Edit",
              onPress: () => {
                setReply(null);
                setEdit(m);
                setBody(m.body || "");
              },
            },
            {
              text: "Delete",
              style: "destructive" as const,
              onPress: () => {
                void api
                  .delete(`/messages/${m.id}`)
                  .then(() => messages.refetch())
                  .catch((e) => setError(errorText(e)));
              },
            },
          ]
        : []),
      { text: "Cancel", style: "cancel" },
    ]);
  };
  const onVisible = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<Message>[] }) =>
      setVisibleIds(viewableItems.map((v) => v.item.id)),
  ).current;
  const c = conversation.data;
  const peer = c?.participants.find((p) => p.id !== user?.id);
  const presence = useQuery({
    queryKey: ["presence", peer?.id],
    queryFn: async () =>
      (await api.get<{ online: boolean }>(`/users/${peer!.id}/presence`)).data,
    enabled: !!peer && c?.type === "private" && focused && active,
    refetchInterval: 30000,
    retry: false,
  });
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
      style={{ flex: 1 }}
    >
      <Screen scroll={false}>
        <Pressable
          style={{ padding: 16 }}
          onPress={() =>
            c?.type === "group"
              ? router.push(`/group/${id}`)
              : peer && router.push(`/profile/${peer.id}`)
          }
        >
          <Label>{c?.type === "group" ? c.name : peer?.name || "Chat"}</Label>
          <Label muted>
            {typing ||
              (c?.type === "group"
                ? `${c.participants.length} members`
                : presence.data?.online
                  ? "Online"
                  : "Offline")}
          </Label>
        </Pressable>
        {(messages.isPending || conversation.isPending) && <Loading />}
        <ErrorBox
          message={
            error ||
            (messages.isError
              ? errorText(messages.error)
              : conversation.isError
                ? errorText(conversation.error)
                : "")
          }
          retry={() => {
            void messages.refetch();
            void conversation.refetch();
          }}
        />
        <FlatList
          style={{ flex: 1 }}
          inverted
          data={unique}
          keyExtractor={(m) => String(m.id)}
          onViewableItemsChanged={onVisible}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          onEndReached={() => {
            if (messages.hasNextPage && !messages.isFetchingNextPage)
              void messages.fetchNextPage();
          }}
          ListFooterComponent={messages.isFetchingNextPage ? <Loading /> : null}
          ListHeaderComponent={
            <View>
              {drafts.map((d) => (
                <View
                  key={d.client_message_id}
                  style={{
                    margin: 10,
                    padding: 12,
                    alignSelf: "flex-end",
                    borderRadius: 16,
                    backgroundColor: t.surface,
                  }}
                >
                  <Label>{d.body || "Photo"}</Label>
                  <Label muted>
                    {d.status === "sending" ? "Sending…" : d.error || "Failed"}
                  </Label>
                  {d.status === "failed" && (
                    <>
                      <Button
                        title="Retry message"
                        onPress={() => void send(d)}
                      />
                      <Button
                        secondary
                        title="Discard"
                        onPress={() =>
                          useOutbox.getState().remove(d.client_message_id)
                        }
                      />
                    </>
                  )}
                </View>
              ))}
            </View>
          }
          renderItem={({ item: m }) => {
            const mine = m.sender_id === user?.id;
            const seen =
              m.receipts?.length && m.receipts.every((r) => r.read_at);
            const delivered =
              m.receipts?.length && m.receipts.every((r) => r.delivered_at);
            return (
              <Pressable
                onLongPress={() => actions(m)}
                accessibilityLabel="Message. Long press for actions."
                style={{
                  marginHorizontal: 14,
                  marginVertical: 4,
                  padding: 12,
                  maxWidth: "85%",
                  minWidth: 100,
                  borderRadius: 18,
                  alignSelf: mine ? "flex-end" : "flex-start",
                  backgroundColor: mine ? t.accent : t.surface,
                }}
              >
                {!mine && c?.type === "group" && (
                  <Text style={{ color: t.muted, fontWeight: "700" }}>
                    {m.sender?.name}
                  </Text>
                )}
                {!!m.reply_to_message_id && (
                  <Text
                    style={{ color: mine ? "#dbe0ff" : t.muted, fontSize: 12 }}
                  >
                    Reply to #{m.reply_to_message_id}
                  </Text>
                )}
                {m.attachments?.map((a) => (
                  <Image
                    key={a.id}
                    source={{ uri: a.url, headers: authHeaders(token) }}
                    style={{
                      width: 220,
                      height: 200,
                      borderRadius: 12,
                      marginBottom: 6,
                    }}
                  />
                ))}
                <Text style={{ color: mine ? "white" : t.text, fontSize: 16 }}>
                  {m.deleted_at ? "Message deleted" : m.body}
                </Text>
                <Text
                  style={{
                    color: mine ? "#e0e6ff" : t.muted,
                    fontSize: 11,
                    marginTop: 5,
                  }}
                >
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {m.edited_at ? " · edited" : ""}
                  {mine
                    ? seen
                      ? " · Read"
                      : delivered
                        ? " · Delivered"
                        : " · Sent"
                    : ""}
                </Text>
              </Pressable>
            );
          }}
        />
        <View style={{ padding: 12, gap: 8, backgroundColor: t.surface }}>
          {(reply || edit || image) && (
            <>
              <Label muted>
                {edit
                  ? "Editing message"
                  : reply
                    ? `Replying to: ${reply.body || "Photo"}`
                    : `Photo: ${image?.name}`}
              </Label>
              <Button
                secondary
                title="Cancel"
                onPress={() => {
                  setReply(null);
                  setEdit(null);
                  setImage(undefined);
                  setBody("");
                }}
              />
            </>
          )}
          <Field
            placeholder="Message…"
            value={body}
            multiline
            maxLength={5000}
            onChangeText={(text) => {
              setBody(text);
              if (text && Date.now() - lastTyping.current > 3500) {
                lastTyping.current = Date.now();
                void api.post(`/conversations/${id}/typing`).catch(() => {});
              }
            }}
            style={{ maxHeight: 120 }}
          />
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            {!edit && (
              <Button secondary title="Photo" onPress={() => void pick()} />
            )}
            <Button
              title={edit ? "Save edit" : "Send"}
              disabled={!body.trim() && (!image || !!edit)}
              onPress={() => void submit()}
            />
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
