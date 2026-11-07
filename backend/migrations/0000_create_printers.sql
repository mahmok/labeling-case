CREATE TABLE "printers" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"location" varchar(255) NOT NULL,
	"model" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"nickname" varchar(255),
	"serial_number" varchar(255) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
