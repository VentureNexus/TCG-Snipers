import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { profilesTable } from "./profiles";

export const SUPPORTED_RETAILERS = [
  "Amazon",
  "Walmart",
  "Best Buy",
  "Target",
  "Costco",
  "Sam's Club",
  "Pokemon Center",
] as const;

export type SupportedRetailer = (typeof SUPPORTED_RETAILERS)[number];

export const retailerAccountsTable = pgTable("retailer_accounts", {
  id: serial("id").primaryKey(),
  retailer: text("retailer").notNull(),
  profileId: integer("profile_id").references(() => profilesTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type RetailerAccount = typeof retailerAccountsTable.$inferSelect;
export type InsertRetailerAccount = typeof retailerAccountsTable.$inferInsert;
