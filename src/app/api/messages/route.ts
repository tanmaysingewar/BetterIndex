// File: app/api/messages/route.ts

import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { db } from "@/database/db";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import {
  messages,
  chat,
  sharedChatMessages,
} from "@/database/schema/auth-schema";

export async function GET(req: Request) {
  try {
    // --- Authentication ---
    const sessionData = await auth.api.getSession({
      headers: await nextHeaders(),
    });

    if (!sessionData?.session || !sessionData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = sessionData.user.id;

    // --- Get chat_id from URL query parameters ---
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get("chatId");
    const shared = searchParams.get("shared") || false;

    console.log("chatId", chatId);
    console.log("shared", shared);

    if (!chatId) {
      return NextResponse.json(
        { error: "chatId query parameter is required" },
        { status: 400 }
      );
    }

    // --- Fetch messages JOINED with chat to verify ownership ---
    // This query ensures we only get messages from chats owned by the logged-in user.
    let fetchedMessages;

    if (shared === "true") {
      fetchedMessages = await db
        .select({
          id: sharedChatMessages.id,
          userMessage: sharedChatMessages.userMessage,
          botResponse: sharedChatMessages.botResponse,
          createdAt: sharedChatMessages.createdAt,
          fileUrl: sharedChatMessages.fileUrl,
          fileType: sharedChatMessages.fileType,
          fileName: sharedChatMessages.fileName,
          imageResponseId: sharedChatMessages.imageResponseId,
          model: sharedChatMessages.model,
        })
        .from(sharedChatMessages)
        .where(eq(sharedChatMessages.sharedChatId, chatId))
        .orderBy(sharedChatMessages.createdAt);
    } else {
      fetchedMessages = await db
        .select({
          id: messages.id,
          userMessage: messages.userMessage,
          botResponse: messages.botResponse,
          // Add createdAt if you need to sort by it, otherwise ID might suffice
          createdAt: messages.createdAt,
          fileUrl: messages.fileUrl,
          fileType: messages.fileType,
          fileName: messages.fileName,
          imageResponseId: messages.imageResponseId,
          model: messages.model,
        })
        .from(messages)
        .innerJoin(chat, eq(messages.chatId, chat.id)) // Join messages with chat
        .where(
          and(
            eq(messages.chatId, chatId), // Filter by the requested chatId
            eq(chat.userId, userId) // Filter by the authenticated user's ID
          )
        )
        // Add ordering if needed, e.g., by message ID or timestamp
        // .orderBy(messages.createdAt); // or .orderBy(messages.id);
        .orderBy(messages.createdAt); // Assuming nanoid/similar IDs are roughly sequential
    }

    // --- Format the response ---
    // The frontend expects an array of { role, content } objects.
    // We need to transform the DB result (one row per turn) into this format.
    const formattedMessages: Array<{
      role: "user" | "assistant";
      content: string;
      fileUrl?: string;
      fileType?: string;
      fileName?: string;
      imageResponseId?: string;
      model?: string;
    }> = [];
    for (const msg of fetchedMessages) {
      if (msg.userMessage) {
        const userMessage: {
          role: "user";
          content: string;
          fileUrl?: string;
          fileType?: string;
          fileName?: string;
          model?: string;
        } = { role: "user", content: msg.userMessage };

        // Add file information if present
        if (msg.fileUrl) {
          userMessage.fileUrl = msg.fileUrl;
          userMessage.fileType = msg.fileType || undefined;
          userMessage.fileName = msg.fileName || undefined;
        }

        // Add model information if present
        if (msg.model) {
          userMessage.model = msg.model;
        }

        formattedMessages.push(userMessage);
      }
      if (msg.botResponse) {
        const assistantMessage: {
          role: "assistant";
          content: string;
          imageResponseId?: string;
          model?: string;
        } = { role: "assistant", content: msg.botResponse };

        // Add image response ID if present (for multi-turn image generation)
        if (msg.imageResponseId) {
          assistantMessage.imageResponseId = msg.imageResponseId;
        }

        // Add model information if present
        if (msg.model) {
          assistantMessage.model = msg.model;
        }

        formattedMessages.push(assistantMessage);
      }
    }

    return NextResponse.json(formattedMessages, { status: 200 });
  } catch (error) {
    console.error("API error fetching messages:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
