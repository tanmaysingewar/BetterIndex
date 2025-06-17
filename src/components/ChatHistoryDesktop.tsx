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
import { User, Trash2, Edit3, Check, X, GitBranch, Image } from "lucide-react";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import Settings from "./Setting";
import { authClient } from "@/lib/auth-client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2 } from "lucide-react";
import { CHAT_CACHE_UPDATED_EVENT } from "@/lib/fetchChats";
import { DialogTitle } from "@radix-ui/react-dialog";
import BringYourOwnKey from "./BringYourOwnKey";

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
  isLoading?: boolean;
}

export default function ChatHistoryDesktop({
  onClose,
  isNewUser = true,
  isLoading: isLoadingProp = false,
}: ChatHistoryProps) {
  // Use a single source of truth for all chats data
  const [cacheData, setCacheData] = useState<RawCacheData | null>(null);
  const [isLoadingCache, setIsLoadingCache] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [updatingChatId, setUpdatingChatId] = useState<string | null>(null);
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [openSettings, setOpenSettings] = useState(false);
  const { user } = useUserStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Reference for the chat list container
  const chatListRef = useRef<HTMLDivElement>(null);
  // Reference for the search input
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    (chatId: string, chatTitle: string) => {
      const currentPath = window.location.pathname;
      const currentSearchParams = new URLSearchParams(window.location.search);
      const currentChatId = currentSearchParams.get("chatId");

      if (currentPath === "/chat" && currentChatId === chatId) {
        onClose(); // Already on the page, just close sidebar
        return;
      }

      document.title = chatTitle + " - Better Index";
      currentSearchParams.set("chatId", chatId);
      currentSearchParams.delete("new");
      window.history.pushState({}, "", `/chat?${currentSearchParams}`);
      onClose();
    },
    [router, onClose]
  );

  const handleNewChatClick = useCallback(() => {
    const currentSearchParams = new URLSearchParams(window.location.search);
    currentSearchParams.set("new", "true");
    currentSearchParams.delete("chatId");
    document.title = "Better Index";
    window.history.pushState({}, "", `/chat?${currentSearchParams}`);
  }, []);

  // Get current chat ID from URL for highlighting active chat
  const currentChatId = useMemo(() => {
    return searchParams.get("chatId");
  }, [searchParams]);

  // Handle chat deletion
  const handleDeleteChat = useCallback(
    async (chatId: string, event: React.MouseEvent) => {
      event.stopPropagation(); // Prevent chat click when deleting

      if (deletingChatId) return; // Prevent multiple deletions

      setDeletingChatId(chatId);

      try {
        const response = await fetch(`/api/chat/${chatId}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to delete chat");
        }

        // Update local cache immediately for better UX
        setCacheData((prevData) => {
          if (!prevData) return prevData;

          const updatedChats = prevData.chats.filter(
            (chat) => chat.id !== chatId
          );
          const updatedData = {
            ...prevData,
            chats: updatedChats,
            totalChats: updatedChats.length,
            timestamp: Date.now(),
          };

          // Update localStorage
          localStorage.setItem(CACHE_KEY, JSON.stringify(updatedData));

          // Dispatch event to notify other components
          window.dispatchEvent(new CustomEvent(CHAT_CACHE_UPDATED_EVENT));

          return updatedData;
        });

        // If we deleted the currently active chat, redirect to new chat
        const currentChatId = searchParams.get("chatId");
        if (currentChatId === chatId) {
          handleNewChatClick();
        }
      } catch (error) {
        console.error("Error deleting chat:", error);
        setError("Failed to delete chat. Please try again.");
      } finally {
        setDeletingChatId(null);
      }
    },
    [deletingChatId, searchParams, handleNewChatClick]
  );

  // Handle starting chat title edit
  const handleStartEditTitle = useCallback(
    (chatId: string, currentTitle: string, event: React.MouseEvent) => {
      event.stopPropagation(); // Prevent chat click when editing
      setEditingChatId(chatId);
      setEditingTitle(currentTitle || "Untitled Chat");
    },
    []
  );

  // Handle saving chat title edit
  const handleSaveEditTitle = useCallback(
    async (chatId: string, event?: React.MouseEvent) => {
      if (event) {
        event.stopPropagation(); // Prevent chat click when saving
      }

      if (updatingChatId || !editingTitle.trim()) return;

      setUpdatingChatId(chatId);

      try {
        const response = await fetch(`/api/chat/${chatId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ title: editingTitle.trim() }),
        });

        if (!response.ok) {
          throw new Error("Failed to update chat title");
        }

        // Update local cache immediately for better UX
        setCacheData((prevData) => {
          if (!prevData) return prevData;

          const updatedChats = prevData.chats.map((chat) =>
            chat.id === chatId ? { ...chat, title: editingTitle.trim() } : chat
          );
          const updatedData = {
            ...prevData,
            chats: updatedChats,
            timestamp: Date.now(),
          };

          // Update localStorage
          localStorage.setItem(CACHE_KEY, JSON.stringify(updatedData));

          // Dispatch event to notify other components
          window.dispatchEvent(new CustomEvent(CHAT_CACHE_UPDATED_EVENT));

          return updatedData;
        });

        // Clear editing state
        setEditingChatId(null);
        setEditingTitle("");
      } catch (error) {
        console.error("Error updating chat title:", error);
        setError("Failed to update chat title. Please try again.");
      } finally {
        setUpdatingChatId(null);
      }
    },
    [editingTitle, updatingChatId]
  );

  // Handle canceling chat title edit
  const handleCancelEditTitle = useCallback((event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation(); // Prevent chat click when canceling
    }
    setEditingChatId(null);
    setEditingTitle("");
  }, []);

  // Handle keyboard events in edit mode
  const handleEditKeyDown = useCallback(
    (event: React.KeyboardEvent, chatId: string) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSaveEditTitle(chatId);
      } else if (event.key === "Escape") {
        event.preventDefault();
        handleCancelEditTitle();
      }
    },
    [handleSaveEditTitle, handleCancelEditTitle]
  );

  // Handle chat navigation shortcuts
  const handleChatNavigation = useCallback(
    (event: KeyboardEvent) => {
      // Check for cmd/ctrl + [ or ]
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifierKey = isMac ? event.metaKey : event.ctrlKey;

      if (!modifierKey || displayedChats.length === 0) return;

      if (event.key === "[" || event.key === "]") {
        event.preventDefault();

        const currentIndex = displayedChats.findIndex(
          (chat) => chat.id === currentChatId
        );

        if (event.key === "[") {
          // Previous chat
          const prevIndex =
            currentIndex > 0 ? currentIndex - 1 : displayedChats.length - 1;
          const prevChat = displayedChats[prevIndex];
          if (prevChat) {
            handleChatClick(prevChat.id, prevChat.title);
          }
        } else if (event.key === "]") {
          // Next chat
          const nextIndex =
            currentIndex < displayedChats.length - 1 ? currentIndex + 1 : 0;
          const nextChat = displayedChats[nextIndex];
          if (nextChat) {
            handleChatClick(nextChat.id, nextChat.title);
          }
        }
      }

      // Handle search focus shortcut (cmd/ctrl + k)
      if (event.key === "k" || event.key === "K") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    },
    [displayedChats, currentChatId, handleChatClick]
  );

  // Add keyboard event listeners for chat navigation
  useEffect(() => {
    document.addEventListener("keydown", handleChatNavigation);
    return () => {
      document.removeEventListener("keydown", handleChatNavigation);
    };
  }, [handleChatNavigation]);

  // Determine UI states
  const hasChats = cacheData?.chats && cacheData.chats.length > 0;
  const showEmptySearchResults =
    !isLoadingCache &&
    !isLoadingProp &&
    hasChats &&
    displayedChats.length === 0 &&
    !!debouncedSearchTerm;

  return (
    <div className="flex flex-col h-full dark:bg-[#161719] bg-[#f9f9f9] select-none">
      <span className={cn("text-xl text-center mt-5", pacifico.className)}>
        {" "}
        Better Index
      </span>
      <Button
        onClick={handleNewChatClick}
        className="mx-5 mt-3 cursor-pointer bg-gradient-to-r from-[#2a3f47] via-[#3d5b6b] to-[#2a3f47] hover:from-[#354a52] hover:via-[#4a6b7a] hover:to-[#5a7b8a] text-white border border-[#3d5b6b] hover:border-[#4a6b7a] shadow-lg"
      >
        <p className="text-[14px] font-semibold">New Chat</p>
      </Button>
      <div className="flex-shrink-0 text-center mt-5">
        <Input
          ref={searchInputRef}
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
          <div className="flex justify-center items-center py-2 bg-[#161719]/5 backdrop-blur-xs z-10 sticky top-0">
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
                const isDeleting = deletingChatId === chat.id;
                const isEditing = editingChatId === chat.id;
                const isUpdating = updatingChatId === chat.id;

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
                    onClick={
                      isEditing
                        ? undefined
                        : () => handleChatClick(chat.id, chat.title)
                    }
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) =>
                      !isEditing &&
                      e.key === "Enter" &&
                      handleChatClick(chat.id, chat.title)
                    }
                  >
                    <div
                      className={`hover:bg-neutral-200 dark:hover:bg-[#222325] cursor-pointer rounded-sm p-2 px-3 transition-colors duration-150 group relative ${
                        currentChatId === chat.id
                          ? "bg-neutral-200 dark:bg-[#222325]"
                          : ""
                      } ${
                        isDeleting || isUpdating
                          ? "opacity-50 pointer-events-none"
                          : ""
                      } ${isEditing ? "cursor-default" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => handleEditKeyDown(e, chat.id)}
                              onBlur={() => handleSaveEditTitle(chat.id)}
                              className="text-sm font-medium bg-transparent border-b border-neutral-400 dark:border-neutral-500 focus:border-neutral-600 dark:focus:border-neutral-300 outline-none flex-1 px-1"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => handleSaveEditTitle(chat.id, e)}
                                disabled={isUpdating || !editingTitle.trim()}
                                className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded text-green-600 hover:text-green-500 dark:hover:text-green-400 flex-shrink-0 disabled:opacity-50"
                                title="Save"
                              >
                                {isUpdating ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                              </button>
                              <button
                                onClick={handleCancelEditTitle}
                                disabled={isUpdating}
                                className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-400 hover:text-red-300 dark:hover:text-red-400 flex-shrink-0 disabled:opacity-50"
                                title="Cancel"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm font-medium truncate flex-1">
                              <span className="flex flex-row items-center">
                                {(() => {
                                  const isBranched =
                                    chat.title?.startsWith("Branched - ");
                                  const isImage =
                                    chat.title?.includes("Image:");
                                  let displayTitle =
                                    chat.title || "Untitled Chat";

                                  // Remove prefixes for display
                                  if (isBranched) {
                                    displayTitle = displayTitle.replace(
                                      "Branched - ",
                                      ""
                                    );
                                  }
                                  if (isImage) {
                                    displayTitle = displayTitle
                                      .replace("Image:", "")
                                      .trim();
                                  }

                                  return (
                                    <>
                                      {isBranched && (
                                        <GitBranch className="h-4 w-4 mr-1 text-neutral-600 dark:text-neutral-400 flex-shrink-0" />
                                      )}
                                      {isImage && (
                                        <Image className="h-4 w-4 mr-2 text-neutral-600 dark:text-neutral-400 flex-shrink-0" />
                                      )}
                                      {displayTitle || "Untitled Chat"}
                                    </>
                                  );
                                })()}
                              </span>
                            </p>
                            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-neutral-200 dark:bg-[#222325] px-1 rounded">
                              <button
                                onClick={(e) =>
                                  handleStartEditTitle(chat.id, chat.title, e)
                                }
                                disabled={isDeleting}
                                className="p-1 hover:bg-blue-100 dark:hover:bg-neutral-700 rounded text-neutral-600 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300 flex-shrink-0 cursor-pointer"
                                title="Edit title"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(e) => handleDeleteChat(chat.id, e)}
                                disabled={isDeleting}
                                className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-neutral-600 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 flex-shrink-0 cursor-pointer"
                                title="Delete chat"
                              >
                                {isDeleting ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col">
        <BringYourOwnKey />
        {user?.emailVerified === false || !user || isNewUser ? (
          <SignInComponent />
        ) : (
          <div
            className="flex items-center gap-2 p-3 mx-2 mb-2 mt-2 dark:bg-[#222325] bg-neutral-200 rounded-md cursor-pointer"
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
                <User size={20} className="dark:text-white" />
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium dark:text-white">
                {user?.name || "User"}
              </span>
              <span className="text-xs dark:text-neutral-400 text-neutral-600 truncate max-w-[200px]">
                {user?.email || ""}
              </span>
            </div>
          </div>
        )}
        <Dialog open={openSettings} onOpenChange={setOpenSettings}>
          <DialogContent className="dark:bg-[#1d1e20] h-[60vh] w-[53vw]">
            <DialogHeader>
              <DialogTitle className="hidden">Settings</DialogTitle>
              <Settings />
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

const SignInComponent = () => {
  const [signLoading, setSignLoading] = useState(false);
  return (
    <Button
      className="cursor-pointer mx-2 mt-3 mb-2"
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
