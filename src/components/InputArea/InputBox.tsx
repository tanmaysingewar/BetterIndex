"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  GlobeIcon,
  OctagonPause,
  Send,
  Sparkles,
  Zap,
  Crown,
  ChevronUp,
  Search,
  Paperclip,
  Loader2,
} from "lucide-react";
import { Button } from "../ui/button";
import TextInput from "./TextInput";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  // UploadButton,
  // UploadDropzone,
  useUploadThing,
} from "@/lib/uploadthing";
import { useDropzone } from "@uploadthing/react";
import {
  generateClientDropzoneAccept,
  generatePermittedFileTypes,
} from "uploadthing/client";

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
  fileUrl: string;
  setFileUrl: (value: string) => void;
  fileType: string;
  setFileType: (value: string) => void;
  fileName: string;
  setFileName: (value: string) => void;
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
  fileUrl,
  setFileUrl,
  setFileType,
  fileName,
  setFileName,
}: InputBoxProps) {
  // Model definitions
  const models = [
    {
      id: "gpt-4.1-mini",
      name: "GPT 4.1 Mini",
      description: "Mini model",
      icon: Sparkles,
      available: true,
    },
    {
      id: "google/gemini-2.5-flash-preview-05-20",
      name: "Gemini 2.5 Flash",
      description: "Fast responses",
      icon: Sparkles,
      available: true,
    },
    {
      id: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      description: "Fast responses",
      icon: Zap,
      available: true,
    },
    {
      id: "gpt-4.1",
      name: "GPT 4.1",
      description: "Latest model",
      icon: Sparkles,
      available: false,
    },
    {
      id: "anthropic/claude-sonnet-4",
      name: "Claude 4 Sonnet",
      description: "Pro feature",
      icon: Sparkles,
      available: false,
    },
    {
      id: "anthropic/claude-3.7-sonnet",
      name: "Claude 3.7 Sonnet",
      description: "Pro feature",
      icon: Sparkles,
      available: false,
    },
    {
      id: "anthropic/claude-3.7-sonnet:thinking",
      name: "Claude 3.7 Sonnet: Thinking",
      description: "Pro feature",
      icon: Sparkles,
      available: false,
    },
    {
      id: "deepseek/deepseek-r1-0528",
      name: "DeepSeek R1",
      description: "Reasoning model",
      icon: null,
      available: false,
    },
    {
      id: "google/gemini-2.5-pro-preview",
      name: "Gemini 2.5 Pro",
      description: "Latest model",
      icon: Sparkles,
      available: false,
    },
  ];

  const lastWord = input.split(" ").slice(-1)[0];
  const hasExistingTone = input
    .split(" ")
    .some((word) => word.startsWith("#") && word !== lastWord);

  const filteredSuggestions =
    lastWord.startsWith("#") && !hasExistingTone
      ? promptSuggestions.filter((suggestion) =>
          suggestion
            .toLowerCase()
            .includes(lastWord.trim().replace("#", "").toLowerCase())
        )
      : // .slice(0, 5)
        [];

  const selectedModelData =
    models.find((m) => m.id === selectedModel) || models[0];

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const suggestionsContainerRef = useRef<HTMLDivElement>(null);
  const suggestionItemRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Filter models based on search
  const filteredModels = models.filter(
    (model) =>
      model.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
      model.description.toLowerCase().includes(modelSearch.toLowerCase())
  );

  // Auto-scroll selected item into view
  useEffect(() => {
    if (
      filteredSuggestions.length > 0 &&
      suggestionItemRefs.current[selectedIndex]
    ) {
      suggestionItemRefs.current[selectedIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [selectedIndex, filteredSuggestions.length]);

  // Reset suggestion refs when suggestions change
  useEffect(() => {
    suggestionItemRefs.current = suggestionItemRefs.current.slice(
      0,
      filteredSuggestions.length
    );
  }, [filteredSuggestions]);

  const handleSelection = useCallback(
    (selection: string) => {
      const tokens = input.split(" ");
      const lastToken = tokens[tokens.length - 1];

      if (lastToken.startsWith("#")) {
        const newTokens = tokens.filter((token, index) => {
          // Keep the current token if it's the last one
          if (index === tokens.length - 1) return true;
          // Remove any previous #words
          return !token.startsWith("#");
        });
        newTokens[newTokens.length - 1] = "#" + selection + " ";
        setInput(newTokens.join(" "));
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
    setModelSearch(""); // Clear search when selecting a model
  };

  // Clear search when popover closes
  useEffect(() => {
    if (!isPopoverOpen) {
      setModelSearch("");
    }
  }, [isPopoverOpen]);

  const { startUpload, routeConfig } = useUploadThing("mediaUploader", {
    onClientUploadComplete: (res) => {
      console.log("Upload completed:", res);
      setIsUploading(false);
      if (res && res.length > 0) {
        setFileUrl(res[0].url || "");
        setFileType(res[0].type || "");
      }
    },
    onUploadError: (error) => {
      console.error("Upload error:", error);
      setIsUploading(false);
    },
    onUploadBegin: (file) => {
      console.log("upload has begun for", file);
      setIsUploading(true);
    },
  });

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        startUpload(acceptedFiles);
        setFileName(acceptedFiles[0].name);
      }
    },
    [startUpload]
  );

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: generateClientDropzoneAccept(
      generatePermittedFileTypes(routeConfig).fileTypes
    ),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      console.log(
        "Selected file:",
        file.name,
        "Type:",
        file.type,
        "Size:",
        file.size
      );
      setFileName(file.name);
      startUpload([file]);
      setFileUrl(file.name);
      setFileType(file.type);
      setFileName(file.name);
    }
  };

  return (
    <div>
      <div className="max-w-3xl text-base font-sans lg:px-0 w-screen md:rounded-t-3xl px-2 fixed bottom-0  select-none">
        {filteredSuggestions.length > 0 && (
          <div className="mx-5">
            <div
              ref={suggestionsContainerRef}
              className="bg-[#303335]/20 backdrop-blur-xs rounded-t-md p-2 pb-3 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent no-scrollbar"
            >
              {filteredSuggestions.map((match, index) => (
                <p
                  key={index}
                  ref={(el) => {
                    suggestionItemRefs.current[index] = el;
                  }}
                  className={`mb-1 cursor-pointer rounded-sm p-1 ${
                    index === selectedIndex ? "bg-white/20" : ""
                  }`}
                  onClick={() => handleSelection(match)}
                >
                  <span className="text-white rounded-md px-2 py-1">
                    {match}
                  </span>
                </p>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col items-center rounded-t-3xl dark:bg-[#303335]/80 bg-neutral-100/70 p-2 w-full backdrop-blur-xs">
          {/* PDF Content Indicator */}
          {fileUrl && (
            <div className="w-full mx-3 mb-2">
              <div className="flex items-center justify-between bg-blue-50 dark:bg-[#344f5a]/30 border border-blue-200 dark:border-[#344f5a] rounded-lg px-3 py-2">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-[#344f5a] rounded-full"></div>
                  <span className="text-sm text-[#344f5a] dark:text-blue-300">
                    {fileName}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setFileUrl("");
                    setFileType("");
                    setFileName("");
                  }}
                  className="text-[#7bc2de] dark:text-[#7bc2de] hover:text-[#8fdfff] dark:hover:text-[#8fdfff] text-sm cursor-pointer"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
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
            <div className="flex flex-row mt-2 dark:text-neutral-200 mx-3 justify-center items-center">
              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger className="cursor-pointer">
                  <p className="text-[13px] font-medium dark:text-neutral-400 text-neutral-500 mr-3 flex flex-row items-center">
                    {selectedModelData.name}{" "}
                    <ChevronUp className="w-4 h-4 ml-1" />
                  </p>
                </PopoverTrigger>
                <PopoverContent
                  className="w-80 p-0 dark:bg-neutral-900 bg-white shadow-lg select-none"
                  align="start"
                >
                  <div className="p-2">
                    {/* Upgrade Section */}
                    <div className=" p-3 rounded-lg bg-neutral-100 dark:bg-gradient-to-r dark:from-[#131e20] dark:via-[#1c2a31] dark:to-[#1e2c33] border dark:border-[#3d5b6b]">
                      <h3 className="text-sm font-medium dark:text-white text-gray-900 mb-1">
                        Self-hosted it on Vercel
                      </h3>
                      <div className="flex items-center justify-between">
                        <span className="text-sm dark:text-neutral-400 text-neutral-500">
                          Coming soon
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Search Input */}
                  <div className="">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 dark:text-neutral-400 text-neutral-500" />
                      <input
                        type="text"
                        placeholder="Search models..."
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 text-sm bg-transparent focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Model Options - Scrollable Container */}
                  <div className="overflow-y-auto h-72 p-2 no-scrollbar select-none">
                    <div className="space-y-1">
                      {filteredModels.length > 0 ? (
                        filteredModels.map((model) => {
                          const Icon = model.icon;
                          const isSelected = model.id === selectedModel;
                          return (
                            <div
                              key={model.id}
                              className={`flex items-center justify-between p-2 rounded-lg  cursor-pointer ${
                                !model.available ? "opacity-60" : ""
                              } ${
                                isSelected
                                  ? "bg-neutral-100 dark:bg-[#1d2b30]/80"
                                  : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
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
                        })
                      ) : (
                        <div className="text-center py-4">
                          <p className="text-sm dark:text-neutral-400 text-neutral-500">
                            No models found
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="mt-0 flex flex-row gap-3">
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
                <div
                  className={`flex flex-row items-center justify-center h-[28px] px-2 rounded-full space-x-1.5 border cursor-pointer ${
                    isUploading
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-600"
                      : "bg-transparent text-neutral-500 dark:text-neutral-400 border-neutral-300 dark:border-neutral-400"
                  }`}
                  {...getRootProps()}
                >
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    accept=".txt,.pdf,.doc,.docx"
                    onChange={handleFileUpload}
                    {...getInputProps()}
                    disabled={isUploading}
                  />
                  <label
                    htmlFor="file-upload"
                    className={`flex flex-row items-center space-x-1.5 ${
                      isUploading ? "cursor-wait" : "cursor-pointer"
                    }`}
                  >
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Paperclip className="w-4 h-4" />
                    )}
                    <p className="text-sm select-none">
                      {isUploading ? "Uploading..." : "Upload"}
                    </p>
                  </label>
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

const promptSuggestions: string[] = [];
