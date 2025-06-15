import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { db } from "@/database/db";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  chat,
  messages,
  sharedChat,
  sharedChatMessages,
} from "@/database/schema/auth-schema";

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

    // --- Get chatId from request body ---
    const { chatId } = await req.json();

    if (!chatId) {
      return NextResponse.json(
        { error: "chatId is required" },
        { status: 400 }
      );
    }

    // --- Verify chat ownership ---
    const existingChat = await db
      .select({
        id: chat.id,
        title: chat.title,
        userId: chat.userId,
        isShared: chat.isShared,
        createdAt: chat.createdAt,
      })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!existingChat.length) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const currentChat = existingChat[0];

    if (currentChat.userId !== userId) {
      return NextResponse.json(
        { error: "Forbidden: Chat does not belong to user" },
        { status: 403 }
      );
    }

    // --- Get all messages from the chat ---
    const chatMessages = await db
      .select({
        id: messages.id,
        userMessage: messages.userMessage,
        botResponse: messages.botResponse,
        createdAt: messages.createdAt,
        fileUrl: messages.fileUrl,
        fileType: messages.fileType,
        fileName: messages.fileName,
        imageResponseId: messages.imageResponseId,
        model: messages.model,
      })
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(messages.createdAt);

    // --- Generate new shared chat ID ---
    const sharedChatId = nanoid();

    // --- Use transaction to ensure data consistency ---
    await db.transaction(async (tx) => {
      // Create shared chat entry
      await tx.insert(sharedChat).values({
        id: sharedChatId,
        title: currentChat.title,
        createdAt: new Date(),
        chatId: chatId,
        userId: userId,
      });

      // Copy all messages to shared chat messages
      if (chatMessages.length > 0) {
        const sharedMessages = chatMessages.map((msg) => ({
          id: nanoid(),
          userMessage: msg.userMessage,
          botResponse: msg.botResponse,
          sharedChatId: sharedChatId,
          chatId: chatId,
          createdAt: new Date(),
          fileUrl: msg.fileUrl,
          fileType: msg.fileType,
          fileName: msg.fileName,
          imageResponseId: msg.imageResponseId,
          model: msg.model,
        }));

        await tx.insert(sharedChatMessages).values(sharedMessages);
      }

      // Mark original chat as shared
      await tx.update(chat).set({ isShared: true }).where(eq(chat.id, chatId));
    });

    // --- Return success response with shared chat info ---
    return NextResponse.json(
      {
        success: true,
        sharedChatId,
        message: "Chat shared successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("API error sharing chat:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function GET() {
  // --- Authentication ---
  const sessionData = await auth.api.getSession({
    headers: await nextHeaders(),
  });

  if (!sessionData?.session || !sessionData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = sessionData.user.id;

  // Get all shared chats for the user
  const sharedChats = await db
    .select({
      id: sharedChat.id,
      title: sharedChat.title,
      userId: sharedChat.userId,
      createdAt: sharedChat.createdAt,
      chatId: sharedChat.chatId,
    })
    .from(sharedChat)
    .where(and(eq(sharedChat.userId, userId)))
    .orderBy(sharedChat.createdAt);

  return NextResponse.json(
    {
      chats: sharedChats,
      count: sharedChats.length,
    },
    { status: 200 }
  );
}
