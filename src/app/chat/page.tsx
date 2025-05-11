"use client";
import { useEffect, useState } from "react";
import ChatInterface from "@/screens/ChatScreen";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import Cookies from "js-cookie";

interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  image?: string | null | undefined;
  isAnonymous?: boolean | null | undefined;
}

interface SessionDetailsInterface {
  user: User | null;
}

export default function ChatPage() {
  const [sessionDetails, setSessionDetails] = useState<SessionDetailsInterface>(
    { user: null }
  );
  const [isNewUser, setIsNewUser] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();

  useEffect(() => {
    async function checkUserStatus() {
      const userStatus = Cookies.get("user-status");

      if (userStatus === "user") {
        setSessionDetails({ user: null });
        setIsNewUser(false);
        setIsAnonymous(false);
        setLoading(false);
        return;
      }

      if (userStatus === "guest") {
        setSessionDetails({ user: null });
        setIsNewUser(false);
        setIsAnonymous(true);
        setLoading(false);
        return;
      }

      try {
        const sessionResult = await authClient.getSession();

        if (!sessionResult || !sessionResult.data) {
          setSessionDetails({ user: null });
          setIsNewUser(true);
          setIsAnonymous(false);
          setLoading(false);
          return;
        }

        const userData = sessionResult.data.user;

        if (userData?.isAnonymous) {
          setSessionDetails({
            user: {
              ...userData,
            },
          });
          setIsNewUser(false);
          setIsAnonymous(true);
        } else if (userData) {
          setSessionDetails({
            user: {
              ...userData,
            },
          });
          setIsNewUser(false);
          setIsAnonymous(false);
        }
      } catch (error) {
        console.error("Error fetching session:", error);
        setSessionDetails({ user: null });
        setIsNewUser(true);
        setIsAnonymous(false);
      } finally {
        setLoading(false);
      }
    }

    checkUserStatus();
  }, [searchParams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        Loading...
      </div>
    );
  }

  return (
    <ChatInterface
      sessionDetails={sessionDetails}
      isNewUser={isNewUser}
      isAnonymous={isAnonymous}
    />
  );
}
