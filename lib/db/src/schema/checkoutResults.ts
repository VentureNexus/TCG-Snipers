import { pgTable, text, serial, integer, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const checkoutResultsTable = pgTable("checkout_results", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id"),
  success: boolean("success").notNull().default(false),
  productName: text("product_name").notNull().default(""),
  productImage: text("product_image").notNull().default(""),
  price: numeric("price", { precision: 10, scale: 2 }),
  retailer: text("retailer").notNull().default(""),
  orderNumber: text("order_number").notNull().default(""),
  errorMessage: text("error_message").notNull().default(""),
  profileId: integer("profile_id"),
  visualAssist: boolean("visual_assist").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCheckoutResultSchema = createInsertSchema(checkoutResultsTable).omit({ id: true, createdAt: true });
export type InsertCheckoutResult = z.infer<typeof insertCheckoutResultSchema>;
export type CheckoutResult = typeof checkoutResultsTable.$inferSelect;
