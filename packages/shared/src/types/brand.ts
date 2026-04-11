/**
 * Company brand profile — visual identity plus narrative context (voice/
 * tone, guidelines) that can be injected into agent runtime env as prompt
 * context via `PAPERCLIP_BRAND_JSON`.
 */

export interface BrandColors {
  primary?: string | null;
  secondary?: string | null;
  accent?: string | null;
  background?: string | null;
  text?: string | null;
}

export interface BrandTypography {
  primary?: string | null;
  secondary?: string | null;
}

export interface BrandImage {
  id: string;
  assetId: string;
  url: string;
  caption: string | null;
  sortOrder: number;
  createdAt: Date;
}

export interface CompanyBrand {
  companyId: string;
  brandName: string | null;
  tagline: string | null;
  colors: BrandColors | null;
  typography: BrandTypography | null;
  logoLightAssetId: string | null;
  logoLightUrl: string | null;
  logoDarkAssetId: string | null;
  logoDarkUrl: string | null;
  iconAssetId: string | null;
  iconUrl: string | null;
  voiceTone: string | null;
  brandGuidelines: string | null;
  images: BrandImage[];
  createdAt: Date;
  updatedAt: Date;
}
