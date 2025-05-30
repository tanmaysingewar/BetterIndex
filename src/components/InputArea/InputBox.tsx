"use client";
import React, { useState, useEffect, useCallback } from "react";
import {
  GlobeIcon,
  OctagonPause,
  Send,
  Sparkles,
  Zap,
  Crown,
  ChevronUp,
} from "lucide-react";
import { Button } from "../ui/button";
import TextInput from "./TextInput";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
// import Link from "next/link";

interface InputBoxProps {
  input: string;
  setInput: (value: string) => void;
  onSend: (message: string) => void;
  height: number;
  disabled?: boolean;
  searchEnabled: boolean;
  onSearchToggle: (enabled: boolean) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export default function InputBox({
  input,
  setInput,
  onSend,
  height,
  disabled,
  searchEnabled,
  onSearchToggle,
  selectedModel,
  onModelChange,
}: InputBoxProps) {
  // Model definitions
  const models = [
    {
      id: "gpt-4.1",
      name: "GPT 4.1",
      description: "Latest model",
      icon: Sparkles,
      available: true,
    },
    {
      id: "gpt-4.1-mini",
      name: "GPT 4.1 Mini",
      description: "Mini model",
      icon: Sparkles,
      available: true,
    },
    {
      id: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      description: "Fast responses",
      icon: Zap,
      available: false,
    },
    {
      id: "claude-3.5-sonnet",
      name: "Claude 3.5 Sonnet",
      description: "Pro feature",
      icon: Sparkles,
      available: false,
    },
    {
      id: "deepseek-r1",
      name: "DeepSeek R1",
      description: "Reasoning model",
      icon: null,
      available: false,
    },
  ];

  const selectedModelData =
    models.find((m) => m.id === selectedModel) || models[0];

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

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

  const handleModelSelect = (modelId: string) => {
    onModelChange(modelId);
    setIsPopoverOpen(false);
  };

  return (
    <div>
      <div className="max-w-3xl text-base font-sans lg:px-0 w-screen md:rounded-t-3xl px-2 fixed bottom-0  select-none">
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
            <div className="flex flex-row mt-2 dark:text-neutral-200 mx-3 justify-center items-center">
              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger className="cursor-pointer">
                  <p className="text-[13px] font-medium dark:text-neutral-400 text-neutral-500 mr-3 flex flex-row items-center">
                    {selectedModelData.name}{" "}
                    <ChevronUp className="w-4 h-4 ml-1" />
                  </p>
                </PopoverTrigger>
                <PopoverContent
                  className="w-80 p-0 dark:bg-neutral-900 bg-white shadow-lg"
                  align="start"
                >
                  <div className="p-4">
                    {/* Upgrade Section */}
                    <div className="mb-4 p-3 rounded-lg dark:bg-neutral-800 bg-neutral-100 border dark:border-neutral-700 border-neutral-300">
                      <h3 className="text-sm font-medium dark:text-white text-gray-900 mb-1">
                        Unlock all models + higher limits
                      </h3>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1">
                          <span className="text-sm dark:text-neutral-400 text-neutral-500">
                            Add to wishlist
                          </span>
                        </div>
                        <Button
                          size="sm"
                          className="dark:bg-neutral-700 dark:hover:bg-neutral-600 bg-neutral-800 hover:bg-neutral-700 text-white"
                        >
                          Wishlist
                        </Button>
                      </div>
                    </div>

                    {/* Model Options */}
                    <div className="space-y-1">
                      {models.map((model) => {
                        const Icon = model.icon;
                        const isSelected = model.id === selectedModel;
                        return (
                          <div
                            key={model.id}
                            className={`flex items-center justify-between p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer ${
                              !model.available ? "opacity-60" : ""
                            } ${
                              isSelected
                                ? "bg-neutral-100 dark:bg-neutral-800"
                                : ""
                            }`}
                            onClick={() =>
                              model.available && handleModelSelect(model.id)
                            }
                          >
                            <div className="flex items-center space-x-3">
                              {Icon ? (
                                <Icon className="w-4 h-4 dark:text-neutral-400 text-neutral-600" />
                              ) : (
                                <div className="w-4 h-4 rounded dark:bg-neutral-600 bg-neutral-400"></div>
                              )}
                              <div>
                                <p className="text-sm font-medium dark:text-white text-gray-900">
                                  {model.name}
                                </p>
                                <p className="text-xs dark:text-neutral-400 text-neutral-500">
                                  {model.description}
                                </p>
                              </div>
                            </div>
                            <div className="flex space-x-1">
                              {isSelected && model.available && (
                                <div className="w-2 h-2 rounded-full dark:bg-neutral-400 bg-neutral-600"></div>
                              )}
                              {!model.available && (
                                <Crown className="w-4 h-4 dark:text-neutral-500 text-neutral-400" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Show All Button */}
                    <div className="mt-4 pt-2 border-t dark:border-neutral-700 border-neutral-200">
                      <button className="w-full text-left p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-between">
                        <span className="text-sm dark:text-neutral-300 text-neutral-600">
                          Show all
                        </span>
                        <svg
                          className="w-4 h-4 dark:text-neutral-400 text-neutral-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="mt-0 flex flex-row ">
                <div
                  className={`flex flex-row items-center justify-center h-[28px] px-2 rounded-full space-x-1.5 border cursor-pointer  ${
                    searchEnabled
                      ? "dark:bg-neutral-100 bg-neutral-300  text-neutral-500 dark:text-neutral-600 border-neutral-300 dark:border-white"
                      : "dark:bg-transparent bg-neutral-100 text-neutral-500 dark:text-neutral-400 border-neutral-300 dark:border-neutral-400"
                  }`}
                  onClick={() => onSearchToggle(!searchEnabled)}
                >
                  <GlobeIcon
                    className={`w-4 h-4 ${
                      searchEnabled
                        ? "dark:text-neutral-600 text-neutral-500"
                        : "dark:text-neutral-400 text-neutral-500"
                    }`}
                  />
                  <p className="text-sm select-none">Search</p>
                </div>
              </div>
            </div>
            <div className="flex flex-row justify-center items-center">
              <p className="text-xs dark:text-neutral-400 text-neutral-500 mr-3 hidden md:block select-none">
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
