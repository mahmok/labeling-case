ALTER TABLE "labels" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;