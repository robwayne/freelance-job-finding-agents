CREATE TABLE "integration_tokens" (
	"provider" text PRIMARY KEY NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_tokens" ENABLE ROW LEVEL SECURITY;