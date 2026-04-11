import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { assets } from "./assets.js";

/**
 * Gallery of brand images for a company (hero shots, social assets, etc.).
 * Separate from `company_brands.logoLight/Dark/iconAssetId` which are the
 * three named logo slots.
 */
export const companyBrandImages = pgTable(
  "company_brand_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    caption: text("caption"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("company_brand_images_company_idx").on(table.companyId, table.sortOrder),
  }),
);