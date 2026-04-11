import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{3,8}$/, "Must be a hex color like #ffffff")
  .optional()
  .nullable();

export const brandColorsSchema = z.object({
  primary: hexColor,
  secondary: hexColor,
  accent: hexColor,
  background: hexColor,
  text: hexColor,
});

export const brandTypographySchema = z.object({
  primary: z.string().max(120).optional().nullable(),
  secondary: z.string().max(120).optional().nullable(),
});

export const updateBrandSchema = z.object({
  brandName: z.string().max(200).optional().nullable(),
  tagline: z.string().max(300).optional().nullable(),
  colors: brandColorsSchema.optional().nullable(),
  typography: brandTypographySchema.optional().nullable(),
  logoLightAssetId: z.string().uuid().optional().nullable(),
  logoDarkAssetId: z.string().uuid().optional().nullable(),
  iconAssetId: z.string().uuid().optional().nullable(),
  voiceTone: z.string().max(2000).optional().nullable(),
  brandGuidelines: z.string().max(20000).optional().nullable(),
});

export type UpdateBrand = z.infer<typeof updateBrandSchema>;

export const addBrandImageSchema = z.object({
  assetId: z.string().uuid(),
  caption: z.string().max(300).optional().nullable(),
});

export type AddBrandImage = z.infer<typeof addBrandImageSchema>;
