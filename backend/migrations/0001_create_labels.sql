CREATE TABLE "labels" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"name" varchar(255) NOT NULL,
	"nickname" varchar(255),
	"version" varchar(255) NOT NULL
);
