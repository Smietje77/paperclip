CREATE TABLE "company_brand_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"brand_name" text,
	"tagline" text,
	"colors" jsonb,
	"typography" jsonb,
	"logo_light_asset_id" uuid,
	"logo_dark_asset_id" uuid,
	"icon_asset_id" uuid,
	"voice_tone" text,
	"brand_guidelines" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_brand_images" ADD CONSTRAINT "company_brand_images_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_brand_images" ADD CONSTRAINT "company_brand_images_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_brands" ADD CONSTRAINT "company_brands_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_brands" ADD CONSTRAINT "company_brands_logo_light_asset_id_assets_id_fk" FOREIGN KEY ("logo_light_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_brands" ADD CONSTRAINT "company_brands_logo_dark_asset_id_assets_id_fk" FOREIGN KEY ("logo_dark_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_brands" ADD CONSTRAINT "company_brands_icon_asset_id_assets_id_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_brand_images_company_idx" ON "company_brand_images" USING btree ("company_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "company_brands_company_uq" ON "company_brands" USING btree ("company_id");