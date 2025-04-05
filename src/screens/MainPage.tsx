"use client";
import { useState, useEffect } from "react";
import InputBox from "@/components/InputArea/InputBox";
import Header from "@/components/Header";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useChatStore } from "@/store/chatStore";
import { nanoid } from "nanoid";
import Spinner from "@/components/Spinner";

interface User {
  id: string | undefined;
  name: string | undefined;
  email: string | undefined;
  emailVerified: boolean | undefined;
  image: string | undefined;
  createdAt?: Date | undefined; // Allow undefined or null
  updatedAt?: Date | undefined; // Allow undefined or null
  isAnonymous: boolean;
  isDummy?: boolean;
}

interface Session {
  session: {
    id: string | undefined;
    expiresAt: Date | undefined;
    token: string | undefined;
    createdAt: Date | undefined;
    updatedAt: Date | undefined;
    ipAddress?: string | undefined; // Make optional
    userAgent?: string | undefined; // Make optional
    userId: string | undefined;
  };
  user: User;
}

interface MainPageProps {
  session: Session;
}

export default function MainPage({ session }: MainPageProps) {
  const [input, setInput] = useState<string>("");
  const [user, setUser] = useState<User | undefined>(() => {
    if (session && "session" in session) {
      return session.user; // It's a Session
    } else if (session && "user" in session) {
      return undefined; // It's an AnonymousSession, initialize with null
    } else {
      return undefined; // No session, initialize with null
    }
  });
  const router = useRouter();
  const setInitialMessage = useChatStore((state) => state.setInitialMessage);

  const handleSend = () => {
    setInitialMessage(input); // Set message in the store
    const newChatId = nanoid();
    return router.push(`/chat/${newChatId}`);
  };

  useEffect(() => {
    setUser(session?.user || null);
    async function fetchData() {
      if (session?.user?.isDummy) {
        // console.log(session);
        const user = await authClient.signIn.anonymous();
        if (user) {
          console.log(user.data?.user);
          setUser({
            id: user.data?.user.id || undefined,
            name: "Anonymous",
            email: user.data?.user.email,
            emailVerified: false,
            image: undefined,
            isAnonymous: true,
          });
          console.log("Anonymous user signed in");
        }
      }
    }

    fetchData();
  }, [session]);

  return (
    <div className="flex flex-col h-screen items-center justify-center">
      <Header user={user} landingPage={true} />
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
