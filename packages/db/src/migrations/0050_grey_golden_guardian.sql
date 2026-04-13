ALTER TABLE "company_mcp_servers" ADD COLUMN "health_status" text DEFAULT 'untested' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_mcp_servers" ADD COLUMN "last_health_check_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_mcp_servers" ADD COLUMN "last_health_error" text;