import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  assets,
  companies,
  companyBrandImages,
  companyBrands,
  companyLogos,
} from "@paperclipai/db";
import type {
  BrandColors,
  BrandImage,
  BrandTypography,
  CompanyBrand,
} from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";

const ASSET_CONTENT_PATH = (assetId: string) => `/api/assets/${assetId}/content`;

function normalizeColors(value: unknown): BrandColors | null {
  if (!value || typeof value !== "object") return null;
  const src = value as Record<string, unknown>;
  const pick = (key: string) =>
    typeof src[key] === "string" ? (src[key] as string) : null;
  return {
    primary: pick("primary"),
    secondary: pick("secondary"),
    accent: pick("accent"),
    background: pick("background"),
    text: pick("text"),
  };
}

function normalizeTypography(value: unknown): BrandTypography | null {
  if (!value || typeof value !== "object") return null;
  const src = value as Record<string, unknown>;
  const pick = (key: string) =>
    typeof src[key] === "string" ? (src[key] as string) : null;
  return {
    primary: pick("primary"),
    secondary: pick("secondary"),
  };
}

export function brandService(db: Db) {
  async function assertCompanyExists(companyId: string) {
    const row = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Company not found");
  }

  async function assertAssetBelongsToCompany(companyId: string, assetId: string) {
    const asset = await db
      .select({ id: assets.id, companyId: assets.companyId })
      .from(assets)
      .where(eq(assets.id, assetId))
      .then((rows) => rows[0] ?? null);
    if (!asset) throw notFound("Asset not found");
    if (asset.companyId !== companyId) {
      throw unprocessable("Asset must belong to the same company");
    }
  }

  async function loadImages(companyId: string): Promise<BrandImage[]> {
    const rows = await db
      .select()
      .from(companyBrandImages)
      .where(eq(companyBrandImages.companyId, companyId))
      .orderBy(asc(companyBrandImages.sortOrder), asc(companyBrandImages.createdAt));
    return rows.map((row) => ({
      id: row.id,
      assetId: row.assetId,
      url: ASSET_CONTENT_PATH(row.assetId),
      caption: row.caption,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
    }));
  }

  async function loadRow(companyId: string) {
    return db
      .select()
      .from(companyBrands)
      .where(eq(companyBrands.companyId, companyId))
      .then((rows) => rows[0] ?? null);
  }

  function enrich(
    row: typeof companyBrands.$inferSelect | null,
    companyId: string,
    images: BrandImage[],
  ): CompanyBrand {
    if (!row) {
      const now = new Date();
      return {
        companyId,
        brandName: null,
        tagline: null,
        colors: null,
        typography: null,
        logoLightAssetId: null,
        logoLightUrl: null,
        logoDarkAssetId: null,
        logoDarkUrl: null,
        iconAssetId: null,
        iconUrl: null,
        voiceTone: null,
        brandGuidelines: null,
        images,
        createdAt: now,
        updatedAt: now,
      };
    }
    return {
      companyId: row.companyId,
      brandName: row.brandName,
      tagline: row.tagline,
      colors: normalizeColors(row.colors),
      typography: normalizeTypography(row.typography),
      logoLightAssetId: row.logoLightAssetId,
      logoLightUrl: row.logoLightAssetId ? ASSET_CONTENT_PATH(row.logoLightAssetId) : null,
      logoDarkAssetId: row.logoDarkAssetId,
      logoDarkUrl: row.logoDarkAssetId ? ASSET_CONTENT_PATH(row.logoDarkAssetId) : null,
      iconAssetId: row.iconAssetId,
      iconUrl: row.iconAssetId ? ASSET_CONTENT_PATH(row.iconAssetId) : null,
      voiceTone: row.voiceTone,
      brandGuidelines: row.brandGuidelines,
      images,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  return {
    async get(companyId: string): Promise<CompanyBrand> {
      await assertCompanyExists(companyId);
      const [row, images] = await Promise.all([loadRow(companyId), loadImages(companyId)]);
      return enrich(row, companyId, images);
    },

    async upsert(
      companyId: string,
      patch: {
        brandName?: string | null;
        tagline?: string | null;
        colors?: BrandColors | null;
        typography?: BrandTypography | null;
        logoLightAssetId?: string | null;
        logoDarkAssetId?: string | null;
        iconAssetId?: string | null;
        voiceTone?: string | null;
        brandGuidelines?: string | null;
      },
    ): Promise<CompanyBrand> {
      await assertCompanyExists(companyId);

      // Verify all referenced assets belong to this company.
      for (const key of ["logoLightAssetId", "logoDarkAssetId", "iconAssetId"] as const) {
        const assetId = patch[key];
        if (assetId) await assertAssetBelongsToCompany(companyId, assetId);
      }

      return db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(companyBrands)
          .where(eq(companyBrands.companyId, companyId))
          .then((rows) => rows[0] ?? null);

        const now = new Date();
        const merged = {
          brandName: patch.brandName === undefined ? existing?.brandName ?? null : patch.brandName,
          tagline: patch.tagline === undefined ? existing?.tagline ?? null : patch.tagline,
          colors:
            patch.colors === undefined
              ? (existing?.colors as Record<string, string> | null) ?? null
              : (patch.colors as Record<string, string> | null),
          typography:
            patch.typography === undefined
              ? (existing?.typography as Record<string, string> | null) ?? null
              : (patch.typography as Record<string, string> | null),
          logoLightAssetId:
            patch.logoLightAssetId === undefined
              ? existing?.logoLightAssetId ?? null
              : patch.logoLightAssetId,
          logoDarkAssetId:
            patch.logoDarkAssetId === undefined
              ? existing?.logoDarkAssetId ?? null
              : patch.logoDarkAssetId,
          iconAssetId:
            patch.iconAssetId === undefined ? existing?.iconAssetId ?? null : patch.iconAssetId,
          voiceTone:
            patch.voiceTone === undefined ? existing?.voiceTone ?? null : patch.voiceTone,
          brandGuidelines:
            patch.brandGuidelines === undefined
              ? existing?.brandGuidelines ?? null
              : patch.brandGuidelines,
        };

        if (existing) {
          await tx
            .update(companyBrands)
            .set({ ...merged, updatedAt: now })
            .where(eq(companyBrands.companyId, companyId));
        } else {
          await tx.insert(companyBrands).values({
            companyId,
            ...merged,
          });
        }

        // Sync primary color to companies.brandColor so sidebar/favicon stay consistent.
        const primaryColor = merged.colors?.primary ?? null;
        if (patch.colors !== undefined) {
          await tx
            .update(companies)
            .set({ brandColor: primaryColor, updatedAt: now })
            .where(eq(companies.id, companyId));
        }

        // Sync logoLight to the legacy company_logos single-slot so the sidebar
        // header keeps rendering the light variant as the company logo.
        if (patch.logoLightAssetId !== undefined) {
          const assetId = merged.logoLightAssetId;
          if (assetId) {
            await tx
              .insert(companyLogos)
              .values({ companyId, assetId })
              .onConflictDoUpdate({
                target: companyLogos.companyId,
                set: { assetId, updatedAt: now },
              });
          } else {
            await tx.delete(companyLogos).where(eq(companyLogos.companyId, companyId));
          }
        }

        const [row, images] = await Promise.all([
          tx
            .select()
            .from(companyBrands)
            .where(eq(companyBrands.companyId, companyId))
            .then((rows) => rows[0] ?? null),
          tx
            .select()
            .from(companyBrandImages)
            .where(eq(companyBrandImages.companyId, companyId))
            .orderBy(asc(companyBrandImages.sortOrder), asc(companyBrandImages.createdAt))
            .then((rows) =>
              rows.map(
                (r): BrandImage => ({
                  id: r.id,
                  assetId: r.assetId,
                  url: ASSET_CONTENT_PATH(r.assetId),
                  caption: r.caption,
                  sortOrder: r.sortOrder,
                  createdAt: r.createdAt,
                }),
              ),
            ),
        ]);

        return enrich(row, companyId, images);
      });
    },

    async addImage(
      companyId: string,
      input: { assetId: string; caption?: string | null },
    ): Promise<BrandImage> {
      await assertCompanyExists(companyId);
      await assertAssetBelongsToCompany(companyId, input.assetId);

      // Use creation time as the tie-breaker within same sortOrder — new images
      // land at the end by default.
      const maxOrderRow = await db
        .select({ max: companyBrandImages.sortOrder })
        .from(companyBrandImages)
        .where(eq(companyBrandImages.companyId, companyId))
        .orderBy(asc(companyBrandImages.sortOrder));
      const maxOrder = maxOrderRow.reduce(
        (acc, row) => (row.max > acc ? row.max : acc),
        -1,
      );

      const [row] = await db
        .insert(companyBrandImages)
        .values({
          companyId,
          assetId: input.assetId,
          caption: input.caption ?? null,
          sortOrder: maxOrder + 1,
        })
        .returning();

      if (!row) throw notFound("Failed to add brand image");

      return {
        id: row.id,
        assetId: row.assetId,
        url: ASSET_CONTENT_PATH(row.assetId),
        caption: row.caption,
        sortOrder: row.sortOrder,
        createdAt: row.createdAt,
      };
    },

    async removeImage(companyId: string, imageId: string): Promise<void> {
      const existing = await db
        .select()
        .from(companyBrandImages)
        .where(
          and(
            eq(companyBrandImages.id, imageId),
            eq(companyBrandImages.companyId, companyId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (!existing) throw notFound("Brand image not found");

      await db.transaction(async (tx) => {
        await tx.delete(companyBrandImages).where(eq(companyBrandImages.id, imageId));
        // Clean up the underlying asset so storage doesn't leak.
        await tx.delete(assets).where(eq(assets.id, existing.assetId));
      });
    },
  };
}
