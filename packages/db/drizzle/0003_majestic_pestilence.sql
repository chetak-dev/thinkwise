ALTER TABLE "quizzes" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "published" jsonb;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "published_at" timestamp with time zone;