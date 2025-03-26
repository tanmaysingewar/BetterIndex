import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/database/db";
import {
  account,
  user,
  verification,
  session,
} from "@/database/schema/auth-schema";
import { anonymous } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [anonymous()],
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
