import {
  pgTable,
  text,
  timestamp,
  boolean,
  numeric,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  isAnonymous: boolean("is_anonymous"),
  rateLimit: numeric("rate_limit").default("1"),
  lastRateLimitReset: timestamp("last_rate_limit_reset"),
  pro: boolean("pro").default(false),
});

export const userRelations = relations(user, ({ many }) => ({
  chats: many(chat),
  sessions: many(session),
  accounts: many(account),
}));

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const chat = pgTable("chat", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  isShared: boolean("is_shared").default(false),
});

export const chatRelations = relations(chat, ({ one, many }) => ({
  user: one(user, {
    fields: [chat.userId],
    references: [user.id],
  }),
  messages: many(messages),
}));

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  userMessage: text("user_message").notNull(),
  botResponse: text("bot_response").notNull(),
  chatId: text("chat_id")
    .notNull()
    .references(() => chat.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull(),
  fileUrl: text("file_url").default(""),
  fileType: text("file_type").default(""),
  fileName: text("file_name").default(""),
  imageResponseId: text("image_response_id"), // For OpenAI image generation response IDs
  model: text("model").default(""), // Model name used for the message
});

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chat, {
    fields: [messages.chatId],
    references: [chat.id],
  }),
}));

export const sharedChat = pgTable("shared_chat", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  chatId: text("chat_id").notNull(),
  createdAt: timestamp("created_at").notNull(),
  userId: text("user_id").notNull(),
});

export const sharedChatRelations = relations(sharedChat, ({ many }) => ({
  messages: many(sharedChatMessages),
}));

export const sharedChatMessages = pgTable("shared_chat_messages", {
  id: text("id").primaryKey(),
  userMessage: text("user_message"),
  botResponse: text("bot_response"),
  sharedChatId: text("shared_chat_id")
    .notNull()
    .references(() => sharedChat.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull(),
  fileUrl: text("file_url").default(""),
  fileType: text("file_type").default(""),
  fileName: text("file_name").default(""),
  imageResponseId: text("image_response_id"), // For OpenAI image generation response IDs
  model: text("model").default(""), // Model name used for the message
});
