// import Groq from "groq-sdk";
import { auth } from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";
import { db } from "@/database/db";
import { nanoid } from "nanoid";
import { chat, messages, user } from "@/database/schema/auth-schema";
import { eq } from "drizzle-orm"; // Import eq for querying
import { QdrantClient } from "@qdrant/js-client-rest"; // Import Qdrant client
import OpenAI from "openai"; // Import OpenAI

// --- API Keys ---x
const grokApiKey = process.env.XAI_API_KEY;
const qdrantApiKey = process.env.QDRANT_API_KEY;
const qdrantUrl =
  process.env.QDRANT_URL ||
  "https://18ba2c2a-f7d7-4ee0-bf76-40eebb84a4c5.us-east4-0.gcp.cloud.qdrant.io"; // Use env var or default
const openaiApiKey = process.env.OPENAI_API_KEY; // Get OpenAI API Key
// No need for a static QDRANT_COLLECTION_NAME anymore

if (!grokApiKey) {
  console.warn("XAI_API_KEY environment variable not set.");
}
if (!qdrantApiKey) {
  console.error(
    "QDRANT_API_KEY environment variable not set. Qdrant search will fail."
  );
  // Potentially throw an error or handle this case depending on requirements
}
if (!openaiApiKey) {
  console.error(
    "OPENAI_API_KEY environment variable not set. Embedding generation will fail."
  );
  // Consider throwing an error or handling this more gracefully
}

// Instantiate Qdrant Client
const qdrantClient = new QdrantClient({
  url: qdrantUrl,
  apiKey: qdrantApiKey,
});

// Instantiate OpenAI Client
const openai = new OpenAI({
  apiKey: openaiApiKey,
});

const grokClient = new OpenAI({
  apiKey: grokApiKey,
  baseURL: "https://api.x.ai/v1",
});

