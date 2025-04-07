"use client";
import { useState, useEffect } from "react";
import InputBox from "@/components/InputArea/InputBox";
import Header from "@/components/Header";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useChatStore } from "@/store/chatStore";
import { nanoid } from "nanoid";
import Spinner from "@/components/Spinner";
import { useUserStore } from "@/store/userStore";
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

interface MainPageProps {
  sessionDetails: {
    user: User | null; // Allow user to be null within sessionDetails
  } | null;
  isNewUser: boolean;
  isAnonymous: boolean;
}

export default function MainPage({
  sessionDetails,
  isNewUser,
  isAnonymous,
}: MainPageProps) {
  const { user, setUser } = useUserStore();

  useEffect(() => {
    // setUser(session?.user || null);
    async function fetchData() {
      if (isNewUser && !user) {
        const user = await authClient.signIn.anonymous();
        if (user) {
          setUser(user?.data?.user);
          // SetCookie user-status=guest
          return Cookies.set("user-status", "guest", { expires: 7 });
        }
      }

      if (sessionDetails?.user) {
        setUser(sessionDetails?.user);
        if (!isNewUser && !isAnonymous) {
          Cookies.set("user-status", "user", { expires: 7 });
          return location.reload();
        }
        if (isAnonymous) {
          Cookies.set("user-status", "guest", { expires: 7 });
          return location.reload();
        }
      }
    }

    fetchData();
  }, [user, isNewUser, setUser, isAnonymous, sessionDetails]);

  const [input, setInput] = useState<string>("");
  const router = useRouter();
  const setInitialMessage = useChatStore((state) => state.setInitialMessage);

  const handleSend = () => {
    setInitialMessage(input); // Set message in the store
    const newChatId = nanoid();
    return router.push(`/chat?chatId=${newChatId}`);
  };

  return (
    <div className="flex flex-col h-screen items-center justify-center">
      <Header
        landingPage={true}
        isNewUser={isNewUser}
        isAnonymous={isAnonymous}
      />
      <div className="text-center w-full -mt-20 md:mt-0">
        <div className="flex justify-center items-center mb-5">
          <Spinner />
        </div>
        {/* <p className="text-2xl font-light">Good morning! How can I help you today?</p> */}
        <p className="text-2xl font-light">Welcome to Horizora</p>
        <p className="text-2xl font-light text-neutral-400">
          How can I help you today?
        </p>
      </div>
      <div className="mt-8 w-full">
        <InputBox
          height={58}
          input={input}
          setInput={setInput}
          onSend={handleSend}
        />
      </div>
    </div>
  );
}
