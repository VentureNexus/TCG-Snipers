import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";

export const checkoutSelectorStatsTable = pgTable("checkout_selector_stats", {
  id: serial("id").primaryKey(),
  retailer: text("retailer").notNull(),
  step: text("step").notNull(),
  selector: text("selector").notNull(),
  successes: integer("successes").notNull().default(0),
  failures: integer("failures").notNull().default(0),
  avgDurationMs: real("avg_duration_ms").notNull().default(0),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
});
