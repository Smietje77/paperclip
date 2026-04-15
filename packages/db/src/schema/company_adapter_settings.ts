import { pgTable, uuid, text, timestamp, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Per-company defaults for each adapter type. One row per (companyId, adapterType).
 * Rows are seeded for every adapter type via company-scaffold so every company
 * exposes an identical Company → Adapters surface.
 */
export const companyAdapterSettings = pgTable(
  "company_adapter_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    adapterType: text("adapter_type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    defaultModel: text("default_model"),
    defaultAdapterConfig: jsonb("default_adapter_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastTestStatus: text("last_test_status"),
    lastTestError: text("last_test_error"),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    configured: boolean("configured").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("company_adapter_settings_company_idx").on(table.companyId),
    companyTypeUq: uniqueIndex("company_adapter_settings_company_type_uq").on(
      table.companyId,
      table.adapterType,
    ),
  }),
);
