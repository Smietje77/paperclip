import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Palette, Plus, Trash2, Upload, X } from "lucide-react";
import type { BrandColors, BrandTypography, CompanyBrand } from "@paperclipai/shared";
import { brandApi, type UpdateBrandPayload } from "../api/brand";
import { assetsApi } from "../api/assets";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const COLOR_SLOTS: Array<{ key: keyof BrandColors; label: string }> = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "text", label: "Text" },
];

interface FormState {
  brandName: string;
  tagline: string;
  colors: Record<keyof BrandColors, string>;
  typography: { primary: string; secondary: string };
  voiceTone: string;
  brandGuidelines: string;
}

function emptyForm(): FormState {
  return {
    brandName: "",
    tagline: "",
    colors: { primary: "", secondary: "", accent: "", background: "", text: "" },
    typography: { primary: "", secondary: "" },
    voiceTone: "",
    brandGuidelines: "",
  };
}

function brandToForm(brand: CompanyBrand | undefined): FormState {
  if (!brand) return emptyForm();
  return {
    brandName: brand.brandName ?? "",
    tagline: brand.tagline ?? "",
    colors: {
      primary: brand.colors?.primary ?? "",
      secondary: brand.colors?.secondary ?? "",
      accent: brand.colors?.accent ?? "",
      background: brand.colors?.background ?? "",
      text: brand.colors?.text ?? "",
    },
    typography: {
      primary: brand.typography?.primary ?? "",
      secondary: brand.typography?.secondary ?? "",
    },
    voiceTone: brand.voiceTone ?? "",
    brandGuidelines: brand.brandGuidelines ?? "",
  };
}

function trimOrNull(value: string): string | null {
  const t = value.trim();
  return t.length === 0 ? null : t;
}

function buildColorsPatch(form: FormState): BrandColors | null {
  const result: BrandColors = {};
  let any = false;
  for (const slot of COLOR_SLOTS) {
    const value = trimOrNull(form.colors[slot.key]);
    if (value) {
      result[slot.key] = value;
      any = true;
    } else {
      result[slot.key] = null;
    }
  }
  return any ? result : null;
}

function buildTypographyPatch(form: FormState): BrandTypography | null {
  const primary = trimOrNull(form.typography.primary);
  const secondary = trimOrNull(form.typography.secondary);
  if (!primary && !secondary) return null;
  return { primary, secondary };
}

interface LogoSlotProps {
  label: string;
  url: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onClear: () => void;
}

