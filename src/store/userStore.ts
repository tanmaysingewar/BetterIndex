import { authClient } from "@/lib/auth-client";
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
  fetchAndSetSession: () => Promise<void>;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      setUser: (user: User | undefined) => {
        set({ user: user });
      },
      fetchAndSetSession: async () => {
        // Check if user data is already present in the store
        if (get().user) {
          return; // Do not fetch again if user data exists
        }

        const session = await authClient.getSession();
        console.log(session?.data?.user);
        get().setUser(session?.data?.user || undefined);
      },
    }),
    {
      name: "user-session-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
