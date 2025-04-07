import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

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

interface CachedChatData {
  chats: Chat[];
  pagination: PaginationInfo;
  timestamp: number;
}

const CACHE_KEY = "chatHistoryCache_page1";

const loadFromCache = (): CachedChatData | null => {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const data: CachedChatData = JSON.parse(cached);
    if (
      !data ||
      !Array.isArray(data.chats) ||
      !data.pagination ||
      data.pagination.currentPage !== 1
    ) {
      console.warn("Invalid cache structure found. Clearing.");
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

const saveToCache = (chats: Chat[], pagination: PaginationInfo) => {
  if (typeof window === "undefined") return;
  if (pagination.currentPage !== 1) {
    return;
  }
  try {
    const data: CachedChatData = {
      chats,
      pagination,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (error) {
  }
};

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
  max_chats: number;
  onClose: () => void;
}

export default function ChatHistory({ max_chats, onClose }: ChatHistoryProps) {
  const initialCacheRef = useRef<CachedChatData | null>(loadFromCache());

  const [chats, setChats] = useState<Chat[]>(
    initialCacheRef.current?.chats || [],
  );
  const [pagination, setPagination] = useState<PaginationInfo | null>(
    initialCacheRef.current?.pagination || null,
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(!initialCacheRef.current);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const router = useRouter();
  const limit = max_chats;
  const isInitialFetchCycle = useRef(true);

  const fetchChats = useCallback(
    async (page: number, search: string = "") => {
      const showLoadingIndicator =
        page !== 1 ||
        search ||
        (isInitialFetchCycle.current && !initialCacheRef.current);

      if (showLoadingIndicator) {
        setIsLoading(true);
      }
      setError(null);

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
          }
          throw new Error(errorMsg);
        }

        const data = await response.json();

        const fetchedChats = data.chats || [];
        const fetchedPagination = data.pagination;

        setChats(fetchedChats);
        setPagination(fetchedPagination || null);

        if (page === 1 && !search && fetchedPagination) {
          saveToCache(fetchedChats, fetchedPagination);
        }
      } catch (err) {
        console.error("Error fetching chats:", err);
        const errorMessage =
          err instanceof Error ? err.message : "An unknown error occurred";
        setError(errorMessage);

        if (search || page !== 1 || !initialCacheRef.current) {
          setChats([]);
          setPagination(null);
        } else {
          setError(`${errorMessage} (showing potentially stale data)`);
        }
      } finally {
        setIsLoading(false);
        isInitialFetchCycle.current = false;
      }
    },
    [limit],
  );

  useEffect(() => {
    fetchChats(currentPage, debouncedSearchTerm);
  }, [currentPage, debouncedSearchTerm, fetchChats]);

  useEffect(() => {
    if (!isInitialFetchCycle.current) {
      setCurrentPage(1);
    }
  }, [debouncedSearchTerm]);

  const handleChatClick = (chatId: string) => {
    if (location.pathname === `/chat?chatId=${chatId}`) {
      return;
    }
    router.push(`/chat?chatId=${chatId}`);
    onClose(); // Call the onClose function here
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

  const showEmptySearchResults =
    !isLoading && !error && chats.length === 0 && !!debouncedSearchTerm;
  const showNoChatsOverall =
    !isLoading && !error && chats.length === 0 && !debouncedSearchTerm;

  return (
    <div className="flex flex-col h-full border-r md:min-h-[652px]">
      <div className="flex-shrink-0">
        <Input
          placeholder="Search chats..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ fontSize: "16px" }}
          className="w-full border-0 ring-0 h-[60px] border-b rounded-none px-4 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      <div className="flex-grow p-4 overflow-y-auto">
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
                className={`hover:bg-neutral-200 dark:hover:bg-neutral-800 cursor-pointer rounded-lg p-3 transition-colors duration-150 ${new URLSearchParams(location.search).get("chatId") === chat.id
                    ? "bg-neutral-100 dark:bg-neutral-700/80"
                    : ""
                  }`}

                onClick={() => handleChatClick(chat.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  e.key === "Enter" && handleChatClick(chat.id)
                }
              >
                <p className="text-[15px] font-medium truncate">
                  {chat.title || "Untitled Chat"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

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
          !error && <span className="text-sm text-gray-500"></span>
        )}
      </div>
    </div>
  );
}
