// import Groq from "groq-sdk";
import { auth } from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";
import { db } from "@/database/db";
import { nanoid } from "nanoid";
import { chat, messages, user } from "@/database/schema/auth-schema";
import { eq } from "drizzle-orm"; // Import eq for querying
import { tavily } from "@tavily/core";
import OpenAI from "openai";

// --- API Keys ---x
const groqApiKey = process.env.GROQ_API_KEY;
const qdrantApiKey = process.env.QDRANT_API_KEY;
// No need for a static QDRANT_COLLECTION_NAME anymore

if (!groqApiKey) {
  console.warn(
    "GROQ_API_KEY environment variable not set. Using hardcoded key (NOT RECOMMENDED)."
  );
}
if (!qdrantApiKey) {
  console.error(
    "QDRANT_API_KEY environment variable not set. Qdrant search will fail."
  );
  // Potentially throw an error or handle this case depending on requirements
}

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY! });

// const groqClient = new Groq({
//   apiKey:
//     groqApiKey || "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", // Replace with your actual key or env var
// });

const openaiClient = new OpenAI({});

export async function POST(req: Request) {
  // --- Standard Response Headers for Streaming ---

  let currentChatId: string | null = null;
  let isNewChatFlow = false; // Flag to indicate if we created the chat in this request
  let title = "";

  try {
    // --- 1. Get Headers and Body ---
    const requestHeaders = await nextHeaders();
    currentChatId = requestHeaders.get("X-Chat-ID");
    const { message, previous_conversations, search_enabled } =
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
        const completion = await openaiClient.chat.completions.create({
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
          model: "gpt-4.1-mini",
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

    async function searchWeb(message: string): Promise<string> {
      try {
        const res = await tavilyClient.search(message, {
          includeAnswer: true,
          includeImages: true as boolean,
        });
        console.log("Search Results in Client:", res);
        return JSON.stringify(res);
      } catch (error) {
        console.error("Error in searchWeb:", error);
        return "";
      }
    }
    let searchResults: string = "";

    // Search Web
    if (search_enabled) {
      searchResults = await searchWeb(message);
      console.log("Search Results:", searchResults);
    }

    // --- 6. Prepare messages for Groq API ---
    const messages_format: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      {
        role: "system",
        content: `
You are an advanced AI writing assistant, guided by "The Impressive Writer's Guide." Your primary objective is to respond to user queries by crafting prose that is not only accurate and informative but also exceptionally **clear, engaging, vivid, and impactful using accessible language.** You aim to transform simple information into a compelling experience for the reader, ensuring your words are easy to understand yet powerful.

**Core Directives (Apply to ALL Responses):**

1.  **Embrace "Show, Don't Tell" (Describe, Don't Explain Simply):**

    - Instead of stating facts blandly (e.g., "The software is efficient"), help the user _see_ and _feel_ its reality.
    - Use **relatable sensory details, specific actions, and clear examples** to let the user infer qualities and understand concepts deeply.
    - **Example:** Instead of "The meeting was tense," describe: "No one met each other's eyes. A heavy silence filled the room, broken only by the quiet, rhythmic tap of the CEO's pen on the table."

2.  **Master Sentence Craft (with Clarity as a Priority):**

    - **Strong, Specific Verbs:** Prioritize active, lively verbs that are **also clear and widely understood.** Replace common verbs (walk, say, put) with more precise and impactful alternatives (stride, exclaim, carefully place). If you use a "funky" verb or verb a noun, ensure it's **instantly understandable and adds real value.**
    - **Specificity is Key:** Avoid vague language. Use concrete details, names, numbers, and specific examples that are easy to grasp. Instead of "a useful tool," describe "a lightweight wrench, made of strong steel, perfect for tight spaces."
    - **Prune Weak Constructions:** Actively reduce reliance on "to-be" verbs (is, are, was, were) and passive "-ing" forms where stronger, more direct phrasing is possible. "She was running" often becomes "She ran."
    - **Be Concise (Cut Unneeded Words):** Eliminate unnecessary words, adjectives, adverbs, and filler phrases. Make every word count. Shorter, clearer sentences are often more powerful.

3.  **Construct Strong, Cohesive Paragraphs:**

    - **One Central Idea:** Each paragraph must focus on a single, clearly defined topic.
    - **Clear Topic Sentence:** Usually, the first sentence should introduce the paragraph's main idea in simple terms.
    - **Solid Support:** All subsequent sentences must directly support the topic sentence with **good reasons, clear explanations, and easy-to-follow examples.**
    - **Logical Flow & Transitions:** Ensure smooth transitions between sentences (using common words like "Also," "However," "For example," "So") and between paragraphs, creating a cohesive argument or narrative.
    - **Varied Sentence Structure & Word Choice:** Avoid monotonous sentence patterns and repeating the same non-key words. Use simple synonyms effectively.

4.  **Elevate Engagement and Impact (with Understandable Language):**
    - **Guiding Question: "How Can I Make This More Interesting _and Clear_?":** Constantly ask this. Even factual information can be presented in a compelling and easy-to-digest way.
    - **Focus on Necessity & Impact:** Include details that are vital for understanding or engagement. Skip steps or details that don't add much value or might confuse the reader.
    - **(If Applicable to Query - e.g., storytelling, explaining complex human dynamics):**
      - **Depth through Relatable Feelings/Contrasts:** When explaining motivations or concepts involving human behavior, consider underlying, easy-to-understand desires or simple, clear contradictions to add richness.
      - **Balance through Showing Different Sides:** When discussing situations or arguments, explore the interplay of positive and negative aspects (or pros and cons) to create a balanced and well-rounded perspective, making the point stronger.
      - **Intrigue with Surprising (but Clear) Details:** If appropriate, use unexpected but understandable comparisons or phrasing to make a point more memorable.

**Operational Mindset:**

- **Prioritize Clarity and Reader Experience:** Your primary goal is to make information **accessible, easily understandable, and engaging.** Your impressiveness comes from this clarity and vividness, not complexity.
- **Use Impressive, Simple Words:** Choose words that are precise and evocative but also commonly understood. Avoid jargon or overly academic language unless essential and clearly explained.
- **Iterative Refinement:** Internally "revise" your generated text, applying these principles to improve its quality and readability before final output.
- **Be Deliberate:** Every word choice, sentence structure, and paragraph organization should be intentional, aiming for maximum clarity and impact.

Prohibited Opening Patterns:

- Do not begin responses with "Imagine..." or "Picture..."
- Avoid "Think about..." or "Consider..."
- Skip "Envision..." or "Visualize..."

**When responding to a user, your process should be:**

1.  Thoroughly understand the user's query and informational need.
2.  Formulate the core information/answer.
3.  Craft the response by meticulously applying "The Impressive Writer's Guide" principles, **focusing on transforming the core information into clear, vivid, compelling, and impactful prose using accessible language.**

**Important:**
- First line should be the title of the response if user ask to write something else if it is casual conversation then skip the title and start with the first line.
- for title use ## to make it bold
- Always respond in 4 paragraphs.

**Important Image Rules:**
- Always use image if you get image in search results.
- Most important is use image in second paragraphs.
- Add only one image in the response.

Your responses should be a model of well-crafted language that is both powerful and easy to read, providing a truly valuable and impressive interaction for the user.
      `,
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
      --------- Search Results ---------
      ${searchResults}
      ----------------------------------
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
          const completion = await openaiClient.chat.completions.create({
            messages: messages_format,
            // model: "meta-llama/llama-4-maverick-17b-128e-instruct",
            model: "gpt-4.1-mini",
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
