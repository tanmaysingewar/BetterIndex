interface Chat {
  id: string;
  title: string;
  createdAt: string; // Keep this, might be useful for sorting later if needed
}

interface PaginationInfo {
  currentPage: number;
  pageSize: number;
  totalChats: number;
  totalPages: number;
}

// Define a specific cache key for all chats
const ALL_CHATS_CACHE_KEY = "chatHistoryCache";

// Define a specific cache key for shared chats
const SHARED_CHATS_CACHE_KEY = "sharedChatHistoryCache";

// Define the structure for the data we'll store
interface AllChatsCacheData {
  chats: Chat[];
  totalChats: number; // Store the total count reported by the API
  timestamp: number; // Timestamp of when the cache was created
}

// Define a custom event name for cache updates
export const CHAT_CACHE_UPDATED_EVENT = "chatCacheUpdated";

/**
 * Fetches all chats from the API by paginating and stores them in localStorage.
 *
 * @param {number} [fetchLimit=50] - The number of chats to request per API call during pagination.
 * @returns {Promise<boolean>} - True if fetching and caching were successful, false otherwise.
 */
export const fetchAllChatsAndCache = async (
  fetchLimit: number = 50
): Promise<boolean> => {
  // Check if localStorage is available
  if (typeof window === "undefined" || !window.localStorage) {
    console.error("localStorage is not available. Cannot cache chats.");
    return false;
  }

  console.log("Attempting to fetch all chats for caching...");
  let allChats: Chat[] = [];
  let totalChatsFromApi = 0;
  let totalPages = 1; // Start assuming at least one page

  try {
    // --- Step 1: Fetch the first page to get pagination info ---
    const firstPageUrl = `/api/chats?page=1&limit=${fetchLimit}`;
    console.log(`Fetching: ${firstPageUrl}`);
    const responsePage1 = await fetch(firstPageUrl);

    if (!responsePage1.ok) {
      throw new Error(
        `API Error (Page 1): ${responsePage1.status} ${responsePage1.statusText}`
      );
    }

    const dataPage1 = await responsePage1.json();

    // Validate the response structure
    if (
      !dataPage1 ||
      !Array.isArray(dataPage1.chats) ||
      !dataPage1.pagination
    ) {
      throw new Error("Invalid API response structure received from Page 1.");
    }

    const paginationInfo: PaginationInfo = dataPage1.pagination;
    allChats = dataPage1.chats; // Add chats from the first page
    totalPages = paginationInfo.totalPages || 1;
    totalChatsFromApi = paginationInfo.totalChats || allChats.length; // Use reported total if available

    console.log(
      `Page 1 fetched. Total Pages: ${totalPages}, Total Chats (Reported): ${totalChatsFromApi}`
    );

    // --- Step 2: Fetch remaining pages if necessary ---
    if (totalPages > 1) {
      const pagePromises: Promise<Chat[]>[] = [];
      for (let page = 2; page <= totalPages; page++) {
        const pageUrl = `/api/chats?page=${page}&limit=${fetchLimit}`;
        console.log(`Queueing fetch: ${pageUrl}`);
        pagePromises.push(
          fetch(pageUrl)
            .then((res) => {
              if (!res.ok) {
                throw new Error(
                  `API Error (Page ${page}): ${res.status} ${res.statusText}`
                );
              }
              return res.json();
            })
            .then((data) => {
              if (!data || !Array.isArray(data.chats)) {
                throw new Error(
                  `Invalid API response structure received from Page ${page}.`
                );
              }
              return data.chats; // We only need the chats array from subsequent pages
            })
        );
      }

      // Execute all remaining page fetches in parallel
      const subsequentPagesChats = await Promise.all(pagePromises);

      // Flatten the array of chat arrays and append to allChats
      subsequentPagesChats.forEach((pageChats) => {
        allChats = allChats.concat(pageChats);
      });

      console.log(`Fetched remaining ${totalPages - 1} pages.`);
    }

    // --- Step 3: Store the combined data in localStorage ---
    const cacheData: AllChatsCacheData = {
      chats: allChats,
      totalChats: totalChatsFromApi, // Store the total count reported by the API
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(ALL_CHATS_CACHE_KEY, JSON.stringify(cacheData));
      console.log(
        `Successfully fetched and cached ${allChats.length} chats (API reported ${totalChatsFromApi}) under key "${ALL_CHATS_CACHE_KEY}".`
      );

      // Dispatch a custom event when cache is updated
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(CHAT_CACHE_UPDATED_EVENT));
      }

      // Optional: Verify if fetched count matches reported count
      if (allChats.length !== totalChatsFromApi) {
        console.warn(
          `Mismatch: Fetched ${allChats.length} chats, but API reported ${totalChatsFromApi}.`
        );
      }
      return true;
    } catch (storageError) {
      console.error("Failed to save chats to localStorage:", storageError);
      // Consider potential storage limits
      if (
        storageError instanceof Error &&
        storageError.name === "QuotaExceededError"
      ) {
        console.error(
          "LocalStorage quota exceeded. Unable to cache all chats."
        );
      }
    }

    return false;
  } catch (error) {
    console.error("Failed to fetch all chats:", error);
    // Optional: You might want to clear any potentially incomplete cache entry
    // localStorage.removeItem(ALL_CHATS_CACHE_KEY);
    return false;
  }
};

export const fetchSharedChatsAndCache = async (): Promise<boolean> => {
  // Check if localStorage is available
  if (typeof window === "undefined" || !window.localStorage) {
    console.error("localStorage is not available. Cannot cache shared chats.");
    return false;
  }

  console.log("Attempting to fetch all shared chats for caching...");

  try {
    // Fetch shared chats from the API (no pagination needed based on the route structure)
    const apiUrl = `/api/share-chat`;
    console.log(`Fetching: ${apiUrl}`);
    const response = await fetch(apiUrl, {
      method: "GET",
      credentials: "include", // Include cookies for authentication
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error("Authentication failed. User not logged in.");
      } else if (response.status === 403) {
        console.error("Access forbidden.");
      } else {
        console.error(`API Error: ${response.status} ${response.statusText}`);
      }
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Validate the response structure
    if (!data || !Array.isArray(data.chats)) {
      throw new Error("Invalid API response structure received.");
    }

    const sharedChats: Chat[] = data.chats;
    const totalSharedChats = data.count || sharedChats.length;

    console.log(
      `Fetched ${sharedChats.length} shared chats (API reported ${totalSharedChats})`
    );

    // Store the data in localStorage
    const cacheData: AllChatsCacheData = {
      chats: sharedChats,
      totalChats: totalSharedChats,
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(SHARED_CHATS_CACHE_KEY, JSON.stringify(cacheData));
      console.log(
        `Successfully fetched and cached ${sharedChats.length} shared chats under key "${SHARED_CHATS_CACHE_KEY}".`
      );

      // Dispatch a custom event when cache is updated
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(CHAT_CACHE_UPDATED_EVENT));
      }

      return true;
    } catch (storageError) {
      console.error(
        "Failed to save shared chats to localStorage:",
        storageError
      );
      // Consider potential storage limits
      if (
        storageError instanceof Error &&
        storageError.name === "QuotaExceededError"
      ) {
        console.error(
          "LocalStorage quota exceeded. Unable to cache all shared chats."
        );
      }
      return false;
    }
  } catch (error) {
    console.error("Failed to fetch shared chats:", error);
    return false;
  }
};
