CREATE TABLE "jobs" (
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"error" text,
	"id" uuid PRIMARY KEY NOT NULL,
	"result" jsonb,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"type" varchar(255) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "jobs_status_created_at_idx" ON "jobs" USING btree ("status","created_at");