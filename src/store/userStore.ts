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
  fetchAndSetSession: (forceRefresh?: boolean) => Promise<void>;
  refreshSession: () => Promise<void>;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      setUser: (user: User | undefined) => {
        set({ user: user });
      },
      fetchAndSetSession: async (forceRefresh = false) => {
        // Check if user data is already present in the store and not forcing refresh
        if (get().user && !forceRefresh) {
          return; // Do not fetch again if user data exists and not forcing refresh
        }

        const session = await authClient.getSession();
        get().setUser(session?.data?.user || undefined);
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
