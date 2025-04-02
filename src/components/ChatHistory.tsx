import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation"; // For navigation on click
import { Input } from "./ui/input"; // Assuming this is from shadcn/ui
import { Button } from "./ui/button"; // Assuming this is from shadcn/ui

// Define the structure of a single chat item from the API
interface Chat {
  id: string;
  title: string;
  createdAt: string; // Assuming it's an ISO string date
}

// Define the structure of the pagination data from the API
interface PaginationInfo {
  currentPage: number;
  pageSize: number;
  totalChats: number;
  totalPages: number;
}

export default function ChatHistory() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1); // Track the page we want to fetch
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(""); // For the search input

  const router = useRouter();
  const limit = 15; // Or get from config/state

  // Function to fetch chats
  const fetchChats = useCallback(
    async (page: number) => {
      setIsLoading(true);
      setError(null);
      console.log(`Fetching chats for page: ${page}`);

      try {
        // TODO: Add search term to query if implementing search later
        const response = await fetch(`/api/chats?page=${page}&limit=${limit}`);

        if (!response.ok) {
          let errorMsg = `Failed to fetch chats (${response.status})`;
          try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
          } catch (e) {
            /* Ignore if response isn't JSON */
          }
          throw new Error(errorMsg);
        }

        const data = await response.json();
        console.log("Fetched data:", data);

        setChats(data.chats || []);
        setPagination(data.pagination || null);
      } catch (err) {
        console.error("Error fetching chats:", err);
        setError(
          err instanceof Error ? err.message : "An unknown error occurred",
        );
        setChats([]); // Clear chats on error
        setPagination(null);
      } finally {
        setIsLoading(false);
      }
    },
    [limit],
  ); // Dependency array includes limit

  // Effect to fetch chats when the component mounts or currentPage changes
  useEffect(() => {
    fetchChats(currentPage);
  }, [currentPage, fetchChats]); // Re-run when currentPage changes

  // Handler for clicking a chat item
  const handleChatClick = (chatId: string) => {
    console.log("Navigating to chat:", chatId);
    router.replace(`/chat/${chatId}`); // Navigate to the chat page
  };

  // Handlers for pagination buttons
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

  // TODO: Implement search logic - likely involves another useEffect
  // listening to debounced searchTerm and calling fetchChats with search query

  // Helper to format date (optional)
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Invalid Date";
    }
  };

  return (
    <div className="flex flex-col h-full border-r">
      {" "}
      {/* Ensure parent has height */}
      {/* Search Input */}
      <div className="flex-shrink-0">
        <Input
          placeholder="Search chats..." // More specific placeholder
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ fontSize: "16px" }}
          className="w-full border-0 ring-0 h-[60px] border-b rounded-none px-4 focus-visible:ring-0 focus-visible:ring-offset-0" // Added padding
        />
      </div>
      {/* Chat List Area */}
      <div className="flex-grow p-4 overflow-y-auto">
        {" "}
        {/* Use flex-grow */}
        {/* Loading State */}
        {isLoading && (
          <p className="text-center text-gray-500">Loading chats...</p>
        )}
        {/* Error State */}
        {error && <p className="text-center text-red-500">Error: {error}</p>}
        {/* Empty State (after load, no error) */}
        {!isLoading && !error && chats.length === 0 && (
          <p className="text-center text-gray-500">No chats found.</p>
        )}
        {/* Chat List */}
        {!isLoading && !error && chats.length > 0 && (
          <div className="gap-1 flex flex-col">
            {/* TODO: Add date grouping logic here if needed (e.g., "Today", "Yesterday") */}
            {chats.map((chat) => (
              <div
                key={chat.id}
                className="hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer rounded-lg p-3 transition-colors duration-150" // Adjusted hover/rounding
                onClick={() => handleChatClick(chat.id)}
                role="button" // Accessibility
                tabIndex={0} // Accessibility
                onKeyDown={(e) => e.key === "Enter" && handleChatClick(chat.id)} // Accessibility
              >
                <p className="text-[15px] font-medium truncate">
                  {chat.title || "Untitled Chat"}
                </p>{" "}
                {/* Truncate long titles */}
                {/* Optional: Show date */}
                {/* <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(chat.createdAt)}</p> */}
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
          // Show placeholder or nothing if no chats/pagination
          !isLoading &&
          !error && <span className="text-sm text-gray-500"></span>
        )}
      </div>
    </div>
  );
}
