ALTER TABLE "self_attempts" ADD COLUMN "layout" jsonb;--> statement-breakpoint
ALTER TABLE "self_attempts" ADD COLUMN "tab_switches" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "can_host" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");