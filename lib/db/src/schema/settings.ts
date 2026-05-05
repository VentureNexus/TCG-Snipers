import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  concurrency: integer("concurrency").notNull().default(5),
  monitorDelay: integer("monitor_delay").notNull().default(3000),
  webhookUrl: text("webhook_url").notNull().default(""),
  imapHost: text("imap_host").notNull().default(""),
  imapPort: text("imap_port").notNull().default("993"),
  imapEmail: text("imap_email").notNull().default(""),
  imapPassword: text("imap_password").notNull().default(""),
  googleEmail: text("google_email"),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiry: text("google_token_expiry"),
  discordGuildName: text("discord_guild_name"),
  discordChannelName: text("discord_channel_name"),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export const selectSettingsSchema = createSelectSchema(settingsTable);
export const updateSettingsSchema = insertSettingsSchema.partial();

export type Settings = z.infer<typeof selectSettingsSchema>;
export type UpdateSettings = z.infer<typeof updateSettingsSchema>;
