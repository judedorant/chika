import { create } from "zustand";
import type { Draft } from "../types/chat";
type Outbox = {
  drafts: Draft[];
  put: (draft: Draft) => void;
  remove: (id: string) => void;
  clear: () => void;
};
// Message bodies stay in memory. Tokens alone are stored in SecureStore.
export const useOutbox = create<Outbox>((set) => ({
  drafts: [],
  put: (draft) =>
    set((s) => ({
      drafts: [
        ...s.drafts.filter(
          (d) => d.client_message_id !== draft.client_message_id,
        ),
        draft,
      ],
    })),
  remove: (id) =>
    set((s) => ({
      drafts: s.drafts.filter((d) => d.client_message_id !== id),
    })),
  clear: () => set({ drafts: [] }),
}));
