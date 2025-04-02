import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

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
// const CACHE_TTL = 5 * 60 * 1000; // Optional TTL

// --- Cache Helpers ---
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

// --- Debounce Hook ---
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

// --- Component ---
export default function ChatHistory() {
  // Load cache *inside* the component to get the latest on each mount
  // We use useRef to store it so it doesn't trigger re-renders if cache changes
  // between renders but before the effect runs.
  const initialCacheRef = useRef<CachedChatData | null>(loadFromCache());

  const [chats, setChats] = useState<Chat[]>(
    initialCacheRef.current?.chats || [],
  );
  const [pagination, setPagination] = useState<PaginationInfo | null>(
    initialCacheRef.current?.pagination || null,
  );
  const [currentPage, setCurrentPage] = useState(1);
  // Start loading true only if there's no initial cache for page 1
  const [isLoading, setIsLoading] = useState(!initialCacheRef.current);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const router = useRouter();
  const limit = 10;
  // Ref to track if it's the very first fetch cycle of this component instance
  const isInitialFetchCycle = useRef(true);

  const fetchChats = useCallback(
    async (page: number, search: string = "") => {
      // Determine if loading indicator should be shown
      // Show loading if:
      // - It's not page 1 OR
      // - It's a search OR
      // - It's the very first fetch cycle AND there was no initial cache
      const showLoadingIndicator =
        page !== 1 ||
        search ||
        (isInitialFetchCycle.current && !initialCacheRef.current);

      if (showLoadingIndicator) {
        setIsLoading(true);
      }
      setError(null); // Clear previous errors on new fetch
      console.log(
        `Fetching chats - Page: ${page}, Limit: ${limit}, Search: "${search}"`,
      );

      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (search) {
        queryParams.set("search", search);
      }

      try {
        const response = await fetch(`/api/chats?${queryParams.toString()}`);

        if (!response.ok) {
          let errorMsg = `Failed to fetch chats (${response.status})`;
          try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
          } catch (e) {
            console.log("ERROR", e);
          }
          throw new Error(errorMsg);
        }

        const data = await response.json();
        console.log("Fetched data from API:", data);

        const fetchedChats = data.chats || [];
        const fetchedPagination = data.pagination; // API should provide this structure

        // Update state
        setChats(fetchedChats);
        setPagination(fetchedPagination || null); // Handle potential null from API

        // Update cache ONLY if it's the first page AND not a search result AND pagination exists
        if (page === 1 && !search && fetchedPagination) {
          console.log("Save condition MET. Attempting to save to cache...");
          saveToCache(fetchedChats, fetchedPagination);
        } else {
          console.log("Save condition NOT MET.");
          if (page !== 1) console.log("Reason: Page is not 1.");
          if (search) console.log("Reason: Search term exists.");
          if (!fetchedPagination)
            console.log("Reason: Fetched pagination is missing.");
        }
      } catch (err) {
        console.error("Error fetching chats:", err);
        const errorMessage =
          err instanceof Error ? err.message : "An unknown error occurred";
        setError(errorMessage);

        // Clear data only if the error occurred during a search or non-page-1 fetch,
        // or if there was no initial cache to fall back to.
        // Keep potentially stale data (from initial cache or previous successful fetch)
        // if the error happens when fetching page 1 without search.
        if (search || page !== 1 || !initialCacheRef.current) {
          setChats([]);
          setPagination(null);
        } else {
          // Optionally add a more specific error message when showing stale data
          setError(`${errorMessage} (showing potentially stale data)`);
        }
      } finally {
        setIsLoading(false);
        isInitialFetchCycle.current = false; // Mark initial fetch cycle as complete
      }
    },
    [limit], // fetchChats depends only on limit
  );

  // Effect for fetching data when page or search term changes
  useEffect(() => {
    console.log(
      `Effect triggered: Fetching page ${currentPage}, search "${debouncedSearchTerm}"`,
    );
    // Fetch chats whenever currentPage or debouncedSearchTerm changes.
    // The fetchChats function itself handles the caching logic.
    fetchChats(currentPage, debouncedSearchTerm);

    // fetchChats is stable due to useCallback with only `limit` dependency.
  }, [currentPage, debouncedSearchTerm, fetchChats]);

  // Effect for resetting page to 1 when search term changes
  useEffect(() => {
    // Reset to page 1 when search term changes, but not on initial mount/load
    // Check isInitialFetchCycle to prevent resetting page on the very first load
    // if debouncedSearchTerm is initially empty.
    if (!isInitialFetchCycle.current) {
      setCurrentPage(1);
    }
  }, [debouncedSearchTerm]);

  // --- Handlers and Formatting (keep as before) ---

  const handleChatClick = (chatId: string) => {
    console.log("Navigating to chat:", chatId);
    router.push(`/chat/${chatId}`);
  };

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

  // const formatDate = (dateString: string) => {
  //   // ... (implementation remains the same)
  //   try {
  //     return new Date(dateString).toLocaleDateString(undefined, {
  //       year: "numeric",
  //       month: "short",
  //       day: "numeric",
  //     });
  //   } catch {
  //     return "Invalid Date";
  //   }
  // };

  // --- Render Logic ---
  const showEmptySearchResults =
    !isLoading && !error && chats.length === 0 && !!debouncedSearchTerm;
  const showNoChatsOverall =
    !isLoading && !error && chats.length === 0 && !debouncedSearchTerm;

  return (
    <div className="flex flex-col h-full border-r min-h-[652px]">
      {/* Search Input */}
      <div className="flex-shrink-0">
        <Input
          placeholder="Search chats..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ fontSize: "16px" }}
          className="w-full border-0 ring-0 h-[60px] border-b rounded-none px-4 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      {/* Chat List Area */}
      <div className="flex-grow p-4 overflow-y-auto">
        {/* {showLoading && (
          <p className="text-center text-gray-500">Loading chats...</p>
        )} */}
        {error && <p className="text-center text-red-500">Error: {error}</p>}
        {showEmptySearchResults && (
          <p className="text-center text-gray-500">
            No chats found matching {debouncedSearchTerm}.
          </p>
        )}
        {showNoChatsOverall && (
          <p className="text-center text-gray-500">No chats found.</p>
        )}

        {!error && chats.length > 0 && (
          <div className="gap-1 flex flex-col">
            {chats.map((chat) => (
              <div
                key={chat.id}
                className="hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer rounded-lg p-3 transition-colors duration-150"
                onClick={() => handleChatClick(chat.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && handleChatClick(chat.id)}
              >
                <p className="text-[15px] font-medium truncate">
                  {chat.title || "Untitled Chat"}
                </p>
                {/* Optional: Display date if needed */}
                {/* <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(chat.createdAt)}
                </p> */}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination Controls Area */}
      <div className="flex-shrink-0 border-t h-[60px] flex items-center justify-between px-4">
        {pagination && pagination.totalChats > 0 ? (
          <>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Page {pagination.currentPage} of {pagination.totalPages} (
              {pagination.totalChats} chats)
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
          !isLoading &&
          !error && <span className="text-sm text-gray-500"></span> // Keep empty span or add "No chats" text if preferred
        )}
      </div>
    </div>
  );
}
