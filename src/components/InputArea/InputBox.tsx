"use client";
import React, { useState, useEffect, useCallback, KeyboardEvent } from "react";
import { OctagonPause, Send, Search, ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import TextInput from "./TextInput";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
// import Link from "next/link";

interface InputBoxProps {
  input: string;
  setInput: (value: string) => void;
  onSend: (message: string) => void;
  height: number;
  disabled?: boolean;
  selectedModel?: string;
  setSelectedModel?: (value: string) => void;
}

export default function InputBox({
  input,
  setInput,
  onSend,
  height,
  disabled,
  selectedModel,
  setSelectedModel = () => {},
}: InputBoxProps) {
  // Suggestion filtering and navigation state
  const lastWord = input.split(" ").slice(-1)[0];
  const hasExistingTone = input
    .split(" ")
    .some((word) => word.startsWith("#") && word !== lastWord);

  const filteredSuggestions =
    // lastWord.startsWith("@")
    //   ? popularToolsAndFrameworks
    //       .filter((tool) =>
    //         tool
    //           .toLowerCase()
    //           .includes(lastWord.trim().replace("@", "").toLowerCase())
    //       )
    //       .slice(0, 5)
    //   :
    lastWord.startsWith("#") && !hasExistingTone
      ? promptSuggestions
          .filter((suggestion) =>
            suggestion
              .toLowerCase()
              .includes(lastWord.trim().replace("#", "").toLowerCase())
          )
          .slice(0, 5)
      : [];
  // lastWord.startsWith("$")
  // ? tools
  //     .filter((tool) =>
  //       tool
  //         .toLowerCase()
  //         .includes(lastWord.trim().replace("$", "").toLowerCase())
  //     )
  //     .slice(0, 5)
  // :
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [openPopover, setOpenPopover] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [selectedModelName, setSelectedModelName] =
    useState("Gemini 2.5 Flash");

  const handleSelection = useCallback(
    (selection: string) => {
      const tokens = input.split(" ");
      const lastToken = tokens[tokens.length - 1];
      const prefix = lastToken.startsWith("#") ? "#" : "$";

      // If adding a !word, remove any existing !words
      if (prefix === "#") {
        const newTokens = tokens.filter((token, index) => {
          // Keep the current token if it's the last one
          if (index === tokens.length - 1) return true;
          // Remove any previous !words
          return !token.startsWith("#");
        });
        newTokens[newTokens.length - 1] = prefix + selection + " ";
        setInput(newTokens.join(" "));
      } else {
        tokens[tokens.length - 1] = prefix + selection + " ";
        setInput(tokens.join(" "));
      }
    },
    [input, setInput]
  );

  // Update input change handling in TextInput component
  const handleInputChange = useCallback(
    (newValue: string) => {
      const tokens = newValue.split(" ");
      const exclamationWords = tokens.filter((token) => token.startsWith("#"));

      if (exclamationWords.length > 1) {
        // Keep only the last !word
        const cleanedTokens = tokens.map((token, index) => {
          if (token.startsWith("#")) {
            // Keep only the last !word
            return index ===
              tokens.lastIndexOf(exclamationWords[exclamationWords.length - 1])
              ? token
              : token.substring(1); // Remove ! from other words
          }
          return token;
        });
        setInput(cleanedTokens.join(" "));
      } else {
        setInput(newValue);
      }
    },
    [setInput]
  );

  // This function is now handled in TextInput component
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLParagraphElement>, selection: string) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSelection(selection);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredSuggestions.length - 1
        );
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : 0
        );
      }
    },
    [handleSelection, filteredSuggestions.length]
  );
  useEffect(() => {
    // Only reset selection index when the actual list of suggestions changes
    // We'll compare the current input's last token to determine if suggestions changed
    setSelectedIndex(0);
  }, [input.split(" ").slice(-1)[0]]);

  const handleModelSelect = (model: { key: string; value: string }) => {
    setSelectedModel(model.value);
    setSelectedModelName(model.key);
    setOpenPopover(false);
    setModelSearch(""); // Reset search when a model is selected
  };

  // Filter models based on search
  const filteredModels = modelSearch
    ? openSourceModels.filter((model) =>
        model.key.toLowerCase().includes(modelSearch.toLowerCase())
      )
    : openSourceModels;

  return (
    <div>
      <div className="max-w-3xl text-base font-sans lg:px-0 w-screen md:rounded-t-3xl px-2 fixed bottom-0">
        {filteredSuggestions.length > 0 && (
          <div className="mx-5">
            <div className="dark:bg-[#303335]/20 bg-[#f9f9f9] backdrop-blur-xs rounded-t-md p-2">
              {filteredSuggestions.map((match, index) => (
                <p
                  key={index}
                  className={`mb-1 cursor-pointer rounded-sm p-1 ${
                    index === selectedIndex
                      ? "dark:bg-white/20 bg-[#ebebeb]"
                      : ""
                  }`}
                  onClick={() => handleSelection(match)}
                  onKeyDown={(e) => handleKeyDown(e, match)}
                  tabIndex={0}
                >
                  <span className="dark:text-white rounded-md px-2 py-1">
                    {match}
                  </span>
                </p>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col items-center rounded-t-3xl dark:bg-[#303335]/80 bg-neutral-100/70 p-2 w-full backdrop-blur-xs">
          <TextInput
            input={input}
            setInput={setInput}
            height={height}
            onSend={onSend}
            filteredSuggestions={filteredSuggestions}
            selectedIndex={selectedIndex}
            setSelectedIndex={setSelectedIndex}
            handleSelection={handleSelection}
            handleInputChange={handleInputChange}
          />
          <div className="flex flex-row justify-between w-full mt-0">
            <div className="flex flex-row mt-2 dark:text-neutral-200">
              <Popover open={openPopover} onOpenChange={setOpenPopover}>
                <PopoverTrigger>
                  <div className="flex items-center px-2 py-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer space-x-2">
                    <p className="text-sm">{selectedModelName}</p>
                    <ChevronDown className="w-5 h-5" />
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="max-w-2xl p-2 w-[300px] bg-white dark:bg-[#161719]"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium mb-2">Select Model</p>
                    <div className="relative mb-2">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search models..."
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        aria-label="Search models"
                        className="pl-8 w-full py-1.5 px-2 rounded bg-gray-100 dark:bg-neutral-800 text-sm focus:outline-none "
                      />
                    </div>
                    {filteredModels.map((model) => (
                      <div
                        key={model.key}
                        className={`px-2 py-1.5 rounded cursor-pointer ${
                          selectedModel === model.value
                            ? "bg-neutral-200 dark:bg-neutral-800"
                            : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        }`}
                        onClick={() => handleModelSelect(model)}
                      >
                        <p className="text-sm">{model.key}</p>
                      </div>
                    ))}
                    {/* <p className="text-xs dark:text-neutral-400 text-neutral-500">
                      Add Free Gemini API Key for more models{" "}
                      <Link href="/settings" className="text-blue-500">
                        here
                      </Link>
                    </p> */}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex flex-row justify-center items-center">
              <p className="text-xs dark:text-neutral-400 text-neutral-500 mr-3 hidden sm:block">
                Use{" "}
                <span className="dark:text-white text-black">
                  shift + return
                </span>{" "}
                for new line
              </p>
              <Button
                className="p-2 h-[38px] w-[38px] rounded-full dark:bg-neutral-200 bg-neutral-800"
                onClick={() => onSend(input)}
                disabled={disabled}
              >
                {!disabled ? <Send /> : <OctagonPause />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// const popularToolsAndFrameworks: string[] = [
//   "Modal",
//   "Manim",
//   "IndianConstitution",
// ];

const promptSuggestions: string[] = [
  "TravelGuide",
  "StoryTeller",
  "MotivationalCoach",
  "ScreenWriter",
  "CareerCounselor",
  "PromptGenerator",
  "PasswordGenerator",
  "Psychologist",
  "Gaslighter",
  "Yogi",
  "Astrologer",
  "TechWriter",
  "LegalAdvisor",
  "RegexGenerator",
  "StartupIdeaGenerator",
  "ProductManager",
  "DrunkPerson",
  "Rephraser",
  "LinkedinGhostwriter",
  "ProductDemoTweeter",
  "TweetGenerator",
];

// const tools = [
//   "Search",
// ];

const openSourceModels = [
  {
    key: "Gemini 2.5 Flash",
    value: "gemini-2.5-flash-preview-04-17",
  },
  {
    key: "Gemini 2.0 Flash",
    value: "gemini-2.0-flash",
  },
];
