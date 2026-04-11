import type {
  BrandColors,
  BrandImage,
  BrandTypography,
  CompanyBrand,
} from "@paperclipai/shared";
import { api } from "./client";

export interface UpdateBrandPayload {
  brandName?: string | null;
  tagline?: string | null;
  colors?: BrandColors | null;
  typography?: BrandTypography | null;
  logoLightAssetId?: string | null;
  logoDarkAssetId?: string | null;
  iconAssetId?: string | null;
  voiceTone?: string | null;
  brandGuidelines?: string | null;
}

export const brandApi = {
  get: (companyId: string) => api.get<CompanyBrand>(`/companies/${companyId}/brand`),
  update: (companyId: string, data: UpdateBrandPayload) =>
    api.put<CompanyBrand>(`/companies/${companyId}/brand`, data),
  addImage: (companyId: string, data: { assetId: string; caption?: string | null }) =>
    api.post<BrandImage>(`/companies/${companyId}/brand/images`, data),
  removeImage: (companyId: string, imageId: string) =>
    api.delete<{ ok: true }>(`/companies/${companyId}/brand/images/${imageId}`),
};
