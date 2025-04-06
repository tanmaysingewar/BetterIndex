import { authClient } from "@/lib/auth-client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface Session {
  session:
    | {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        expiresAt: Date;
        token: string;
        ipAddress?: string | null | undefined | undefined;
        userAgent?: string | null | undefined | undefined;
      }
    | undefined;
  user:
    | {
        id: string;
        name: string;
        email: string;
        emailVerified: boolean;
        createdAt?: Date;
        updatedAt?: Date;
        image?: string | null | undefined | undefined;
        isAnonymous?: boolean | null | undefined;
      }
    | undefined;
}

interface UserState {
  session: Session | null;
  setSession: (session: Session | undefined) => void;
  fetchAndSetSession: () => Promise<void>;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      session: {
        session: undefined,
        user: {
          id: "",
          name: "Anonymous",
          email: "",
          emailVerified: false,
          image: undefined,
          isAnonymous: true,
        },
      },
      setSession: (session: Session | undefined) => {
        set({ session: session });
      },
      fetchAndSetSession: async () => {
        const session = await authClient.getSession();
        get().setSession(session?.data || undefined); // Use the setSession action
      },
    }),
    {
      name: "user-session-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// Immediately try to fetch and set the session
useUserStore.getState().fetchAndSetSession();