// Function to generate embeddings using OpenAI text-embedding-3-large
async function generateEmbedding(text: string): Promise<number[]> {
  // Normalize the input text to replace newlines, which can affect performance.
  const input = text.replace(/\n/g, " ");

  if (!openaiApiKey) {
    console.error("OpenAI API Key not configured. Cannot generate embeddings.");
    throw new Error("OpenAI API Key not configured."); // Throw error to prevent proceeding
  }

  try {
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-large", // Specify the model
      input: input,
      // Optionally specify dimensions if your Qdrant collection uses a smaller size
      // dimensions: 1536, // Or 256, 512 etc. if needed and supported by your Qdrant setup
    });

    // Check if the response structure is as expected
    if (
      !embeddingResponse ||
      !embeddingResponse.data ||
      !embeddingResponse.data[0] ||
      !embeddingResponse.data[0].embedding
    ) {
      console.error(
        "Invalid response structure from OpenAI API:",
        embeddingResponse
      );
      throw new Error(
        "Failed to get embedding from OpenAI: Invalid response structure."
      );
    }

    const vector = embeddingResponse.data[0].embedding;
    // console.log(`Generated embedding of dimension: ${vector.length}`); // Optional: Log dimension
    return vector;
  } catch (error) {
    console.error("Error generating embedding from OpenAI:", error);
    // Re-throw the error or handle it appropriately (e.g., return a default/empty vector or throw specific error)
    throw new Error(
      `Failed to generate embedding: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// Helper function to generate title
async function generateTitle(userMessage: string): Promise<string> {
  try {
    const completion = await grokClient.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "Generate a concise and relevant title for the chat based solely on the user's messages in less than 50 words. The title should be plain text without any symbols, prefixes, or formatting. Do not respond to the query or provide explanations—just return the title directly.",
        },
        {
          role: "user",
          content: userMessage.trim().substring(0, 100),
        },
      ],
      model: "grok-3-beta",
      temperature: 0.1,
    });

    return (
      completion.choices[0]?.message
        ?.content!.trim()
        .substring(0, 100)
        .replace(/"/g, "") || "Untitled Chat"
    );
  } catch (error) {
    console.error("Error generating title:", error);
    return "Untitled Chat"; // Fallback title
  }
}

// Helper function to handle new chat creation (title generation + DB insert)
async function handleNewChatCreation(
  isNewChat: boolean,
  chatId: string,
  userMessage: string,
  userId: string
): Promise<string> {
  if (!isNewChat) {
    return ""; // Not a new chat, no title needed from this flow
  }

  const title = await generateTitle(userMessage);
  try {
    await db.insert(chat).values({
      id: chatId,
      title: title,
      userId: userId,
      createdAt: new Date(),
    });
    return title;
  } catch (dbError) {
    console.error(`Database error inserting new chat ${chatId}:`, dbError);
    // Decide how to handle DB error during creation. Re-throw or return default?
    // For now, let's return the generated title but log the error.
    // The stream will still proceed, but the chat might not be saved correctly.
    return title; // Return title even if DB insert fails, maybe log severity?
  }
}

// Helper function to create the response stream and handle Groq interaction + saving
async function createChatResponseStream(
  messagesToSend: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>,
  chatId: string,
  originalUserMessage: string
): Promise<ReadableStream> {
  const encoder = new TextEncoder();
  let fullBotResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const completion = await grokClient.chat.completions.create({
          messages: messagesToSend,
          model: "grok-3-mini-fast-beta",
          temperature: 0.7,
          stream: true as const,
        });

        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            fullBotResponse += content;
            controller.enqueue(encoder.encode(content));
          }
        }

        // Save message pair after successful streaming
        if (fullBotResponse.trim() === "") {
          console.warn(
            `Groq returned an empty response for chat ${chatId}. Not saving empty message pair.`
          );
        } else {
          try {
            await db.insert(messages).values({
              id: nanoid(),
              userMessage: originalUserMessage.trim(),
              botResponse: fullBotResponse,
              chatId: chatId,
              createdAt: new Date(),
            });
          } catch (dbError) {
            console.error(
              `Error saving message pair for chat ${chatId}:`,
              dbError
            );
            // Log error but don't necessarily stop the stream response
          }
        }
      } catch (error) {
        console.error("Groq streaming or processing error:", error);
        // Encode the error message to send it to the client if needed
        // controller.enqueue(encoder.encode(`\n\n[Error: ${error instanceof Error ? error.message : 'Failed to get response'}]`));
        controller.error(error); // Signal stream error
      } finally {
        controller.close();
      }
    },
  });

  return stream;
}

export async function POST(req: Request) {
  // --- Standard Response Headers for Streaming ---

  let currentChatId: string | null = null;
  let isNewChatFlow = false; // Flag to indicate if we created the chat in this request
  let userId = "";

  try {
    // --- 1. Get Headers and Body ---
    const requestHeaders = await nextHeaders();
    currentChatId = requestHeaders.get("X-Chat-ID");
    const { message, previous_conversations } = await req.json();

    // --- 2. Validate Input ---
    if (!currentChatId) {
      console.error("API Error: Missing X-Chat-ID header");
      return new Response(
        JSON.stringify({ error: "Missing X-Chat-ID header" }),
        { status: 400 }
      ); // Simplified error
    }
    if (!message || typeof message !== "string" || message.trim() === "") {
      console.error("API Error: Missing or invalid message content");
      return new Response(
        JSON.stringify({ error: "Message content is required" }),
        { status: 400 }
      );
    }

    // --- 3. Authentication ---
    const sessionData = await auth.api.getSession({ headers: requestHeaders });
    if (!sessionData?.session || !sessionData?.user?.id) {
      console.error("API Error: Unauthorized access attempt");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }
    userId = sessionData.user.id; // Assign userId here

    // ------- Rate Limit ----------
    const userData = await db
      .select({
        id: user.id,
        rateLimit: user.rateLimit,
        updatedAt: user.updatedAt,
        isAnonymous: user.isAnonymous,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!userData || userData.length === 0) {
      console.error(`API Error: User data not found for ID ${userId}`);
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
      });
    }

    let { rateLimit } = userData[0];
    const { updatedAt, isAnonymous } = userData[0];
    const now = new Date();
    const twelveHoursInMillis = 12 * 60 * 60 * 1000;
    let limitWasReset = false;

    // check if quoteRemain is zero and updatedAt and current has difference of the 12 hr then reset the limit
    if (rateLimit === "0") {
      const timeDifference = now.getTime() - updatedAt.getTime();
      if (timeDifference >= twelveHoursInMillis) {
        // if user is isAnonymous true then reset limit to 1
        // if user in isAnonymous false the reset limit to 10
        const newLimit = isAnonymous ? "1" : "10";
        try {
          await db
            .update(user)
            .set({ rateLimit: newLimit, updatedAt: now })
            .where(eq(user.id, userId));
          rateLimit = newLimit; // Update local variable
          limitWasReset = true;
          console.log(`Rate limit reset for user ${userId} to ${newLimit}.`);
        } catch (dbError) {
          console.error(
            `Database error resetting rate limit for user ${userId}:`,
            dbError
          );
          // Decide if you want to block the request or proceed cautiously
          // For now, we'll return an error
          return new Response(
            JSON.stringify({ error: "Database error during rate limit reset" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Check if the limit is still zero after potential reset attempt
    if (rateLimit === "0") {
      let remainingTimeMessage = "Please try again later.";
      // Calculate remaining time ONLY if the limit wasn't just reset in this request
      if (!limitWasReset) {
        const resetTime = new Date(updatedAt.getTime() + twelveHoursInMillis);
        const remainingMillis = resetTime.getTime() - now.getTime();

        if (remainingMillis > 0) {
          const totalSeconds = Math.max(0, Math.floor(remainingMillis / 1000)); // Ensure non-negative
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          const seconds = totalSeconds % 60;

          const parts = [];
          if (hours > 0) parts.push(`${hours} hour${hours > 1 ? "s" : ""}`);
          if (minutes > 0)
            parts.push(`${minutes} minute${minutes > 1 ? "s" : ""}`);
          // Only show seconds if the remaining time is less than a minute
          if (hours === 0 && minutes === 0 && seconds > 0)
            parts.push(`${seconds} second${seconds > 1 ? "s" : ""}`);
          // Handle case where time is very short or slightly negative due to timing
          else if (hours === 0 && minutes === 0 && seconds <= 0)
            parts.push("a few moments");

          if (parts.length > 0) {
            remainingTimeMessage = `Please try again in approximately ${parts.join(
              ", "
            )}.`;
          }
        }
      }

      console.warn(`API Warning: Rate limit exceeded for user ${userId}.`);
      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded. ${remainingTimeMessage}`,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // --- 5. Check Chat Existence, Ownership, or Create New ---
    try {
      // Attempt to find the chat
      const results = await db
        .select({ id: chat.id, userId: chat.userId })
        .from(chat)
        .where(eq(chat.id, currentChatId))
        .limit(1);
      const existingChat = results[0];

      if (existingChat) {
        // Chat exists - check ownership
        if (existingChat.userId !== userId) {
          console.error(
            `API Error: User ${userId} forbidden access to chat ${currentChatId} owned by ${existingChat.userId}.`
          );
          return new Response(
            JSON.stringify({
              error: "Forbidden: Chat does not belong to user",
            }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
        // Chat exists and belongs to the user
        isNewChatFlow = false;
      } else {
        // Chat does NOT exist - Create it using the ID from the frontend
        isNewChatFlow = true; // Mark that we need to create this chat
      }
    } catch (dbError) {
      console.error(
        `Database error during chat check/creation for ID ${currentChatId}:`,
        dbError
      );
      return new Response(
        JSON.stringify({ error: "Database error during chat handling" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // --- 6. Prepare messages for Groq API ---
    const messages_format: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [{ role: "system", content: "You are a helpful assistant." }];

    if (!isNewChatFlow && Array.isArray(previous_conversations)) {
      // If it's an existing chat, add previous messages sent by the client
      const validPreviousConversations = previous_conversations.filter(
        (msg) =>
          msg &&
          (msg.role === "user" || msg.role === "assistant") &&
          typeof msg.content === "string" &&
          msg.content.trim() !== ""
      );
      messages_format.push(...validPreviousConversations);
    }

    // ----------- Add the Context Here ----------

    function extractAndCleanWordWithAt(sentence: string): string | undefined {
      const words = sentence.split(/\s+/);
      const wordWithAt = words.find((word) => word.startsWith("@"));

      if (wordWithAt) {
        return wordWithAt.slice(1).toLowerCase();
      }

      return undefined;
    }

    const searchNameSpace = extractAndCleanWordWithAt(message); // This is now the collection name
    let docs: string[] = []; // Initialize docs as an empty array

    // Check if we have a namespace (collection name) and the Qdrant/OpenAI API keys are set
    if (searchNameSpace && qdrantApiKey && openaiApiKey) {
      console.log(`Searching Qdrant in collection '${searchNameSpace}'...`);
      try {
        // 1. Generate embedding for the user's message
        const queryVector = await generateEmbedding(message); // Now uses OpenAI

        // 2. Search Qdrant using searchNameSpace as the collection name
        const searchResult = await qdrantClient.search(searchNameSpace, {
          vector: queryVector,
          limit: 5,
          with_payload: true,
        });

        // 3. Extract content from results
        docs = searchResult
          .map((point) => point.payload?.content as string)
          .filter(
            (content) => typeof content === "string" && content.trim() !== ""
          );

        console.log("Retrieved context documents from Qdrant:", docs.length);
      } catch (error) {
        // Log errors from embedding generation or other Qdrant issues
        console.error(
          `Error during Qdrant search/embedding process for collection '${searchNameSpace}':`,
          error
        );
        docs = []; // Ensure docs is empty on error
      }
    } else if (searchNameSpace && !qdrantApiKey) {
      console.warn("Qdrant API Key not configured. Skipping context search.");
    } else if (searchNameSpace && !openaiApiKey) {
      console.warn("OpenAI API Key not configured. Skipping context search.");
    }

    // -------------------------------------------------

    const docsString: string =
      docs.length > 0 ? JSON.stringify(docs) : "No relevant context found."; // Updated message

    // Add the current user message
    messages_format.push({
      role: "user",
      content: `
      ------------ Context ------------
      ${docsString}
      ----------------------------------
      Message:
      ${message.trim()}`,
    });

    // --- 7. Stream Groq Response and Save Message ---
    const finalChatId = currentChatId; // Use the validated/created chat ID

    // --- 4. Decrement Rate Limit (if quota allows) ---
    try {
      await db
        .update(user)
        .set({ rateLimit: String(Number(rateLimit) - 1) }) // Decrement the limit
        .where(eq(user.id, userId));

      console.log("Quote decrease", String(Number(rateLimit) - 1));
    } catch (dbError) {
      console.error(
        `Database error decrementing rate limit for user ${userId}:`,
        dbError
      );
      // Log error but proceed with the request as the check passed initially
    }

    // --- 8. Run Title Creation (if needed) and Stream Generation Concurrently ---
    try {
      // Start both tasks concurrently
      const [title, stream] = await Promise.all([
        handleNewChatCreation(isNewChatFlow, finalChatId, message, userId),
        createChatResponseStream(messages_format, finalChatId, message),
      ]);

      // --- 9. Construct and Return the Response ---
      const responseHeaders = new Headers({
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      // Add X-Title header ONLY if a new chat was created and title generated
      if (isNewChatFlow && title) {
        responseHeaders.set("X-Title", title);
      }

      return new Response(stream, {
        headers: responseHeaders,
      });
    } catch (concurrentError) {
      // This catches errors from Promise.all, likely from one of the helper functions
      console.error(
        "Error during concurrent title/stream generation:",
        concurrentError
      );
      // Determine which task failed if possible, or return a generic error
      return new Response(
        JSON.stringify({ error: "Failed to process chat request." }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("Unhandled API route error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
