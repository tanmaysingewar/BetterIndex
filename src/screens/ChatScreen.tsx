"use client";
import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  memo,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import InputBox, { InputBoxRef } from "@/components/InputArea/InputBox";
import Header from "@/components/Header";
import Spinner from "@/components/Spinner";
import MessageRenderer from "@/components/MessageRenderer";
import { useUserStore } from "@/store/userStore";
import { authClient } from "@/lib/auth-client";
import Cookies from "js-cookie";
import {
  fetchAllChatsAndCache,
  fetchSharedChatsAndCache,
  CHAT_CACHE_UPDATED_EVENT,
} from "@/lib/fetchChats";
import { cn } from "@/lib/utils";
import ChatHistoryDesktop from "@/components/ChatHistoryDesktop";
import Head from "next/head";
import {
  Check,
  CopyIcon,
  Edit3,
  GitBranch,
  Loader2,
  Upload,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { Textarea } from "@/components/ui/textarea";
import models from "@/support/models";
import HeroSection from "@/components/HeroSection";
// import { Button } from "@/components/ui/button";

interface Message {
  role: "user" | "assistant";
  content: string;
  fileUrl?: string;
  fileType?: string;
  fileName?: string;
  imageResponseId?: string; // For tracking OpenAI image generation response IDs
  model?: string; // Model name used for the message
}

const generateChatId = (): string => {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  } else {
    return `fallback-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 15)}`;
  }
};

const decrementRateLimit = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    console.error(
      "localStorage is not available. Cannot decrement rate limit."
    );
    return;
  }

  const storedRateLimit = localStorage.getItem("userRateLimit");

  if (storedRateLimit) {
    const currentRateLimit = parseInt(storedRateLimit, 10);

    if (!isNaN(currentRateLimit) && currentRateLimit > 0) {
      const newRateLimit = currentRateLimit - 1;
      localStorage.setItem("userRateLimit", newRateLimit.toString());
      console.log(`Rate limit decremented to: ${newRateLimit}`);
    } else if (isNaN(currentRateLimit)) {
      console.warn("Rate limit in local storage is not a valid number.");
    } else {
      console.log("Rate limit is already 0 or less, cannot decrement.");
    }
  } else {
    console.warn("Rate limit not found in local storage.");
  }
};

const MESSAGES_UPDATED_EVENT = "messagesUpdated";

const getLocalStorageKey = (chatId: string): string => `chatMessages_${chatId}`;

interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  image?: string | null | undefined;
  isAnonymous?: boolean | null | undefined;
  rateLimit?: string | null | undefined;
}

interface Chat {
  id: string;
  title: string;
  createdAt: string; // Keep this, might be useful for sorting later if needed
}

// Define a specific cache key for all chats
const ALL_CHATS_CACHE_KEY = "chatHistoryCache";

// Define the structure for the data we'll store
interface AllChatsCacheData {
  chats: Chat[];
  totalChats: number; // Store the total count reported by the API
  timestamp: number; // Timestamp of when the cache was created
}

const addChatToCache = (newChat: Chat): boolean => {
  // Check if localStorage is available
  if (typeof window === "undefined" || !window.localStorage) {
    console.error("localStorage is not available. Cannot add chat to cache.");
    return false;
  }

  console.log(`Attempting to add chat (ID: ${newChat.id}) to cache...`);

  try {
    // --- Step 1: Retrieve existing cache data ---
    const existingCacheJson = localStorage.getItem("chatHistoryCache");
    console.log("Existing cache data:", existingCacheJson);
    let cacheData: AllChatsCacheData;

    if (existingCacheJson) {
      // --- Step 2a: Parse existing cache ---
      try {
        cacheData = JSON.parse(existingCacheJson);
        // Basic validation of existing cache structure
        if (!cacheData || !Array.isArray(cacheData.chats)) {
          console.warn(
            "Existing cache data is corrupted. Creating a new cache."
          );
          // Treat as if cache didn't exist
          cacheData = {
            chats: [],
            totalChats: 0,
            timestamp: Date.now(),
          };
        }
      } catch (parseError) {
        console.error("Failed to parse existing cache data:", parseError);
        // Optionally clear the corrupted cache
        // localStorage.removeItem(ALL_CHATS_CACHE_KEY);
        // Proceed to create a new cache below
        cacheData = {
          chats: [],
          totalChats: 0,
          timestamp: Date.now(),
        };
      }

      // --- Step 3a: Check for duplicate and add/update chat ---
      const existingChatIndex = cacheData.chats.findIndex(
        (chat) => chat.id === newChat.id
      );

      if (existingChatIndex >= 0) {
        // Update existing chat (for edited messages with same ID)
        cacheData.chats[existingChatIndex] = newChat;
        console.log(`Updated existing chat (ID: ${newChat.id}) in cache`);
      } else {
        // Add new chat to the beginning
        cacheData.chats.unshift(newChat);
        cacheData.totalChats += 1; // Only increment for truly new chats
        console.log(
          `Added new chat to cache. New total: ${cacheData.totalChats}`
        );
      }

      cacheData.timestamp = Date.now(); // Update timestamp
    } else {
      // --- Step 2b/3b: Create new cache if none exists ---
      console.log("No existing cache found. Creating a new one.");
      cacheData = {
        chats: [newChat], // Start with the new chat
        totalChats: 1, // Total is now 1
        timestamp: Date.now(),
      };
    }

    // --- Step 4: Store the updated data back in localStorage ---
    try {
      localStorage.setItem(ALL_CHATS_CACHE_KEY, JSON.stringify(cacheData));
      console.log(
        `Successfully updated cache with chat (ID: ${newChat.id}) under key "${ALL_CHATS_CACHE_KEY}".`
      );

      // Dispatch a storage event to notify other components of the change
      // This will be picked up by the event listener in ChatHistoryDesktop
      try {
        // The storage event only fires in other tabs/windows by default
        // To make it work in the same tab, we need to manually dispatch an event
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: ALL_CHATS_CACHE_KEY,
            newValue: JSON.stringify(cacheData),
            storageArea: localStorage,
          })
        );
        console.log("Dispatched storage event for chat history update");
      } catch (eventError) {
        console.error("Failed to dispatch storage event:", eventError);
        // Continue anyway since the localStorage was updated successfully
      }

      return true;
    } catch (storageError) {
      console.error(
        "Failed to save updated cache to localStorage:",
        storageError
      );
      if (
        storageError instanceof Error &&
        storageError.name === "QuotaExceededError"
      ) {
        console.error(
          "LocalStorage quota exceeded. Unable to save updated cache."
        );
        // Optional: Implement cache eviction strategy here if needed
      }
      // Revert the in-memory changes if save fails? Depends on desired behavior.
      // For simplicity, we don't revert here, but the function returns false.
      return false;
    }
  } catch (error) {
    // Catch any unexpected errors during the process
    console.error(
      "An unexpected error occurred while adding chat to cache:",
      error
    );
    return false;
  }
};

// Add this constant near the top where other constants are defined
const SHARED_CHATS_CACHE_KEY = "sharedChatHistoryCache";

interface ChatPageProps {
  sessionDetails: {
    user: User | null; // Allow user to be null within sessionDetails
  } | null;
  isNewUser: boolean;
  isAnonymous: boolean;
}

