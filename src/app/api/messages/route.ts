// File: app/api/messages/route.ts

import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { db } from "@/database/db";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { messages, chat } from "@/database/schema/auth-schema";

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

    if (!chatId) {
      return NextResponse.json(
        { error: "chatId query parameter is required" },
        { status: 400 },
      );
    }

    // --- Fetch messages JOINED with chat to verify ownership ---
    // This query ensures we only get messages from chats owned by the logged-in user.
    const fetchedMessages = await db
      .select({
        id: messages.id,
        userMessage: messages.userMessage,
        botResponse: messages.botResponse,
        // Add createdAt if you need to sort by it, otherwise ID might suffice
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(chat, eq(messages.chatId, chat.id)) // Join messages with chat
      .where(
        and(
          eq(messages.chatId, chatId), // Filter by the requested chatId
          eq(chat.userId, userId), // Filter by the authenticated user's ID
        ),
      )
      // Add ordering if needed, e.g., by message ID or timestamp
      // .orderBy(messages.createdAt); // or .orderBy(messages.id);
      .orderBy(messages.createdAt); // Assuming nanoid/similar IDs are roughly sequential

    // --- Format the response ---
    // The frontend expects an array of { role, content } objects.
    // We need to transform the DB result (one row per turn) into this format.
    const formattedMessages: Array<{
      role: "user" | "assistant";
      content: string;
    }> = [];
    for (const msg of fetchedMessages) {
      if (msg.userMessage) {
        formattedMessages.push({ role: "user", content: msg.userMessage });
      }
      if (msg.botResponse) {
        formattedMessages.push({ role: "assistant", content: msg.botResponse });
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
