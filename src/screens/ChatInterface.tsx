"use client";
import React, { useState, useRef, useEffect, useCallback, memo } from "react";
import { useParams, useRouter } from "next/navigation";
import InputBox from "@/components/InputArea/InputBox";
import Header from "@/components/Header";
import Spinner from "@/components/Spinner";
import MessageRenderer from "@/components/MessageRenderer";
import { useChatStore } from "@/store/chatStore";

interface Message {
  role: "user" | "assistant";
  content: string;
}

// --- Interfaces ---
interface Chat {
  id: string;
  title: string;
  createdAt: string;
}

interface PaginationInfo {
  currentPage: number;
  pageSize: number;
  totalChats: number;
  totalPages: number;
}

// --- Local Storage Cache ---
interface CachedChatData {
  chats: Chat[];
  pagination: PaginationInfo;
  timestamp: number;
}

const CACHE_KEY = "chatHistoryCache_page1";

const generateChatId = (): string => {
  // ... (keep existing implementation)
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  } else {
    return `fallback-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
};

const getLocalStorageKey = (chatId: string): string => `chatMessages_${chatId}`;

const loadFromCache = (): CachedChatData | null => {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const data: CachedChatData = JSON.parse(cached);
    // Optional: Check TTL
    // if (Date.now() - data.timestamp > CACHE_TTL) { ... }
    if (
      !data ||
      !Array.isArray(data.chats) ||
      !data.pagination ||
      data.pagination.currentPage !== 1 // Ensure cache is specifically for page 1
    ) {
      console.warn("Invalid cache structure found. Clearing.");
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    console.log("Loaded chats from cache");
    return data;
  } catch (error) {
    console.error("Failed to load or parse cache:", error);
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
};

const saveToCache = (chats: Chat[], pagination: PaginationInfo) => {
  if (typeof window === "undefined") return;
  // Only cache page 1 data
  if (pagination.currentPage !== 1) {
    console.log("Skipping cache save: Not page 1.");
    return;
  }
  try {
    const data: CachedChatData = {
      chats,
      pagination,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    console.log("Saved page 1 chats to cache");
  } catch (error) {
    console.error("Failed to save cache:", error);
  }
};

export default function ChatPage({ session }: any) {
  const router = useRouter();
  const params = useParams();
  const [chatInitiated, setChatInitiated] = useState<boolean>(false);
  const [input, setInput] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const initialMessage = useChatStore((state) => state.initialMessage);
  const setInitialMessage = useChatStore((state) => state.setInitialMessage);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const serverFetchInitiated = useRef<Record<string, boolean>>({});
  // Ref to track the initial message being processed by handleSendMessage
  const processingInitialMessageRef = useRef<string | null>(null);

  // Effect 1: Set initial chat ID from URL & Load from Local Storage
  useEffect(() => {
    const chatIdFromUrl = params?.chatId as string | undefined;
    console.log("Chat ID from URL params:", chatIdFromUrl);

    if (chatIdFromUrl && chatIdFromUrl !== currentChatId) {
      console.log("Setting currentChatId from URL:", chatIdFromUrl);
      setCurrentChatId(chatIdFromUrl);
      setChatInitiated(false);
      // Don't clear messages unconditionally here, let LS/Server handle it
      // setMessages([]);
      serverFetchInitiated.current = {};

      // Try loading from Local Storage FIRST
      let foundInLs = false;
      try {
        const storedMessages = localStorage.getItem(
          getLocalStorageKey(chatIdFromUrl),
        );
        if (storedMessages) {
          const parsedMessages: Message[] = JSON.parse(storedMessages);
          if (Array.isArray(parsedMessages)) {
            console.log(
              "Loaded messages from Local Storage:",
              parsedMessages.length,
            );
            setMessages(parsedMessages); // Set state from LS
            foundInLs = true;
            // if (parsedMessages.length > 0) setChatInitiated(true); // Set initiated later
          } else {
            console.warn(
              "Invalid data format in Local Storage for",
              chatIdFromUrl,
            );
            localStorage.removeItem(getLocalStorageKey(chatIdFromUrl));
          }
        } else {
          console.log("No messages found in Local Storage for", chatIdFromUrl);
        }
      } catch (error) {
        console.error("Error reading or parsing Local Storage:", error);
        localStorage.removeItem(getLocalStorageKey(chatIdFromUrl));
      }

      // If not found in LS, clear messages explicitly before potential fetch/send
      if (!foundInLs) {
        setMessages([]);
      }
    } else if (!chatIdFromUrl) {
      console.warn("No chat ID found in URL parameters.");
      // Optional: Redirect or handle base route
    }
  }, [
    params?.chatId,
    currentChatId,
    initialMessage,
    setInitialMessage,
    isGenerating,
  ]); // Keep dependencies

  // Effect 2: Fetch messages from Server (if ID exists and not fetched yet)
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (
      currentChatId &&
      !serverFetchInitiated.current[currentChatId] &&
      !initialMessage
    ) {
      const fetchMessagesFromServer = async (chatIdToFetch: string) => {
        console.log(
          `Fetching messages from server for chat ID: ${chatIdToFetch}`,
        );
        serverFetchInitiated.current[chatIdToFetch] = true;

        try {
          const response = await fetch(`/api/messages?chatId=${chatIdToFetch}`);
          // ... (error handling for response.ok) ...
          if (!response.ok) {
            // ... (existing error handling) ...
            throw new Error(/* error message */);
          }

          const fetchedMessages: Message[] = await response.json();
          console.log("Fetched messages from server:", fetchedMessages.length);

          // --- Server is Source of Truth ---
          // Check if an initial message was being processed optimistically
          // const initialMsgContent = processingInitialMessageRef.current;
          const finalMessagesFromServer = fetchedMessages;

          // If the server state DOES NOT include the user message we just added optimistically
          // (which is expected if the fetch happened before the backend processed it),
          // we might need to add it back temporarily until the *next* fetch.
          // However, the safest approach is to trust the server state completely for existing chats.
          // The `handleSendMessage` final update will ensure the *current session's* messages are consistent.
          setMessages(finalMessagesFromServer);
          // if (finalMessagesFromServer.length > 0) setChatInitiated(true); // Set initiated later

          try {
            localStorage.setItem(
              getLocalStorageKey(chatIdToFetch),
              JSON.stringify(finalMessagesFromServer),
            );
            console.log(
              "Updated Local Storage from server data for",
              chatIdToFetch,
            );
          } catch (lsError) {
            // Handle Local Storage error
            // Log error or show notification to user
            console.error("Error updating Local Storage:", lsError);
          }
        } catch (error) {
          console.error("Error fetching initial messages from server:", error);
          // Keep potentially loaded LS messages if fetch fails
        } finally {
          processingInitialMessageRef.current = null; // Clear ref after fetch attempt
        }
      };

      fetchMessagesFromServer(currentChatId);
    }
    // Do not add initialMessage as dependency
  }, [currentChatId]);
  // Depend only on currentChatId
  // !Do not add the and other dependencies here

  // Effect 3: Scroll to bottom
  useEffect(() => {
    // ... (existing scroll logic - likely okay) ...
    if (!chatInitiated && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
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
        console.log("Generated new chat ID:", chatIdForRequest);
        setCurrentChatId(chatIdForRequest);
        router.push(`/chat/${chatIdForRequest}`, { scroll: false });
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
        const response = await fetch("/api/gpt4omini", {
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
              chatIdForRequest,
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

        console.log("Header X-Title", get_header);

        if (get_header != "") {
          console.log(loadFromCache());

          const chatsCache = loadFromCache();

          const chats = [
            {
              id: chatIdForRequest,
              title: get_header!,
              createdAt: new Date().toString(),
            },
          ].concat(chatsCache?.chats || []);

          saveToCache(chats, chatsCache?.pagination);
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

        // Save the definitive final state to Local Storage
        try {
          localStorage.setItem(
            getLocalStorageKey(chatIdForRequest),
            JSON.stringify(finalMessagesState), // Save the calculated final state
          );
          console.log(
            "Updated Local Storage after successful message send for:",
            chatIdForRequest,
          );
        } catch (lsError) {
          console.error(
            "Error saving final messages to Local Storage:",
            lsError,
          );
        }
      } catch (error) {
        console.error("Error sending message:", error);
        // Update UI with error, keeping user message but removing potential placeholder
        setMessages((prev) => {
          const currentMessages = prev.filter(
            (m) => !(m.role === "assistant" && m.content === ""),
          );
          // Ensure the user message that caused the error is still present
          const userMessageExists = currentMessages.some(
            (m) => m.role === "user" && m.content === trimmedMessage,
          );
          const baseMessages = userMessageExists
            ? currentMessages
            : [...messagesBeforeOptimisticUpdate, newUserMessage]; // Add user msg back if lost

          return [
            ...baseMessages,
            {
              role: "assistant",
              content: `Sorry, an error occurred: ${error instanceof Error ? error.message : String(error)}`,
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
    ],
  );

  // Effect 4: Handle Initial Message from Store
  useEffect(() => {
    if (
      initialMessage &&
      !isGenerating &&
      currentChatId !== null &&
      !processingInitialMessageRef.current // Ensure we don't re-process if already started
    ) {
      console.log(
        "Processing initial message from store for chat:",
        currentChatId,
        initialMessage,
      );
      const messageToSend = initialMessage;
      setInitialMessage(null); // Clear immediately from store
      handleSendMessage(messageToSend); // Trigger send
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

  return (
    // 1. Main container: Full height, flex column
    <div className="flex flex-col h-full">
      {" "}
      {/* Use h-screen for fixed viewport height */}
      {/* 2. Header: Takes its natural height */}
      <Header session={session} />
      <div className="md:hidden block bg-red-500/10">
        <p className="text-center p-1 font-semibold text-sm">
          Mobile optimization is still in progress!
        </p>
      </div>
      {/* 3. Messages container: Grows to fill space, allows scrolling */}
      <div className="overflow-y-scroll h-full [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-transparent dark:[&::-webkit-scrollbar-thumb]:bg-neutral-500">
        <div className="p-4 max-w-[750px] mx-auto">
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
          {/* Ref for scrolling, inside the scrollable area */}
          <div ref={messagesEndRef} />
        </div>
      </div>
      {/* 4. InputBox container: Takes its natural height */}
      {/* No extra wrapper needed unless for specific styling/positioning that flex doesn't handle */}
      {/* Removed the extra wrapper divs around InputBox as they weren't strictly needed for this layout */}
      <InputBox
        height={inputBoxHeight} // Pass the height if needed by InputBox itself
        input={input}
        setInput={setInput}
        onSend={handleSendMessage}
        disabled={isGenerating}
      />
    </div>
  );
}
// --- Memoized Message Rendering Component ---

interface RenderMessageProps {
  message: Message;
  index: number;
  totalMessages: number; // Use total count instead of the full array
  messages: [];
  chatInitiated: boolean;
}

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
        className={`mb-2 hidden md:block ${message.role === "user" ? "ml-auto" : "mr-auto"}`}
        // style={{ minHeight: desktopMinHeight }}
        style={{
          minHeight: `${messages.length - 1 === index && message.role === "user" && chatInitiated ? "calc(-174px + 100vh)" : messages.length - 1 === index && message.role === "assistant" && chatInitiated ? "calc(-230px + 100vh)" : "auto"}`,
        }}
      >
        <div
          className={`p-3 rounded-3xl w-fit max-w-full ${
            // Added max-w-full
            message.role === "user"
              ? "bg-blue-500 dark:bg-[#2d2e30] text-white rounded-br-lg ml-auto" // Added bg-blue-500 for light mode user
              : "bg-gray-200 dark:bg-transparent dark:text-white rounded-bl-lg mr-auto" // Added bg-gray-200 for light mode assistant
          }`}
        >
          {/* Conditional rendering for spinner or content */}
          {message.content === "loading" ? (
            <Spinner />
          ) : message.role === "assistant" ? (
            <div className="markdown-content">
              <MessageRenderer content={message.content || " "} />
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}
        </div>
      </div>

      {/* Mobile Message Bubble */}
      <div
        className={`mb-2 block md:hidden ${message.role === "user" ? "ml-auto" : "mr-auto"}`}
        // style={{ minHeight: mobileMinHeight }}
        style={{
          minHeight: `${messages.length - 1 === index && chatInitiated && message.role === "user" ? "calc(-314px + 100vh)" : messages.length - 1 === index && chatInitiated && message.role === "assistant" ? "calc(-290px + 100vh)" : "auto"}`,
        }}
      >
        <div
          className={`p-3 rounded-3xl w-fit max-w-full ${
            // Added max-w-full
            message.role === "user"
              ? "bg-blue-500 dark:bg-[#2d2e30] text-white rounded-br-lg ml-auto" // Added bg-blue-500 for light mode user
              : "bg-gray-200 dark:bg-transparent dark:text-white rounded-bl-lg mr-auto" // Added bg-gray-200 for light mode assistant
          }`}
        >
          {/* Conditional rendering for spinner or content */}
          {message.content === "loading" ? (
            <Spinner />
          ) : message.role === "assistant" ? (
            <div className="markdown-content">
              <MessageRenderer content={message.content || " "} />
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}
        </div>
      </div>
    </>
  );
};

// Create the memoized version of the component
const MemoizedRenderMessageOnScreen = memo(RenderMessageOnScreen);
