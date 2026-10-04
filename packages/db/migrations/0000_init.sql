CREATE TYPE "public"."budget_confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."budget_type" AS ENUM('fixed', 'hourly', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."match_outcome" AS ENUM('rejected', 'below_threshold', 'matched', 'error');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('new', 'saved', 'applied', 'won', 'lost', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('schedule', 'manual', 'cli');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"schedule_interval_minutes" integer DEFAULT 30 NOT NULL,
	"sources" text[] DEFAULT ARRAY['upwork','hn']::text[] NOT NULL,
	"filters" jsonb NOT NULL,
	"offers" jsonb NOT NULL,
	"weights" jsonb NOT NULL,
	"score_threshold" real DEFAULT 6 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_singleton" CHECK ("app_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "job_matches" (
	"job_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"run_id" uuid,
	"outcome" "match_outcome" NOT NULL,
	"filter_reasons" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"unknown_fields" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"matched_offer" text,
	"fit_score" real,
	"reasoning" text,
	"red_flags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"failure_case" text,
	"opener" text,
	"est_hours_low" real,
	"est_hours_high" real,
	"complexity" integer,
	"est_duration_days" real,
	"budget_confidence" "budget_confidence",
	"effective_rate" double precision,
	"total_pay" double precision,
	"priority" real,
	"priority_components" jsonb,
	"priority_computed_at" timestamp with time zone,
	"status" "match_status" DEFAULT 'new' NOT NULL,
	"status_changed_by" text,
	"status_changed_at" timestamp with time zone,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"scored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_matches_job_id_agent_id_pk" PRIMARY KEY("job_id","agent_id")
);
--> statement-breakpoint
ALTER TABLE "job_matches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"skills" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"budget_type" "budget_type" DEFAULT 'unknown' NOT NULL,
	"budget_min" double precision,
	"budget_max" double precision,
	"payment_verified" boolean,
	"client_total_spend" double precision,
	"client_hires" integer,
	"client_rating" real,
	"client_country" text,
	"proposal_count" integer,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "match_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"from_status" "match_status",
	"to_status" "match_status" NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_status_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"trigger" "run_trigger" DEFAULT 'schedule' NOT NULL,
	"requested_by" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"fetched" integer DEFAULT 0 NOT NULL,
	"new_jobs" integer DEFAULT 0 NOT NULL,
	"filtered" integer DEFAULT 0 NOT NULL,
	"scored" integer DEFAULT 0 NOT NULL,
	"matched" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"config_snapshot" jsonb
);
--> statement-breakpoint
ALTER TABLE "runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_state" (
	"email" text PRIMARY KEY NOT NULL,
	"jobs_last_seen_at" timestamp with time zone,
	"jobs_prev_seen_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_matches_agent_outcome_priority_idx" ON "job_matches" USING btree ("agent_id","outcome","priority" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_matches_status_idx" ON "job_matches" USING btree ("agent_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_source_external_id_idx" ON "jobs" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "jobs_posted_at_idx" ON "jobs" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "match_status_events_match_idx" ON "match_status_events" USING btree ("job_id","agent_id","changed_at");--> statement-breakpoint
CREATE INDEX "runs_agent_queued_idx" ON "runs" USING btree ("agent_id","queued_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("status","queued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_one_active_per_agent_idx" ON "runs" USING btree ("agent_id") WHERE "runs"."status" in ('queued', 'running');