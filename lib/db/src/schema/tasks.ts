import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id"),
  profileId: integer("profile_id"),
  proxyId: integer("proxy_id"),
  retailer: text("retailer").notNull(),
  productUrl: text("product_url").notNull().default(""),
  productKeywords: text("product_keywords").notNull().default(""),
  size: text("size").notNull().default(""),
  quantity: integer("quantity").notNull().default(1),
  monitorDelay: integer("monitor_delay").notNull().default(3000),
  retryCount: integer("retry_count").notNull().default(3),
  maxPrice: integer("max_price"),
  status: text("status").notNull().default("idle"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
