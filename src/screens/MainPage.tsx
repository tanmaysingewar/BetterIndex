"use client";
import { useState, useEffect } from "react";
import InputBox from "@/components/InputArea/InputBox";

import Header from "@/components/Header";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useChatStore } from "@/store/chatStore";
import { nanoid } from "nanoid";

export default function MainPage({ session }: any) {
  const [input, setInput] = useState<string>("");
  const [showHighlights, setShowHighlights] = useState(true);
  const [user, setUser] = useState<any>(session?.user);
  const router = useRouter();
  const setInitialMessage = useChatStore((state) => state.setInitialMessage);

  const handleSend = () => {
    setInitialMessage(input); // Set message in the store
    const newChatId = nanoid();
    return router.push(`/chat/${newChatId}`);
  };

  useEffect(() => {
    setUser(session?.user);
    async function fetchData() {
      if (session?.user?.isDummy) {
        // console.log(session);
        const user = await authClient.signIn.anonymous();
        if (user) {
          console.log(user.data?.user);
          setUser({
            id: user.data?.user.id,
            name: "Anonymous",
            email: user.data?.user.email,
            emailVerified: false,
            image: null,
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
      <Header session={user} />
      <div className="text-center">
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
          setShowHighlights={setShowHighlights}
          showHighlights={showHighlights}
        />
      </div>
    </div>
  );
}
