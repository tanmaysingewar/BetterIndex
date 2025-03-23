"use client";
import { useState,useEffect } from "react";
import InputBox from "@/components/InputArea/InputBox";

import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Spinner from "@/components/Spinner";
import { useAppTheme } from "@/components/theme-provider";
import SignIn from "@/components/sign-in";


export default function Index() {
  const [input, setInput] = useState<string>("")
  const [showHighlights, setShowHighlights] = useState(true)

  const handleSend = () => {
    console.log(input);
  };

  return(
    <div className="h-screen flex items-center justify-center">
      <SignIn />
    </div>
  )


  return (
    <div className="flex flex-col h-screen items-center justify-center">
        <Header />
      <div className="text-center">
          {/* <p className="text-2xl font-light">Good morning! How can I help you today?</p> */}
          <p className="text-2xl font-light">Welcome to Horizora</p>
        <p className="text-2xl font-light text-neutral-400">How can I help you today?</p>
      </div>
      <div className="mt-8 w-full">
        <InputBox height={58} input={input} setInput={setInput} onSend={handleSend} setShowHighlights={setShowHighlights} showHighlights={showHighlights} />
      </div>
    </div>
  );
}
