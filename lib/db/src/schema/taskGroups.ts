import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const taskGroupsTable = pgTable("task_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  retailer: text("retailer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaskGroupSchema = createInsertSchema(taskGroupsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTaskGroup = z.infer<typeof insertTaskGroupSchema>;
export type TaskGroup = typeof taskGroupsTable.$inferSelect;
