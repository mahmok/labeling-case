CREATE TABLE "prints" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"label_id" varchar(255) NOT NULL,
	"printer_id" uuid,
	"printer_name" varchar(255) NOT NULL,
	"triggered_by" varchar(255) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "prints_printer_name_idx" ON "prints" USING btree ("printer_name");