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
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";

export const auth = betterAuth({
  plugins: [
    nextCookies(),
    anonymous({
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        // Ensure both user objects and their IDs are present
        if (!anonymousUser?.user?.id || !newUser?.user?.id) {
          console.error(
            "Missing anonymousUser or newUser ID during account linking."
          );
          // Depending on your auth library, you might need to throw an error
          // or return a specific value to indicate failure.
          throw new Error("Cannot link accounts without valid user IDs.");
        }

        // Check if a user with this email already existed before linking
        const [preExistingUser] = await db
          .select({ createdAt: user.createdAt, id: user.id })
          .from(user)
          .where(eq(user.email, newUser.user.email));

        console.log(preExistingUser);
        // Check if the pre-existing user was created recently
        if (preExistingUser?.createdAt) {
          const fortySecondsAgo = new Date(Date.now() - 40 * 1000);
          if (preExistingUser.createdAt > fortySecondsAgo) {
            // Apply rate limiting logic for recently created accounts
            console.log(
              `User account ${newUser.user.email} was created recently. Applying rate limit.`
            );
            await db
              .update(user)
              .set({ rateLimit: "10" })
              .where(eq(user.id, preExistingUser?.id));
          }
        }

        try {
          // Use a transaction to ensure atomicity: either all chats are transferred
          // or none are if an error occurs.
          await db.transaction(async (tx) => {
            // Update all chats belonging to the anonymous user to belong to the new user
            await tx
              .update(chat)
              .set({ userId: newUser?.user?.id })
              .where(eq(chat.userId, anonymousUser?.user?.id))
              .returning({ updatedChatId: chat.id }); // Optional: get IDs of updated chats
          });
        } catch (error) {
          console.error(
            `Error transferring chats from user ${anonymousUser?.user?.id} to ${newUser?.user?.id}:`,
            error
          );
          // Re-throw the error or handle it as needed for your auth library
          // to know the linking process might have failed partially or fully.
          throw new Error(
            "Failed to transfer user chats during account linking."
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
