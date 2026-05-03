import { pgTable, serial, text, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { licensesTable } from "./licenses";

// One license -> one currently-bound device. Enforced via unique index on licenseId.
export const devicesTable = pgTable(
  "devices",
  {
    id: serial("id").primaryKey(),
    licenseId: integer("license_id")
      .notNull()
      .references(() => licensesTable.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    osPlatform: text("os_platform").notNull().default(""),
    label: text("label").notNull().default(""),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    licenseIdx: uniqueIndex("devices_license_idx").on(t.licenseId),
  }),
);

export const insertDeviceSchema = createInsertSchema(devicesTable).omit({ id: true, activatedAt: true, lastSeenAt: true });
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devicesTable.$inferSelect;
