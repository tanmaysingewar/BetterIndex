import Groq from "groq-sdk";
import { auth } from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";
import { db } from "@/database/db";
import { nanoid } from "nanoid";
import { chat, messages } from "@/database/schema/auth-schema";
import { eq } from "drizzle-orm"; // Import eq for querying

// --- API Key ---
const groqApiKey = process.env.GROQ_API_KEY;
if (!groqApiKey) {
  console.warn(
    "GROQ_API_KEY environment variable not set. Using hardcoded key (NOT RECOMMENDED).",
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
  let tilte = "";

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
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (!message || typeof message !== "string" || message.trim() === "") {
      console.error("API Error: Missing or invalid message content");
      return new Response(
        JSON.stringify({ error: "Message content is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
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

    // --- 4. Check Chat Existence, Ownership, or Create New ---
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
            `API Error: User ${userId} forbidden access to chat ${currentChatId} owned by ${existingChat.userId}.`,
          );
          return new Response(
            JSON.stringify({
              error: "Forbidden: Chat does not belong to user",
            }),
            { status: 403, headers: { "Content-Type": "application/json" } },
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

        // Overight the title of the current chat
        tilte = completion.choices[0]?.message
          ?.content!.trim()
          .substring(0, 100)
          .replace(/"/g, "");

        await db.insert(chat).values({
          id: currentChatId, // Use the ID provided by the frontend
          title: tilte, // Use first message for title
          userId: userId,
          createdAt: new Date(),
        });
        isNewChatFlow = true; // Mark that we just created this chat
      }
    } catch (dbError) {
      console.error(
        `Database error during chat check/creation for ID ${currentChatId}:`,
        dbError,
      );
      return new Response(
        JSON.stringify({ error: "Database error during chat handling" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // --- 5. Prepare messages for Groq API ---
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
          msg.content.trim() !== "",
      );
      messages_format.push(...validPreviousConversations);
    } else if (isNewChatFlow) {
      // For new chats, we ignore any 'previous_conversations' sent (should be empty anyway)
    }

    // Add the current user message
    messages_format.push({ role: "user", content: message.trim() });

    // --- 6. Stream Groq Response and Save Message ---
    const encoder = new TextEncoder();
    let fullBotResponse = "";
    const finalChatId = currentChatId; // Use the validated/created chat ID

    // Streaming the Response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const completion = await client.chat.completions.create({
            messages: messages_format,
            model: "deepseek-r1-distill-llama-70b",
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
              `Groq returned an empty response for chat ${finalChatId}. Not saving empty message pair.`,
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
      "X-Title": tilte,
    });

    // --- 7. Return the stream ---
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
