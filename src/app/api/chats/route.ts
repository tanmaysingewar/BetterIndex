// File: app/api/chats/route.ts

import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { db } from "@/database/db";
import { auth } from "@/lib/auth";
import { eq, desc, count, and, ilike, SQL } from "drizzle-orm"; // Import and, ilike, SQL
import { chat } from "@/database/schema/auth-schema";

// Default values for pagination
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 15; // Adjust as needed

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

    // --- Get Parameters from URL ---
    const { searchParams } = new URL(req.url);

    // Pagination
    let page = parseInt(searchParams.get("page") || `${DEFAULT_PAGE}`, 10);
    let limit = parseInt(searchParams.get("limit") || `${DEFAULT_LIMIT}`, 10);

    // Search
    const searchTerm = searchParams.get("search") || ""; // Get search term

    // Validate pagination parameters
    if (isNaN(page) || page < 1) {
      page = DEFAULT_PAGE;
    }
    if (isNaN(limit) || limit < 1) {
      limit = DEFAULT_LIMIT;
    }
    // Optional: Add a max limit check
    // if (limit > 100) {
    //   limit = 100;
    // }

    const offset = (page - 1) * limit;

    // --- Build Base Where Condition ---
    const baseWhereCondition: SQL = eq(chat.userId, userId);

    // --- Add Search Condition if searchTerm exists ---
    let finalWhereCondition: SQL | undefined = baseWhereCondition;
    if (searchTerm) {
      // Use ilike for case-insensitive search (adjust if your DB doesn't support it)
      // The `%` wildcards match any sequence of characters
      const searchCondition: SQL = ilike(chat.title, `%${searchTerm}%`);
      finalWhereCondition = and(baseWhereCondition, searchCondition);
    }

    // --- Fetch Total Count of User's Chats (with search filter) ---
    const totalResult = await db
      .select({ value: count() })
      .from(chat)
      .where(finalWhereCondition); // Apply combined filter

    const totalChats = totalResult[0]?.value ?? 0;
    const totalPages = Math.ceil(totalChats / limit);

    // --- Fetch Paginated Chats (with search filter) ---
    const userChats = await db
      .select({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
      })
      .from(chat)
      .where(finalWhereCondition) // Apply combined filter
      .orderBy(desc(chat.createdAt))
      .limit(limit)
      .offset(offset);

    // --- Structure and Return Response ---
    const responsePayload = {
      chats: userChats,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalChats: totalChats,
        totalPages: totalPages,
        searchTerm: searchTerm || null, // Optionally include search term in response
      },
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error) {
    console.error("API error fetching chats:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
