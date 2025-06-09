// import Groq from "groq-sdk";
import { auth } from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";
import { db } from "@/database/db";
import { nanoid } from "nanoid";
import { chat, messages } from "@/database/schema/auth-schema";
import { eq } from "drizzle-orm"; // Import eq for querying
import { tavily } from "@tavily/core";
import OpenAI from "openai";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY! });

const openaiClient = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
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
    const { message, previous_conversations, search_enabled, model } =
      await req.json();

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

    if (message.trim().length > 3000) {
      console.error("API Error: Message too long");
      return new Response(
        JSON.stringify({
          error: "Message too long. Please shorten your message.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    // --- 3. Authentication ---
    const sessionData = await auth.api.getSession({
      headers: requestHeaders,
    });
    if (!sessionData?.session || !sessionData?.user?.id) {
      console.error("API Error: Unauthorized access attempt");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const userId = sessionData.user.id;
    const userEmail = sessionData.user.email;

    // ------- 4. Rate Limit ----------
    let ratelimit;

    if (
      userEmail.includes("@https://www.betterindex.io") ||
      userEmail.includes("@http://localhost:3000")
    ) {
      // Create a new ratelimiter, that allows 1 requests per 24 hours
      ratelimit = new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(1, "24 h"),
      });

      // Use user email as the identifier for rate limiting
      const { success } = await ratelimit.limit(userEmail);

      if (!success) {
        console.warn(`API Warning: Rate limit exceeded for user ${userEmail}.`);
        return new Response(
          JSON.stringify({
            error:
              "You have reached the maximum of requests per 24 hours. Please sign in for a free account to continue.",
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      ratelimit = new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(10, "24 h"),
      });

      // Use user email as the identifier for rate limiting
      const { success } = await ratelimit.limit(userEmail);

      if (!success) {
        console.warn(`API Warning: Rate limit exceeded for user ${userEmail}.`);
        return new Response(
          JSON.stringify({
            error:
              "Rate limit exceeded. You have reached the maximum of 10 requests per 24 hours. Please try again later.",
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
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
        const completion = await openaiClient.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "You are the Title Generator. You are given a message and you need to generate a title for the chat. The title should be plain text without any symbols, prefixes, or formatting. The title should be 10 words or less.",
            },
            {
              role: "user",
              content: message.trim().substring(0, 100),
            },
          ],
          model: "google/gemini-2.0-flash-001",
          temperature: 0.1,
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

    // --- 6. Search Web ---

    async function searchWeb(message: string): Promise<string> {
      try {
        const res = await tavilyClient.search(message, {
          includeAnswer: true,
        });
        console.log("Search Results in Client:", res);
        return JSON.stringify(res);
      } catch (error) {
        console.error("Error in searchWeb:", error);
        return "";
      }
    }

    let searchResults: string = "";

    if (search_enabled) {
      searchResults = await searchWeb(message);
      console.log("Search Results:", searchResults);
    }

    // --- Prepare messages for OpenAI API ---
    const messages_format: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      {
        role: "system",
        content: ``,
      },
    ];

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

    // Add the current user message
    messages_format.push({
      role: "user",
      content: `
      ${message.trim()}`,
    });

    // --- 7. Stream OpenAI Response and Save Message ---
    const encoder = new TextEncoder();
    let fullBotResponse = "";
    const finalChatId = currentChatId; // Use the validated/created chat ID

    // Streaming the Response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const completion = await openaiClient.chat.completions.create({
            messages: messages_format,
            model: model,
            temperature: 0.2,
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
