"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Trash2, Edit3, Check, X, Loader2 } from "lucide-react";
import { CHAT_CACHE_UPDATED_EVENT } from "@/lib/fetchChats";

// Interface for individual chat items (remains the same)
interface Chat {
  id: string;
  title: string;
  createdAt: string; // Keep this, might be useful for sorting later if needed
}

// Interface for the calculated pagination state (remains the same)
interface PaginationInfo {
  currentPage: number;
  pageSize: number;
  totalChats: number; // Total chats *after* filtering
  totalPages: number;
}

// Interface for the NEW structure stored in localStorage
interface RawCacheData {
  chats: Chat[];
  totalChats: number; // Total chats originally stored in the cache
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
      typeof data.totalChats !== "number" || // Check for totalChats
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
    // Optional: Could add validation for individual chat items if needed
    // data.chats.forEach(chat => { ... });

    // Return the entire parsed data
    return data;
  } catch (error) {
    console.error("Failed to load or parse cache:", error);
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
};

// saveToCache is no longer needed in this component as it only reads
// and operates on the existing cache. It's assumed another part
// of the application populates the cache in the new format.
/*
const saveToCache = (...) => { ... }; // Removed or commented out
*/

// Debounce hook remains the same
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
  max_chats: number; // This acts as the page size for local pagination
  onClose: () => void;
}

