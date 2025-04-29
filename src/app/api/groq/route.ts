import Groq from "groq-sdk";
import { auth } from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";
import { db } from "@/database/db";
import { nanoid } from "nanoid";
import { chat, messages, user } from "@/database/schema/auth-schema";
import { eq } from "drizzle-orm"; // Import eq for querying

// --- API Key ---
const groqApiKey = process.env.GROQ_API_KEY;
if (!groqApiKey) {
  console.warn(
    "GROQ_API_KEY environment variable not set. Using hardcoded key (NOT RECOMMENDED)."
  );
}
const client = new Groq({
  apiKey:
    groqApiKey || "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", // Replace with your actual key or env var
});

export async function POST(req: Request) {
  // --- Standard Response Headers for Streaming ---

  let currentChatId: string | null = null;
  let isNewChatFlow = false; // Flag to indicate if we created the chat in this request
  let title = "";

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
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!message || typeof message !== "string" || message.trim() === "") {
      console.error("API Error: Missing or invalid message content");
      return new Response(
        JSON.stringify({ error: "Message content is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // --- 3. Authentication ---
    const sessionData = await auth.api.getSession({ headers: requestHeaders });
    if (!sessionData?.session || !sessionData?.user?.id) {
      console.error("API Error: Unauthorized access attempt");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const userId = sessionData.user.id;

    // ------- Rate Limit ----------

    // Check the rate limit
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
        headers: { "Content-Type": "application/json" },
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

        // Generate the title
        const completion = await client.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "Generate a concise and relevant title for the chat based solely on the user's messages. The title should be plain text without any symbols, prefixes, or formatting. Do not respond to the query or provide explanations—just return the title directly.",
            },
            {
              role: "user",
              content: message.trim().substring(0, 100),
            },
          ],
          model: "llama-3.3-70b-versatile",
          temperature: 0.7,
        });

        // Overright the title of the current chat
        title = completion.choices[0]?.message
          ?.content!.trim()
          .substring(0, 100)
          .replace(/"/g, "");

        await db.insert(chat).values({
          id: currentChatId, // Use the ID provided by the frontend
          title: title, // Use first message for title
          userId: userId,
          createdAt: new Date(),
        });
        isNewChatFlow = true; // Mark that we just created this chat
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

    const searchNameSpace = extractAndCleanWordWithAt(message);
    let docs: string[] = []; // Initialize docs as an empty array

    if (searchNameSpace) {
      const searchBody = {
        query: message,
        name_space: searchNameSpace,
      };

      console.log(searchBody);

      try {
        const response = await fetch("http://localhost:8080/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer xx-bi-qqq", // Replace with your actual token or env variable
          },
          body: JSON.stringify(searchBody),
        });

        if (!response.ok) {
          console.error(
            `Context search API error: ${response.status} ${response.statusText}`
          );
          // Handle non-OK responses appropriately, maybe skip context injection
        } else {
          const responseData = await response.json();
          // Ensure documents is an array, default to empty if missing or not an array
          docs = Array.isArray(responseData?.documents)
            ? responseData.documents
            : [];
          console.log("Retrieved context documents:", docs.length); // Log how many documents were retrieved
        }
      } catch (error) {
        console.error("Error calling context search API:", error);
        // Handle fetch or JSON parsing errors, maybe skip context injection
      }
    }

    // -------------------------------------------------

    const docsString: string = JSON.stringify(docs);

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
    const encoder = new TextEncoder();
    let fullBotResponse = "";
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

    // Streaming the Response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const completion = await client.chat.completions.create({
            messages: messages_format,
            model: "llama-3.1-8b-instant",
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
              `Groq returned an empty response for chat ${finalChatId}. Not saving empty message pair.`
            );
          } else {
            try {
              await db.insert(messages).values({
                id: nanoid(),
                userMessage: message.trim(),
                botResponse: fullBotResponse,
                chatId: finalChatId, // Link to the correct chat ID
                createdAt: new Date(),
              });
            } catch (dbError) {
              // Log error but don't necessarily stop the stream response
              console.error("Error saving message pair:", dbError);
            }
          }
        } catch (error) {
          console.error("Groq streaming or processing error:", error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    // Assigning the new header to
    const responseHeaders = new Headers({
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Title": title,
    });

    // --- 8. Return the stream ---
    return new Response(stream, {
      headers: responseHeaders,
    });
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
