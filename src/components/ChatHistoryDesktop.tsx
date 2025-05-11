import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import { Pacifico } from "next/font/google";
import { Button } from "./ui/button";
import { useUserStore } from "@/store/userStore";
import { User } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import Settings from "./Setting";
import { authClient } from "@/lib/auth-client";

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
}

export default function ChatHistoryDesktop({
  onClose,
  isNewUser = true,
  isAnonymous = true,
}: ChatHistoryProps) {
  const initialCacheDataRef = useRef<RawCacheData | null>(loadFromCache());
  const allCachedChats = useRef<Chat[]>(
    initialCacheDataRef.current?.chats || []
  );

  const [displayedChats, setDisplayedChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [openSettings, setOpenSettings] = useState(false);
  const { user } = useUserStore();

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
      <span className={cn("text-2xl text-center mt-5", pacifico.className)}>
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

      <div className="flex-1 overflow-y-auto p-2 no-scrollbar h-screen">
        {isLoading && <p className="text-center text-gray-500">Loading...</p>}
        {showEmptySearchResults && (
          <p
            className="text-center text-gray-500 text-sm"
            suppressContentEditableWarning
          >
            {`No chats found matching "${debouncedSearchTerm}"`}
          </p>
        )}

        {!isLoading && !error && displayedChats.length > 0 && (
          <div className="space-y-2 h-full">
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

      {isNewUser || isAnonymous || user?.isAnonymous === false ? (
        <SignInComponent />
      ) : (
        <div
          className="flex items-center gap-2 p-3 mx-3 mb-5 mt-3 bg-neutral-800 rounded-md cursor-pointer"
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
          <Settings onClose={() => setOpenSettings(false)} />
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
