CREATE TABLE "company_adapter_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"adapter_type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"default_model" text,
	"default_adapter_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_test_status" text,
	"last_test_error" text,
	"last_tested_at" timestamp with time zone,
	"configured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_adapter_settings" ADD CONSTRAINT "company_adapter_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_adapter_settings_company_idx" ON "company_adapter_settings" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_adapter_settings_company_type_uq" ON "company_adapter_settings" USING btree ("company_id","adapter_type");