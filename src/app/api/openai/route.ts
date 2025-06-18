import { auth } from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";
import { db } from "@/database/db";
import { nanoid } from "nanoid";
import { chat, messages, sharedChat } from "@/database/schema/auth-schema";
import { eq } from "drizzle-orm"; // Import eq for querying
import { tavily } from "@tavily/core";
import OpenAI from "openai";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import * as mammoth from "mammoth";
import models from "@/support/models";

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY! });

export async function POST(req: Request) {
  // --- Standard Response Headers for Streaming ---

  let currentChatId: string | null = null;
  let isNewChatFlow = false; // Flag to indicate if we created the chat in this request
  let title = "";

  try {
    // --- 1. Get Headers, Query Params, and Body ---
    const requestHeaders = await nextHeaders();
    currentChatId = requestHeaders.get("X-Chat-ID");

    // Extract shared query parameter from URL
    const url = new URL(req.url);
    const shared = url.searchParams.get("shared") === "true";
    const editedMessage = url.searchParams.get("editedMessage") === "true";

    const {
      message,
      previous_conversations,
      search_enabled,
      model,
      fileUrl,
      fileType,
      fileName,
      openrouter_api_key,
      openai_api_key,
      anthropic_api_key,
      google_api_key,
    } = await req.json();

    console.log("Model", model);

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

    let openaiClient;
    let clientProvider = "default";
    let modelId = model;

    console.log("OpenAI API key", openai_api_key);
    console.log("OpenRouter API key", openrouter_api_key);
    console.log("Anthropic API key", anthropic_api_key);
    console.log("Google API key", google_api_key);

    if (openrouter_api_key) {
      openaiClient = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: openrouter_api_key,
      });
      clientProvider = "openrouter";
      console.log("User provided OpenRouter API key");
    } else if (
      anthropic_api_key &&
      (model.includes("claude") || model.includes("anthropic"))
    ) {
      openaiClient = new OpenAI({
        baseURL: "https://api.anthropic.com/v1/",
        apiKey: anthropic_api_key,
      });
      clientProvider = "anthropic";
      const currentModel = models.find((m) => m.id === model);
      modelId = currentModel?.originalId || model;
      console.log("User provided Anthropic API key");
    } else if (
      google_api_key &&
      (model.includes("gemini") || model.includes("google"))
    ) {
      openaiClient = new OpenAI({
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        apiKey: google_api_key,
      });
      clientProvider = "google";
      const currentModel = models.find((m) => m.id === model);
      modelId = currentModel?.originalId || model;
      console.log("User provided Google Gemini API key");
    } else if (openai_api_key && model.includes("openai")) {
      openaiClient = new OpenAI({
        apiKey: openai_api_key,
      });
      clientProvider = "openai";
      const currentModel = models.find((m) => m.id === model);
      modelId = currentModel?.originalId || model;
      console.log("User provided OpenAI API key");
    } else {
      openaiClient = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY,
      });
      clientProvider = "default";
      console.log("Using default OpenRouter API key");
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
    // Skip rate limiting if user provides their own API key
    if (clientProvider === "default") {
      // Find the current model to check if it's premium
      const currentModel = models.find((m) => m.id === model);
      const isPremiumModel = currentModel?.premium || false;

      // Determine if user is non-logged in (demo user)
      const isNonLoggedInUser =
        userEmail.includes("@https://www.betterindex.io") ||
        userEmail.includes("@http://localhost:3000");

      let ratelimit;
      let requestLimit: number;
      let errorMessage: string;

      if (isNonLoggedInUser) {
        // Non-logged in users
        if (isPremiumModel) {
          // Premium models: 0 messages for non-logged in users
          requestLimit = 0;
          errorMessage =
            "Premium models require a signed-in account. Please sign in to use more.";
        } else {
          // Non-premium models: 10 messages in 24h for non-logged in users
          requestLimit = 10;
          errorMessage =
            "You have reached the maximum of 10 requests per 24 hours for free users. Please sign in for a free account to get more usage.";
        }
      } else {
        // Logged-in users
        if (isPremiumModel) {
          // Premium models: 10 messages in 24h for logged-in users
          requestLimit = 10;
          errorMessage =
            "You have reached the maximum of 10 requests per 24 hours for premium models. Please try again after 24 hours or use a non-premium model.";
        } else {
          // Non-premium models: 30 messages in 24h for logged-in users
          requestLimit = 30;
          errorMessage =
            "You have reached the maximum of 30 requests per 24 hours. Please try again after 24 hours.";
        }
      }

      // Create rate limiter with the determined limit
      if (requestLimit > 0) {
        ratelimit = new Ratelimit({
          redis: Redis.fromEnv(),
          limiter: Ratelimit.slidingWindow(requestLimit, "24 h"),
        });

        // Use user email as the identifier for rate limiting
        const { success } = await ratelimit.limit(
          `${userEmail}:${isPremiumModel ? "premium" : "free"}`
        );

        if (!success) {
          console.warn(
            `API Warning: Rate limit exceeded for user ${userEmail} using ${
              isPremiumModel ? "premium" : "free"
            } model ${model}.`
          );
          return new Response(
            JSON.stringify({
              error: errorMessage,
            }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }
      } else {
        // requestLimit is 0, deny access immediately
        console.warn(
          `API Warning: Access denied for user ${userEmail} trying to use premium model ${model} without login.`
        );
        return new Response(
          JSON.stringify({
            error: errorMessage,
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      console.log(
        `Bypassing rate limit for user ${userEmail} using custom API key from ${clientProvider}`
      );
    }

    // --- 5. Check Chat Existence, Ownership, or Create New ---
    if (!shared) {
      // Normal chat flow
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
              `API Error: User ${userId} forbidden access to chat ${currentChatId}.`
            );
            return new Response(
              JSON.stringify({
                error: "Forbidden: Chat does not belong to user",
              }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            );
          }

          // If editedMessage is true, delete the existing chat and all its messages
          if (editedMessage) {
            // Delete all messages associated with this chat
            await db.delete(messages).where(eq(messages.chatId, currentChatId));

            // Delete the chat itself
            await db.delete(chat).where(eq(chat.id, currentChatId));

            console.log(
              `Deleted chat ${currentChatId} and its messages for edited message flow`
            );

            // Set flag to create new chat
            isNewChatFlow = true;
          } else {
            // Chat exists and belongs to the user, normal flow
            isNewChatFlow = false;
          }
        } else {
          // Chat does NOT exist - Create it using the ID from the frontend
          isNewChatFlow = true;
        }

        // Create new chat if needed (either doesn't exist or was deleted for edit)
        if (isNewChatFlow) {
          // Generate the title
          const openaiClientForTitle = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: process.env.OPENROUTER_API_KEY,
          });
          const completion = await openaiClientForTitle.chat.completions.create(
            {
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
            }
          );

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
    } else {
      // Shared chat flow - User is continuing a shared chat, convert it to their own chat
      console.log(
        `User continuing shared chat ${currentChatId}, converting to user's own chat`
      );

      try {
        // Check if user already has a chat with this ID
        const existingUserChat = await db
          .select({ id: chat.id, userId: chat.userId })
          .from(chat)
          .where(eq(chat.id, currentChatId))
          .limit(1);

        if (
          existingUserChat.length > 0 &&
          existingUserChat[0].userId === userId
        ) {
          // User already owns a chat with this ID, proceed normally
          isNewChatFlow = false;
          console.log("User already owns this chat, proceeding normally");
        } else {
          // Create a new chat for this user with a new ID
          const newChatId = nanoid();
          currentChatId = newChatId; // Update the current chat ID

          // Generate title from the first message or use shared chat title
          let chatTitle = "Continued Chat";

          try {
            // Fetch the shared chat to get its title
            const originalSharedChatId = requestHeaders.get("X-Chat-ID");
            const sharedChatData = await db
              .select({ title: sharedChat.title })
              .from(sharedChat)
              .where(eq(sharedChat.id, originalSharedChatId || ""))
              .limit(1);

            if (sharedChatData.length > 0) {
              chatTitle = sharedChatData[0].title;
            } else {
              // Generate title from the message
              const openaiClientForTitle = new OpenAI({
                baseURL: "https://openrouter.ai/api/v1",
                apiKey: process.env.OPENROUTER_API_KEY,
              });
              const completion =
                await openaiClientForTitle.chat.completions.create({
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

              chatTitle =
                completion.choices[0]?.message
                  ?.content!.trim()
                  .substring(0, 100)
                  .replace(/"/g, "") || "New Chat";
            }
          } catch (titleError) {
            console.error("Error generating title:", titleError);
            chatTitle = "Continued Chat";
          }

          title = chatTitle;

          // Create the new chat
          await db.insert(chat).values({
            id: newChatId,
            title: chatTitle,
            userId: userId,
            createdAt: new Date(),
          });

          isNewChatFlow = true;
          console.log(
            `Created new chat ${newChatId} for user continuing shared chat`
          );
        }
      } catch (dbError) {
        console.error(
          `Database error during shared chat conversion for ID ${currentChatId}:`,
          dbError
        );
        return new Response(
          JSON.stringify({
            error: "Database error during shared chat handling",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // --- 6. Search Web ---

    async function searchWeb(message: string): Promise<string> {
      try {
        const res = await tavilyClient.search(message, {
          includeAnswer: true,
        });

        // Format the results as a string
        let formattedResults = "";

        if (res.results && Array.isArray(res.results)) {
          res.results.forEach((result, index) => {
            formattedResults += `Result ${index + 1}:\n`;
            formattedResults += `Title: ${result.title}\n`;
            formattedResults += `Content: ${result.content}\n\n`;
          });
        }

        // Add the answer if available
        if (res.answer) {
          formattedResults += `Summary: ${res.answer}\n`;
        }

        return formattedResults;
      } catch (error) {
        console.error("Error in searchWeb:", error);
        return "";
      }
    }

    let searchResults: string = "";

    if (search_enabled) {
      searchResults = await searchWeb(message);
    }

    // --- Prepare messages for OpenAI API ---
    const messages_format: Array<{
      role: "system" | "user" | "assistant";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content: string | Array<any>;
    }> = [
      {
        role: "system",
        content: ``,
      },
    ];

    if (
      (!isNewChatFlow || shared || editedMessage) &&
      Array.isArray(previous_conversations)
    ) {
      // If it's an existing chat OR a shared chat OR an edited message, add previous messages sent by the client
      const validPreviousConversations = await Promise.all(
        previous_conversations
          .filter(
            (msg) =>
              msg &&
              (msg.role === "user" || msg.role === "assistant") &&
              typeof msg.content === "string" &&
              msg.content.trim() !== ""
          )
          .map(async (msg) => {
            // Clean up message format for OpenRouter - remove extra fields
            const cleanMsg: {
              role: "user" | "assistant";
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content: string | Array<any>;
            } = {
              role: msg.role,
              content: msg.content,
            };

            // If this is a user message with file attachments, process them appropriately
            if (
              msg.role === "user" &&
              msg.fileUrl &&
              msg.fileType &&
              msg.fileName
            ) {
              if (msg.fileType.startsWith("image/")) {
                // Convert to multimodal format for images
                cleanMsg.content = [
                  {
                    type: "text",
                    text: msg.content,
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: msg.fileUrl,
                    },
                  },
                ];
              } else if (msg.fileType === "application/pdf") {
                // For PDFs, convert to multimodal format with file data
                try {
                  console.log(
                    `Processing PDF for previous message: ${msg.fileName}`
                  );
                  const response = await fetch(msg.fileUrl);
                  if (!response.ok) {
                    throw new Error(
                      `Failed to fetch PDF: ${response.statusText}`
                    );
                  }
                  const arrayBuffer = await response.arrayBuffer();
                  const base64 = Buffer.from(arrayBuffer).toString("base64");
                  const dataUrl = `data:application/pdf;base64,${base64}`;

                  cleanMsg.content = [
                    {
                      type: "text",
                      text: msg.content,
                    },
                    {
                      type: "file",
                      file: {
                        filename: msg.fileName,
                        file_data: dataUrl,
                      },
                    },
                  ];
                } catch (error) {
                  console.error(
                    "Error processing PDF for previous message:",
                    error
                  );
                  cleanMsg.content = msg.content;
                }
              } else if (
                msg.fileType === "text/plain" ||
                msg.fileType.startsWith("text/")
              ) {
                // For text files, check if content is already embedded, if not, fetch it
                if (
                  !msg.content.includes(
                    `-------- File Content: ${msg.fileName}`
                  )
                ) {
                  try {
                    console.log(
                      `Processing text file for previous message: ${msg.fileName}`
                    );
                    const response = await fetch(msg.fileUrl);
                    if (!response.ok) {
                      throw new Error(
                        `Failed to fetch text file: ${response.statusText}`
                      );
                    }
                    const textFileContent = await response.text();
                    cleanMsg.content = `${msg.content}\n\n-------- File Content: ${msg.fileName} --------\n${textFileContent}\n-------- End of File Content --------`;
                  } catch (error) {
                    console.error(
                      "Error processing text file for previous message:",
                      error
                    );
                    cleanMsg.content = msg.content;
                  }
                } else {
                  cleanMsg.content = msg.content; // Content already includes file data
                }
              } else if (
                msg.fileType ===
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                msg.fileType === "application/msword" ||
                msg.fileName.toLowerCase().endsWith(".docx") ||
                msg.fileName.toLowerCase().endsWith(".doc")
              ) {
                // For Word documents, check if content is already embedded, if not, fetch and process it
                if (
                  !msg.content.includes(
                    `-------- Document Content: ${msg.fileName}`
                  )
                ) {
                  try {
                    console.log(
                      `Processing Word document for previous message: ${msg.fileName}`
                    );
                    const response = await fetch(msg.fileUrl);
                    if (!response.ok) {
                      throw new Error(
                        `Failed to fetch Word document: ${response.statusText}`
                      );
                    }

                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);

                    if (msg.fileName.toLowerCase().endsWith(".docx")) {
                      // Handle .docx files with mammoth
                      const result = await mammoth.extractRawText({ buffer });
                      const documentText = result.value;

                      if (documentText.trim()) {
                        cleanMsg.content = `${msg.content}\n\n-------- Document Content: ${msg.fileName} --------\n${documentText}\n-------- End of Document Content --------`;
                      } else {
                        cleanMsg.content = `${msg.content}\n\n[Note: Word document "${msg.fileName}" was processed but no readable text content was found.]`;
                      }
                    } else {
                      // Handle .doc files (older format)
                      cleanMsg.content = `${msg.content}\n\n[Note: Microsoft Word document "${msg.fileName}" (.doc format) was attached. For best results with older .doc files, please convert to .docx format or copy/paste the text content.]`;
                    }
                  } catch (error) {
                    console.error(
                      "Error processing Word document for previous message:",
                      error
                    );
                    cleanMsg.content = msg.content;
                  }
                } else {
                  cleanMsg.content = msg.content; // Content already includes file data
                }
              } else {
                // For other file types, just keep the text content
                cleanMsg.content = msg.content;
              }
            }

            return cleanMsg;
          })
      );

      messages_format.push(...validPreviousConversations);
    }

    // --- 7. Prepare User Message Content with File Support ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userMessageContent: string | Array<any>;

    // Prepare base text content with search results if available
    let textContent = message.trim();
    if (searchResults && searchResults.trim() !== "") {
      textContent = `
      -------- Web Search Results --------\n
      ${searchResults}\n
      -------- End of Web Search Results --------\n
      User Message: ${message.trim()}`;
    }

    // Check if we have file content to include
    if (fileUrl && fileType && fileName) {
      // Create content array with text and file
      userMessageContent = [
        {
          type: "text",
          text: textContent,
        },
      ];

      try {
        // Add file content based on type
        if (fileType.startsWith("image/")) {
          // Handle images (png, jpeg, webp) - Public URLs work directly with OpenRouter
          userMessageContent.push({
            type: "image_url",
            image_url: {
              url: fileUrl, // UploadThing public URL works for images
            },
          });
          console.log("Image file added to message content, fileUrl:", fileUrl);
        } else if (fileType === "application/pdf") {
          // Handle PDFs - Need to fetch and convert to base64 for OpenRouter
          try {
            console.log(`Fetching PDF from URL: ${fileUrl}`);
            const response = await fetch(fileUrl);
            if (!response.ok) {
              throw new Error(`Failed to fetch PDF: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString("base64");
            const dataUrl = `data:application/pdf;base64,${base64}`;

            userMessageContent.push({
              type: "file",
              file: {
                filename: fileName,
                file_data: dataUrl,
              },
            });
            console.log(`Successfully processed PDF: ${fileName}`);
          } catch (fetchError) {
            console.error("Error fetching PDF file:", fetchError);
            userMessageContent[0].text += `\n\n[Note: PDF file "${fileName}" could not be processed - ${
              fetchError instanceof Error ? fetchError.message : "Unknown error"
            }]`;
          }
        } else if (fileType === "text/plain" || fileType.startsWith("text/")) {
          // Handle text files by fetching content and adding to message
          try {
            console.log(`Fetching text file from URL: ${fileUrl}`);
            const response = await fetch(fileUrl);
            if (!response.ok) {
              throw new Error(
                `Failed to fetch text file: ${response.statusText}`
              );
            }
            const textFileContent = await response.text();
            userMessageContent[0].text += `\n\n-------- File Content: ${fileName} --------\n${textFileContent}\n-------- End of File Content --------`;
            console.log(`Successfully processed text file: ${fileName}`);
          } catch (fetchError) {
            console.error("Error fetching text file:", fetchError);
            userMessageContent[0].text += `\n\n[Note: Text file "${fileName}" could not be processed - ${
              fetchError instanceof Error ? fetchError.message : "Unknown error"
            }]`;
          }
        } else if (
          fileType ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          fileType === "application/msword" ||
          fileName.toLowerCase().endsWith(".docx") ||
          fileName.toLowerCase().endsWith(".doc")
        ) {
          // Handle Microsoft Word documents
          try {
            console.log(`Processing Word document: ${fileName} (${fileType})`);
            const response = await fetch(fileUrl);
            if (!response.ok) {
              throw new Error(
                `Failed to fetch Word document: ${response.statusText}`
              );
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            if (fileName.toLowerCase().endsWith(".docx")) {
              // Handle .docx files with mammoth
              const result = await mammoth.extractRawText({ buffer });
              const documentText = result.value;

              if (documentText.trim()) {
                userMessageContent[0].text += `\n\n-------- Document Content: ${fileName} --------\n${documentText}\n-------- End of Document Content --------`;
                console.log(
                  `Successfully extracted text from .docx: ${fileName}`
                );
              } else {
                userMessageContent[0].text += `\n\n[Note: Word document "${fileName}" was processed but no readable text content was found.]`;
              }
            } else {
              // Handle .doc files (older format)
              userMessageContent[0].text += `\n\n[Note: Microsoft Word document "${fileName}" (.doc format) was attached. For best results with older .doc files, please convert to .docx format or copy/paste the text content.]`;
            }
          } catch (fetchError) {
            console.error("Error processing Word document:", fetchError);
            userMessageContent[0].text += `\n\n[Note: Word document "${fileName}" could not be processed - ${
              fetchError instanceof Error ? fetchError.message : "Unknown error"
            }. Consider copying and pasting the text content instead.]`;
          }
        } else {
          // Unsupported file type
          console.warn(
            `Unsupported file type: ${fileType} for file: ${fileName}`
          );
          userMessageContent[0].text += `\n\n[Note: File "${fileName}" (${fileType}) was attached but is not supported for processing]`;
        }
      } catch (error) {
        console.error("Error processing file:", error);
        userMessageContent[0].text += `\n\n[Note: File "${fileName}" could not be processed due to an error]`;
      }
    } else {
      // No file, just use text content
      userMessageContent = textContent;
    }

    // Add the current user message
    messages_format.push({
      role: "user",
      content: userMessageContent,
    });

    // --- 7. Save User Message Immediately (Background) ---
    const finalChatId = currentChatId; // Use the validated/created chat ID

    // Save user message immediately in background without blocking AI generation
    const saveUserMessage = async () => {
      // Note: We no longer skip saves for shared chats since continuing them creates a new user chat

      try {
        console.log(`Saving user message immediately for chat ${finalChatId}`);

        // Prepare all messages to be saved (previous conversations + current user message)
        const messagesToSave = [];

        // Save all previous conversations to database if editedMessage is true
        if (
          editedMessage &&
          Array.isArray(previous_conversations) &&
          previous_conversations.length > 0
        ) {
          // Group messages into user-assistant pairs
          for (let i = 0; i < previous_conversations.length - 1; i += 2) {
            const userMsg = previous_conversations[i];
            const assistantMsg = previous_conversations[i + 1];

            if (
              userMsg?.role === "user" &&
              assistantMsg?.role === "assistant" &&
              typeof userMsg.content === "string" &&
              typeof assistantMsg.content === "string" &&
              userMsg.content.trim() !== "" &&
              assistantMsg.content.trim() !== ""
            ) {
              messagesToSave.push({
                id: nanoid(),
                userMessage: userMsg.content.trim(),
                botResponse: assistantMsg.content.trim(),
                chatId: finalChatId,
                createdAt: new Date(),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                fileUrl: (userMsg as any).fileUrl || null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                fileType: (userMsg as any).fileType || null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                fileName: (userMsg as any).fileName || null,
                imageResponseId: null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                model: (assistantMsg as any).model || model,
              });
            }
          }
        }

        // Add the current user message with empty bot response (to be updated later)
        const currentUserMessageId = nanoid();
        messagesToSave.push({
          id: currentUserMessageId,
          userMessage: message.trim(),
          botResponse:
            "We're processing your message in the background due to a technical issue. Please refresh the page in a few seconds to see the response.", // Empty for now, will be updated when AI responds
          chatId: finalChatId,
          createdAt: new Date(),
          fileUrl: fileUrl || null,
          fileType: fileType || null,
          fileName: fileName || null,
          imageResponseId: null,
          model: model,
        });

        // Insert all messages at once
        if (messagesToSave.length > 0) {
          await db.insert(messages).values(messagesToSave);
          console.log(
            `Successfully saved ${messagesToSave.length} messages (including current user message) for chat ${finalChatId}`
          );
        }

        return currentUserMessageId;
      } catch (dbError) {
        console.error("Error saving user message immediately:", dbError);
        return null;
      }
    };

    // Start saving user message immediately (non-blocking)
    const userMessageSavePromise = saveUserMessage();

    // --- 8. Stream OpenAI Response and Update Bot Response ---
    const encoder = new TextEncoder();
    let fullBotResponse = "";

    console.log("messages_format", messages_format);

    // Prepare completion parameters
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completionParams: any = {
      messages: messages_format,
      // handle custom model id
      model: modelId,
      stream: true,
    };

    // Note: Anthropic's OpenAI compatibility layer doesn't stream thinking content
    // The thinking feature is only available when using the native Anthropic API
    // For now, we don't add thinking parameters when using OpenAI compatibility

    // Add PDF processing plugin if we have a PDF file (OpenRouter specific feature)
    if (
      fileUrl &&
      fileType === "application/pdf" &&
      clientProvider === "default"
    ) {
      completionParams.plugins = [
        {
          id: "file-parser",
          pdf: {
            engine: "pdf-text", // Use free engine by default, can be changed to "mistral-ocr" for better OCR
          },
        },
      ];
    }

    // Create an AbortController to detect client disconnect
    const abortController = new AbortController();
    let clientDisconnected = false;

    // Function to update bot response - runs independently of streaming
    const updateBotResponse = async (botResponse: string) => {
      // Note: We no longer skip updates for shared chats since continuing them creates a new user chat

      try {
        console.log(
          `Attempting to update bot response for chat ${finalChatId}, client connected: ${!clientDisconnected}`
        );

        if (botResponse.trim() === "") {
          console.warn(
            `AI returned an empty response for chat ${finalChatId}. Not updating bot response.`
          );
          return;
        }

        // Wait for user message to be saved first
        const userMessageId = await userMessageSavePromise;

        if (userMessageId) {
          // Update the bot response for the current message
          await db
            .update(messages)
            .set({
              botResponse: botResponse,
            })
            .where(eq(messages.id, userMessageId));

          console.log(
            `Successfully updated bot response for message ${userMessageId} in chat ${finalChatId}`
          );
        } else {
          console.warn(
            `User message ID not available, falling back to inserting complete message pair`
          );

          // Fallback: insert the complete message pair if user message save failed
          await db.insert(messages).values({
            id: nanoid(),
            userMessage: message.trim(),
            botResponse: botResponse,
            chatId: finalChatId,
            createdAt: new Date(),
            fileUrl: fileUrl || null,
            fileType: fileType || null,
            fileName: fileName || null,
            imageResponseId: null,
            model: model,
          });

          console.log(
            `Fallback: Saved complete message pair for chat ${finalChatId}`
          );
        }
      } catch (dbError) {
        console.error("Error updating bot response:", dbError);
        // Continue execution even if database update fails
      }
    };

    // Background processing function that continues even if client disconnects
    const processOpenAIResponse = async () => {
      try {
        console.log(
          "Starting completion processing with provider:",
          clientProvider
        );
        console.log("Completion params:", {
          ...completionParams,
          messages: "REDACTED",
        });
        const completion = await openaiClient.chat.completions.create(
          completionParams
        );

        let reasoningStarted = false;
        let reasoningComplete = false;
        let backgroundResponse = "";

        // @ts-expect-error- OpenRouter plugins affect TypeScript inference but streaming works correctly
        for await (const chunk of completion) {
          // Handle different response formats from different providers
          if (
            !chunk ||
            !chunk.choices ||
            !Array.isArray(chunk.choices) ||
            chunk.choices.length === 0
          ) {
            console.warn(
              "Invalid chunk format received:",
              JSON.stringify(chunk)
            );
            continue;
          }

          const content = chunk.choices[0]?.delta?.content || "";
          const reasoning =
            (chunk.choices[0]?.delta as { reasoning?: string })?.reasoning ||
            "";

          if (reasoning) {
            // Start reasoning block if this is the first reasoning chunk
            if (!reasoningStarted) {
              const reasoningStart = `\`\`\` think\n`;
              backgroundResponse += reasoningStart;
              reasoningStarted = true;
            }

            // Add the reasoning chunk to background response
            backgroundResponse += reasoning;
          }

          if (content) {
            // Close reasoning block if we had reasoning and now we're getting content
            if (reasoningStarted && !reasoningComplete) {
              const reasoningEnd = `\n\`\`\`\n\n`;
              backgroundResponse += reasoningEnd;
              reasoningComplete = true;
            }

            backgroundResponse += content;
          }
        }

        console.log(
          "OpenAI completion processing finished, updating bot response..."
        );
        // Always update bot response, regardless of client connection status
        await updateBotResponse(backgroundResponse);

        return backgroundResponse;
      } catch (error) {
        console.error("Background OpenAI processing error:", error);
        throw error;
      }
    };

    // Start background processing immediately (runs independently)
    const backgroundProcessing = processOpenAIResponse();

    // Streaming the Response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const completion = await openaiClient.chat.completions.create(
            completionParams
          );

          let reasoningStarted = false;
          let reasoningComplete = false;

          // @ts-expect-error- OpenRouter plugins affect TypeScript inference but streaming works correctly
          for await (const chunk of completion) {
            // Check if client has disconnected
            if (abortController.signal.aborted) {
              console.log(
                "Client disconnected, but continuing background processing..."
              );
              clientDisconnected = true;
              break;
            }

            // Handle different response formats from different providers
            if (
              !chunk ||
              !chunk.choices ||
              !Array.isArray(chunk.choices) ||
              chunk.choices.length === 0
            ) {
              console.warn(
                "Invalid chunk format received:",
                JSON.stringify(chunk)
              );
              continue;
            }

            const content = chunk.choices[0]?.delta?.content || "";
            const reasoning =
              (chunk.choices[0]?.delta as { reasoning?: string })?.reasoning ||
              "";

            if (reasoning) {
              // Start reasoning block if this is the first reasoning chunk
              if (!reasoningStarted) {
                const reasoningStart = `\`\`\` think\n`;
                fullBotResponse += reasoningStart;
                try {
                  controller.enqueue(encoder.encode(reasoningStart));
                } catch {
                  console.log("Client disconnected during reasoning start");
                  clientDisconnected = true;
                  break;
                }
                reasoningStarted = true;
              }

              // Stream the reasoning chunk
              fullBotResponse += reasoning;
              try {
                controller.enqueue(encoder.encode(reasoning));
              } catch {
                console.log("Client disconnected during reasoning");
                clientDisconnected = true;
                break;
              }
            }

            if (content) {
              // Close reasoning block if we had reasoning and now we're getting content
              if (reasoningStarted && !reasoningComplete) {
                const reasoningEnd = `\n\`\`\`\n\n`;
                fullBotResponse += reasoningEnd;
                try {
                  controller.enqueue(encoder.encode(reasoningEnd));
                } catch {
                  console.log("Client disconnected during reasoning end");
                  clientDisconnected = true;
                  break;
                }
                reasoningComplete = true;
              }

              fullBotResponse += content;
              try {
                controller.enqueue(encoder.encode(content));
              } catch {
                console.log("Client disconnected during content streaming");
                clientDisconnected = true;
                break;
              }
            }
          }

          // If we were streaming and client is still connected, update the bot response
          if (!clientDisconnected && fullBotResponse.trim() !== "") {
            await updateBotResponse(fullBotResponse);
          }
        } catch (error) {
          console.error("Streaming error:", error);
          // Even if streaming fails, the background processing will continue
          if (!clientDisconnected) {
            controller.error(error);
          }
        } finally {
          if (!clientDisconnected) {
            controller.close();
          }
        }
      },

      cancel() {
        console.log(
          "Stream cancelled by client, but background processing continues..."
        );
        clientDisconnected = true;
        abortController.abort();
      },
    });

    // Assigning the new header to
    const responseHeaders = new Headers({
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Title": title,
    });

    // Add headers to indicate if this was a shared chat that got converted
    if (shared && isNewChatFlow) {
      responseHeaders.set("X-New-Chat-ID", currentChatId);
      responseHeaders.set("X-Converted-From-Shared", "true");
    }

    // Ensure background processing continues even if client disconnects
    backgroundProcessing.catch((error) => {
      console.error("Background processing failed:", error);
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
