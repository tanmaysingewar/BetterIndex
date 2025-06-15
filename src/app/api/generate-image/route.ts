import { NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { UTApi } from "uploadthing/server";
import { db } from "@/database/db";
import { nanoid } from "nanoid";
import { chat, messages } from "@/database/schema/auth-schema";
import { eq } from "drizzle-orm";
import models from "@/support/models";

const openai = new OpenAI();
const utapi = new UTApi();

export async function POST(req: Request) {
  let currentChatId: string | null = null;
  let isNewChatFlow = false;
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
      messages: messageHistory,
      previous_image_response_id,
      fileUrl,
      fileType,
      fileName,
    } = await req.json();

    console.log("Image generation request details:", {
      hasFileUrl: !!fileUrl,
      fileUrl: fileUrl,
      fileType: fileType,
      fileName: fileName,
    });

    // --- 2. Validate Input ---
    if (
      !messageHistory ||
      !Array.isArray(messageHistory) ||
      messageHistory.length === 0
    ) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    const lastMessage = messageHistory[messageHistory.length - 1];
    const prompt = lastMessage.content;

    if (!prompt) {
      return NextResponse.json(
        { error: "A prompt is required" },
        { status: 400 }
      );
    }

    // --- 3. Authentication ---
    const sessionData = await auth.api.getSession({
      headers: requestHeaders,
    });

    if (!sessionData?.session || !sessionData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = sessionData.user.id;
    const userEmail = sessionData.user.email;

    // --- 4. Rate Limiting ---
    // The model used for image generation (gpt-4.1-mini)
    const imageGenerationModel = "openai/gpt-image-1";

    // Find the current model to check if it's premium
    const currentModel = models.find((m) => m.id === imageGenerationModel);
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
          "Premium image generation requires a signed-in account. Please sign in to use this feature.";
      } else {
        // Non-premium models: 10 messages in 24h for non-logged in users
        requestLimit = 10;
        errorMessage =
          "You have reached the maximum of 10 image generation requests per 24 hours for free users. Please sign in for a free account to get more usage.";
      }
    } else {
      // Logged-in users: 3 messages in 24h regardless of model type
      requestLimit = 3;
      errorMessage =
        "You have reached the maximum of 3 image generation requests per 24 hours. Please try again later.";
    }

    // Create rate limiter with the determined limit
    if (requestLimit > 0) {
      ratelimit = new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(requestLimit, "24 h"),
      });

      // Use user email as the identifier for rate limiting with image generation suffix
      const { success } = await ratelimit.limit(
        `${userEmail}:image:${isPremiumModel ? "premium" : "free"}`
      );

      if (!success) {
        console.warn(
          `API Warning: Image generation rate limit exceeded for user ${userEmail} using ${
            isPremiumModel ? "premium" : "free"
          } model ${imageGenerationModel}.`
        );
        return NextResponse.json(
          {
            error: errorMessage,
          },
          { status: 429 }
        );
      }
    } else {
      // requestLimit is 0, deny access immediately
      console.warn(
        `API Warning: Access denied for user ${userEmail} trying to use premium image generation without login.`
      );
      return NextResponse.json(
        {
          error: errorMessage,
        },
        { status: 403 }
      );
    }

    // --- 5. Handle Chat ID from Frontend (similar to regular route) ---
    if (!currentChatId) {
      // If no chat ID provided, this is likely a direct API call
      // Generate a new chat ID for consistency
      currentChatId = nanoid();
      isNewChatFlow = true;
    } else {
      // Check Chat Existence, Ownership, or Create New
      try {
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
            return NextResponse.json(
              {
                error: "Forbidden: Chat does not belong to user",
              },
              { status: 403 }
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
      } catch (dbError) {
        console.error(
          `Database error during chat check/creation for ID ${currentChatId}:`,
          dbError
        );
        return NextResponse.json(
          { error: "Database error during chat handling" },
          { status: 500 }
        );
      }
    }

    // --- 6. Generate Image using OpenAI Responses API ---
    const responseIdToUse = previous_image_response_id;

    console.log("Image generation request:", {
      prompt: prompt.slice(0, 100),
      previous_image_response_id,
      responseIdToUse,
      isMultiTurn: !!responseIdToUse,
      hasInputImage: !!fileUrl,
    });

    // Helper function to create file from URL
    const createFileFromUrl = async (url: string): Promise<string> => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        const file = new File([buffer], fileName || "input-image.png", {
          type: fileType || "image/png",
        });

        const fileResponse = await openai.files.create({
          file: file,
          purpose: "vision",
        });

        return fileResponse.id;
      } catch (error) {
        console.error("Error creating file from URL:", error);
        throw error;
      }
    };

    // Prepare input content
    let inputContent;

    if (fileUrl && fileType?.startsWith("image/")) {
      // Handle input image case
      try {
        const fileId = await createFileFromUrl(fileUrl);

        inputContent = [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt,
              },
              {
                type: "input_image",
                file_id: fileId,
              },
            ],
          },
        ];

        console.log("Created input with image file ID:", fileId);
      } catch (error) {
        console.error("Error handling input image:", error);
        // Fallback to text-only if image processing fails
        inputContent = prompt;
      }
    } else {
      // Text-only prompt
      inputContent = prompt;
    }

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: inputContent,
      tools: [{ type: "image_generation", quality: "low" }],
      ...(responseIdToUse && { previous_response_id: responseIdToUse }),
    });

    console.log("OpenAI response received:", {
      responseId: response.id,
      outputCount: response.output?.length || 0,
    });

    // Extract the generated image from the response
    const imageGenerationCalls = response.output?.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (output: any) => output.type === "image_generation_call"
    );

    if (!imageGenerationCalls || imageGenerationCalls.length === 0) {
      return NextResponse.json(
        { error: "No image was generated" },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageBase64 = (imageGenerationCalls[0] as any).result;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Failed to generate image" },
        { status: 500 }
      );
    }

    // --- 7. Upload Image to UploadThing ---
    const imageBuffer = Buffer.from(imageBase64, "base64");
    const imageBlob = new Blob([imageBuffer], { type: "image/png" });
    const imageFile = new File(
      [imageBlob],
      `generated-image-${Date.now()}.png`,
      { type: "image/png" }
    );

    const uploadResponse = await utapi.uploadFiles(imageFile);

    if (uploadResponse.error) {
      console.error("UploadThing error:", uploadResponse.error);
      return NextResponse.json(
        { error: "Failed to upload image" },
        { status: 500 }
      );
    }

    if (!uploadResponse.data) {
      return NextResponse.json(
        { error: "Failed to upload image" },
        { status: 500 }
      );
    }

    const uploadedImageUrl = uploadResponse.data.url;

    // --- 8. Create Chat if New ---
    if (isNewChatFlow) {
      // Generate the title for image generation
      title = `Image: ${prompt.slice(0, 50)}${prompt.length > 50 ? "..." : ""}`;

      try {
        await db.insert(chat).values({
          id: currentChatId,
          title: title,
          userId: userId,
          createdAt: new Date(),
        });
        console.log(`Created new chat ${currentChatId} with title: ${title}`);
      } catch (dbError) {
        console.error(`Error creating chat ${currentChatId}:`, dbError);
        return NextResponse.json(
          { error: "Database error during chat creation" },
          { status: 500 }
        );
      }
    }

    // --- 9. Save Messages to Database ---
    const fullBotResponse = `![Generated Image](${uploadedImageUrl})`;

    try {
      // Prepare all messages to be saved
      const messagesToSave = [];

      // Save all previous conversations to database if shared is true OR editedMessage is true
      if (
        (shared || editedMessage) &&
        Array.isArray(messageHistory) &&
        messageHistory.length > 1
      ) {
        // Group messages into user-assistant pairs (excluding the last user message)
        const previousMessages = messageHistory.slice(0, -1);
        for (let i = 0; i < previousMessages.length - 1; i += 2) {
          const userMsg = previousMessages[i];
          const assistantMsg = previousMessages[i + 1];

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
              chatId: currentChatId,
              createdAt: new Date(),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              fileUrl: (userMsg as any).fileUrl || null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              fileType: (userMsg as any).fileType || null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              fileName: (userMsg as any).fileName || null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              imageResponseId: (assistantMsg as any).imageResponseId || null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              model: (assistantMsg as any).model || imageGenerationModel,
            });
          }
        }
      }

      // Add the current message pair (image generation)
      const currentMessageData = {
        id: nanoid(),
        userMessage: prompt.trim(),
        botResponse: fullBotResponse,
        chatId: currentChatId,
        createdAt: new Date(),
        fileUrl: fileUrl || null, // Store the input image file URL if provided
        fileType: fileType || null,
        fileName: fileName || null,
        imageResponseId: response.id, // Store the OpenAI response ID for multi-turn context
        model: imageGenerationModel,
      };

      console.log("Current message data being saved:", {
        hasFileUrl: !!currentMessageData.fileUrl,
        fileUrl: currentMessageData.fileUrl,
        fileType: currentMessageData.fileType,
        fileName: currentMessageData.fileName,
      });

      messagesToSave.push(currentMessageData);

      // Insert all messages at once
      if (messagesToSave.length > 0) {
        await db.insert(messages).values(messagesToSave);
        console.log(
          `Saved ${messagesToSave.length} message pairs for chat ${currentChatId}`
        );
      }
    } catch (dbError) {
      console.error("Error saving message pair:", dbError);
      // Continue anyway since the image was generated successfully
    }

    // --- 10. Return Response ---
    const responseHeaders = new Headers({
      "Content-Type": "application/json",
      "X-Title":
        title ||
        `Image: ${prompt.slice(0, 50)}${prompt.length > 50 ? "..." : ""}`,
    });

    return new Response(
      JSON.stringify({
        url: uploadedImageUrl,
        response_id: response.id,
      }),
      {
        headers: responseHeaders,
      }
    );
  } catch (error) {
    console.error("Error generating image:", error);
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}
