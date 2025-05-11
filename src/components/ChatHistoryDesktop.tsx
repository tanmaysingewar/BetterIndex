import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import { Pacifico } from "next/font/google";
import { Button } from "./ui/button";

const pacifico = Pacifico({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-pacifico",
});

// Interface for individual chat items
interface Chat {
  id: string;
  title: string;
  createdAt: string;
}

// Interface for the NEW structure stored in localStorage
interface RawCacheData {
  chats: Chat[];
  totalChats: number;
  timestamp: number;
}

// Updated cache key
const CACHE_KEY = "chatHistoryCache";

// Updated function to load data from the new cache format
const loadFromCache = (): RawCacheData | null => {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const data: RawCacheData = JSON.parse(cached);

    // Validate the new structure
    if (
      !data ||
      !Array.isArray(data.chats) ||
      typeof data.totalChats !== "number" ||
      typeof data.timestamp !== "number"
    ) {
      console.warn(
        "Invalid cache structure found for key",
        CACHE_KEY,
        ". Clearing."
      );
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Failed to load or parse cache:", error);
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
};

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

interface ChatHistoryProps {
  onClose: () => void;
}

export default function ChatHistoryDesktop({ onClose }: ChatHistoryProps) {
  const initialCacheDataRef = useRef<RawCacheData | null>(loadFromCache());
  const allCachedChats = useRef<Chat[]>(
    initialCacheDataRef.current?.chats || []
  );

  const [displayedChats, setDisplayedChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const router = useRouter();

  // Function to reload cache data from localStorage
  const reloadCacheData = useCallback(() => {
    const freshCacheData = loadFromCache();
    if (freshCacheData) {
      allCachedChats.current = freshCacheData.chats;

      // Inline filtering logic instead of calling filterChats
      setIsLoading(true);
      setError(null);

      try {
        // Filter based on search term (case-insensitive)
        const filteredChats = debouncedSearchTerm
          ? freshCacheData.chats.filter((chat) =>
              (chat.title || "Untitled Chat")
                .toLowerCase()
                .includes(debouncedSearchTerm.toLowerCase())
            )
          : freshCacheData.chats;

        setDisplayedChats(filteredChats);
      } catch (err) {
        console.error("Error processing local chats:", err);
        setError("Failed to process cached chat data.");
        setDisplayedChats([]);
      } finally {
        setIsLoading(false);
      }
    }
  }, [debouncedSearchTerm]);

  // Filter chats based on search term
  const filterChats = useCallback(
    (search: string) => {
      // Just call reloadCacheData which already handles the filtering
      console.log(search);
      reloadCacheData();
    },
    [reloadCacheData]
  );

  // Effect to filter chats when search term changes
  useEffect(() => {
    filterChats(debouncedSearchTerm);
  }, [debouncedSearchTerm, filterChats]);

  // Add storage event listener to detect changes to localStorage
  useEffect(() => {
    // This function will be called when localStorage changes in any tab/window
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === CACHE_KEY) {
        console.log("Chat history cache updated in localStorage");
        reloadCacheData();
      }
    };

    // Add the event listener
    window.addEventListener("storage", handleStorageChange);

    // Clean up
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [reloadCacheData]);

  // Initial processing on mount
  useEffect(() => {
    if (!initialCacheDataRef.current && allCachedChats.current.length === 0) {
      setError("Failed to load chat history from cache or cache is empty.");
    }
    filterChats("");
  }, [filterChats]);

  const handleChatClick = (chatId: string) => {
    const currentPath = window.location.pathname;
    const currentSearchParams = new URLSearchParams(window.location.search);
    const currentChatId = currentSearchParams.get("chatId");

    if (currentPath === "/chat" && currentChatId === chatId) {
      onClose(); // Already on the page, just close sidebar
      return;
    }
    router.push(`/chat?chatId=${chatId}`);
    onClose();
  };

  // Determine UI states
  const hasCache = allCachedChats.current.length > 0;
  const showEmptySearchResults =
    !isLoading &&
    !error &&
    hasCache &&
    displayedChats.length === 0 &&
    !!debouncedSearchTerm;
  //   const showNoChatsInCache = !isLoading && !error && !hasCache;
  //   const showNoChatsAfterFilter =
  //     !isLoading &&
  //     !error &&
  //     hasCache &&
  //     displayedChats.length === 0 &&
  //     !debouncedSearchTerm;

  return (
    <div className="flex flex-col h-full">
      <span className={cn("text-3xl text-center mt-5", pacifico.className)}>
        {" "}
        Better Index
      </span>
      <Button
        onClick={() => {
          return router.push("/chat?new=true");
        }}
        className="mx-5 mt-3 cursor-pointer bg-white opacity-90 text-black"
      >
        New Chat
      </Button>
      <div className="flex-shrink-0 text-center mt-5">
        <Input
          placeholder="Search chats..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ fontSize: "14px" }}
          className="w-full border-0 ring-0 h-[40px] border-b rounded-none px-4 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
        {isLoading && <p className="text-center text-gray-500">Loading...</p>}
        {error && !isLoading && (
          <p className="text-center text-red-500 text-sm">Error: {error}</p>
        )}
        {showEmptySearchResults && (
          <p
            className="text-center text-gray-500 text-sm"
            suppressContentEditableWarning
          >
            {`No chats found matching "${debouncedSearchTerm}"`}
          </p>
        )}

        {!isLoading && !error && displayedChats.length > 0 && (
          <div className="space-y-2">
            {displayedChats.map((chat) => (
              <div
                key={chat.id}
                className={`hover:bg-neutral-200 dark:hover:bg-neutral-800 cursor-pointer rounded-sm p-2 px-3 transition-colors duration-150 ${
                  new URLSearchParams(location.search).get("chatId") === chat.id
                    ? "bg-neutral-100 dark:bg-[#2f2f2f]"
                    : ""
                }`}
                onClick={() => handleChatClick(chat.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && handleChatClick(chat.id)}
              >
                <p className="text-sm font-medium truncate">
                  {chat.title || "Untitled Chat"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
