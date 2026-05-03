import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const creditCardsTable = pgTable("credit_cards", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull(),
  cardNickname: text("card_nickname").notNull().default(""),
  cardholderName: text("cardholder_name").notNull(),
  encryptedNumber: text("encrypted_number").notNull(),
  encryptedCvv: text("encrypted_cvv").notNull(),
  expiryMonth: text("expiry_month").notNull(),
  expiryYear: text("expiry_year").notNull(),
  lastFour: text("last_four").notNull().default(""),
  cardType: text("card_type").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCreditCardSchema = createInsertSchema(creditCardsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCreditCard = z.infer<typeof insertCreditCardSchema>;
export type CreditCard = typeof creditCardsTable.$inferSelect;
