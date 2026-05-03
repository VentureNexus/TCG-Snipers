import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

// Single-use, short-lived. We store sha256 hash of the raw token.
export const magicLinkTokensTable = pgTable(
  "magic_link_tokens",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenIdx: index("magic_link_tokens_hash_idx").on(t.tokenHash),
    customerIdx: index("magic_link_tokens_customer_idx").on(t.customerId),
  }),
);

export const insertMagicLinkTokenSchema = createInsertSchema(magicLinkTokensTable).omit({ id: true, createdAt: true });
export type InsertMagicLinkToken = z.infer<typeof insertMagicLinkTokenSchema>;
export type MagicLinkToken = typeof magicLinkTokensTable.$inferSelect;