export default function ChatHistory({ max_chats, onClose }: ChatHistoryProps) {
  // Load the *entire* cached chat list once on mount
  const initialCacheDataRef = useRef<RawCacheData | null>(loadFromCache());
  // Store *all* chats from the cache in a ref
  const allCachedChats = useRef<Chat[]>(
    initialCacheDataRef.current?.chats || []
  );

  const [displayedChats, setDisplayedChats] = useState<Chat[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false); // Loading is minimal now
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [updatingChatId, setUpdatingChatId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(
    null
  );
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const limit = max_chats; // Use max_chats as the local page size

  // Function to reload cache data from localStorage
  const reloadCacheData = useCallback(() => {
    const freshCacheData = loadFromCache();
    if (freshCacheData) {
      allCachedChats.current = freshCacheData.chats;

      // Directly call the logic instead of relying on processLocalChats
      // to avoid circular dependency
      setIsLoading(true);
      setError(null);

      // Check if the cache is empty
      if (freshCacheData.chats.length === 0) {
        setDisplayedChats([]);
        setPagination(null);
        setIsLoading(false);
        return;
      }

      try {
        // 1. Filter based on search term (case-insensitive)
        const filteredChats = debouncedSearchTerm
          ? freshCacheData.chats.filter((chat) =>
              (chat.title || "Untitled Chat")
                .toLowerCase()
                .includes(debouncedSearchTerm.toLowerCase())
            )
          : freshCacheData.chats;

        // 2. Calculate pagination based on *filtered* results
        const totalFilteredChats = filteredChats.length;
        const totalPages = Math.ceil(totalFilteredChats / limit) || 1;
        const validatedPage = Math.max(1, Math.min(currentPage, totalPages));

        // 3. Slice the filtered chats for the current page
        const startIndex = (validatedPage - 1) * limit;
        const endIndex = startIndex + limit;
        const chatsForPage = filteredChats.slice(startIndex, endIndex);

        // 4. Update state
        setDisplayedChats(chatsForPage);
        setPagination({
          currentPage: validatedPage,
          pageSize: limit,
          totalChats: totalFilteredChats,
          totalPages: totalPages,
        });
      } catch (err) {
        console.error("Error processing local chats:", err);
        setError("Failed to process cached chat data.");
        setDisplayedChats([]);
        setPagination(null);
      } finally {
        setIsLoading(false);
      }
    }
  }, [currentPage, debouncedSearchTerm, limit]);

  // Define a wrapper function to maintain the same API as before for effect dependencies
  const processLocalChats = useCallback(
    (page: number, search: string) => {
      console.log(page, search);
      // We'll just call reloadCacheData instead of duplicating the logic
      // Since reloadCacheData already uses the current page and search term from state,
      // we don't need to use the parameters
      reloadCacheData();
    },
    [reloadCacheData]
  );

  // Effect to process chats when page or debounced search term changes
  useEffect(() => {
    processLocalChats(currentPage, debouncedSearchTerm);
  }, [currentPage, debouncedSearchTerm, processLocalChats]);

  // Effect to reset to page 1 when the search term changes
  useEffect(() => {
    // Reset to page 1 whenever the search term is modified
    setCurrentPage(1);
  }, [debouncedSearchTerm]);

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
        const currentCacheData = loadFromCache();
        if (currentCacheData) {
          const updatedChats = currentCacheData.chats.filter(
            (chat) => chat.id !== chatId
          );
          const updatedData = {
            ...currentCacheData,
            chats: updatedChats,
            totalChats: updatedChats.length,
            timestamp: Date.now(),
          };

          // Update localStorage
          localStorage.setItem(CACHE_KEY, JSON.stringify(updatedData));

          // Dispatch event to notify other components
          window.dispatchEvent(new CustomEvent(CHAT_CACHE_UPDATED_EVENT));

          // Reload cache data to update UI
          reloadCacheData();
        }

        // If we deleted the currently active chat, redirect to new chat
        const currentChatId = new URLSearchParams(window.location.search).get(
          "chatId"
        );
        if (currentChatId === chatId) {
          const currentSearchParams = new URLSearchParams(
            window.location.search
          );
          currentSearchParams.set("new", "true");
          currentSearchParams.delete("chatId");
          window.history.pushState({}, "", `/chat?${currentSearchParams}`);
          onClose();
        }
      } catch (error) {
        console.error("Error deleting chat:", error);
        setError("Failed to delete chat. Please try again.");
      } finally {
        setDeletingChatId(null);
      }
    },
    [deletingChatId, reloadCacheData, onClose]
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
        const currentCacheData = loadFromCache();
        if (currentCacheData) {
          const updatedChats = currentCacheData.chats.map((chat) =>
            chat.id === chatId ? { ...chat, title: editingTitle.trim() } : chat
          );
          const updatedData = {
            ...currentCacheData,
            chats: updatedChats,
            timestamp: Date.now(),
          };

          // Update localStorage
          localStorage.setItem(CACHE_KEY, JSON.stringify(updatedData));

          // Dispatch event to notify other components
          window.dispatchEvent(new CustomEvent(CHAT_CACHE_UPDATED_EVENT));

          // Reload cache data to update UI
          reloadCacheData();
        }

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
    [editingTitle, updatingChatId, reloadCacheData]
  );

  // Handle canceling chat title edit
  const handleCancelEditTitle = useCallback((event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation(); // Prevent chat click when canceling
    }
    setEditingChatId(null);
    setEditingTitle("");
    setSelectedChatId(null); // Also clear selection
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

  // Handle long press for mobile
  const handleTouchStart = useCallback((chatId: string) => {
    const timer = setTimeout(() => {
      setSelectedChatId(chatId);
      // Add haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500); // 500ms long press
    setLongPressTimer(timer);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  }, [longPressTimer]);

  // Add storage event listener to detect changes to localStorage
  useEffect(() => {
    // This function will be called when localStorage changes in any tab/window
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === CACHE_KEY) {
        console.log("Chat history cache updated in localStorage");
        reloadCacheData();
      }
    };

    const handleCacheUpdate = () => {
      console.log("Chat history cache updated in current tab");
      reloadCacheData();
    };

    // Add the event listener
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(CHAT_CACHE_UPDATED_EVENT, handleCacheUpdate);

    // Clean up
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(CHAT_CACHE_UPDATED_EVENT, handleCacheUpdate);
    };
  }, [reloadCacheData]);

  // Initial processing on mount
  useEffect(() => {
    // Check if cache loading itself resulted in an error state initially
    // if (!initialCacheDataRef.current && allCachedChats.current.length === 0) {
    //   // Attempted to load cache, but it was null/invalid
    //   setError("Failed to load chat history from cache or cache is empty.");
    // }
    // Process whatever was loaded (even if empty)
    processLocalChats(1, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Cleanup effect for touch timers
  useEffect(() => {
    return () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
    };
  }, [longPressTimer]);

  const handleChatClick = (chatId: string) => {
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
  };

  const handleChatSelect = useCallback(
    (chatId: string) => {
      if (selectedChatId === chatId) {
        // Already selected, now navigate to chat
        handleChatClick(chatId);
        setSelectedChatId(null);
      } else {
        // First tap - just select
        setSelectedChatId(chatId);
      }
    },
    [selectedChatId, handleChatClick]
  );

  const handlePreviousPage = () => {
    if (pagination && pagination.currentPage > 1) {
      setCurrentPage(pagination.currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (pagination && pagination.currentPage < pagination.totalPages) {
      setCurrentPage(pagination.currentPage + 1);
    }
  };

  // Determine UI states based on processed local data
  const hasCache = allCachedChats.current.length > 0;
  const showEmptySearchResults =
    !isLoading &&
    !error &&
    hasCache &&
    displayedChats.length === 0 &&
    !!debouncedSearchTerm;
  const showNoChatsInCache = !isLoading && !error && !hasCache;
  // This covers the case where cache exists, but filter yields nothing (and it's not the initial empty cache state)
  const showNoChatsAfterFilter =
    !isLoading &&
    !error &&
    hasCache &&
    displayedChats.length === 0 &&
    !debouncedSearchTerm;

  return (
    <div className="flex flex-col h-full border-r">
      <div className="flex-shrink-0">
        <Input
          placeholder="Search cached chats..." // Updated placeholder
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ fontSize: "16px" }}
          className="w-full border-0 ring-0 h-[60px] border-b rounded-none px-4 focus-visible:ring-0 focus-visible:ring-offset-0"
          // Disable search only if there's definitely no cache AND no error state
          disabled={!hasCache && !error}
        />
      </div>

      <div className="flex-grow p-4 overflow-y-auto">
        {isLoading && <p className="text-center text-gray-500">Loading...</p>}
        {/* Show error first if it exists */}
        {/* {error && !isLoading && (
          <p className="text-center text-red-500">Error: {error}</p>
        )} */}
        {/* Specific message for empty search results */}
        {showEmptySearchResults && (
          <p className="text-center text-gray-500">
            {`No cached chats found matching ${debouncedSearchTerm}.`}
          </p>
        )}
        {/* Message when the cache was empty/invalid from the start */}
        {showNoChatsInCache && (
          <p className="text-center text-gray-500">No cached chats found.</p>
        )}
        {/* Message when cache exists, but current filter (no search term) shows nothing - unlikely but possible */}
        {showNoChatsAfterFilter && (
          <p className="text-center text-gray-500">No chats to display.</p>
        )}

        {/* Display chat list if not loading, no error, and there are chats to display */}
        {!isLoading && !error && displayedChats.length > 0 && (
          <>
            <div className="text-xs text-gray-500 mb-2 px-1 text-center">
              Long press to see options.
            </div>
            <div className="gap-1 flex flex-col">
              {displayedChats.map((chat) => {
                const isDeleting = deletingChatId === chat.id;
                const isEditing = editingChatId === chat.id;
                const isUpdating = updatingChatId === chat.id;
                const isSelected = selectedChatId === chat.id;
                const isActive =
                  new URLSearchParams(location.search).get("chatId") ===
                  chat.id;

                return (
                  <div
                    key={chat.id}
                    className={`active:bg-neutral-200 dark:active:bg-neutral-800 cursor-pointer rounded-lg p-3 transition-colors duration-150 relative ${
                      isActive ? "bg-neutral-100 dark:bg-neutral-700/80" : ""
                    } ${
                      isSelected && !isEditing
                        ? "bg-neutral-200 dark:bg-neutral-700 ring-2 ring-blue-300 dark:ring-blue-600"
                        : ""
                    } ${
                      isDeleting || isUpdating
                        ? "opacity-50 pointer-events-none"
                        : ""
                    } ${isEditing ? "cursor-default" : ""}`}
                    onClick={
                      isEditing ? undefined : () => handleChatSelect(chat.id)
                    }
                    onTouchStart={() => !isEditing && handleTouchStart(chat.id)}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (!isEditing && e.key === "Enter") {
                        handleChatSelect(chat.id);
                      }
                    }}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => handleEditKeyDown(e, chat.id)}
                          onBlur={() => handleSaveEditTitle(chat.id)}
                          className="text-[15px] font-medium bg-transparent border-b border-neutral-400 dark:border-neutral-500 focus:border-neutral-600 dark:focus:border-neutral-300 outline-none flex-1 px-1"
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
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-5 w-5" />
                            )}
                          </button>
                          <button
                            onClick={handleCancelEditTitle}
                            disabled={isUpdating}
                            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-400 hover:text-red-300 dark:hover:text-red-400 flex-shrink-0 disabled:opacity-50"
                            title="Cancel"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-[15px] font-medium truncate flex-1">
                          {chat.title || "Untitled Chat"}
                        </p>
                        {isSelected && (
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              onClick={(e) =>
                                handleStartEditTitle(chat.id, chat.title, e)
                              }
                              disabled={isDeleting}
                              className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 flex-shrink-0 cursor-pointer active:bg-blue-200 dark:active:bg-blue-900/50"
                              title="Edit title"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteChat(chat.id, e)}
                              disabled={isDeleting}
                              className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400 flex-shrink-0 cursor-pointer active:bg-red-200 dark:active:bg-red-900/50"
                              title="Delete chat"
                            >
                              {isDeleting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Optional: Display createdAt if needed */}
                    {/* <p className="text-xs text-gray-500">{new Date(chat.createdAt).toLocaleString()}</p> */}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="flex-shrink-0 border-t h-[60px] flex items-center justify-between px-4">
        {/* Show pagination only if there are chats *after filtering* */}
        {pagination && pagination.totalChats > 0 ? (
          <>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Page {pagination.currentPage} of {pagination.totalPages} (
              {pagination.totalChats}{" "}
              {pagination.totalChats === 1 ? "chat" : "chats"})
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={isLoading || pagination.currentPage <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={
                  isLoading || pagination.currentPage >= pagination.totalPages
                }
              >
                Next
              </Button>
            </div>
          </>
        ) : (
          // Show an empty span or placeholder text if no pagination is needed
          // Avoid showing anything if loading or error occurred
          !isLoading &&
          !error && (
            <span className="text-sm text-gray-500">
              {/* Text shown when cache exists but search yields 0 results, or cache was empty */}
              {hasCache && debouncedSearchTerm
                ? "No matching results"
                : hasCache
                ? "" // Cache exists, no search, but 0 results (unlikely)
                : ""}
              {/* If !hasCache, the main area already shows "No cached chats found" */}
            </span>
          )
        )}
      </div>
    </div>
  );
}
