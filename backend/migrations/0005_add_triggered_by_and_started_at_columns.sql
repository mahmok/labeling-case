ALTER TABLE "jobs" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "triggered_by" varchar(255) DEFAULT 'system' NOT NULL;