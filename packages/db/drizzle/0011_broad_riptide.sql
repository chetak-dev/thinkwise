CREATE TABLE "self_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"nickname" text NOT NULL,
	"avatar" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "self_attempts_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "opens_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "closes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "time_limit_ms" integer;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "quiz" jsonb;--> statement-breakpoint
ALTER TABLE "self_attempts" ADD CONSTRAINT "self_attempts_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "self_attempts_session_idx" ON "self_attempts" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "self_attempts_nickname_idx" ON "self_attempts" USING btree ("session_id",lower("nickname"));--> statement-breakpoint
CREATE INDEX "game_sessions_pin_idx" ON "game_sessions" USING btree ("pin");