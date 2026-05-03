import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const proxiesTable = pgTable("proxies", {
  id: serial("id").primaryKey(),
  label: text("label").notNull().default(""),
  host: text("host").notNull(),
  port: text("port").notNull(),
  username: text("username").notNull().default(""),
  password: text("password").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  lastTestStatus: text("last_test_status").notNull().default("untested"),
  lastTestLatency: text("last_test_latency").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProxySchema = createInsertSchema(proxiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProxy = z.infer<typeof insertProxySchema>;
export type Proxy = typeof proxiesTable.$inferSelect;
