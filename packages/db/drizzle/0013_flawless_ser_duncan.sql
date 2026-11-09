CREATE TABLE "live_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"language" text DEFAULT '' NOT NULL,
	"nickname" text NOT NULL,
	"avatar" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "self_attempts" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "self_attempts" ADD COLUMN "language" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_players" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "session_players" ADD COLUMN "language" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "live_attempts" ADD CONSTRAINT "live_attempts_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_attempts" ADD CONSTRAINT "live_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "live_attempts_user_idx" ON "live_attempts" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_attempts_nickname_idx" ON "live_attempts" USING btree ("session_id",lower("nickname"));--> statement-breakpoint
CREATE INDEX "live_attempts_history_idx" ON "live_attempts" USING btree ("user_id","started_at");--> statement-breakpoint
ALTER TABLE "self_attempts" ADD CONSTRAINT "self_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_players" ADD CONSTRAINT "session_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "self_attempts_user_idx" ON "self_attempts" USING btree ("session_id","user_id");