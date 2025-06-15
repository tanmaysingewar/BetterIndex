import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { db } from "@/database/db";
import { auth } from "@/lib/auth";
import { nanoid } from "nanoid";
import { chat, messages } from "@/database/schema/auth-schema";

export async function POST(req: Request) {
  try {
    // --- Authentication ---
    const sessionData = await auth.api.getSession({
      headers: await nextHeaders(),
    });

    if (!sessionData?.session || !sessionData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = sessionData.user.id;

    // --- Get request body ---
    const { chatId, title, messages: chatMessages } = await req.json();

    // --- Validate input ---
    if (!chatId || typeof chatId !== "string") {
      return NextResponse.json(
        { error: "chatId is required and must be a string" },
        { status: 400 }
      );
    }

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "title is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!Array.isArray(chatMessages)) {
      return NextResponse.json(
        { error: "messages must be an array" },
        { status: 400 }
      );
    }

    // --- Validate messages format ---
    for (const msg of chatMessages) {
      if (
        !msg ||
        typeof msg !== "object" ||
        !msg.role ||
        !msg.content ||
        typeof msg.content !== "string" ||
        (msg.role !== "user" && msg.role !== "assistant")
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid message format. Each message must have role ('user' or 'assistant') and content (string)",
          },
          { status: 400 }
        );
      }
    }

    // --- Use transaction to ensure data consistency ---
    await db.transaction(async (tx) => {
      // Create the new chat
      await tx.insert(chat).values({
        id: chatId,
        title: title.trim(),
        userId: userId,
        createdAt: new Date(),
        isShared: false,
      });

      // Convert the messages array to the database format
      // Group messages into user-assistant pairs
      const messagesToSave = [];

      for (let i = 0; i < chatMessages.length; i += 2) {
        const userMsg = chatMessages[i];
        const assistantMsg = chatMessages[i + 1];

        // Ensure we have both user and assistant messages
        if (
          userMsg?.role === "user" &&
          assistantMsg?.role === "assistant" &&
          userMsg.content?.trim() &&
          assistantMsg.content?.trim()
        ) {
          messagesToSave.push({
            id: nanoid(),
            userMessage: userMsg.content.trim(),
            botResponse: assistantMsg.content.trim(),
            chatId: chatId,
            createdAt: new Date(),
            fileUrl: userMsg.fileUrl || "",
            fileType: userMsg.fileType || "",
            fileName: userMsg.fileName || "",
            imageResponseId: assistantMsg.imageResponseId || null,
            model: assistantMsg.model || "",
          });
        }
      }

      // Insert all message pairs if any exist
      if (messagesToSave.length > 0) {
        await tx.insert(messages).values(messagesToSave);
      }
    });

    // --- Return success response ---
    return NextResponse.json(
      {
        success: true,
        chatId,
        title: title.trim(),
        messageCount: Math.floor(chatMessages.length / 2),
        message: "Chat branched successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("API error branching chat:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
