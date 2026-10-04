import { z } from "zod";
import { PriorityAnchorsSchema, PriorityWeightsSchema } from "@jf/scoring";

export const SOURCE_IDS = ["upwork", "hn"] as const;
export const SourceIdSchema = z.enum(SOURCE_IDS);
export type SourceId = z.infer<typeof SourceIdSchema>;

/** Hard filter thresholds. A missing field on a job never fails a check; it is marked unknown. */
export const AgentFiltersSchema = z.object({
  requirePaymentVerified: z.boolean().default(true),
  minClientSpend: z.number().min(0).default(10000),
  /** Clients with at least `minHires` hires must average `minSpendPerHire`. */
  hireSanity: z
    .object({
      minHires: z.number().int().min(1).default(5),
      minSpendPerHire: z.number().min(0).default(500),
    })
    .prefault({}),
  minFixedBudget: z.number().min(0).default(500),
  minHourlyRate: z.number().min(0).default(40),
  /** Jobs with this many proposals or more are dropped. */
  maxProposals: z.number().int().min(1).default(20),
  maxAgeHours: z.number().min(1).default(48),
  excludedKeywords: z
    .array(z.string().min(1))
    .default(["starter project", "unpaid", "test task", "equity only", "free trial"]),
});
export type AgentFilters = z.infer<typeof AgentFiltersSchema>;

export const OfferSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, "lowercase letters, digits and underscores"),
  title: z.string().min(1),
  description: z.string().min(1),
});
export type Offer = z.infer<typeof OfferSchema>;
export const OffersSchema = z.array(OfferSchema).min(1);

export const UPWORK_MODES = ["auto", "live", "fixture"] as const;

/**
 * Global settings, edited on the Settings page. The worker reads the latest saved
 * version at the start of every run (never cached), and snapshots it onto the run row.
 */
export const GlobalSettingsSchema = z.object({
  priority: PriorityAnchorsSchema.prefault({}),
  scoring: z
    .object({
      model: z.string().min(1).default("claude-haiku-4-5-20251001"),
      /** Who we are; prepended to every scoring prompt. */
      agencyProfile: z
        .string()
        .default(
          "We are a two-engineer freelance coding agency. Both engineers previously built self-driving software at GM, " +
            "so we are strong on production backend systems, data pipelines, integrations and applied AI. " +
            "We prefer well-scoped projects we can ship quickly for clients who value quality.",
        ),
      /** Extra free-text guidance appended to the scoring prompt. */
      extraInstructions: z.string().default(""),
      maxConcurrency: z.number().int().min(1).max(16).default(4),
      maxOutputTokens: z.number().int().min(256).max(8000).default(1500),
      maxJobsPerRun: z.number().int().min(1).max(1000).default(60),
      inputCostPerMTok: z.number().min(0).default(1),
      outputCostPerMTok: z.number().min(0).default(5),
    })
    .prefault({}),
  runs: z
    .object({
      allowManualRunWhenPaused: z.boolean().default(true),
      /** How often fresh matches get their priority recomputed (freshness decays). 0 disables. */
      freshnessRescoreMinutes: z.number().int().min(0).default(15),
      /** A running run with no heartbeat for this long is marked failed. */
      staleRunMinutes: z.number().int().min(2).default(10),
    })
    .prefault({}),
  sources: z
    .object({
      /** auto: live API when credentials exist, fixtures otherwise. */
      upworkMode: z.enum(UPWORK_MODES).default("auto"),
      upworkSearchQueries: z
        .array(z.string().min(1))
        .default([
          "AI chatbot",
          "workflow automation",
          "Zapier OR Make OR n8n",
          "Conversions API",
          "server side tracking",
          "OpenAI integration",
          "LLM",
        ]),
      hnEnabled: z.boolean().default(true),
    })
    .prefault({}),
});
export type GlobalSettings = z.infer<typeof GlobalSettingsSchema>;

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = GlobalSettingsSchema.parse({});

/** Parse stored settings leniently: unknown keys dropped, missing keys defaulted. */
export function parseGlobalSettings(data: unknown): GlobalSettings {
  const result = GlobalSettingsSchema.safeParse(data ?? {});
  return result.success ? result.data : DEFAULT_GLOBAL_SETTINGS;
}

export const DEFAULT_OFFERS: Offer[] = [
  {
    key: "ai_support_bot",
    title: "AI support bot",
    description:
      "A chatbot that answers customer or internal questions from the client's own docs (help center, PDFs, Notion, website). Retrieval over their content, citations, handoff to a human.",
  },
  {
    key: "workflow_automation",
    title: "Workflow automation",
    description:
      "Connecting CRM, email, forms, Google Sheets and Slack, with AI steps for sorting, enriching, summarizing and drafting. Zapier/Make/n8n or custom code.",
  },
  {
    key: "server_side_tracking",
    title: "Server side tracking",
    description:
      "Meta Conversions API (CAPI), TikTok Events API, Google Ads enhanced conversions, server side Google Tag Manager, deduplication and consent handling.",
  },
  {
    key: "ai_feature",
    title: "AI feature for an existing app",
    description:
      "Adding an LLM-powered feature to an existing web or mobile product: summarization, extraction, classification, semantic search, assistants, with evals and cost control.",
  },
];
