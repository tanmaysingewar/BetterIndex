import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { db } from "@/database/db";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { chat, messages } from "@/database/schema/auth-schema";

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
      id: chat.id,
      title: chat.title,
      userId: chat.userId,
      createdAt: chat.createdAt,
      isShared: chat.isShared,
    })
    .from(chat)
    .where(and(eq(chat.userId, userId), eq(chat.isShared, true)))
    .orderBy(chat.createdAt);

  return NextResponse.json(
    {
      chats: sharedChats,
      count: sharedChats.length,
    },
    { status: 200 }
  );
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    // --- Authentication ---
    const sessionData = await auth.api.getSession({
      headers: await nextHeaders(),
    });

    if (!sessionData?.session || !sessionData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = sessionData.user.id;
    const { chatId } = await params;

    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID is required" },
        { status: 400 }
      );
    }

    // --- Verify chat exists and belongs to user ---
    const existingChat = await db
      .select({ id: chat.id, userId: chat.userId })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!existingChat || existingChat.length === 0) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    if (existingChat[0].userId !== userId) {
      return NextResponse.json(
        { error: "Forbidden: Chat does not belong to user" },
        { status: 403 }
      );
    }

    // --- Delete messages first (cascade should handle this, but explicit is safer) ---
    await db.delete(messages).where(eq(messages.chatId, chatId));

    // --- Delete the chat ---
    await db
      .delete(chat)
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));

    return NextResponse.json(
      { message: "Chat deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("API error deleting chat:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    // --- Authentication ---
    const sessionData = await auth.api.getSession({
      headers: await nextHeaders(),
    });

    if (!sessionData?.session || !sessionData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = sessionData.user.id;
    const { chatId } = await params;

    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID is required" },
        { status: 400 }
      );
    }

    // --- Parse request body ---
    let body;
    try {
      body = await req.json();
    } catch (error) {
      console.log(error);
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const { title } = body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "Title is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (title.trim().length > 200) {
      return NextResponse.json(
        { error: "Title must be 200 characters or less" },
        { status: 400 }
      );
    }

    // --- Verify chat exists and belongs to user ---
    const existingChat = await db
      .select({ id: chat.id, userId: chat.userId })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!existingChat || existingChat.length === 0) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    if (existingChat[0].userId !== userId) {
      return NextResponse.json(
        { error: "Forbidden: Chat does not belong to user" },
        { status: 403 }
      );
    }

    // --- Update the chat title ---
    await db
      .update(chat)
      .set({ title: title.trim() })
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));

    return NextResponse.json(
      {
        message: "Chat title updated successfully",
        title: title.trim(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("API error updating chat title:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
