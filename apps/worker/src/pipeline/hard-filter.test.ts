import { AgentFiltersSchema } from "@jf/db";
import { describe, expect, it } from "vitest";
import type { NormalizedJob } from "../sources/types";
import { hardFilter, matchesKeyword } from "./hard-filter";

const NOW = new Date("2026-10-01T12:00:00Z");
const filters = AgentFiltersSchema.parse({});

const good: NormalizedJob = {
  externalId: "1",
  source: "upwork",
  url: "https://example.com/1",
  title: "Build a support chatbot",
  description: "RAG over our docs",
  budgetType: "fixed",
  budgetMin: 3000,
  budgetMax: 3000,
  paymentVerified: true,
  clientTotalSpend: 50_000,
  clientHires: 10,
  clientRating: 4.9,
  clientCountry: "US",
  proposalCount: 5,
  postedAt: new Date(NOW.getTime() - 3 * 3_600_000),
  skills: [],
  raw: {},
};

const check = (patch: Partial<NormalizedJob>, f = filters) => hardFilter({ ...good, ...patch }, f, NOW);

describe("hardFilter", () => {
  it("passes a job meeting every criterion with nothing unknown", () => {
    expect(check({})).toEqual({ pass: true, reasons: [], unknownFields: [] });
  });

  it("rejects unverified payment, but only when required", () => {
    expect(check({ paymentVerified: false }).reasons).toEqual(["Payment not verified"]);
    expect(check({ paymentVerified: false }, { ...filters, requirePaymentVerified: false }).pass).toBe(true);
  });

  it("rejects low client spend at the boundary", () => {
    expect(check({ clientTotalSpend: 9_999 }).pass).toBe(false);
    expect(check({ clientTotalSpend: 10_000 }).pass).toBe(true);
  });

  it("rejects clients with many hires and low spend per hire", () => {
    const r = check({ clientTotalSpend: 12_000, clientHires: 60 });
    expect(r.pass).toBe(false);
    expect(r.reasons[0]).toMatch(/per hire over 60 hires/);
    // Few hires: the per-hire check doesn't apply.
    expect(check({ clientTotalSpend: 10_000, clientHires: 4 }).pass).toBe(true);
    expect(check({ clientTotalSpend: 10_000, clientHires: 20 }).pass).toBe(true); // $500/hire
  });

  it("applies fixed and hourly budget minimums", () => {
    expect(check({ budgetMin: 499, budgetMax: 499 }).pass).toBe(false);
    expect(check({ budgetMin: 500, budgetMax: 500 }).pass).toBe(true);
    expect(check({ budgetType: "hourly", budgetMin: 25, budgetMax: 39 }).pass).toBe(false);
    // Hourly range qualifies if its top reaches the minimum.
    expect(check({ budgetType: "hourly", budgetMin: 30, budgetMax: 40 }).pass).toBe(true);
  });

  it("requires fewer than maxProposals", () => {
    expect(check({ proposalCount: 19 }).pass).toBe(true);
    expect(check({ proposalCount: 20 }).reasons).toEqual(["20 proposals (max 19)"]);
  });

  it("rejects jobs older than maxAgeHours", () => {
    expect(check({ postedAt: new Date(NOW.getTime() - 47 * 3_600_000) }).pass).toBe(true);
    expect(check({ postedAt: new Date(NOW.getTime() - 49 * 3_600_000) }).reasons[0]).toMatch(/Posted 49h ago/);
  });

  it("rejects excluded keywords case-insensitively, as whole words", () => {
    expect(check({ title: "STARTER PROJECT: chatbot" }).reasons).toEqual(["Excluded keyword: starter project"]);
    expect(check({ description: "this is a starter-project first" }).pass).toBe(false);
    expect(check({ description: "our starter projects page" }).pass).toBe(true);
    expect(matchesKeyword("Unpaid trial", "unpaid")).toBe(true);
    expect(matchesKeyword("unpaidinvoices", "unpaid")).toBe(false);
  });

  it("marks missing fields unknown instead of rejecting", () => {
    const r = check({
      paymentVerified: null,
      clientTotalSpend: null,
      clientHires: null,
      budgetType: "unknown",
      budgetMin: null,
      budgetMax: null,
      proposalCount: null,
      postedAt: null,
    });
    expect(r.pass).toBe(true);
    expect(r.unknownFields).toEqual([
      "payment_verified",
      "client_total_spend",
      "client_hires",
      "budget",
      "proposal_count",
      "posted_at",
    ]);
  });

  it("collects every failing reason", () => {
    const r = check({ paymentVerified: false, proposalCount: 50, budgetMin: 100, budgetMax: 100 });
    expect(r.reasons).toHaveLength(3);
  });
});
