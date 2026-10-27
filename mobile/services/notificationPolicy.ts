export function notificationTarget(
  data: Record<string, unknown> | undefined,
  userId: number | undefined,
) {
  if (!data || !userId || Number(data.recipient_user_id) !== userId)
    return null;
  const id = Number(data.conversation_id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export function shouldShowNotification(
  data: Record<string, unknown> | undefined,
  userId: number | undefined,
  active: boolean,
  visibleConversation: number | null,
) {
  const target = notificationTarget(data, userId);
  return target !== null && !(active && target === visibleConversation);
}
export function rememberTap(seen: Set<string>, identifier: string) {
  if (!identifier || seen.has(identifier)) return false;
  seen.add(identifier);
  if (seen.size > 100) seen.delete(seen.values().next().value!);
  return true;
}
