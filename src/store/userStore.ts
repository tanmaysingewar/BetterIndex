import { authClient } from "@/lib/auth-client";
// import { fetchAllChatsAndCache } from "@/lib/fetchChats";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  image?: string | null | undefined | undefined;
  isAnonymous?: boolean | null | undefined;
}

interface UserState {
  user: User | null;
  setUser: (user: User | undefined) => void;
  refreshSession: () => Promise<void>;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      setUser: (user: User | undefined) => {
        set({ user: user });
      },
      refreshSession: async () => {
        // Always fetch fresh session data
        const session = await authClient.getSession();
        get().setUser(session?.data?.user || undefined);
      },
    }),
    {
      name: "user-session-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
