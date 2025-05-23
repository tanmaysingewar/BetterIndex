"use client";
import React, { useState, useEffect, useCallback } from "react";
import { OctagonPause, Send } from "lucide-react";
import { Button } from "../ui/button";
import TextInput from "./TextInput";
// import Link from "next/link";

interface InputBoxProps {
  input: string;
  setInput: (value: string) => void;
  onSend: (message: string) => void;
  height: number;
  disabled?: boolean;
}

export default function InputBox({
  input,
  setInput,
  onSend,
  height,
  disabled,
}: InputBoxProps) {
  // Character counting function
  const getCharacterCount = (text: string): number => {
    return text.length;
  };

  const currentCharacterCount = getCharacterCount(input);
  const maxCharacterCount = 3000;

  const [selectedIndex, setSelectedIndex] = useState(0);

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

  useEffect(() => {
    // Only reset selection index when the actual list of suggestions changes
    // We'll compare the current input's last token to determine if suggestions changed
    setSelectedIndex(0);
  }, [input.split(" ").slice(-1)[0]]);

  return (
    <div>
      <div className="max-w-3xl text-base font-sans lg:px-0 w-screen md:rounded-t-3xl px-2 fixed bottom-0">
        <div className="flex flex-col items-center rounded-t-3xl dark:bg-[#303335]/80 bg-neutral-100/70 p-2 w-full backdrop-blur-xs">
          <TextInput
            input={input}
            setInput={setInput}
            height={height}
            onSend={onSend}
            filteredSuggestions={[]}
            selectedIndex={selectedIndex}
            setSelectedIndex={setSelectedIndex}
            handleSelection={handleSelection}
            handleInputChange={handleInputChange}
          />
          <div className="flex flex-row justify-between w-full mt-0">
            <div className="flex flex-row mt-2 dark:text-neutral-200 mx-3">
              <p className="text-sm dark:text-neutral-400 text-neutral-500 mr-3">
                {currentCharacterCount}/{maxCharacterCount}
              </p>
            </div>
            <div className="flex flex-row justify-center items-center">
              <p className="text-xs dark:text-neutral-400 text-neutral-500 mr-3 hidden md:block">
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
