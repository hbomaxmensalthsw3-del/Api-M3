import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const authorizedUsersTable = pgTable("authorized_users", {
  id: serial("id").primaryKey(),
  discordUserId: text("discord_user_id").notNull().unique(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export const keysTable = pgTable("keys", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  discordUserId: text("discord_user_id").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuthorizedUserSchema = createInsertSchema(authorizedUsersTable).omit({ id: true, addedAt: true });
export const insertKeySchema = createInsertSchema(keysTable).omit({ id: true, createdAt: true });

export type AuthorizedUser = typeof authorizedUsersTable.$inferSelect;
export type Key = typeof keysTable.$inferSelect;
export type InsertAuthorizedUser = z.infer<typeof insertAuthorizedUserSchema>;
export type InsertKey = z.infer<typeof insertKeySchema>;
