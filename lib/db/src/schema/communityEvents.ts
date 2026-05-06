import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const communityEventsTable = pgTable("community_events", {
  id: serial("id").primaryKey(),
  retailer: text("retailer").notNull(),
  eventType: text("event_type").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