export default function ChatPage({
  sessionDetails,
  isNewUser,
  isAnonymous,
}: ChatPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [chatInitiated, setChatInitiated] = useState<boolean>(false);
  const [input, setInput] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<
    "searching" | "generating" | null
  >(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [searchEnabled, setSearchEnabled] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>(
    "openai/gpt-4.1-mini"
  );
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const { user, setUser, refreshSession } = useUserStore();
  const [chatTitle, setChatTitle] = useState<string>("Better Index");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const serverFetchInitiated = useRef<Record<string, boolean>>({});
  // Ref to track the initial message being processed by handleSendMessage
  const processingInitialMessageRef = useRef<string | null>(null);
  // Ref for InputBox to enable focus functionality
  const inputBoxRef = useRef<InputBoxRef>(null);

  const anonymousSignInAttempted = useRef(false); // <-- Add this ref
  const [isChatHistoryOpen, setIsChatHistoryOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [CopyClicked, setCopyClicked] = useState(false);
  const [chatShared, setChatShared] = useState(false);
  const [chatShareLoading, setChatShareLoading] = useState(false);
  const [sharedChatId, setSharedChatId] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(() => {
    // Initialize as true if we need to do anonymous sign-in
    const userAlreadySet =
      typeof window !== "undefined" ? Cookies.get("user-status") : null;
    return isNewUser && !user && !userAlreadySet;
  });
  const [messagesLoadedFromLocalStorage, setMessagesLoadedFromLocalStorage] =
    useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      const userAlreadySet = Cookies.get("user-status");
      // Condition for anonymous sign-in
      // Check the ref *before* attempting sign-in
      if (
        isNewUser &&
        !user &&
        !userAlreadySet &&
        !anonymousSignInAttempted.current
      ) {
        setIsAuthenticating(true); // Set loading state
        anonymousSignInAttempted.current = true; // <-- Set the ref immediately
        console.log("Attempting Anonymous User creation on CI - fetchData"); // Updated log

        try {
          const userResult = await authClient.signIn.anonymous(); // API call
          if (userResult?.data?.user) {
            console.log("Anonymous user created, setting state and cookie."); // Added log
            console.log(userResult.data.user);
            setUser(userResult.data.user); // State Update
            // Return the promise from Cookies.set
            Cookies.set("user-status", "guest", { expires: 7 });
          } else {
            console.warn("Anonymous sign-in failed or returned no user.");
            // Reset the ref if the sign-in *fails* structurally, allowing a retry maybe?
            // Or handle the error state appropriately. For now, we leave it true.
            // anonymousSignInAttempted.current = false;
          }
        } catch (error) {
          console.error("Error during anonymous sign-in:", error);
        } finally {
          setIsAuthenticating(false); // Clear loading state
        }
      } else if (user && !userAlreadySet && (isNewUser || isAnonymous)) {
        // If user exists in state but cookie is missing (e.g., after state update), set cookie
        console.log("User exists in state, setting guest cookie.");
        Cookies.set("user-status", "guest", { expires: 7 });
      } else if (user && !userAlreadySet && !isNewUser && !isAnonymous) {
        console.log("User exists in state, setting user cookie.");
        Cookies.set("user-status", "user", { expires: 7 });
        console.log(user);
      }

      // Condition for handling existing session (might run on the second pass)
      if (sessionDetails?.user && !user) {
        // Only set if user state isn't already set
        console.log("Setting user from sessionDetails.");
        setUser(sessionDetails.user); // State Update 2 (potentially)
        // Cookie setting logic moved slightly to avoid redundant sets
        if (!isNewUser && !isAnonymous && !userAlreadySet) {
          console.log("Setting user cookie based on session.");
          Cookies.set("user-status", "user", { expires: 7 });
        }
        if (isAnonymous && !userAlreadySet) {
          console.log("Setting guest cookie based on session (anonymous).");
          Cookies.set("user-status", "guest", { expires: 7 });
        }
      }
    }

    fetchData();
    // Dependency array remains the same. The ref handles the execution logic.
  }, [user, isNewUser, setUser, isAnonymous, sessionDetails]);

  // useLayoutEffect to scroll to bottom when messages are loaded from localStorage
  useLayoutEffect(() => {
    if (messagesLoadedFromLocalStorage && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({
        behavior: "instant",
        block: "end",
      });
      setMessagesLoadedFromLocalStorage(false); // Reset the flag
    }
  }, [messagesLoadedFromLocalStorage]);

  useEffect(() => {
    // Don't proceed if authentication is in progress
    if (isAuthenticating) {
      console.log("Authentication in progress, delaying navigation actions");
      return;
    }

    if (typeof window !== "undefined") {
      const navigationEntries =
        window.performance.getEntriesByType("navigation");
      if (navigationEntries.length > 0) {
        const navigationEntry =
          navigationEntries[0] as PerformanceNavigationTiming;
        const chatIdFromUrl = searchParams.get("chatId") || undefined;

        // Fetch chats on both initial load and reload
        if (
          navigationEntry.type === "reload" ||
          navigationEntry.type === "navigate"
        ) {
          try {
            async function updateChatCache() {
              setIsLoadingChats(true);
              refreshSession();
              const success = await fetchAllChatsAndCache();
              await fetchSharedChatsAndCache();
              if (success) {
                console.log("Chat cache updated.");
              } else {
                console.error("Failed to update chat cache.");
              }
              setIsLoadingChats(false);
            }
            updateChatCache();
          } catch (error) {
            console.error("Error updating chat cache:", error);
            setIsLoadingChats(false);
          }
        }

        if (navigationEntry.type === "reload" && chatIdFromUrl) {
          const fetchMessagesFromServer = async (chatIdToFetch: string) => {
            serverFetchInitiated.current[chatIdToFetch] = true;
            console.log(
              `Fetching messages from server for chatId: ${chatIdToFetch}`
            );

            const shared = searchParams.get("shared") || false;

            try {
              const response = await fetch(
                `/api/messages?chatId=${chatIdToFetch}&shared=${shared}`
              );

              if (!response.ok) {
                console.error(`Error fetching messages: ${response.status}`); // Add this
                return router.push("/chat");
              }

              const fetchedMessages: Message[] = await response.json();
              console.log("Fetched messages:", fetchedMessages); // Add this

              const finalMessagesFromServer =
                fetchedMessages.length === 0
                  ? [
                      {
                        role: "assistant" as const,
                        content: "How can I help you?",
                      },
                    ]
                  : fetchedMessages;
              setMessages(finalMessagesFromServer);

              // Trigger scroll to bottom when messages are loaded from server
              setMessagesLoadedFromLocalStorage(true);

              try {
                localStorage.setItem(
                  getLocalStorageKey(chatIdToFetch),
                  JSON.stringify(finalMessagesFromServer)
                );
                dispatchMessagesUpdatedEvent(
                  getLocalStorageKey(chatIdToFetch),
                  JSON.stringify(finalMessagesFromServer)
                );
              } catch (lsError) {
                console.error("Error updating Local Storage:", lsError);
              }
            } catch (error) {
              console.error(
                "Error fetching initial messages from server:",
                error
              );
            } finally {
              processingInitialMessageRef.current = null;
            }
          };
          fetchMessagesFromServer(chatIdFromUrl);
          // fetchMessages(chatIdFromUrl); // Fetch on component mount
        } else {
          console.log("Page was not reloaded");
        }
      }
    }
  }, [isAuthenticating]);

  // Effect: Fetch chats on initial load when user is authenticated
  useEffect(() => {
    // Don't proceed if authentication is in progress
    if (isAuthenticating) {
      console.log("Authentication in progress, delaying chat fetch");
      return;
    }

    // Only fetch if user is set and we haven't loaded chats yet
    if (user && !isLoadingChats) {
      // Check if we already have chats in cache
      const existingCache = localStorage.getItem(ALL_CHATS_CACHE_KEY);
      const sharedCache = localStorage.getItem(SHARED_CHATS_CACHE_KEY);

      // If no cache exists, fetch chats immediately
      if (!existingCache || !sharedCache) {
        console.log("No chat cache found, fetching chats on initial load");
        try {
          async function initialChatFetch() {
            setIsLoadingChats(true);
            const success = await fetchAllChatsAndCache();
            await fetchSharedChatsAndCache();
            if (success) {
              console.log("Initial chat cache populated.");
            } else {
              console.error("Failed to populate initial chat cache.");
            }
            setIsLoadingChats(false);
          }
          initialChatFetch();
        } catch (error) {
          console.error("Error during initial chat fetch:", error);
          setIsLoadingChats(false);
        }
      }
    }
  }, [user, isAuthenticating, isLoadingChats]);

  // Effect 1: Set initial chat ID from URL & Load from Local Storage
  useEffect(() => {
    // Don't proceed if authentication is in progress
    if (isAuthenticating) {
      console.log("Authentication in progress, delaying chat loading");
      return;
    }

    const chatIdFromUrl = searchParams.get("chatId") || undefined;
    console.log("chatIdFromUrl:", chatIdFromUrl); // Add this

    if (chatIdFromUrl && chatIdFromUrl !== currentChatId) {
      setCurrentChatId(chatIdFromUrl);
      console.log("Setting currentChatId to:", chatIdFromUrl); // Add this
      setChatInitiated(false);
      setMessagesLoadedFromLocalStorage(false); // Reset the flag when switching chats
      serverFetchInitiated.current = {};

      let foundInLs = false;
      try {
        const storedMessages = localStorage.getItem(
          getLocalStorageKey(chatIdFromUrl)
        );
        if (storedMessages) {
          const parsedMessages: Message[] = JSON.parse(storedMessages);
          if (Array.isArray(parsedMessages)) {
            setMessages(parsedMessages); // Set state from LS
            foundInLs = true;
            setMessagesLoadedFromLocalStorage(true); // Set flag to trigger scroll

            // Get chat title from cache
            const chatCache = localStorage.getItem("chatHistoryCache");
            if (chatCache) {
              const parsedCache = JSON.parse(chatCache);
              const chat = parsedCache.chats.find(
                (c: Chat) => c.id === chatIdFromUrl
              );
              if (chat) {
                setChatTitle(chat.title);
              }
            }
          } else {
            console.warn(
              "Invalid data format in Local Storage for",
              chatIdFromUrl
            );
            localStorage.removeItem(getLocalStorageKey(chatIdFromUrl));
          }
        } else {
          const fetchMessagesFromServer = async (chatIdToFetch: string) => {
            serverFetchInitiated.current[chatIdToFetch] = true;
            console.log(
              `Fetching messages from server for chatId: ${chatIdToFetch}`
            );

            const shared = searchParams.get("shared") || false;

            try {
              const response = await fetch(
                `/api/messages?chatId=${chatIdToFetch}&shared=${shared}`
              );

              if (!response.ok) {
                console.error(`Error fetching messages: ${response.status}`); // Add this
                throw new Error(`HTTP error! Status: ${response.status}`);
              }

              const fetchedMessages: Message[] = await response.json();
              console.log("Fetched messages:", fetchedMessages); // Add this

              const finalMessagesFromServer =
                fetchedMessages.length === 0
                  ? [
                      {
                        role: "assistant" as const,
                        content: "How can I help you?",
                      },
                    ]
                  : fetchedMessages;

              // Set messages and trigger scroll to bottom
              setMessages(finalMessagesFromServer);
              setMessagesLoadedFromLocalStorage(true); // Trigger scroll using the same mechanism

              try {
                localStorage.setItem(
                  getLocalStorageKey(chatIdToFetch),
                  JSON.stringify(finalMessagesFromServer)
                );
                dispatchMessagesUpdatedEvent(
                  getLocalStorageKey(chatIdToFetch),
                  JSON.stringify(finalMessagesFromServer)
                );
              } catch (lsError) {
                console.error("Error updating Local Storage:", lsError);
              }
            } catch (error) {
              console.error(
                "Error fetching initial messages from server:",
                error
              );
            } finally {
              processingInitialMessageRef.current = null;
            }
          };
          fetchMessagesFromServer(chatIdFromUrl);
        }
      } catch (error) {
        console.error("Error loading chat from Local Storage:", error);
        localStorage.removeItem(getLocalStorageKey(chatIdFromUrl));
      }

      if (!foundInLs) {
        setMessages([]);
      }
    } else if (!chatIdFromUrl) {
      console.warn("No chat ID found in URL parameters.");
      // Optional: Redirect or handle base route
    }
  }, [searchParams, currentChatId, isGenerating, isAuthenticating]);

  // Effect 3: Scroll to bottom
  useEffect(() => {
    // Only scroll during active chat interactions, not initial loads
    if (chatInitiated && isGenerating) {
      if (
        messages[messages.length - 1]?.role === "assistant" &&
        messages[messages.length - 1]?.content === "loading"
      ) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }

    // Scroll during message streaming
    if (chatInitiated && !isGenerating && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (
        lastMessage?.role === "assistant" &&
        lastMessage?.content &&
        lastMessage.content !== "loading"
      ) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages, chatInitiated, isGenerating]);

  // --- Message Sending Logic ---
  const dispatchMessagesUpdatedEvent = (key: string, value: string) => {
    window.dispatchEvent(
      new CustomEvent(MESSAGES_UPDATED_EVENT, {
        detail: { key, newValue: value },
      })
    );
  };

  // Helper function to find the last image response ID for multi-turn image generation
  const getLastImageResponseId = (messages: Message[]): string | null => {
    // Look through messages in reverse order to find the most recent image response ID
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === "assistant" && message.imageResponseId) {
        console.log(
          "Found previous image response ID:",
          message.imageResponseId
        );
        return message.imageResponseId;
      }
    }
    console.log("No previous image response ID found");
    return null;
  };

  const handleSendMessage = useCallback(
    async (
      messageContent: string,
      editedMessage: boolean,
      messagesUpToEdit?: Message[]
    ) => {
      const trimmedMessage = messageContent.trim();
      if (!trimmedMessage || isGenerating || isAuthenticating) return;

      setIsGenerating(true);

      // Set appropriate loading phase based on model
      const isImageGenerationModel = selectedModel === "openai/gpt-image-1";
      if (isImageGenerationModel) {
        setLoadingPhase("generating");
      } else {
        setLoadingPhase("searching");
        // Add a timeout to switch to generating phase after 2 seconds for regular chat
        setTimeout(() => {
          setLoadingPhase("generating");
        }, 3000);
      }

      setInput("");

      let chatIdForRequest = currentChatId;
      let isNewChat = false;
      let messagesBeforeOptimisticUpdate: Message[] = []; // Capture state before optimistic update

      if (!chatIdForRequest) {
        isNewChat = true;
        chatIdForRequest = generateChatId();
        setCurrentChatId(chatIdForRequest);
        const newUrl = `/chat?chatId=${chatIdForRequest}`;
        window.history.pushState({}, "", newUrl);
        setMessages([]); // Start clean for new chat UI
        setChatInitiated(true);
        serverFetchInitiated.current = { [chatIdForRequest]: true };
        messagesBeforeOptimisticUpdate = []; // History is empty
      } else {
        // For existing chats, capture the current state *before* adding the new user message
        // If this is an edited message, use the provided messagesUpToEdit
        if (editedMessage && messagesUpToEdit) {
          messagesBeforeOptimisticUpdate = messagesUpToEdit;
        } else {
          // Use the state directly, as functional update below handles concurrency
          // messagesBeforeOptimisticUpdate = messages; // This might be stale, functional update is better
        }
        setChatInitiated(true);
      }

      const newUserMessage: Message = {
        role: "user",
        content: trimmedMessage,
        ...(fileUrl && {
          fileUrl,
          fileType: fileType || undefined,
          fileName: fileName || undefined,
        }),
        model: selectedModel,
      };

      // --- Optimistic UI Update (using functional form) ---
      // This ensures we append to the *very latest* state, preventing race conditions
      // with Effect 1 (LS) or Effect 2 (Server) setting state.
      setMessages((prevMessages) => {
        // For edited messages, we already have the correct state, so just capture it
        if (editedMessage && messagesUpToEdit) {
          // Don't update messagesBeforeOptimisticUpdate here since it's already set correctly above
          // Prevent adding duplicates if called rapidly
          if (
            prevMessages.length > 0 &&
            prevMessages[prevMessages.length - 1].role === "user" &&
            prevMessages[prevMessages.length - 1].content === trimmedMessage
          ) {
            return prevMessages;
          }
          return [...prevMessages, newUserMessage];
        } else {
          messagesBeforeOptimisticUpdate = prevMessages; // Capture the state right before update
          // Prevent adding duplicates if called rapidly
          if (
            prevMessages.length > 0 &&
            prevMessages[prevMessages.length - 1].role === "user" &&
            prevMessages[prevMessages.length - 1].content === trimmedMessage
          ) {
            return prevMessages;
          }
          return [...prevMessages, newUserMessage];
        }
      });
      // --- End Optimistic Update ---
      //
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "loading" },
      ]);

      // Prepare request
      const requestHeaders = new Headers({
        "Content-Type": "application/json",
        // Send the determined chat ID (new or existing) to the backend
        "X-Chat-ID": chatIdForRequest,
      });

      let requestBody = {};

      console.log("File URL:", fileUrl);

      if (fileUrl) {
        console.log("File uploaded");
        console.log("fileUrl:", fileUrl);
        console.log("fileType:", fileType);
        console.log("fileName:", fileName);
        requestBody = {
          message: trimmedMessage,
          previous_conversations: isNewChat
            ? []
            : editedMessage && messagesUpToEdit
            ? messagesUpToEdit
            : messages,
          search_enabled: searchEnabled,
          model: selectedModel,
          fileUrl: fileUrl,
          fileType: fileType,
          fileName: fileName,
          openrouter_api_key:
            localStorage.getItem("openrouter_api_key") == ""
              ? ""
              : localStorage.getItem("openrouter_api_key"),
          openai_api_key:
            localStorage.getItem("openai_api_key") == ""
              ? ""
              : localStorage.getItem("openai_api_key"),
          anthropic_api_key:
            localStorage.getItem("anthropic_api_key") == ""
              ? ""
              : localStorage.getItem("anthropic_api_key"),
          google_api_key:
            localStorage.getItem("google_api_key") == ""
              ? ""
              : localStorage.getItem("google_api_key"),
        };
      } else {
        console.log("No file uploaded");
        requestBody = {
          message: trimmedMessage,
          previous_conversations: isNewChat
            ? []
            : editedMessage && messagesUpToEdit
            ? messagesUpToEdit
            : messages,
          search_enabled: searchEnabled,
          model: selectedModel,
          fileUrl: "",
          fileType: "",
          fileName: "",
          openrouter_api_key:
            localStorage.getItem("openrouter_api_key") == ""
              ? ""
              : localStorage.getItem("openrouter_api_key"),
          openai_api_key:
            localStorage.getItem("openai_api_key") == ""
              ? ""
              : localStorage.getItem("openai_api_key"),
          anthropic_api_key:
            localStorage.getItem("anthropic_api_key") == ""
              ? ""
              : localStorage.getItem("anthropic_api_key"),
          google_api_key:
            localStorage.getItem("google_api_key") == ""
              ? ""
              : localStorage.getItem("google_api_key"),
        };
      }

      setFileUrl("");
      setFileType("");
      setFileName("");

      try {
        // Check if the selected model is the image generation model
        const isImageGenerationModel = selectedModel === "openai/gpt-image-1";

        let response;
        if (isImageGenerationModel) {
          // Get the last image response ID for multi-turn context
          const currentMessages =
            editedMessage && messagesUpToEdit ? messagesUpToEdit : messages;
          const lastImageResponseId = getLastImageResponseId(currentMessages);

          console.log("Image generation request:", {
            isNewChat,
            currentMessagesCount: currentMessages.length,
            lastImageResponseId,
            prompt: trimmedMessage.slice(0, 100),
          });

          // Use the image generation API
          response = await fetch(
            `/api/generate-image?shared=${
              searchParams.get("shared") || false
            }&editedMessage=${editedMessage}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Chat-ID": chatIdForRequest,
              },
              body: JSON.stringify({
                messages: isNewChat
                  ? [{ role: "user", content: trimmedMessage }]
                  : editedMessage && messagesUpToEdit
                  ? [
                      ...messagesUpToEdit,
                      { role: "user", content: trimmedMessage },
                    ]
                  : [...messages, { role: "user", content: trimmedMessage }],
                previous_image_response_id: lastImageResponseId,
                // Include file information for input images
                fileUrl: fileUrl || "",
                fileType: fileType || "",
                fileName: fileName || "",
                openrouter_api_key: localStorage.getItem("openrouter_api_key"),
                openai_api_key: localStorage.getItem("openai_api_key"),
                anthropic_api_key: localStorage.getItem("anthropic_api_key"),
                google_api_key: localStorage.getItem("google_api_key"),
              }),
            }
          );
        } else {
          // Make the LLM provider dynamic for regular chat
          response = await fetch(
            `/api/openai?shared=${
              searchParams.get("shared") || false
            }&editedMessage=${editedMessage}`,
            {
              method: "POST",
              headers: requestHeaders,
              body: JSON.stringify(requestBody),
            }
          );
        }

        if (!response.ok) {
          let errorMsg = `Network response was not ok (${response.status})`;
          try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
            setIsGenerating(false);
            setLoadingPhase(null);
          } catch (e) {
            console.error("Failed to parse error response:", e);
          }

          const currentChatId = searchParams.get("chatId");

          if (currentChatId === chatIdForRequest) {
            // remove the last message from setMessages
            setMessages((prevMessages) => {
              if (prevMessages.length === 0) {
                return prevMessages;
              }
              return prevMessages.slice(0, -1);
            });
          }

          // Revert optimistic update on error
          if (isNewChat) {
            // If the *first* message failed, maybe revert URL/state?
            // This is complex. For now, we keep the new URL/ID.
            console.warn(
              "First message failed for new chat ID:",
              chatIdForRequest
            );
            // Optionally clear the failed user message:
            // setMessages([]);
            // setCurrentChatId(null); // Or revert? Needs careful thought.
            // router.push('/chat'); // Or back?
          }
          throw new Error(errorMsg);
        }

        if (isImageGenerationModel) {
          // Handle image generation response
          const imageData = await response.json();

          console.log("Image generation response:", {
            url: imageData.url,
            response_id: imageData.response_id,
            hasResponseId: !!imageData.response_id,
          });

          // Get the header of the response (similar to regular chat)
          const get_header = response.headers.get("X-Title");
          const newChatId = response.headers.get("X-New-Chat-ID");
          const convertedFromShared =
            response.headers.get("X-Converted-From-Shared") === "true";

          console.log("X-Title", get_header);
          console.log("X-New-Chat-ID", newChatId);
          console.log("X-Converted-From-Shared", convertedFromShared);

          // Handle shared chat conversion to personal chat
          if (convertedFromShared && newChatId) {
            // Update the chat ID for the current conversation
            chatIdForRequest = newChatId;
            setCurrentChatId(newChatId);

            // Update URL to remove shared parameter and use new chat ID
            const newUrl = `/chat?chatId=${newChatId}`;
            window.history.pushState({}, "", newUrl);

            console.log(
              `Shared chat converted to personal chat with ID: ${newChatId}`
            );
          }

          if (
            get_header &&
            (!searchParams.get("shared") || convertedFromShared)
          ) {
            const chat = {
              id: chatIdForRequest,
              title: get_header!,
              createdAt: new Date().toString(),
            };

            const added = addChatToCache(chat);
            document.title = get_header;
            setChatTitle(get_header); // Update the chatTitle state

            if (added) {
              console.log("Chat successfully added to the local cache.");
            } else {
              console.log("Failed to add chat to the local cache.");
            }
          } else if (
            get_header &&
            searchParams.get("shared") &&
            !convertedFromShared
          ) {
            // For shared chats that remain shared, just update the title without caching
            document.title = get_header;
            setChatTitle(get_header);
          }

          // Create the final assistant message with the image
          const finalAssistantMessage: Message = {
            role: "assistant",
            content: `![Generated Image](${imageData.url})`,
            imageResponseId: imageData.response_id, // Store the response ID for multi-turn context
            model: selectedModel,
          };

          // Calculate the definitive final state
          const finalMessagesState = [
            ...messagesBeforeOptimisticUpdate,
            newUserMessage,
            finalAssistantMessage,
          ];

          const currentChatId = searchParams.get("chatId");

          if (currentChatId === chatIdForRequest) {
            // Remove the loading message
            setMessages((prevMessages) => {
              if (prevMessages.length === 0) {
                return prevMessages;
              }
              return prevMessages.slice(0, -1);
            });

            // Set the final state
            setMessages(finalMessagesState);
            decrementRateLimit();
          }

          // Save to localStorage (save for personal chats and converted shared chats)
          const currentSharedStatus = searchParams.get("shared");
          const shouldSaveToLocalStorage =
            !currentSharedStatus || convertedFromShared;

          if (shouldSaveToLocalStorage) {
            try {
              localStorage.setItem(
                getLocalStorageKey(chatIdForRequest),
                JSON.stringify(finalMessagesState)
              );
              dispatchMessagesUpdatedEvent(
                getLocalStorageKey(chatIdForRequest),
                JSON.stringify(finalMessagesState)
              );

              // Only update URL if it hasn't been updated already by the conversion logic
              if (!convertedFromShared) {
                const currentSearchParams = new URLSearchParams(
                  window.location.search
                );
                currentSearchParams.set("chatId", chatIdForRequest);
                currentSearchParams.delete("shared");
                window.history.pushState(
                  {},
                  "",
                  `/chat?${currentSearchParams}`
                );
              }
            } catch (lsError) {
              console.error(
                "Error saving final messages to Local Storage:",
                lsError
              );
            }
          }
        } else {
          // Handle regular chat streaming response
          // Get the header of the response
          const get_header = response.headers.get("X-Title");
          const newChatId = response.headers.get("X-New-Chat-ID");
          const convertedFromShared =
            response.headers.get("X-Converted-From-Shared") === "true";

          console.log("X-Title", get_header);
          console.log("X-New-Chat-ID", newChatId);
          console.log("X-Converted-From-Shared", convertedFromShared);

          // Handle shared chat conversion to personal chat
          if (convertedFromShared && newChatId) {
            // Update the chat ID for the current conversation
            chatIdForRequest = newChatId;
            setCurrentChatId(newChatId);

            // Update URL to remove shared parameter and use new chat ID
            const newUrl = `/chat?chatId=${newChatId}`;
            window.history.pushState({}, "", newUrl);

            console.log(
              `Shared chat converted to personal chat with ID: ${newChatId}`
            );
          }

          if (
            get_header &&
            (!searchParams.get("shared") || convertedFromShared)
          ) {
            const chat = {
              id: chatIdForRequest,
              title: get_header!,
              createdAt: new Date().toString(),
            };

            const added = addChatToCache(chat);
            document.title = get_header;
            setChatTitle(get_header); // Update the chatTitle state

            if (added) {
              console.log("Chat successfully added to the local cache.");
            } else {
              console.log("Failed to add chat to the local cache.");
            }
          } else if (
            get_header &&
            searchParams.get("shared") &&
            !convertedFromShared
          ) {
            // For shared chats that remain shared, just update the title without caching
            document.title = get_header;
            setChatTitle(get_header);
          }
          const reader = response.body?.getReader();

          const currentChatId = searchParams.get("chatId");
          if (currentChatId === chatIdForRequest) {
            if (!reader) {
              setMessages(messagesBeforeOptimisticUpdate); // Revert
              throw new Error("No reader available");
            }

            // remove the last message from setMessages
            // To remove the last message:
            setMessages((prevMessages) => {
              // Check if there are any messages to remove
              if (prevMessages.length === 0) {
                return prevMessages; // Return the empty array if no messages exist
              }
              // Create a new array containing all elements except the last one
              return prevMessages.slice(0, -1);
            });

            // Add placeholder for assistant message using functional update
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "" },
            ]);
          }

          if (!reader) {
            throw new Error("No reader available");
          }

          const decoder = new TextDecoder();
          let accumulatedText = "";
          while (true) {
            const { done, value } = await reader?.read();
            if (done) break;
            accumulatedText += decoder.decode(value, { stream: true });

            // Create the current assistant message with accumulated content
            const currentAssistantMessage: Message = {
              role: "assistant",
              content: accumulatedText,
              model: selectedModel,
            };

            // Calculate current state for localStorage
            const currentMessagesState = [
              ...messagesBeforeOptimisticUpdate,
              newUserMessage,
              currentAssistantMessage,
            ];

            const currentChatId = searchParams.get("chatId");
            if (currentChatId === chatIdForRequest) {
              // Update the streaming content using functional update
              setMessages((prev) => {
                if (prev.length === 0) return prev; // Should not happen
                const updatedMessages = [...prev];
                const lastMsgIndex = updatedMessages.length - 1;
                // Ensure we are updating the last message and it's the assistant placeholder/stream
                if (updatedMessages[lastMsgIndex].role === "assistant") {
                  updatedMessages[lastMsgIndex].content = accumulatedText;
                }
                return updatedMessages;
              });
            }

            // Save current state to localStorage after each chunk (save for personal chats and converted shared chats)
            const shouldSaveStreaming =
              !searchParams.get("shared") || convertedFromShared;
            if (shouldSaveStreaming) {
              try {
                localStorage.setItem(
                  getLocalStorageKey(chatIdForRequest),
                  JSON.stringify(currentMessagesState)
                );
                dispatchMessagesUpdatedEvent(
                  getLocalStorageKey(chatIdForRequest),
                  JSON.stringify(currentMessagesState)
                );
              } catch (lsError) {
                console.error(
                  "Error saving streaming chunk to Local Storage:",
                  lsError
                );
                // Continue streaming even if localStorage fails
              }
            }
          }

          // --- Final State Update & Local Storage ---
          const finalAssistantMessage: Message = {
            role: "assistant",
            content: accumulatedText || " ", // Use space if empty
            model: selectedModel,
          };

          // Calculate the definitive final state based on the state *before* the placeholder was added
          // This ensures consistency even if rapid updates occurred.
          const finalMessagesState = [
            ...messagesBeforeOptimisticUpdate, // Start with state before optimistic user msg
            newUserMessage, // Add the user message
            finalAssistantMessage, // Add the final assistant message
          ];

          // Set the final state
          setMessages(finalMessagesState);
          decrementRateLimit();

          // Save the definitive final state to Local Storage (save for personal chats and converted shared chats)
          const shouldSaveFinal =
            !searchParams.get("shared") || convertedFromShared;
          if (shouldSaveFinal) {
            try {
              localStorage.setItem(
                getLocalStorageKey(chatIdForRequest),
                JSON.stringify(finalMessagesState) // Save the calculated final state
              );
              dispatchMessagesUpdatedEvent(
                getLocalStorageKey(chatIdForRequest),
                JSON.stringify(finalMessagesState)
              );

              // Only update URL if it hasn't been updated already by the conversion logic
              if (!convertedFromShared) {
                const currentSearchParams = new URLSearchParams(
                  window.location.search
                );
                currentSearchParams.set("chatId", chatIdForRequest);
                currentSearchParams.delete("shared");
                window.history.pushState(
                  {},
                  "",
                  `/chat?${currentSearchParams}`
                );
              }
            } catch (lsError) {
              console.error(
                "Error saving final messages to Local Storage:",
                lsError
              );
            }
          }
        }
      } catch (error) {
        // console.error("Error sending message:", error);
        // Update UI with error, keeping user message but removing potential placeholder

        // Raise a tost

        setMessages((prev) => {
          const currentMessages = prev.filter(
            (m) => !(m.role === "assistant" && m.content === "")
          );
          // Ensure the user message that caused the error is still present
          const userMessageExists = currentMessages.some(
            (m) => m.role === "user" && m.content === trimmedMessage
          );
          const baseMessages = userMessageExists
            ? currentMessages
            : [...messagesBeforeOptimisticUpdate, newUserMessage]; // Add user msg back if lost

          return [
            ...baseMessages,
            {
              role: "assistant",
              content: `${error}`,
              model: selectedModel,
            },
          ];
        });
      } finally {
        setIsGenerating(false);
        setLoadingPhase(null);
        processingInitialMessageRef.current = null; // Clear ref after processing attempt
      }
    },
    [
      isGenerating,
      isAuthenticating,
      currentChatId,
      router,
      messages,
      searchEnabled,
      selectedModel,
      fileUrl,
      fileType,
      fileName,
      searchParams,
    ]
  );

  // Effect 4: Handle Initial Message from Store
  useEffect(() => {
    if (!isGenerating && currentChatId !== null) {
      handleSendMessage("", false); // Trigger send
      console.log(isChatHistoryOpen);
    }
  }, [isGenerating, messages, currentChatId, router, handleSendMessage]);

  // Effect: Update selectedModel to match the last message's model
  useEffect(() => {
    if (messages.length > 0) {
      // Find the last message that has a model property
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message.model) {
          setSelectedModel(message.model);
          break;
        }
      }
    }
  }, [messages]);

  const inputBoxHeight = 58; // From your InputBox prop

  useEffect(() => {
    if (searchParams.get("new")) {
      setCurrentChatId(null);
      setChatInitiated(false);
      setMessages([]);
      setChatTitle("Better Index"); // Reset title for new chat
    }
  }, [searchParams]);

  // Add keyboard shortcuts for Cmd+I to focus the input and Cmd+B for new chat
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd+I on Mac or Ctrl+I on Windows/Linux
      if ((event.metaKey || event.ctrlKey) && event.key === "i") {
        event.preventDefault();
        inputBoxRef.current?.focus();
      }
      // Check for Cmd+B on Mac or Ctrl+B on Windows/Linux for new chat
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key === "o"
      ) {
        event.preventDefault();
        document.title = "Better Index";
        setChatTitle("Better Index"); // Update the chatTitle state when creating a new chat
        const currentSearchParams = new URLSearchParams(window.location.search);
        currentSearchParams.set("new", "true");
        currentSearchParams.delete("shared");
        currentSearchParams.delete("chatId");
        window.history.pushState({}, "", `/chat?${currentSearchParams}`);
        // Focus the input after navigation with a small delay
        setTimeout(() => {
          inputBoxRef.current?.focus();
        }, 100);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [router]);

  // Add localStorage event listener to sync messages across tabs
  useEffect(() => {
    if (!currentChatId) return;

    const handleStorageChange = (event: StorageEvent | CustomEvent) => {
      const chatStorageKey = getLocalStorageKey(currentChatId);

      // Handle storage event (cross-tab)
      if (event instanceof StorageEvent) {
        if (event.key === chatStorageKey && event.newValue) {
          try {
            const updatedMessages = JSON.parse(event.newValue);
            if (Array.isArray(updatedMessages)) {
              setMessages(updatedMessages);
            }
          } catch (error) {
            console.error(
              "Error parsing updated messages from localStorage:",
              error
            );
          }
        }
      }
      // Handle custom event (same-tab)
      else if (
        event instanceof CustomEvent &&
        event.detail?.key === chatStorageKey
      ) {
        try {
          const updatedMessages = JSON.parse(event.detail.newValue);
          if (Array.isArray(updatedMessages)) {
            setMessages(updatedMessages);
          }
        } catch (error) {
          console.error(
            "Error parsing updated messages from custom event:",
            error
          );
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(
      MESSAGES_UPDATED_EVENT,
      handleStorageChange as EventListener
    );

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(
        MESSAGES_UPDATED_EVENT,
        handleStorageChange as EventListener
      );
    };
  }, [currentChatId]);

  // Add a function to check if current chat is already shared and get its shared ID
  const checkIfChatIsShared = useCallback(() => {
    if (!currentChatId) return { isShared: false, sharedId: null };

    try {
      const sharedChatsCache = localStorage.getItem(SHARED_CHATS_CACHE_KEY);
      if (sharedChatsCache) {
        const parsedCache = JSON.parse(sharedChatsCache);
        if (parsedCache && Array.isArray(parsedCache.chats)) {
          // Compare chatId (original chat ID) with currentChatId
          const sharedChat = parsedCache.chats.find(
            (chat: { chatId: string }) => chat.chatId === currentChatId
          );
          if (sharedChat) {
            // Return the shared chat ID (stored in the 'id' field)
            return {
              isShared: true,
              sharedId: sharedChat.id,
            };
          }
        }
      }
    } catch (error) {
      console.error("Error checking shared chats cache:", error);
    }
    return { isShared: false, sharedId: null };
  }, [currentChatId]);

  // Add useEffect to check shared status when dialog opens or currentChatId changes
  useEffect(() => {
    if (isShareDialogOpen && currentChatId) {
      const { isShared, sharedId } = checkIfChatIsShared();
      setChatShared(isShared);
      setSharedChatId(sharedId);

      // If chat is shared but we don't have the sharedChatId, we might need to fetch it
      // For now, we'll handle this case in the UI by showing a different state
    }
  }, [isShareDialogOpen, currentChatId, checkIfChatIsShared]);

  // Update the handleShareChat function
  const handleShareChat = async () => {
    if (!currentChatId) {
      console.error("No chat ID available to share");
      return;
    }

    try {
      setChatShareLoading(true);

      const response = await fetch("/api/share-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chatId: currentChatId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to share chat");
      }

      const data = await response.json();

      if (data.success) {
        // Store the shared chat ID
        setSharedChatId(data.sharedChatId);

        // Update the shared chats cache
        try {
          const sharedChatsCache = localStorage.getItem(SHARED_CHATS_CACHE_KEY);
          let cacheData;

          if (sharedChatsCache) {
            cacheData = JSON.parse(sharedChatsCache);
          } else {
            cacheData = {
              chats: [],
              totalChats: 0,
              timestamp: Date.now(),
            };
          }

          // Find the current chat in the regular chats cache to get its details
          const allChatsCache = localStorage.getItem(ALL_CHATS_CACHE_KEY);
          let currentChatDetails = null;

          if (allChatsCache) {
            const parsedAllChats = JSON.parse(allChatsCache);
            currentChatDetails = parsedAllChats.chats.find(
              (chat: Chat) => chat.id === currentChatId
            );
          }

          // Check if chat already exists in shared cache
          const existingSharedChatIndex = cacheData.chats.findIndex(
            (chat: { chatId: string }) => chat.chatId === currentChatId
          );

          if (currentChatDetails) {
            const sharedChatEntry = {
              id: data.sharedChatId, // This is the shared chat ID
              title: currentChatDetails.title,
              userId: sessionDetails?.user?.id || user?.id,
              createdAt: currentChatDetails.createdAt,
              isShared: true,
              chatId: currentChatId, // This is the original chat ID
            };

            if (existingSharedChatIndex >= 0) {
              // Update existing entry
              cacheData.chats[existingSharedChatIndex] = sharedChatEntry;
            } else {
              // Add new entry
              cacheData.chats.unshift(sharedChatEntry);
              cacheData.totalChats += 1;
            }

            cacheData.timestamp = Date.now();

            localStorage.setItem(
              SHARED_CHATS_CACHE_KEY,
              JSON.stringify(cacheData)
            );

            // Dispatch cache update event
            window.dispatchEvent(new Event(CHAT_CACHE_UPDATED_EVENT));

            console.log(
              "Added/updated chat in shared chats cache with sharedChatId:",
              data.sharedChatId
            );
          }
        } catch (cacheError) {
          console.error("Error updating shared chats cache:", cacheError);
          // Continue even if cache update fails - the share was successful
        }

        setChatShared(true);
        console.log(
          "Chat shared successfully with sharedChatId:",
          data.sharedChatId
        );
      } else {
        throw new Error("Failed to share chat");
      }
    } catch (error) {
      console.error("Error sharing chat:", error);
      // You might want to show a toast notification here
    } finally {
      setChatShareLoading(false);
    }
  };

  if (isAuthenticating) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Spinner />
      </div>
    );
  }

  const handleBranchClick = async () => {
    // duplicate the current chat
    const newChatId = crypto.randomUUID();
    const newChatTitle = "Branched - " + chatTitle;
    const newChatCreatedAt = new Date().toISOString();
    const newChat = {
      id: newChatId,
      title: newChatTitle,
      createdAt: newChatCreatedAt,
    };
    let newChatMessages = [];
    // get current chat history form ChatHistoryCache key
    const currentChatHistory = localStorage.getItem("chatHistoryCache");
    let currentChatHistoryData = null;
    if (currentChatHistory) {
      currentChatHistoryData = JSON.parse(currentChatHistory);
    }

    // Get the current chat messages from the local storage
    const currentChatMessages = localStorage.getItem(
      getLocalStorageKey(searchParams.get("chatId") || "")
    );
    console.log(currentChatMessages);
    if (currentChatMessages) {
      const currentChatData = JSON.parse(currentChatMessages);
      newChatMessages = currentChatData;
    }

    // Update the new chat in the DB
    const response = await fetch("/api/branch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatId: newChatId,
        title: newChatTitle,
        messages: newChatMessages,
      }),
    });

    if (!response.ok) {
      console.error("Failed to branch chat");
      return false;
    }

    //add the new chat to the currentChatHistoryData
    if (currentChatHistoryData) {
      localStorage.setItem(
        "chatHistoryCache",
        JSON.stringify({
          chats: [newChat, ...currentChatHistoryData.chats],
          totalChats: currentChatHistoryData.totalChats + 1,
          timestamp: Date.now(),
        })
      );
      window.dispatchEvent(new Event(CHAT_CACHE_UPDATED_EVENT));
    }
    // save the new chat to the local storage
    localStorage.setItem(
      getLocalStorageKey(newChatId),
      JSON.stringify(newChatMessages)
    );

    document.title = newChatTitle + " - Better Index";
    setChatTitle(newChatTitle); // Update the chatTitle state to reflect the new branched chat title
    const currentSearchParams = new URLSearchParams(window.location.search);
    currentSearchParams.set("chatId", newChatId);
    currentSearchParams.delete("new");
    window.history.pushState({}, "", `/chat?${currentSearchParams}`);
    return true;
  };

  return (
    <div className={`flex w-full h-full`}>
      {/* Chat History - Hidden on mobile by default */}
      <Head>
        <title>{chatTitle}</title>
        <meta name="description" content="example description" />
      </Head>
      <div
        className={cn(
          "hidden lg:block max-w-[300px] w-full h-full fixed md:relative z-50 transition-transform duration-200 ease-in-out scrollbar-hide"
        )}
      >
        <ChatHistoryDesktop
          onClose={() => setIsChatHistoryOpen(false)}
          isNewUser={isNewUser}
          isLoading={isLoadingChats}
        />
      </div>

      {/* Main Chat Area */}
      <div
        className={`flex flex-col w-full dark:bg-[#222325] bg-white lg:mt-0 `}
      >
        <div className="lg:hidden">
          <Header landingPage={true} isAnonymous={isAnonymous} />
        </div>

        {!searchParams.get("shared") && !searchParams.get("new") ? (
          <div className="fixed top-4 right-4 z-50 hidden lg:block">
            <Button
              onClick={() => setIsShareDialogOpen(true)}
              className="cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Share
            </Button>
          </div>
        ) : null}

        {/* Show HeroSection for new chats */}
        {searchParams.get("new") && !input ? (
          <HeroSection setInput={setInput} />
        ) : /* Show loading spinner when loading an existing chat with no messages yet */
        messages.length === 0 && !input ? (
          <div className="flex justify-center items-center h-full">
            <Spinner />
          </div>
        ) : (
          /* Show main chat interface */
          <div className="overflow-y-scroll h-full [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-transparent dark:[&::-webkit-scrollbar-thumb]:bg-neutral-500 mt-12 lg:mt-0">
            <div className="max-w-[780px] mx-auto px-4 mt-5 md:pl-10">
              {messages.map((message, index) => (
                <MemoizedRenderMessageOnScreen
                  key={index}
                  message={message}
                  index={index}
                  messages={messages}
                  chatInitiated={chatInitiated}
                  loadingPhase={loadingPhase}
                  searchEnabled={searchEnabled}
                  selectedModel={selectedModel}
                  setMessages={setMessages}
                  handleSendMessage={handleSendMessage}
                  handleBranchClick={handleBranchClick}
                />
              ))}
              <div ref={messagesEndRef} className="pb-[120px]" />
            </div>
          </div>
        )}

        <div className="w-full mx-auto">
          <div className="max-w-[750px] mx-auto">
            <InputBox
              ref={inputBoxRef}
              height={inputBoxHeight}
              input={input}
              setInput={setInput}
              onSend={(messageContent) => {
                handleSendMessage(messageContent, false);
              }}
              disabled={isGenerating || isAuthenticating}
              searchEnabled={searchEnabled}
              onSearchToggle={setSearchEnabled}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              fileUrl={fileUrl || ""}
              setFileUrl={setFileUrl}
              fileType={fileType || ""}
              setFileType={setFileType}
              fileName={fileName || ""}
              setFileName={setFileName}
            />
          </div>
        </div>
      </div>

      {/* Share Dialog */}
      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent className="sm:max-w-md p-5 bg-white dark:bg-[#222325]">
          <DialogHeader>
            <DialogTitle>Share this conversation</DialogTitle>
            <DialogDescription>
              Share this chat with others by copying the link below.
            </DialogDescription>
          </DialogHeader>
          {chatShared ? (
            sharedChatId ? (
              <div className="flex items-center space-x-2 p-2">
                <div className="grid flex-1 gap-2">
                  <p className="text-sm text-black dark:text-white font-lora text-ellipsis overflow-hidden whitespace-nowrap ">
                    {`${window.location.origin}/chat?chatId=${sharedChatId}&shared=true`}
                  </p>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="px-3 bg-black dark:bg-[#2d2e30] dark:text-white rounded-lg cursor-pointer"
                  onClick={() => {
                    setCopyClicked(true);
                    navigator.clipboard.writeText(
                      `${window.location.origin}/chat?chatId=${sharedChatId}&shared=true`
                    );
                    setTimeout(() => {
                      setCopyClicked(false);
                    }, 1000);
                  }}
                >
                  <span className="sr-only">Copy</span>
                  {CopyClicked ? (
                    <Check className="w-4 h-4 m-2" />
                  ) : (
                    <CopyIcon className="w-4 h-4 cursor-pointer m-2" />
                  )}
                </Button>
              </div>
            ) : (
              <div className="p-2 text-center">
                <p className="text-sm text-black dark:text-white font-lora mb-2">
                  This chat is already shared, but we&apos;re unable to retrieve
                  the share link at the moment.
                </p>
                <Button
                  onClick={() => {
                    setChatShared(false);
                    setSharedChatId(null);
                  }}
                  variant="outline"
                  className="cursor-pointer"
                >
                  Try sharing again
                </Button>
              </div>
            )
          ) : (
            <Button
              onClick={() => {
                setChatShareLoading(true);
                handleShareChat();
              }}
              className="cursor-pointer"
              disabled={chatShareLoading}
            >
              {chatShareLoading ? (
                <p className="text-sm text-white dark:text-black font-lora">
                  Sharing...
                </p>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Share
                </>
              )}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
// --- Memoized Message Rendering Component ---

interface RenderMessageProps {
  message: Message;
  index: number;
  messages: Message[];
  chatInitiated: boolean;
  loadingPhase: "searching" | "generating" | null;
  searchEnabled: boolean;
  selectedModel: string;
  setMessages: (messages: Message[]) => void;
  handleSendMessage: (
    messageContent: string,
    editedMessage: boolean,
    messagesUpToEdit?: Message[]
  ) => Promise<void>;
  handleBranchClick: () => void;
}

/**
 * Helper function to highlight special words in text
 */
const highlightSpecialWords = (text: string) => {
  // Split the text into words while preserving spaces and punctuation
  return text.split(/(\s+)/).map((word, index) => {
    if (word.includes("#")) {
      return (
        <span
          key={index}
          className="bg-blue-500/30 rounded px-1 py-1 text-sm font-semibold font-lora"
        >
          {word}
        </span>
      );
    } else if (word.includes("@")) {
      return (
        <span
          key={index}
          className="bg-pink-500/30 rounded px-1 py-1 text-sm font-semibold font-lora"
        >
          {word}
        </span>
      );
    } else if (word.includes("$")) {
      return (
        <span
          key={index}
          className="bg-orange-500/30 rounded px-1 py-1 text-sm font-semibold font-lora"
        >
          {word}
        </span>
      );
    }
    return word;
  });
};

/**
 * Renders a single message bubble.
 * Memoized to prevent re-rendering if props haven't changed.
 */

const handleEditKeyPress = (
  e: React.KeyboardEvent,
  index: number,
  editingText: string,
  setEditingMessageIndex: (index: number | null) => void,
  setEditingText: (text: string) => void,
  messages: Message[],
  setMessages: (messages: Message[]) => void,
  handleSendMessage: (
    messageContent: string,
    editedMessage: boolean,
    messagesUpToEdit?: Message[]
  ) => Promise<void>
) => {
  if (e.key === "Enter") {
    e.preventDefault();
    // Handle the edit here
    console.log("Editing message:", editingText);

    // Filter messages to only include those before the edited message
    const messagesUpToEdit = messages.filter((_, i) => i < index);

    // Set the filtered messages immediately
    setMessages(messagesUpToEdit);

    // Clear editing state
    setEditingMessageIndex(null);
    setEditingText("");

    // Send the edited message with the correct context
    const editedMessage = true;
    handleSendMessage(editingText, editedMessage, messagesUpToEdit);
  }
};

const RenderMessageOnScreen = ({
  message,
  index,
  messages,
  chatInitiated,
  loadingPhase,
  searchEnabled,
  selectedModel,
  setMessages,
  handleSendMessage,
  handleBranchClick,
}: RenderMessageProps) => {
  const [CopyClicked, setCopyClicked] = useState(false);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(
    null
  );
  const [editingText, setEditingText] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [branchLoading, setBranchLoading] = useState(false);
  const [imageKey, setImageKey] = useState<string>(
    `${message.content}-${Date.now()}`
  );

  // Update image key when message changes
  useEffect(() => {
    if (message.fileUrl) {
      setImageKey(`${message.fileUrl}-${Date.now()}`);
    }
  }, [message.fileUrl]);

  // Auto-resize textarea based on content
  useEffect(() => {
    // Add a small delay to ensure the textarea is rendered
    const timeoutId = setTimeout(() => {
      if (textareaRef.current && editingMessageIndex === index) {
        const textarea = textareaRef.current;
        console.log("Textarea ref found:", textarea); // Debug log

        // Reset height to auto to get the correct scrollHeight
        textarea.style.height = "auto";
        textarea.style.overflow = "hidden";
        textarea.style.resize = "none";

        // Set height to scrollHeight to fit content
        const newHeight = Math.max(textarea.scrollHeight, 60); // minimum height
        textarea.style.height = newHeight + "px";
        console.log("heightOfTheTextArea", newHeight);

        // textarea.scrollIntoView({
        //   behavior: "smooth",
        //   block: "end",
        //   inline: "nearest",
        // });

        textarea.focus();
      } else {
        console.log("Textarea ref not found or not editing:", {
          current: textareaRef.current,
          editingMessageIndex,
          index,
        }); // Debug log
      }
    }, 10); // Small delay to ensure DOM is updated

    return () => clearTimeout(timeoutId);
  }, [editingText, editingMessageIndex, index]);

  // Create a callback ref that handles auto-resizing
  const textareaCallbackRef = useCallback(
    (textarea: HTMLTextAreaElement | null) => {
      if (textarea && editingMessageIndex === index) {
        console.log("Textarea callback ref called:", textarea); // Debug log

        // Store the ref for other uses
        textareaRef.current = textarea;

        // Auto-resize logic
        textarea.style.height = "auto";
        textarea.style.overflow = "hidden";
        textarea.style.resize = "none";

        const newHeight = Math.max(textarea.scrollHeight, 60);
        textarea.style.height = newHeight + "px";
        console.log("heightOfTheTextArea from callback:", newHeight);

        textarea.scrollIntoView({
          behavior: "smooth",
          block: "end",
          inline: "nearest",
        });

        textarea.focus();
      }
    },
    [editingText, editingMessageIndex, index]
  );

  const handleCopyClick = () => {
    setCopyClicked(true);
    navigator.clipboard.writeText(message.content);
    setTimeout(() => {
      setCopyClicked(false);
    }, 2000);
  };
  const LoadingIndicator = () => {
    const isImageGenerationModel = selectedModel === "openai/gpt-image-1";

    let loadingText = "Generating response...";
    if (isImageGenerationModel) {
      loadingText = "Generating image...";
    } else if (searchEnabled && loadingPhase === "searching") {
      loadingText = "Searching...";
    }

    return (
      <div className="flex items-center space-x-2">
        <Spinner className="w-5 h-5" />
        <span className="loading-text-shine">{loadingText}</span>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Message Bubble */}
      <div
        className={`mb-2 hidden md:block font-lora ${
          message.role === "user" ? "ml-auto" : "mr-auto"
        }`}
        style={{
          minHeight: `${
            messages.length - 1 === index &&
            message.role === "user" &&
            chatInitiated
              ? "calc(-300px + 100vh)"
              : messages.length - 1 === index &&
                message.role === "assistant" &&
                chatInitiated
              ? "calc(-240px + 100vh)"
              : "auto"
          }`,
        }}
      >
        <div>
          {/* User */}
          {message.role === "user" && (
            <div className="ml-auto max-w-full w-fit">
              <div
                className={`rounded-3xl bg-gray-100  dark:text-white rounded-br-lg   font-lora ${
                  editingMessageIndex === index
                    ? "px-[1px] w-screen max-w-[720px] dark:bg-neutral-900"
                    : "p-2 px-4 dark:bg-[#2d2e30]"
                }`}
              >
                {editingMessageIndex === index ? (
                  <Textarea
                    ref={textareaCallbackRef}
                    value={editingText}
                    className="rounded-xl p-3 border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-xl font-lora dark:bg-neutral-900 bg-neutral-200"
                    style={{
                      fontSize: "17px",
                    }}
                    onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={(e) =>
                      handleEditKeyPress(
                        e,
                        index,
                        editingText,
                        setEditingMessageIndex,
                        setEditingText,
                        messages,
                        setMessages,
                        handleSendMessage
                      )
                    }
                  />
                ) : (
                  <div className="font-lora">
                    <p>{highlightSpecialWords(message.content)}</p>
                    {message.fileUrl && (
                      <div className="mt-1">
                        {message.fileType?.startsWith("image/") ? (
                          <div className="relative">
                            <img
                              key={imageKey}
                              src={message.fileUrl}
                              alt={message.fileName || "Uploaded image"}
                              className="max-w-[300px] max-h-[200px] object-cover rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() =>
                                message.fileUrl &&
                                window.open(message.fileUrl, "_blank")
                              }
                              title="Click to open in new tab"
                              onError={(e) => {
                                console.error(
                                  "Image failed to load:",
                                  message.fileUrl
                                );
                                e.currentTarget.src = ""; // Clear the src on error
                              }}
                            />
                            <div className="text-xs text-gray-500 mt-1">
                              {message.fileName}
                            </div>
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-[#344d58] max-w-[300px] cursor-pointer hover:bg-gray-100 dark:hover:bg-[#2e444e] transition-colors mb-2"
                            onClick={() =>
                              message.fileUrl &&
                              window.open(message.fileUrl, "_blank")
                            }
                            title="Click to open in new tab"
                          >
                            <div className="flex-shrink-0">
                              <svg
                                className="w-8 h-8 text-gray-400"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {message.fileName}
                              </div>
                              <div className="text-xs text-gray-500">
                                {message.fileType}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-row justify-end items-end">
                {CopyClicked ? (
                  <Check className="w-4 h-4 m-2" />
                ) : (
                  <CopyIcon
                    className="w-4 h-4 cursor-pointer m-2"
                    onClick={handleCopyClick}
                  />
                )}
                <Edit3
                  className="w-4 h-4 cursor-pointer m-2"
                  onClick={() => {
                    if (editingMessageIndex === index) {
                      setEditingMessageIndex(null);
                    } else {
                      setEditingMessageIndex(index);
                    }
                    setEditingText(message.content);
                  }}
                />
                <RotateCcw
                  className="w-4 h-4 cursor-pointer m-2"
                  onClick={() => {
                    // Redo from this point: remove all messages after this one and resend
                    const messagesUpToRedo = messages.filter(
                      (_, i) => i < index
                    );
                    setMessages(messagesUpToRedo);
                    handleSendMessage(message.content, true, messagesUpToRedo);
                  }}
                />
              </div>
            </div>
          )}

          {/* Bot  */}
          {message.role === "assistant" && (
            <div>
              <div
                className={`p-3 rounded-3xl w-fit max-w-full  dark:bg-transparent dark:text-white rounded-bl-lg mr-auto`}
              >
                {message.content === "loading" ? (
                  <LoadingIndicator />
                ) : (
                  <div className="markdown-content">
                    <MessageRenderer
                      key={imageKey}
                      content={message.content || " "}
                    />
                    <div className="flex flex-row items-center gap-4">
                      {CopyClicked ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <CopyIcon
                          className="w-4 h-4 cursor-pointer"
                          onClick={handleCopyClick}
                        />
                      )}
                      {branchLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <GitBranch
                          className="w-4 h-4 cursor-pointer"
                          onClick={async () => {
                            setBranchLoading(true);
                            await handleBranchClick();
                            setBranchLoading(false);
                          }}
                        />
                      )}
                      {message.model && (
                        <div className="text-sm px-0 py-1 font">
                          {models.find((m) => m.id === message.model)?.name}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Message Bubble */}
      <div
        className={`mb-2 block md:hidden font-lora ${
          message.role === "user" ? "ml-auto" : "mr-auto"
        }`}
        style={{
          minHeight: `${
            messages.length - 1 === index &&
            chatInitiated &&
            message.role === "user"
              ? "calc(-360px + 100vh)"
              : messages.length - 1 === index &&
                chatInitiated &&
                message.role === "assistant"
              ? "calc(-380px + 100vh)"
              : "auto"
          }`,
        }}
      >
        <div>
          {/* User */}
          {message.role === "user" && (
            <div className="ml-auto max-w-full w-fit">
              <div
                className={`rounded-3xl bg-gray-100 dark:bg-[#2d2e30] dark:text-white rounded-br-lg font-lora ${
                  editingMessageIndex === index
                    ? "px-[1px] w-screen max-w-[720px]"
                    : "p-3 px-4"
                }`}
              >
                {editingMessageIndex === index ? (
                  <Textarea
                    ref={textareaCallbackRef}
                    value={editingText}
                    className="rounded-xl p-3 border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-lg font-lora bg-neutral-900"
                    style={{
                      fontSize: "16px",
                      resize: "none",
                      overflow: "hidden",
                    }}
                    onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={(e) =>
                      handleEditKeyPress(
                        e,
                        index,
                        editingText,
                        setEditingMessageIndex,
                        setEditingText,
                        messages,
                        setMessages,
                        handleSendMessage
                      )
                    }
                  />
                ) : (
                  <div>
                    <div>{highlightSpecialWords(message.content)}</div>
                    {message.fileUrl && (
                      <div className="mt-3">
                        {message.fileType?.startsWith("image/") ? (
                          <div className="relative">
                            <img
                              key={imageKey}
                              src={message.fileUrl}
                              alt={message.fileName || "Uploaded image"}
                              className="max-w-[250px] max-h-[150px] object-cover rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() =>
                                message.fileUrl &&
                                window.open(message.fileUrl, "_blank")
                              }
                              title="Click to open in new tab"
                              onError={(e) => {
                                console.error(
                                  "Image failed to load:",
                                  message.fileUrl
                                );
                                e.currentTarget.src = ""; // Clear the src on error
                              }}
                            />
                            <div className="text-xs text-gray-500 mt-1">
                              {message.fileName}
                            </div>
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-2 p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 max-w-[250px] cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                            onClick={() =>
                              message.fileUrl &&
                              window.open(message.fileUrl, "_blank")
                            }
                            title="Click to open in new tab"
                          >
                            <div className="flex-shrink-0">
                              <svg
                                className="w-6 h-6 text-gray-400"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-gray-900 dark:text-white truncate">
                                {message.fileName}
                              </div>
                              <div className="text-xs text-gray-500">
                                {message.fileType}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-row justify-end items-end">
                {CopyClicked ? (
                  <Check className="w-4 h-4 m-2" />
                ) : (
                  <CopyIcon
                    className="w-4 h-4 cursor-pointer m-2"
                    onClick={handleCopyClick}
                  />
                )}
                <Edit3
                  className="w-4 h-4 cursor-pointer m-2"
                  onClick={() => {
                    if (editingMessageIndex === index) {
                      setEditingMessageIndex(null);
                    } else {
                      setEditingMessageIndex(index);
                    }
                    setEditingText(message.content);
                  }}
                />
                <RotateCcw
                  className="w-4 h-4 cursor-pointer m-2"
                  onClick={() => {
                    // Redo from this point: remove all messages after this one and resend
                    const messagesUpToRedo = messages.filter(
                      (_, i) => i < index
                    );
                    setMessages(messagesUpToRedo);
                    handleSendMessage(message.content, true, messagesUpToRedo);
                  }}
                />
              </div>
            </div>
          )}

          {/* Bot  */}
          {message.role === "assistant" && (
            <div>
              <div
                className={`p-3 rounded-3xl w-fit max-w-full  dark:bg-transparent dark:text-white rounded-bl-lg mr-auto`}
              >
                {message.content === "loading" ? (
                  <LoadingIndicator />
                ) : (
                  <div className="markdown-content">
                    <MessageRenderer
                      key={imageKey}
                      content={message.content || " "}
                    />
                    <div className="flex flex-row items-center gap-4">
                      {CopyClicked ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <CopyIcon
                          className="w-4 h-4 cursor-pointer"
                          onClick={handleCopyClick}
                        />
                      )}
                      {branchLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <GitBranch
                          className="w-4 h-4 cursor-pointer"
                          onClick={async () => {
                            setBranchLoading(true);
                            await handleBranchClick();
                            setBranchLoading(false);
                          }}
                        />
                      )}
                      {message.model && (
                        <div className="text-sm px-0 py-1 font">
                          {models.find((m) => m.id === message.model)?.name}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// Create the memoized version of the component
const MemoizedRenderMessageOnScreen = memo(RenderMessageOnScreen);
