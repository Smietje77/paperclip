CREATE TABLE "company_mcp_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"transport" text NOT NULL,
	"command" text,
	"args" jsonb,
	"url" text,
	"headers" jsonb,
	"env" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_mcp_servers" ADD CONSTRAINT "company_mcp_servers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_mcp_servers_company_idx" ON "company_mcp_servers" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_mcp_servers_company_name_uq" ON "company_mcp_servers" USING btree ("company_id","name");