CREATE TABLE "feedback_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"org_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"quiz_id" uuid,
	"form_id" uuid,
	"after_form_id" uuid,
	"flow" text NOT NULL,
	"identity" text NOT NULL,
	"feedback_required" boolean DEFAULT true NOT NULL,
	"allow_late_entry" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_form_id_feedback_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."feedback_forms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_after_form_id_feedback_forms_id_fk" FOREIGN KEY ("after_form_id") REFERENCES "public"."feedback_forms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_events_owner_updated_idx" ON "feedback_events" USING btree ("owner_id","updated_at");--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_event_id_feedback_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."feedback_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_sessions_event_idx" ON "game_sessions" USING btree ("event_id");