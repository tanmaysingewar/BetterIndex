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
import * as mammoth from "mammoth";
import models from "@/support/models";

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
    } = await req.json();

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
          "Premium models require a signed-in account. Please sign in to use this model.";
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
          "You have reached the maximum of 10 requests per 24 hours for premium models. Please try again later or use a non-premium model.";
      } else {
        // Non-premium models: 30 messages in 24h for logged-in users
        requestLimit = 30;
        errorMessage =
          "You have reached the maximum of 30 requests per 24 hours for this model. Please try again later.";
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
        return JSON.stringify(res);
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

    if ((!isNewChatFlow || shared) && Array.isArray(previous_conversations)) {
      // If it's an existing chat OR a shared chat, add previous messages sent by the client
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
      textContent = `-------- Web Search Results --------
${searchResults}
-------- End of Web Search Results --------

${message.trim()}`;
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

    // --- 7. Stream OpenAI Response and Save Message ---
    const encoder = new TextEncoder();
    let fullBotResponse = "";
    const finalChatId = currentChatId; // Use the validated/created chat ID

    console.log("messages_format", messages_format);

    // Prepare completion parameters
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completionParams: any = {
      messages: messages_format,
      model: model,
      stream: true,
    };

    // Add PDF processing plugin if we have a PDF file (OpenRouter specific feature)
    if (fileUrl && fileType === "application/pdf") {
      completionParams.plugins = [
        {
          id: "file-parser",
          pdf: {
            engine: "pdf-text", // Use free engine by default, can be changed to "mistral-ocr" for better OCR
          },
        },
      ];
    }

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
            const content = chunk.choices[0]?.delta?.content || "";
            const reasoning =
              (chunk.choices[0]?.delta as { reasoning?: string })?.reasoning ||
              "";

            if (reasoning) {
              // Start reasoning block if this is the first reasoning chunk
              if (!reasoningStarted) {
                const reasoningStart = `\`\`\` think\n`;
                fullBotResponse += reasoningStart;
                controller.enqueue(encoder.encode(reasoningStart));
                reasoningStarted = true;
              }

              // Stream the reasoning chunk
              fullBotResponse += reasoning;
              controller.enqueue(encoder.encode(reasoning));
            }

            if (content) {
              // Close reasoning block if we had reasoning and now we're getting content
              if (reasoningStarted && !reasoningComplete) {
                const reasoningEnd = `\n\`\`\`\n\n`;
                fullBotResponse += reasoningEnd;
                controller.enqueue(encoder.encode(reasoningEnd));
                reasoningComplete = true;
              }

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
              // Prepare all messages to be saved
              const messagesToSave = [];

              // Save all previous conversations to database if shared is true OR editedMessage is true
              if (
                (shared || editedMessage) &&
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
                      imageResponseId: null, // Regular chat messages don't have image response IDs
                    });
                  }
                }
              }

              // Add the current message pair
              messagesToSave.push({
                id: nanoid(),
                userMessage: message.trim(),
                botResponse: fullBotResponse,
                chatId: finalChatId, // Link to the correct chat ID
                createdAt: new Date(),
                fileUrl: fileUrl || null,
                fileType: fileType || null,
                fileName: fileName || null,
                imageResponseId: null, // Regular chat messages don't have image response IDs
              });

              // Insert all messages at once
              if (messagesToSave.length > 0) {
                await db.insert(messages).values(messagesToSave);
                console.log(
                  `Saved ${messagesToSave.length} message pairs for chat ${finalChatId}`
                );
              }
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
