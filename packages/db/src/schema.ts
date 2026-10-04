import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { PriorityComponents, PriorityWeights } from "@jf/scoring";
import type { AgentFilters, GlobalSettings, Offer } from "./config";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const budgetTypeEnum = pgEnum("budget_type", ["fixed", "hourly", "unknown"]);
export const runStatusEnum = pgEnum("run_status", ["queued", "running", "succeeded", "failed"]);
export const runTriggerEnum = pgEnum("run_trigger", ["schedule", "manual", "cli"]);
export const matchOutcomeEnum = pgEnum("match_outcome", ["rejected", "below_threshold", "matched", "error"]);
export const matchStatusEnum = pgEnum("match_status", ["new", "saved", "applied", "won", "lost", "dismissed"]);
export const budgetConfidenceEnum = pgEnum("budget_confidence", ["high", "medium", "low"]);

export const MATCH_STATUSES = matchStatusEnum.enumValues;
export type MatchStatus = (typeof MATCH_STATUSES)[number];
export type MatchOutcome = (typeof matchOutcomeEnum.enumValues)[number];
export type RunStatus = (typeof runStatusEnum.enumValues)[number];

/** Singleton row (id = 1) holding global settings edited from the Settings page. */
export const appSettings = pgTable(
  "app_settings",
  {
    id: integer("id").primaryKey().default(1),
    data: jsonb("data").$type<GlobalSettings>().notNull(),
    updatedBy: text("updated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("app_settings_singleton", sql`${t.id} = 1`)],
).enableRLS();

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  scheduleIntervalMinutes: integer("schedule_interval_minutes").notNull().default(30),
  sources: text("sources").array().notNull().default(sql`ARRAY['upwork','hn']::text[]`),
  filters: jsonb("filters").$type<AgentFilters>().notNull(),
  offers: jsonb("offers").$type<Offer[]>().notNull(),
  weights: jsonb("weights").$type<PriorityWeights>().notNull(),
  /** A scored job is a match when fit_score >= this. */
  scoreThreshold: real("score_threshold").notNull().default(6),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    skills: text("skills").array().notNull().default(sql`ARRAY[]::text[]`),
    budgetType: budgetTypeEnum("budget_type").notNull().default("unknown"),
    budgetMin: doublePrecision("budget_min"),
    budgetMax: doublePrecision("budget_max"),
    paymentVerified: boolean("payment_verified"),
    clientTotalSpend: doublePrecision("client_total_spend"),
    clientHires: integer("client_hires"),
    clientRating: real("client_rating"),
    clientCountry: text("client_country"),
    proposalCount: integer("proposal_count"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    raw: jsonb("raw"),
  },
  (t) => [
    uniqueIndex("jobs_source_external_id_idx").on(t.source, t.externalId),
    index("jobs_posted_at_idx").on(t.postedAt),
  ],
).enableRLS();

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    status: runStatusEnum("status").notNull().default("queued"),
    trigger: runTriggerEnum("trigger").notNull().default("schedule"),
    requestedBy: text("requested_by"),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    fetched: integer("fetched").notNull().default(0),
    newJobs: integer("new_jobs").notNull().default(0),
    filtered: integer("filtered").notNull().default(0),
    scored: integer("scored").notNull().default(0),
    matched: integer("matched").notNull().default(0),
    errors: jsonb("errors").$type<RunError[]>().notNull().default([]),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    /** The agent + global settings this run actually used. */
    configSnapshot: jsonb("config_snapshot"),
  },
  (t) => [
    index("runs_agent_queued_idx").on(t.agentId, t.queuedAt.desc()),
    index("runs_status_idx").on(t.status, t.queuedAt),
    // At most one queued or running run per agent.
    uniqueIndex("runs_one_active_per_agent_idx")
      .on(t.agentId)
      .where(sql`${t.status} in ('queued', 'running')`),
  ],
).enableRLS();

export interface RunError {
  stage: string;
  source?: string;
  jobId?: string;
  message: string;
  at: string;
}

export const jobMatches = pgTable(
  "job_matches",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
    outcome: matchOutcomeEnum("outcome").notNull(),
    filterReasons: text("filter_reasons").array().notNull().default(sql`ARRAY[]::text[]`),
    unknownFields: text("unknown_fields").array().notNull().default(sql`ARRAY[]::text[]`),

    matchedOffer: text("matched_offer"),
    fitScore: real("fit_score"),
    reasoning: text("reasoning"),
    redFlags: text("red_flags").array().notNull().default(sql`ARRAY[]::text[]`),
    failureCase: text("failure_case"),
    opener: text("opener"),
    estHoursLow: real("est_hours_low"),
    estHoursHigh: real("est_hours_high"),
    complexity: integer("complexity"),
    estDurationDays: real("est_duration_days"),
    budgetConfidence: budgetConfidenceEnum("budget_confidence"),

    effectiveRate: doublePrecision("effective_rate"),
    totalPay: doublePrecision("total_pay"),
    priority: real("priority"),
    priorityComponents: jsonb("priority_components").$type<PriorityComponents>(),
    priorityComputedAt: timestamp("priority_computed_at", { withTimezone: true }),

    status: matchStatusEnum("status").notNull().default("new"),
    statusChangedBy: text("status_changed_by"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),

    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    scoredAt: timestamp("scored_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.agentId] }),
    index("job_matches_agent_outcome_priority_idx").on(t.agentId, t.outcome, t.priority.desc()),
    index("job_matches_status_idx").on(t.agentId, t.status),
  ],
).enableRLS();

export const matchStatusEvents = pgTable(
  "match_status_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull(),
    agentId: uuid("agent_id").notNull(),
    fromStatus: matchStatusEnum("from_status"),
    toStatus: matchStatusEnum("to_status").notNull(),
    changedBy: text("changed_by").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("match_status_events_match_idx").on(t.jobId, t.agentId, t.changedAt)],
).enableRLS();

/** Per-user UI state, e.g. when they last opened the jobs page. */
export const userState = pgTable("user_state", {
  email: text("email").primaryKey(),
  jobsLastSeenAt: timestamp("jobs_last_seen_at", { withTimezone: true }),
  jobsPrevSeenAt: timestamp("jobs_prev_seen_at", { withTimezone: true }),
  updatedAt: updatedAt(),
}).enableRLS();

export type Agent = typeof agents.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type JobMatch = typeof jobMatches.$inferSelect;
export type NewJobMatch = typeof jobMatches.$inferInsert;

/** OAuth tokens for source APIs (e.g. Upwork refresh tokens rotate, so they live here, not in env). */
export const integrationTokens = pgTable("integration_tokens", {
  provider: text("provider").primaryKey(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  updatedAt: updatedAt(),
}).enableRLS();
