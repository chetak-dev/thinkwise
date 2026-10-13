CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"host_id" uuid NOT NULL,
	"org_id" uuid,
	"quiz_id" uuid,
	"title" text NOT NULL,
	"pin" text NOT NULL,
	"mode" text DEFAULT 'live' NOT NULL,
	"status" text DEFAULT 'live' NOT NULL,
	"question_count" integer DEFAULT 0 NOT NULL,
	"questions_asked" integer DEFAULT 0 NOT NULL,
	"player_count" integer DEFAULT 0 NOT NULL,
	"questions" jsonb,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"avatar" text NOT NULL,
	"score" integer NOT NULL,
	"rank" integer NOT NULL,
	"correct_count" integer NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_players" ADD CONSTRAINT "session_players_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_sessions_host_created_idx" ON "game_sessions" USING btree ("host_id","created_at");--> statement-breakpoint
CREATE INDEX "game_sessions_quiz_idx" ON "game_sessions" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "session_players_session_idx" ON "session_players" USING btree ("session_id");