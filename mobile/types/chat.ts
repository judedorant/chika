export type User = {
  id: number;
  name: string;
  email?: string;
  avatar: string | null;
  role?: string;
};
export type Receipt = {
  user_id: number;
  delivered_at: string | null;
  read_at: string | null;
};
export type Message = {
  id: number;
  conversation_id: number;
  sender_id: number;
  client_message_id: string;
  body: string | null;
  message_type: "text" | "image";
  reply_to_message_id: number | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  sender?: User;
  attachments?: {
    id: number;
    url: string;
    mime_type: string;
    file_size: number;
  }[];
  receipts?: Receipt[];
};
export type Conversation = {
  id: number;
  type: "private" | "group";
  name: string | null;
  created_by: number;
  participants: User[];
  latest_message?: Message;
  unread_count: number;
};
export type Page<T> = {
  data: T[];
  links: { next: string | null };
  meta: {
    next_cursor?: string | null;
    current_page?: number;
    last_page?: number;
  };
};
export type Draft = {
  client_message_id: string;
  conversation_id: number;
  body: string;
  reply_to_message_id?: number;
  image?: { uri: string; name: string; type: string };
  status: "sending" | "failed";
  error?: string;
};
