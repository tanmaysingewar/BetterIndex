import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/database/db";
import {
  account,
  user,
  verification,
  session,
  chat,
} from "@/database/schema/auth-schema";
import { anonymous } from "better-auth/plugins";
import { eq } from "drizzle-orm";

export const auth = betterAuth({
  plugins: [
    anonymous({
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        console.log("anonymousUser", anonymousUser);
        console.log("newUser", newUser);

        // Ensure both user objects and their IDs are present
        if (!anonymousUser?.user?.id || !newUser?.user?.id) {
          console.error(
            "Missing anonymousUser or newUser ID during account linking.",
          );
          // Depending on your auth library, you might need to throw an error
          // or return a specific value to indicate failure.
          throw new Error("Cannot link accounts without valid user IDs.");
        }

        try {
          // Use a transaction to ensure atomicity: either all chats are transferred
          // or none are if an error occurs.
          await db.transaction(async (tx) => {
            console.log(
              `Attempting to transfer chats from anonymous user ${anonymousUser?.user?.id} to new user ${newUser?.user?.id}`,
            );

            // Update all chats belonging to the anonymous user to belong to the new user
            const updateResult = await tx
              .update(chat)
              .set({ userId: newUser?.user?.id })
              .where(eq(chat.userId, anonymousUser?.user?.id))
              .returning({ updatedChatId: chat.id }); // Optional: get IDs of updated chats

            console.log(
              `Successfully transferred ${updateResult.length} chats to user ${newUser?.user?.id}.`,
            );
          });

          console.log(
            `Chat transfer complete for user ${newUser?.user?.id} (linked from ${anonymousUser?.user?.id}).`,
          );
        } catch (error) {
          console.error(
            `Error transferring chats from user ${anonymousUser?.user?.id} to ${newUser?.user?.id}:`,
            error,
          );
          // Re-throw the error or handle it as needed for your auth library
          // to know the linking process might have failed partially or fully.
          throw new Error(
            "Failed to transfer user chats during account linking.",
          );
        }
      },
    }),
  ],
  database: drizzleAdapter(db, {
    provider: "pg", // or "mysql", "sqlite"
    schema: {
      user: user,
      session: session,
      account: account,
      verification: verification,
    },
  }),
  // emailAndPassword: {
  //     enabled : true,
  // },
  socialProviders: {
    google: {
      enabled: true,
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});
