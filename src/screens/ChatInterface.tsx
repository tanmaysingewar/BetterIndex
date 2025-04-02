"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
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

const generateChatId = (): string => {
  // ... (keep existing implementation)
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  } else {
    return `fallback-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
};

const getLocalStorageKey = (chatId: string): string => `chatMessages_${chatId}`;

export default function ChatPage({ session }: any) {
  const router = useRouter();
  const params = useParams();
  const [chatInitiated, setChatInitiated] = useState<boolean>(false);
  const [input, setInput] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showHighlights, setShowHighlights] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [errorLoadingMessages, setErrorLoadingMessages] = useState<
    string | null
  >(null);

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
      setErrorLoadingMessages(null);
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
        setIsLoadingMessages(true);
        setErrorLoadingMessages(null);
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
          setErrorLoadingMessages(
            "Error fetching initial messages from server",
          );
          // Keep potentially loaded LS messages if fetch fails
        } finally {
          setIsLoadingMessages(false);
          processingInitialMessageRef.current = null; // Clear ref after fetch attempt
        }
      };

      fetchMessagesFromServer(currentChatId);
    }
  }, [currentChatId]);
  // Depend only on currentChatId
  // !Do not add the and other dependencies here

  // Effect 3: Scroll to bottom
  useEffect(() => {
    // ... (existing scroll logic - likely okay) ...
    // Consider adding isLoadingMessages dependency if loading affects scroll
    if (!chatInitiated && messages.length > 0 && !isLoadingMessages) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
    if (messages[messages.length - 1]?.role === "user") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatInitiated, isGenerating, isLoadingMessages]);

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

        const reader = response.body?.getReader();
        if (!reader) {
          setMessages(messagesBeforeOptimisticUpdate); // Revert
          throw new Error("No reader available");
        }

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

  return (
    <div className="flex flex-col h-screen items-center justify-between">
      <div className="w-full flex flex-col items-center">
        <Header session={session} />
        <div className="mx-auto text-left">
          <div className="max-w-[790px] p-4 mt-12 md:mt-0 mr-3 flex flex-col w-svh">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`mb-2 ${message.role === "user" ? "ml-auto" : "mr-auto"}`}
                style={{
                  minHeight: `${messages.length - 1 === index && chatInitiated && message.role === "user" ? "calc(-170px + 100vh)" : messages.length - 1 === index && chatInitiated && message.role === "assistant" ? "calc(-220px + 100vh)" : "auto"}`,
                }}
              >
                <div
                  className={`p-3 rounded-3xl w-fit rounded-br-lg ${
                    message.role === "user"
                      ? "dark:bg-[#2d2e30] text-white ml-auto"
                      : "bg-transparent dark:text-white mr-auto"
                  }`}
                >
                  {message.content === "loading..." ? (
                    <Spinner />
                  ) : message.role === "assistant" ? (
                    <div className="markdown-content">
                      {/* Use our new component here */}
                      <MessageRenderer
                        content={message.content}
                        showHighlights={showHighlights}
                      />
                      {/* {message.content} */}
                    </div>
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>
              </div>
            ))}
            <div className="mb-[120px]" ref={messagesEndRef} />
          </div>
        </div>
      </div>
      <div className="flex flex-col bottom-0 w-full fixed max-w-3xl">
        <InputBox
          height={58}
          input={input}
          setInput={setInput}
          onSend={handleSendMessage}
          disabled={isGenerating}
          showHighlights={showHighlights}
          setShowHighlights={setShowHighlights}
        />
      </div>
    </div>
  );
}
