import { pgTable, serial, text, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

// Status values: "active" | "past_due" | "canceled" | "incomplete"
export const licensesTable = pgTable(
  "licenses",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull(),
    keyLast4: text("key_last4").notNull().default(""),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().default(""),
    status: text("status").notNull().default("incomplete"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    keyHashIdx: uniqueIndex("licenses_key_hash_idx").on(t.keyHash),
    customerIdx: index("licenses_customer_idx").on(t.customerId),
    subIdx: index("licenses_stripe_sub_idx").on(t.stripeSubscriptionId),
  }),
);

export const insertLicenseSchema = createInsertSchema(licensesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLicense = z.infer<typeof insertLicenseSchema>;
export type License = typeof licensesTable.$inferSelect;
