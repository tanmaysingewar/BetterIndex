import { create } from "zustand";

interface ChatState {
  initialMessage: string | null;
  setInitialMessage: (message: string | null) => void;
}

export const useMessageStore = create<ChatState>((set) => ({
  initialMessage: null,
  setInitialMessage: (message) => set({ initialMessage: message }),
}));
