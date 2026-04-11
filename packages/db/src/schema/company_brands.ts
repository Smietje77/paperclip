import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { assets } from "./assets.js";

/**
 * Company brand profile — 1:1 with a company. Holds visual identity
 * (colors, typography, logos) plus narrative brand context (voice, tone,
 * guidelines) that can be injected into agent runtime env as prompt context.
 */
export const companyBrands = pgTable(
  "company_brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    brandName: text("brand_name"),
    tagline: text("tagline"),
    // JSONB blobs keep the schema flexible as we add more named colors or
    // typography slots without needing new columns.
    colors: jsonb("colors").$type<Record<string, string>>(),
    typography: jsonb("typography").$type<Record<string, string>>(),
    logoLightAssetId: uuid("logo_light_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    logoDarkAssetId: uuid("logo_dark_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    iconAssetId: uuid("icon_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    voiceTone: text("voice_tone"),
    brandGuidelines: text("brand_guidelines"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUq: uniqueIndex("company_brands_company_uq").on(table.companyId),
  }),
);