import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const profilesTable = pgTable("profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  shipFirstName: text("ship_first_name").notNull().default(""),
  shipLastName: text("ship_last_name").notNull().default(""),
  shipAddress1: text("ship_address1").notNull().default(""),
  shipAddress2: text("ship_address2").notNull().default(""),
  shipCity: text("ship_city").notNull().default(""),
  shipState: text("ship_state").notNull().default(""),
  shipZip: text("ship_zip").notNull().default(""),
  shipCountry: text("ship_country").notNull().default("US"),
  billSameAsShip: boolean("bill_same_as_ship").notNull().default(true),
  billFirstName: text("bill_first_name").notNull().default(""),
  billLastName: text("bill_last_name").notNull().default(""),
  billAddress1: text("bill_address1").notNull().default(""),
  billAddress2: text("bill_address2").notNull().default(""),
  billCity: text("bill_city").notNull().default(""),
  billState: text("bill_state").notNull().default(""),
  billZip: text("bill_zip").notNull().default(""),
  billCountry: text("bill_country").notNull().default("US"),
  addressJigEnabled: boolean("address_jig_enabled").notNull().default(false),
  costcoMembershipId: text("costco_membership_id").notNull().default(""),
  imapHost: text("imap_host").notNull().default(""),
  imapPort: text("imap_port").notNull().default("993"),
  imapUser: text("imap_user").notNull().default(""),
  imapPassword: text("imap_password").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
