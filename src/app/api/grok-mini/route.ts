import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";
import { db } from "@/database/db";
import { nanoid } from "nanoid";
import { chat, messages } from "@/database/schema/auth-schema";
import { eq } from "drizzle-orm";

// --- API Key ---
const xaiApiKey = process.env.XAI_API_KEY;
if (!xaiApiKey) {
  console.warn("XAI_API_KEY environment variable not set.");
  // Handle missing key appropriately
}

// --- Initialize xAI Client ---
const client = new OpenAI({
  apiKey: xaiApiKey,
  baseURL: "https://api.x.ai/v1",
});

export async function POST(req: Request) {
  let currentChatId: string | null = null;
  let isNewChatFlow = false;
  let title = "";

  try {
    // --- 1. Get Headers and Body ---
    const requestHeaders = await nextHeaders();
    currentChatId = requestHeaders.get("X-Chat-ID");
    const { message, previous_conversations } = await req.json();

    // --- 2. Validate Input ---
    // (Keep your existing validation logic)
    if (!currentChatId) {
      return new Response(
        JSON.stringify({ error: "Missing X-Chat-ID header" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (!message || typeof message !== "string" || message.trim() === "") {
      return new Response(
        JSON.stringify({ error: "Message content is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // --- 3. Authentication ---
    // (Keep your existing authentication logic)
    const sessionData = await auth.api.getSession({ headers: requestHeaders });
    if (!sessionData?.session || !sessionData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const userId = sessionData.user.id;

    // --- 4. Check Chat Existence, Ownership, or Create New ---
    // (Keep your existing chat handling logic, including title generation)
    // ... (ensure title generation happens here if it's a new chat) ...
    try {
      const results = await db
        .select({ id: chat.id, userId: chat.userId, title: chat.title }) // Select title too
        .from(chat)
        .where(eq(chat.id, currentChatId))
        .limit(1);
      let existingChat = results[0];

      if (existingChat) {
        if (existingChat.userId !== userId) {
          // ... (Forbidden error) ...
          return new Response(
            JSON.stringify({
              error: "Forbidden: Chat does not belong to user",
            }),
            { status: 403, headers: { "Content-Type": "application/json" } },
          );
        }
        isNewChatFlow = false;
        title = existingChat.title; // Get title for existing chat
      } else {
        // Generate title
        // Todo : make title using the GPT4.1 nano 
        const titleCompletion = await client.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "Generate a concise and relevant title (max 100 chars) for the chat based *only* on the user's first message. Output *only* the plain text title, without quotes, symbols, prefixes, explanations, or conversation.",
            },
            { role: "user", content: message.trim().substring(0, 150) },
          ],
          model: "grok-3-mini",
          temperature: 0.5,
        });
        console.log(titleCompletion.choices[0]?.message?.content)
        title =
          titleCompletion.choices[0]?.message?.content
            ?.trim()
            .substring(0, 100)
            .replace(/"/g, "") || `Chat ${currentChatId.substring(0, 5)}`;

        await db.insert(chat).values({
          id: currentChatId,
          title: title,
          userId: userId,
          createdAt: new Date(),
        });
        isNewChatFlow = true;
      }
    } catch (dbError) {
      // ... (Database error handling) ...
      return new Response(
        JSON.stringify({ error: "Database error during chat handling" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // --- 5. Prepare messages for xAI API ---
    const messages_format: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [{ role: "system", content: "You are a helpful assistant." }];
    // (Keep logic for adding previous_conversations)
    if (!isNewChatFlow && Array.isArray(previous_conversations)) {
      const validPreviousConversations = previous_conversations.filter(
        (msg) =>
          msg &&
          (msg.role === "user" || msg.role === "assistant") &&
          typeof msg.content === "string" &&
          msg.content.trim() !== "",
      );
      messages_format.push(...validPreviousConversations);
    }
    messages_format.push({ role: "user", content: message.trim() });

    // --- 6. Call xAI API (Non-Streaming) and Assemble Response ---
    const finalChatId = currentChatId; // Use the validated/created chat ID

    // Streaming the Response
    const stream = new ReadableStream({
      async start(controller) {
        let fullBotResponse = "";
        const encoder = new TextEncoder();
        let inReasoningBlock = false; // State to track if we are inside <think> tags

        try {
          const completion = await client.chat.completions.create({
            messages: messages_format,
            model: "grok-3-mini", // Ensure this model supports reasoning_content
            temperature: 0.7,
            stream: true as const,
          });

          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || "";
            const reasoning_content =
              chunk.choices[0]?.delta?.reasoning_content || "";

            const isCurrentChunkReasoning = !!reasoning_content;
            const isCurrentChunkContent = !!content; // Assuming content and reasoning are mutually exclusive per delta

            // --- State transition logic ---

            // 1. Entering a reasoning block?
            if (isCurrentChunkReasoning && !inReasoningBlock) {
              inReasoningBlock = true;
              const thinkStartTag = "```think\n";
              fullBotResponse += thinkStartTag;
              controller.enqueue(encoder.encode(thinkStartTag));
            }
            // 2. Exiting a reasoning block (because regular content arrived)?
            else if (isCurrentChunkContent && inReasoningBlock) {
              // Note: This assumes reasoning blocks don't immediately follow each other
              // without regular content in between. If they can, this logic might need adjustment.
              inReasoningBlock = false;
              const thinkEndTag = "\n```\n";
              fullBotResponse += thinkEndTag;
              controller.enqueue(encoder.encode(thinkEndTag));
            }

            // --- Enqueue actual content ---

            if (reasoning_content) {
              fullBotResponse += reasoning_content;
              controller.enqueue(encoder.encode(reasoning_content));
            }
            if (content) {
              // If we were in a reasoning block and regular content arrives,
              // the exit logic above already handled the closing tag.
              fullBotResponse += content;
              controller.enqueue(encoder.encode(content));
            }
          }

          // --- Final check after loop ---
          // If the stream ended while we were still in a reasoning block, close the tag.
          if (inReasoningBlock) {
            // inReasoningBlock = false; // Not strictly necessary as the scope ends
            const thinkEndTag = "</think>";
            fullBotResponse += thinkEndTag;
            controller.enqueue(encoder.encode(thinkEndTag));
          }

          // --- Database saving logic ---
          if (fullBotResponse.trim() === "") {
            console.warn(
              `Groq returned an empty response for chat ${finalChatId}. Not saving empty message pair.`,
            );
          } else {
            try {
              await db.insert(messages).values({
                id: nanoid(),
                userMessage: message.trim(),
                botResponse: fullBotResponse, // Save the full response with correctly placed tags
                chatId: finalChatId,
                createdAt: new Date(),
              });
            } catch (dbError) {
              console.error("Error saving message pair:", dbError);
            }
          }
        } catch (error) {
          console.error("Groq streaming or processing error:", error);
          // If an error occurs mid-stream, we might have an unclosed tag sent.
          // It's often better to let the consumer handle potentially incomplete streams on error.
          controller.error(error);
        } finally {
          // Ensure the stream is always closed, regardless of success or error.
          // The final </think> tag (if needed) should have been enqueued *before* this.
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