function LogoSlot({ label, url, uploading, onUpload, onClear }: LogoSlotProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    onUpload(file);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
          {url ? (
            <img src={url} alt={`${label} preview`} className="max-h-full max-w-full object-contain" />
          ) : (
            <Palette className="h-6 w-6 text-muted-foreground/60" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {uploading ? "Uploading..." : url ? "Replace" : "Upload"}
          </Button>
          {url ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={onClear}
              disabled={uploading}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CompanyBrand() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(emptyForm());
  const [galleryCaption, setGalleryCaption] = useState("");
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Brand" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  const brandQuery = useQuery({
    queryKey: queryKeys.brand.get(selectedCompanyId!),
    queryFn: () => brandApi.get(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    if (brandQuery.data) setForm(brandToForm(brandQuery.data));
  }, [brandQuery.data]);

  const brand = brandQuery.data;
  const initialForm = useMemo(() => brandToForm(brand), [brand]);
  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);

  const updateBrand = useMutation({
    mutationFn: (patch: UpdateBrandPayload) => brandApi.update(selectedCompanyId!, patch),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.brand.get(selectedCompanyId!), updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      pushToast({ title: "Brand saved", tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Failed to save brand",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const uploadLogo = useMutation({
    mutationFn: async ({ slot, file }: { slot: "logoLightAssetId" | "logoDarkAssetId" | "iconAssetId"; file: File }) => {
      const asset = await assetsApi.uploadImage(selectedCompanyId!, file, `brand/${slot}`);
      return brandApi.update(selectedCompanyId!, { [slot]: asset.assetId });
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.brand.get(selectedCompanyId!), updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      pushToast({ title: "Logo updated", tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Failed to upload logo",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const clearLogo = useMutation({
    mutationFn: (slot: "logoLightAssetId" | "logoDarkAssetId" | "iconAssetId") =>
      brandApi.update(selectedCompanyId!, { [slot]: null }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.brand.get(selectedCompanyId!), updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const uploadGalleryImage = useMutation({
    mutationFn: async ({ file, caption }: { file: File; caption: string | null }) => {
      const asset = await assetsApi.uploadImage(selectedCompanyId!, file, "brand/gallery");
      return brandApi.addImage(selectedCompanyId!, { assetId: asset.assetId, caption });
    },
    onSuccess: async () => {
      setGalleryCaption("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.brand.get(selectedCompanyId!) });
      pushToast({ title: "Image added to gallery", tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Failed to upload image",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const removeGalleryImage = useMutation({
    mutationFn: (imageId: string) => brandApi.removeImage(selectedCompanyId!, imageId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.brand.get(selectedCompanyId!) });
      pushToast({ title: "Image removed", tone: "success" });
    },
  });

  function handleSave() {
    updateBrand.mutate({
      brandName: trimOrNull(form.brandName),
      tagline: trimOrNull(form.tagline),
      colors: buildColorsPatch(form),
      typography: buildTypographyPatch(form),
      voiceTone: trimOrNull(form.voiceTone),
      brandGuidelines: trimOrNull(form.brandGuidelines),
    });
  }

  function handleGalleryFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    uploadGalleryImage.mutate({ file, caption: galleryCaption.trim() || null });
  }

  if (!selectedCompanyId) {
    return <EmptyState icon={Palette} message="Select a company to manage its brand." />;
  }

  if (brandQuery.isLoading) {
    return <PageSkeleton variant="detail" />;
  }

  if (brandQuery.error) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-destructive">
          {brandQuery.error instanceof Error ? brandQuery.error.message : "Failed to load brand"}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Brand</h1>
          <p className="text-sm text-muted-foreground">
            Visual identity, voice, and guidelines for this company. Agents automatically receive this
            as prompt context via <code className="rounded bg-muted px-1">PAPERCLIP_BRAND_JSON</code>.
          </p>
        </div>
        <Button onClick={handleSave} disabled={!isDirty || updateBrand.isPending}>
          {updateBrand.isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>

      {/* Identity */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Identity</h2>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="brand-name" className="text-xs font-medium text-muted-foreground">
              Brand name
            </label>
            <Input
              id="brand-name"
              placeholder={selectedCompany?.name ?? "Brand name"}
              value={form.brandName}
              onChange={(event) => setForm((cur) => ({ ...cur, brandName: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="brand-tagline" className="text-xs font-medium text-muted-foreground">
              Tagline
            </label>
            <Input
              id="brand-tagline"
              placeholder="Short one-liner that captures the brand"
              value={form.tagline}
              onChange={(event) => setForm((cur) => ({ ...cur, tagline: event.target.value }))}
            />
          </div>
        </div>
      </section>

      {/* Colors */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Color palette</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {COLOR_SLOTS.map((slot) => (
            <div key={slot.key} className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{slot.label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.colors[slot.key] || "#000000"}
                  onChange={(event) =>
                    setForm((cur) => ({
                      ...cur,
                      colors: { ...cur.colors, [slot.key]: event.target.value },
                    }))
                  }
                  className="h-9 w-14 cursor-pointer rounded-md border border-border bg-transparent"
                  aria-label={`${slot.label} color picker`}
                />
                <Input
                  placeholder="#000000"
                  value={form.colors[slot.key]}
                  onChange={(event) =>
                    setForm((cur) => ({
                      ...cur,
                      colors: { ...cur.colors, [slot.key]: event.target.value },
                    }))
                  }
                  className="font-mono"
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          The primary color also drives the sidebar accent and favicon.
        </p>
      </section>

      {/* Typography */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Typography</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Primary (headings)</label>
            <Input
              placeholder="e.g. Inter, Playfair Display"
              value={form.typography.primary}
              onChange={(event) =>
                setForm((cur) => ({
                  ...cur,
                  typography: { ...cur.typography, primary: event.target.value },
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Secondary (body)</label>
            <Input
              placeholder="e.g. Inter, system-ui"
              value={form.typography.secondary}
              onChange={(event) =>
                setForm((cur) => ({
                  ...cur,
                  typography: { ...cur.typography, secondary: event.target.value },
                }))
              }
            />
          </div>
        </div>
      </section>

      {/* Logos */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Logos</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          <LogoSlot
            label="Light variant"
            url={brand?.logoLightUrl ?? null}
            uploading={uploadLogo.isPending}
            onUpload={(file) => uploadLogo.mutate({ slot: "logoLightAssetId", file })}
            onClear={() => clearLogo.mutate("logoLightAssetId")}
          />
          <LogoSlot
            label="Dark variant"
            url={brand?.logoDarkUrl ?? null}
            uploading={uploadLogo.isPending}
            onUpload={(file) => uploadLogo.mutate({ slot: "logoDarkAssetId", file })}
            onClear={() => clearLogo.mutate("logoDarkAssetId")}
          />
          <LogoSlot
            label="Icon / favicon"
            url={brand?.iconUrl ?? null}
            uploading={uploadLogo.isPending}
            onUpload={(file) => uploadLogo.mutate({ slot: "iconAssetId", file })}
            onClear={() => clearLogo.mutate("iconAssetId")}
          />
        </div>
      </section>

      {/* Gallery */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Brand images</h2>
        <p className="text-xs text-muted-foreground">
          Hero shots, social assets, and other supporting imagery that agents can reference.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Caption (optional)</label>
            <Input
              placeholder="What's this image for?"
              value={galleryCaption}
              onChange={(event) => setGalleryCaption(event.target.value)}
            />
          </div>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleGalleryFileChange}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => galleryInputRef.current?.click()}
            disabled={uploadGalleryImage.isPending}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {uploadGalleryImage.isPending ? "Uploading..." : "Add image"}
          </Button>
        </div>
        {brand?.images && brand.images.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {brand.images.map((image) => (
              <div
                key={image.id}
                className="group relative overflow-hidden rounded-md border border-border bg-muted/20"
              >
                <img
                  src={image.url}
                  alt={image.caption ?? "Brand image"}
                  className="h-32 w-full object-cover"
                />
                {image.caption ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">{image.caption}</div>
                ) : null}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="destructive"
                  onClick={() => removeGalleryImage.mutate(image.id)}
                  className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Remove image"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No brand images yet.</p>
        )}
      </section>

      {/* Voice & guidelines */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Voice & guidelines
        </h2>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Voice & tone</label>
            <Textarea
              placeholder="e.g. Professional, direct, and confident. Use active voice. Avoid jargon."
              value={form.voiceTone}
              onChange={(event) => setForm((cur) => ({ ...cur, voiceTone: event.target.value }))}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Brand guidelines (markdown)
            </label>
            <Textarea
              placeholder="Do's and don'ts, audience, positioning, key messages..."
              value={form.brandGuidelines}
              onChange={(event) => setForm((cur) => ({ ...cur, brandGuidelines: event.target.value }))}
              rows={10}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Content-generating agents can reference this directly for context-aware writing.
            </p>
          </div>
        </div>
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={handleSave} disabled={!isDirty || updateBrand.isPending}>
          {updateBrand.isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
