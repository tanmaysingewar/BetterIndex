import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import { Pacifico } from "next/font/google";
import { Button } from "./ui/button";
import { useUserStore } from "@/store/userStore";
import { User } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import Settings from "./Setting";
import { authClient } from "@/lib/auth-client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2 } from "lucide-react";
import { CHAT_CACHE_UPDATED_EVENT } from "@/lib/fetchChats";

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
  isNewUser?: boolean;
  isAnonymous?: boolean;
  isLoading?: boolean;
}

export default function ChatHistoryDesktop({
  onClose,
  isNewUser = true,
  isAnonymous = true,
  isLoading: isLoadingProp = false,
}: ChatHistoryProps) {
  // Use a single source of truth for all chats data
  const [cacheData, setCacheData] = useState<RawCacheData | null>(null);
  const [isLoadingCache, setIsLoadingCache] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [openSettings, setOpenSettings] = useState(false);
  const { user } = useUserStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Reference for the chat list container
  const chatListRef = useRef<HTMLDivElement>(null);

  // Load cache data only once on component mount or when localStorage changes
  useEffect(() => {
    const loadCacheData = () => {
      setIsLoadingCache(true);
      try {
        const data = loadFromCache();
        setCacheData(data);
      } catch (err) {
        console.error("Error loading cache data:", err);
        setError("Failed to load chat history from cache.");
        console.log(error);
      } finally {
        setIsLoadingCache(false);
      }
    };

    loadCacheData();

    // Listen for both storage changes (from other tabs) and our custom event (same tab)
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === CACHE_KEY) {
        console.log("Chat history cache updated in localStorage");
        loadCacheData();
      }
    };

    const handleCacheUpdate = () => {
      console.log("Chat history cache updated in current tab");
      loadCacheData();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(CHAT_CACHE_UPDATED_EVENT, handleCacheUpdate);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(CHAT_CACHE_UPDATED_EVENT, handleCacheUpdate);
    };
  }, []);

  // Filter chats based on search term - computed only when dependencies change
  const displayedChats = useMemo(() => {
    if (!cacheData?.chats) return [];

    if (!debouncedSearchTerm) {
      return cacheData.chats;
    }

    const searchTermLower = debouncedSearchTerm.toLowerCase();
    return cacheData.chats.filter((chat) =>
      (chat.title || "Untitled Chat").toLowerCase().includes(searchTermLower)
    );
  }, [cacheData, debouncedSearchTerm]);

  // Setup virtualization
  const rowVirtualizer = useVirtualizer({
    count: displayedChats.length,
    getScrollElement: () => chatListRef.current,
    estimateSize: () => 40, // Height of each chat item
    overscan: 5,
  });

  const handleChatClick = useCallback(
    (chatId: string) => {
      const currentPath = window.location.pathname;
      const currentSearchParams = new URLSearchParams(window.location.search);
      const currentChatId = currentSearchParams.get("chatId");

      if (currentPath === "/chat" && currentChatId === chatId) {
        onClose(); // Already on the page, just close sidebar
        return;
      }
      currentSearchParams.set("chatId", chatId);
      currentSearchParams.delete("new");
      window.history.pushState({}, "", `/chat?${currentSearchParams}`);
      onClose();
    },
    [router, onClose]
  );

  // Get current chat ID from URL for highlighting active chat
  const currentChatId = useMemo(() => {
    return searchParams.get("chatId");
  }, [searchParams]);

  // Determine UI states
  const hasChats = cacheData?.chats && cacheData.chats.length > 0;
  const showEmptySearchResults =
    !isLoadingCache &&
    !isLoadingProp &&
    hasChats &&
    displayedChats.length === 0 &&
    !!debouncedSearchTerm;

  return (
    <div className="flex flex-col h-full bg-[#161719]">
      <span className={cn("text-2xl text-center mt-5", pacifico.className)}>
        {" "}
        Better Index
      </span>
      <Button
        onClick={() => {
          const currentSearchParams = new URLSearchParams(
            window.location.search
          );
          currentSearchParams.delete("chatId");
          currentSearchParams.set("new", "true");
          return window.history.pushState(
            {},
            "",
            `/chat?${currentSearchParams}`
          );
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
      <div
        ref={chatListRef}
        className="flex-1 overflow-y-auto no-scrollbar h-screen relative"
      >
        {(isLoadingCache || isLoadingProp) && (
          <div className="flex justify-center items-center py-2 bg-[#161719]/5 backdrop-blur-xs z-10 sticky top-0 shadow-[15px_15px_15px_-3px_rgba(22,23,25,0.4)]">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        )}

        {showEmptySearchResults && (
          <p className="text-center text-gray-500 text-sm mx-10 mt-8">
            {`No chats found matching "${debouncedSearchTerm}"`}
          </p>
        )}

        {displayedChats.length === 0 && !showEmptySearchResults && (
          <p className="text-center text-gray-500 text-sm mt-8 ">
            {`No chats found`}
          </p>
        )}

        <div className="p-2">
          {displayedChats.length > 0 && (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const chat = displayedChats[virtualRow.index];
                return (
                  <div
                    key={chat.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => handleChatClick(chat.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleChatClick(chat.id)
                    }
                  >
                    <div
                      className={`hover:bg-neutral-200 dark:hover:bg-[#222325] cursor-pointer rounded-sm p-2 px-3 transition-colors duration-150 ${
                        currentChatId === chat.id
                          ? "bg-neutral-100 dark:bg-[#222325]"
                          : ""
                      }`}
                    >
                      <p className="text-sm font-medium truncate">
                        {chat.title || "Untitled Chat"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isNewUser || isAnonymous || user?.isAnonymous === false ? (
        <SignInComponent />
      ) : (
        <div
          className="flex items-center gap-2 p-3 mx-2 mb-2 mt-2 bg-[#222325] rounded-md cursor-pointer"
          onClick={() => {
            setOpenSettings(true);
          }}
        >
          <div className="bg-neutral-700 p-0 rounded-full">
            {user?.image ? (
              <img
                src={user.image}
                alt="Profile picture"
                className="h-9 w-9 rounded-full"
              />
            ) : (
              <User size={20} className="text-white" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">
              {user?.name || "User"}
            </span>
            <span className="text-xs text-neutral-400 truncate max-w-[200px]">
              {user?.email || ""}
            </span>
          </div>
        </div>
      )}
      <Dialog open={openSettings} onOpenChange={setOpenSettings}>
        <DialogContent className="bg-[#1d1e20] h-[60vh] w-[53vw]">
          <DialogTitle className="sr-only">Settings</DialogTitle>
          <Settings />
        </DialogContent>
      </Dialog>
    </div>
  );
}

const SignInComponent = () => {
  const [signLoading, setSignLoading] = useState(false);
  return (
    <Button
      className="cursor-pointer mx-5 mt-3 mb-2"
      onClick={async () => {
        setSignLoading(true);
        await authClient.signIn.social({
          provider: "google",
          callbackURL: "/chat?login=true",
        });
      }}
      disabled={signLoading}
    >
      {signLoading ? (
        <svg
          fill="#000000"
          version="1.1"
          id="Capa_1"
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          width="900px"
          height="900px"
          viewBox="0 0 26.349 26.35"
          style={{ animation: "spin 1s linear infinite" }}
        >
          <style>
            {`
                    @keyframes spin {
                      from {
                        transform: rotate(0deg);
                      }
                      to {
                        transform: rotate(360deg);
                      }
                    }
                `}
          </style>
          <g>
            <g>
              <circle cx="13.792" cy="3.082" r="3.082" />
              <circle cx="13.792" cy="24.501" r="1.849" />
              <circle cx="6.219" cy="6.218" r="2.774" />
              <circle cx="21.365" cy="21.363" r="1.541" />
              <circle cx="3.082" cy="13.792" r="2.465" />
              <circle cx="24.501" cy="13.791" r="1.232" />
              <path d="M4.694,19.84c-0.843,0.843-0.843,2.207,0,3.05c0.842,0.843,2.208,0.843,3.05,0c0.843-0.843,0.843-2.207,0-3.05 C6.902,18.996,5.537,18.988,4.694,19.84z" />
              <circle cx="21.364" cy="6.218" r="0.924" />
            </g>
          </g>
        </svg>
      ) : (
        "Sign In"
      )}
    </Button>
  );
};
