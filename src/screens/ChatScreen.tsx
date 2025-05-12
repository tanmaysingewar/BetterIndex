"use client";
import React, { useState, useRef, useEffect, useCallback, memo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import InputBox from "@/components/InputArea/InputBox";
import Header from "@/components/Header";
import Spinner from "@/components/Spinner";
import MessageRenderer from "@/components/MessageRenderer";
import { useMessageStore } from "@/store/messageStore";
import { useUserStore } from "@/store/userStore";
import { authClient } from "@/lib/auth-client";
import Cookies from "js-cookie";
import { fetchAllChatsAndCache } from "@/lib/fetchChats";
// import MainPage from "./MainPage";
import getRateLimit from "@/lib/fetchRateLimit";
// import toast from 'react-hot-toast';
import { Pacifico } from "next/font/google";
import { cn } from "@/lib/utils";
import Logo_light from "@/assets/logo_light.svg";
import Logo_Dark from "@/assets/logo_dark.svg";
import Image from "next/image";
// import ChatHistory from "@/components/ChatHistory";
// import { Button } from "@/components/ui/button";
// import { Menu } from "lucide-react";
import ChatHistoryDesktop from "@/components/ChatHistoryDesktop";

const pacifico = Pacifico({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-pacifico",
});

interface Message {
  role: "user" | "assistant";
  content: string;
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const { user, setUser } = useUserStore();

  const initialMessage = useMessageStore((state) => state.initialMessage);
  const setInitialMessage = useMessageStore((state) => state.setInitialMessage);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const serverFetchInitiated = useRef<Record<string, boolean>>({});
  // Ref to track the initial message being processed by handleSendMessage
  const processingInitialMessageRef = useRef<string | null>(null);

  const anonymousSignInAttempted = useRef(false); // <-- Add this ref
  const [isChatHistoryOpen, setIsChatHistoryOpen] = useState(false);

  // const errorTost = () => toast.error('Here is your toast.');

  useEffect(() => {
    if (searchParams.get("login") === "true") {
      return router.push("/chat?new=true");
    }
  }, [searchParams, router]);

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
        anonymousSignInAttempted.current = true; // <-- Set the ref immediately
        console.log("Attempting Anonymous User creation on CI - fetchData"); // Updated log
        const userResult = await authClient.signIn.anonymous(); // API call
        if (userResult?.data?.user) {
          console.log("Anonymous user created, setting state and cookie."); // Added log
          console.log(userResult.data.user);
          setUser(userResult.data.user); // State Update
          // Return the promise from Cookies.set
          return Cookies.set("user-status", "guest", { expires: 7 });
        } else {
          console.warn("Anonymous sign-in failed or returned no user.");
          // Reset the ref if the sign-in *fails* structurally, allowing a retry maybe?
          // Or handle the error state appropriately. For now, we leave it true.
          // anonymousSignInAttempted.current = false;
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
          await getRateLimit();
          await fetchAllChatsAndCache();
          return Cookies.set("user-status", "user", { expires: 7 });
        }
        if (isAnonymous && !userAlreadySet) {
          console.log("Setting guest cookie based on session (anonymous).");
          await getRateLimit();
          await fetchAllChatsAndCache();
          return Cookies.set("user-status", "guest", { expires: 7 });
        }
      }
    }

    fetchData();
    // Dependency array remains the same. The ref handles the execution logic.
  }, [user, isNewUser, setUser, isAnonymous, sessionDetails]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const navigationEntries =
        window.performance.getEntriesByType("navigation");
      if (navigationEntries.length > 0) {
        const navigationEntry =
          navigationEntries[0] as PerformanceNavigationTiming;
        const chatIdFromUrl = searchParams.get("chatId") || undefined;
        if (navigationEntry.type === "reload") {
          try {
            async function updateChatCache() {
              await getRateLimit();
              const success = await fetchAllChatsAndCache();
              if (success) {
                console.log("Chat cache updated.");
              } else {
                console.error("Failed to update chat cache.");
              }
            }
            updateChatCache();
          } catch (error) {
            console.error("Error updating chat cache:", error);
          }
        }

        if (
          navigationEntry.type === "reload" &&
          chatIdFromUrl &&
          !initialMessage
        ) {
          const fetchMessagesFromServer = async (chatIdToFetch: string) => {
            serverFetchInitiated.current[chatIdToFetch] = true;
            console.log(
              `Fetching messages from server for chatId: ${chatIdToFetch}`
            ); // Add this

            try {
              const response = await fetch(
                `/api/messages?chatId=${chatIdToFetch}`
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

              try {
                localStorage.setItem(
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
  }, []);

  // Effect 1: Set initial chat ID from URL & Load from Local Storage
  useEffect(() => {
    const chatIdFromUrl = searchParams.get("chatId") || undefined;
    console.log("chatIdFromUrl:", chatIdFromUrl); // Add this

    if (chatIdFromUrl && chatIdFromUrl !== currentChatId) {
      setCurrentChatId(chatIdFromUrl);
      console.log("Setting currentChatId to:", chatIdFromUrl); // Add this
      setChatInitiated(false);
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
            // if (parsedMessages.length > 0) setChatInitiated(true); // Set initiated later
          } else {
            console.warn(
              "Invalid data format in Local Storage for",
              chatIdFromUrl
            );
            localStorage.removeItem(getLocalStorageKey(chatIdFromUrl));
          }
        } else if (!initialMessage) {
          const fetchMessagesFromServer = async (chatIdToFetch: string) => {
            serverFetchInitiated.current[chatIdToFetch] = true;
            console.log(
              `Fetching messages from server for chatId: ${chatIdToFetch}`
            ); // Add this

            try {
              const response = await fetch(
                `/api/messages?chatId=${chatIdToFetch}`
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
              setMessages(finalMessagesFromServer);

              try {
                localStorage.setItem(
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
  }, [
    searchParams,
    currentChatId,
    initialMessage,
    setInitialMessage,
    isGenerating,
  ]);

  // Effect 2: Fetch messages from Server (if ID exists and not fetched yet)
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (
      currentChatId &&
      !serverFetchInitiated.current[currentChatId] &&
      !initialMessage
    ) {
    }
    // Do not add initialMessage as dependency
  }, [currentChatId]);
  // Depend only on currentChatId
  // !Do not add the and other dependencies here

  // Effect 3: Scroll to bottom
  useEffect(() => {
    // ... (existing scroll logic - likely okay) ...
    if (!chatInitiated && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({
        behavior: "auto",
        block: "end",
      });
    }
    if (
      messages[messages.length - 1]?.role === "assistant" &&
      messages[messages.length - 1]?.content === "loading" &&
      chatInitiated
    ) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatInitiated, isGenerating]);

  // --- Message Sending Logic ---
  const handleSendMessage = useCallback(
    async (messageContent: string) => {
      const trimmedMessage = messageContent.trim();
      if (!trimmedMessage || isGenerating) return;

      // Check if this is handling the initial message
      const isProcessingInitial = initialMessage === trimmedMessage;
      if (isProcessingInitial) {
        processingInitialMessageRef.current = trimmedMessage; // Track it
      }

      setIsGenerating(true);
      setInput("");

      let chatIdForRequest = currentChatId;
      let isNewChat = false;
      let messagesBeforeOptimisticUpdate: Message[] = []; // Capture state before optimistic update

      if (!chatIdForRequest) {
        isNewChat = true;
        chatIdForRequest = generateChatId();
        setCurrentChatId(chatIdForRequest);
        const newUrl = `/chat?chatId=${chatIdForRequest}`;
        router.push(newUrl, { scroll: false });
        setMessages([]); // Start clean for new chat UI
        setChatInitiated(true);
        serverFetchInitiated.current = { [chatIdForRequest]: true };
        messagesBeforeOptimisticUpdate = []; // History is empty
      } else {
        // For existing chats, capture the current state *before* adding the new user message
        // Use the state directly, as functional update below handles concurrency
        // messagesBeforeOptimisticUpdate = messages; // This might be stale, functional update is better
        setChatInitiated(true);
      }

      const newUserMessage: Message = { role: "user", content: trimmedMessage };

      // --- Optimistic UI Update (using functional form) ---
      // This ensures we append to the *very latest* state, preventing race conditions
      // with Effect 1 (LS) or Effect 2 (Server) setting state.
      setMessages((prevMessages) => {
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

      const requestBody = {
        message: trimmedMessage,
        // Send history *before* the optimistic user message
        // For new chats, history will be empty
        previous_conversations: isNewChat ? [] : messages,
      };

      try {
        // Make the LLM provider dynamic
        const response = await fetch("/api/grok-mini", {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          let errorMsg = `Network response was not ok (${response.status})`;
          try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
          } catch (e) {
            console.error("Failed to parse error response:", e);
          }
          // Revert optimistic update on error
          setMessages(messages); // Revert to state *before* optimistic update
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

        // Get the header of the response
        const get_header = response.headers.get("X-Title");
        console.log("X-Title", get_header);
        console.log("X-Title", typeof get_header);

        if (get_header) {
          const chat = {
            id: chatIdForRequest,
            title: get_header!,
            createdAt: new Date().toString(),
          };

          const added = addChatToCache(chat);

          if (added) {
            console.log("Chat successfully added to the local cache.");
          } else {
            console.log("Failed to add chat to the local cache.");
          }
        }

        const reader = response.body?.getReader();
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
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        const decoder = new TextDecoder();
        let accumulatedText = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulatedText += decoder.decode(value, { stream: true });
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

        // --- Final State Update & Local Storage ---
        const finalAssistantMessage: Message = {
          role: "assistant",
          content: accumulatedText || " ", // Use space if empty
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

        // Save the definitive final state to Local Storage
        try {
          localStorage.setItem(
            getLocalStorageKey(chatIdForRequest),
            JSON.stringify(finalMessagesState) // Save the calculated final state
          );
        } catch (lsError) {
          console.error(
            "Error saving final messages to Local Storage:",
            lsError
          );
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
            },
          ];
        });
      } finally {
        setIsGenerating(false);
        processingInitialMessageRef.current = null; // Clear ref after processing attempt
      }
    },
    [
      isGenerating,
      messages, // Remove direct dependency on messages, use functional updates
      currentChatId,
      router,
      initialMessage, // Keep dependency to check if it's the initial one
      // setInitialMessage // Keep if needed elsewhere, but not directly for sending logic state capture
    ]
  );

  // Effect 4: Handle Initial Message from Store
  useEffect(() => {
    if (
      initialMessage &&
      !isGenerating &&
      currentChatId !== null &&
      !processingInitialMessageRef.current // Ensure we don't re-process if already started
    ) {
      const messageToSend = initialMessage;
      setInitialMessage(null); // Clear immediately from store
      handleSendMessage(messageToSend); // Trigger send
      console.log(isChatHistoryOpen);
    }
  }, [
    isGenerating,
    messages, // Remove direct dependency on messages, use functional updates
    currentChatId,
    router,
    initialMessage, // Keep dependency to check if it's the initial one
    setInitialMessage, // Keep if needed elsewhere, but not directly for sending logic state capture
    handleSendMessage,
  ]);

  const inputBoxHeight = 58; // From your InputBox prop

  useEffect(() => {
    if (searchParams.get("new")) {
      setCurrentChatId(null);
      setChatInitiated(false);
      setMessages([]);
    }
  }, [searchParams]);

  // Add localStorage event listener to sync messages across tabs
  useEffect(() => {
    if (!currentChatId) return;

    const handleStorageChange = (event: StorageEvent) => {
      const chatStorageKey = getLocalStorageKey(currentChatId);

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
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [currentChatId]);

  return (
    <div className="flex w-full h-full">
      {/* Chat History - Hidden on mobile by default */}
      <div
        className={cn(
          "hidden lg:block max-w-[300px] w-full h-full fixed md:relative z-50 transition-transform duration-200 ease-in-out scrollbar-hide bg-[#080808]"
        )}
      >
        <ChatHistoryDesktop
          onClose={() => setIsChatHistoryOpen(false)}
          isNewUser={isNewUser}
          isAnonymous={isAnonymous}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-col w-full rounded-tl-2xl bg-[#1d1e20] lg:mt-2">
        <Header
          landingPage={true}
          isNewUser={isNewUser}
          isAnonymous={isAnonymous}
        />

        {messages.length === 0 && searchParams.get("new") ? (
          <div className="max-w-[750px] mx-auto px-4 text-center md:mt-[250px] mt-[170px]">
            <Image
              src={Logo_Dark}
              alt="Logo"
              className="mx-auto dark:block hidden"
              height={36}
            />
            <Image
              src={Logo_light}
              alt="Logo"
              className="mx-auto dark:hidden block"
              height={36}
            />
            <p className="text-xl mt-7">Welcome to </p>{" "}
            <span className={cn("text-3xl", pacifico.className)}>
              {" "}
              Better Index
            </span>
            <div className="bg-neutral-600/35 px-5 py-5 mt-8 backdrop-blur-md text-left max-w-[450px] text-sm rounded-lg">
              <p className="text-center text-[16px] font-bold mb-2">
                Special Symbols Use Cases
              </p>
              <p className="">
                <span>
                  <span className="bg-blue-500/30 rounded px-1 py-1 text-sm font-semibold">
                    #
                  </span>{" "}
                  - Use the # to add the prompt
                </span>
              </p>
              <p className="mt-2 ">
                <span>
                  <span className="bg-pink-500/30 rounded px-1 py-1 text-sm font-semibold">
                    @
                  </span>{" "}
                  - Use the @ to to access the default indexes
                </span>
              </p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="max-w-[750px] mx-auto px-4 pt-4 my-auto">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-y-scroll h-full [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-transparent dark:[&::-webkit-scrollbar-thumb]:bg-neutral-500 mt-12 lg:mt-0">
            <div className="max-w-[750px] mx-auto px-4 mt-5">
              {messages.map((message, index) => (
                <MemoizedRenderMessageOnScreen
                  key={index}
                  message={message}
                  index={index}
                  messages={messages}
                  chatInitiated={chatInitiated}
                  isGenerating={isGenerating}
                />
              ))}
              <div ref={messagesEndRef} className="pb-[120px]" />
            </div>
          </div>
        )}

        <div className="w-full mx-auto">
          <div className="max-w-[750px] mx-auto">
            <InputBox
              height={inputBoxHeight}
              input={input}
              setInput={setInput}
              onSend={handleSendMessage}
              disabled={isGenerating}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
// --- Memoized Message Rendering Component ---

interface RenderMessageProps {
  message: Message;
  index: number;
  messages: Message[];
  chatInitiated: boolean;
  isGenerating: boolean;
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
          className="bg-blue-500/30 rounded px-1 py-1 text-sm font-semibold"
        >
          {word}
        </span>
      );
    } else if (word.includes("@")) {
      return (
        <span
          key={index}
          className="bg-pink-500/30 rounded px-1 py-1 text-sm font-semibold"
        >
          {word}
        </span>
      );
    } else if (word.includes("$")) {
      return (
        <span
          key={index}
          className="bg-orange-500/30 rounded px-1 py-1 text-sm font-semibold"
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
const RenderMessageOnScreen = ({
  message,
  index,
  messages,
  chatInitiated,
}: RenderMessageProps) => {
  return (
    <>
      {/* Desktop Message Bubble */}
      <div
        className={`mb-2 hidden md:block ${
          message.role === "user" ? "ml-auto" : "mr-auto"
        }`}
        style={{
          minHeight: `${
            messages.length - 1 === index &&
            message.role === "user" &&
            chatInitiated
              ? "calc(-174px + 100vh)"
              : messages.length - 1 === index &&
                message.role === "assistant" &&
                chatInitiated
              ? "calc(-212px + 100vh)"
              : "auto"
          }`,
        }}
      >
        <div
          className={`p-3 rounded-3xl w-fit max-w-full ${
            message.role === "user"
              ? "bg-blue-500 dark:bg-[#2d2e30] text-white rounded-br-lg ml-auto px-4"
              : "bg-gray-200 dark:bg-transparent dark:text-white rounded-bl-lg mr-auto"
          }`}
        >
          {message.content === "loading" ? (
            <Spinner />
          ) : message.role === "assistant" ? (
            <div className="markdown-content">
              <MessageRenderer content={message.content || " "} />
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words">
              {highlightSpecialWords(message.content)}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Message Bubble */}
      <div
        className={`mb-2 block md:hidden ${
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
        <div
          className={`p-3 rounded-3xl w-fit max-w-full ${
            message.role === "user"
              ? "bg-blue-500 dark:bg-[#2d2e30] text-white rounded-br-lg ml-auto"
              : "bg-gray-200 dark:bg-transparent dark:text-white rounded-bl-lg mr-auto"
          }`}
        >
          {message.content === "loading" ? (
            <Spinner />
          ) : message.role === "assistant" ? (
            <div className="markdown-content">
              <MessageRenderer content={message.content || " "} />
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words">
              {highlightSpecialWords(message.content)}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// Create the memoized version of the component
const MemoizedRenderMessageOnScreen = memo(RenderMessageOnScreen);

// --- Helper Functions for localStorage ---

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

      // --- Step 3a: Add new chat to existing list (prepend) ---
      cacheData.chats.unshift(newChat); // Add to the beginning
      cacheData.totalChats += 1; // Increment total count
      cacheData.timestamp = Date.now(); // Update timestamp
      console.log(
        `Added chat to existing cache. New total: ${cacheData.totalChats}`
      );
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
