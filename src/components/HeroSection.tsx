import { cn } from "@/lib/utils";
import React, { useState } from "react";
import { Button } from "./ui/button";
import { BookMarkedIcon, Code, GraduationCap, Sparkles } from "lucide-react";
import { useUserStore } from "@/store/userStore";

const questions = [
  "How does AI work?",
  "Are black holes real?",
  "How many Rs are in the word 'strawberry'?",
  "What is the meaning of life?",
];

const create = [
  "Write a short story about a robot discovering emotions",
  "Help me outline a sci-fi novel set in a post-apocalyptic world",
  "Create a character profile for a complex villain with sympathetic motives",
  "Give me 5 creative writing prompts for flash fiction",
];

const explore = [
  "What are the latest discoveries in quantum physics?",
  "Explain the concept of parallel universes",
  "How do black holes affect time and space?",
  "What is the current state of climate change research?",
];

const code = [
  "Help me debug this Python function",
  "Explain the difference between React hooks and class components",
  "How do I optimize this SQL query?",
  "What are best practices for API design?",
];

const learn = [
  "Teach me the basics of machine learning",
  "How does photosynthesis work?",
  "Explain calculus in simple terms",
  "What are the fundamentals of economics?",
];

export default function HeroSection({
  setInput,
}: {
  setInput: (input: string) => void;
}) {
  const { user } = useUserStore();
  const [activeTab, setActiveTab] = useState("");

  const getActiveContent = () => {
    switch (activeTab) {
      case "create":
        return create;
      case "explore":
        return explore;
      case "code":
        return code;
      case "learn":
        return learn;
      default:
        return questions;
    }
  };

  return (
    <div className="mx-auto px-4 text-center md:mt-[150px] mt-[170px] md:w-[700px] select-none">
      <p className="text-3xl font-semibold text-left ml-2">
        How can I help you, {user?.name.split(" ")[0]}?
      </p>
      <div className="mt-7 grid grid-cols-4 md:flex md:flex-row space-x-3">
        <Button
          className={cn(
            "dark:bg-[#2a2d2f] dark:text-white bg-[#f0f0f0] text-black rounded-2xl md:rounded-full shadow-none border dark:border-[#2e2e2e] border-[#f0f0f0] flex flex-col md:flex-row items-center gap-2 md:gap-1 h-[70px] md:h-[40px] cursor-pointer hover:bg-[#d2d2d2] dark:hover:bg-[#2e2e2e]",
            activeTab === "create" &&
              "bg-[#395665] dark:bg-[#395665] text-white hover:bg-[#395665] dark:hover:bg-[#395665]"
          )}
          onClick={() => setActiveTab(activeTab === "create" ? "" : "create")}
        >
          <Sparkles className="w-4 h-4 md:mr-2" />
          <span>Create</span>
        </Button>
        <Button
          className={cn(
            "dark:bg-[#2a2d2f] dark:text-white bg-[#f0f0f0] text-black rounded-2xl md:rounded-full shadow-none border dark:border-[#2e2e2e] border-[#f0f0f0] flex flex-col md:flex-row items-center gap-2 md:gap-1 h-[70px] md:h-[40px] cursor-pointer hover:bg-[#d2d2d2] dark:hover:bg-[#2e2e2e]",
            activeTab === "explore" &&
              "bg-[#395665] dark:bg-[#395665] text-white hover:bg-[#395665] dark:hover:bg-[#395665]"
          )}
          onClick={() => setActiveTab(activeTab === "explore" ? "" : "explore")}
        >
          <BookMarkedIcon className="w-4 h-4 md:mr-2" />
          <span>Explore</span>
        </Button>
        <Button
          className={cn(
            "dark:bg-[#2a2d2f] dark:text-white bg-[#f0f0f0] text-black rounded-2xl md:rounded-full shadow-none border dark:border-[#2e2e2e] border-[#f0f0f0] flex flex-col md:flex-row items-center gap-2 md:gap-1 h-[70px] md:h-[40px] cursor-pointer hover:bg-[#d2d2d2] dark:hover:bg-[#2e2e2e]",
            activeTab === "code" &&
              "bg-[#395665] dark:bg-[#395665] text-white hover:bg-[#395665] dark:hover:bg-[#395665]"
          )}
          onClick={() => setActiveTab(activeTab === "code" ? "" : "code")}
        >
          <Code className="w-4 h-4 md:mr-2" />
          <span>Code</span>
        </Button>
        <Button
          className={cn(
            "dark:bg-[#2a2d2f] dark:text-white bg-[#f0f0f0] text-black rounded-2xl md:rounded-full shadow-none border dark:border-[#2e2e2e] border-[#f0f0f0] flex flex-col md:flex-row items-center gap-2 md:gap-1 h-[70px] md:h-[40px] cursor-pointer hover:bg-[#d2d2d2] dark:hover:bg-[#2e2e2e]",
            activeTab === "learn" &&
              "bg-[#395665] dark:bg-[#395665] text-white hover:bg-[#395665] dark:hover:bg-[#395665]"
          )}
          onClick={() => setActiveTab(activeTab === "learn" ? "" : "learn")}
        >
          <GraduationCap className="w-4 h-4 md:mr-2" />
          <span>Learn</span>
        </Button>
      </div>
      <div className="mt-7 select-none">
        {getActiveContent().map((item, index) => (
          <div
            key={index}
            className=" hover:bg-[#f0f0f0] dark:hover:bg-[#2a2d2f] rounded-md p-2 text-left cursor-pointer"
            onClick={() => setInput(item)}
          >
            <span className="text-black dark:text-white text-xs md:text-[15px]">
              {item}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

//   <Image
//     src={Logo_Dark}
//     alt="Logo"
//     className="mx-auto dark:black hidden"
//     height={36}
//   />
//   <Image
//     src={Logo_light}
//     alt="Logo"
//     className="mx-auto dark:hidden block"
//     height={36}
//   />
//   <p className="text-xl mt-7 dark:text-white text-black">Welcome to </p>{" "}
//   <span
//     className={cn(
//       "text-3xl dark:text-white text-black font-lora",
//       pacifico.className
//     )}
//   >
//     {" "}
//     Better Index
