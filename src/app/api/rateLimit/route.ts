// File: src/app/api/rateLimit/route.ts

import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { db } from "@/database/db"; // Assuming your Drizzle database instance is exported as 'db' from here
import { auth } from "@/lib/auth"; // Assuming your authentication library is here
import { user } from "@/database/schema/auth-schema"; // Import the user schema
import { eq } from "drizzle-orm"; // Import eq for querying

export async function GET() {
  try {
    // --- Authentication ---
    const sessionData = await auth.api.getSession({
      headers: await nextHeaders(),
    });

    if (!sessionData?.session || !sessionData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = sessionData.user.id;

    // --- Fetch User Rate Limit ---
    const userData = await db
      .select({
        rateLimit: user.rateLimit,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!userData || userData.length === 0) {
      // This case should ideally not happen if authentication passes, but as a safeguard
      console.error(
        `API Error: User data not found for ID ${userId} after authentication.`
      );
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { rateLimit } = userData[0];

    // --- Return Rate Limit ---
    return NextResponse.json({ rateLimit: rateLimit }, { status: 200 });
  } catch (error) {
    console.error("API error fetching rate limit:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
