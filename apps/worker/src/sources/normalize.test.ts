import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { htmlToText, isSeekingFreelancer, normalizeHnHit, parseBudget, type HnHit } from "./hn/normalize";
import { normalizeUpworkJob } from "./upwork/normalize";
import type { UpworkJobNode } from "./upwork/query";
import { NormalizedJobSchema } from "./types";

const fixture = (p: string) => JSON.parse(readFileSync(new URL(`../../../../fixtures/${p}`, import.meta.url), "utf8"));
const upworkNodes: UpworkJobNode[] = fixture("upwork/search-sample.json").data.marketplaceJobPostingsSearch.edges.map(
  (e: { node: UpworkJobNode }) => e.node,
);
const hnHits: HnHit[] = fixture("hn/comments-sample.json").hits;

describe("normalizeUpworkJob", () => {
  it("normalizes every fixture into a valid job", () => {
    for (const node of upworkNodes) expect(() => NormalizedJobSchema.parse(normalizeUpworkJob(node))).not.toThrow();
  });

  it("maps a fixed price job with client stats", () => {
    const j = normalizeUpworkJob(upworkNodes[0]!);
    expect(j).toMatchObject({
      source: "upwork",
      externalId: upworkNodes[0]!.id,
      url: `https://www.upwork.com/jobs/${upworkNodes[0]!.ciphertext}`,
      budgetType: "fixed",
      budgetMin: 6000,
      budgetMax: 6000,
      paymentVerified: true,
      clientTotalSpend: 85000,
      clientHires: 22,
      proposalCount: 4,
      clientCountry: "United States",
      skills: ["OpenAI API", "LangChain", "Python"],
    });
    expect(j.postedAt?.toISOString()).toBe("2026-10-01T09:00:00.000Z");
  });

  it("maps hourly ranges and unverified clients", () => {
    expect(normalizeUpworkJob(upworkNodes[1]!)).toMatchObject({ budgetType: "hourly", budgetMin: 60, budgetMax: 95 });
    expect(normalizeUpworkJob(upworkNodes[5]!).paymentVerified).toBe(false);
  });

  it("keeps missing client fields as null (unknown)", () => {
    const j = normalizeUpworkJob(upworkNodes[9]!);
    expect(j.clientTotalSpend).toBeNull();
    expect(j.clientHires).toBeNull();
    const bare = normalizeUpworkJob({ id: "x", title: "T" });
    expect(bare).toMatchObject({ budgetType: "unknown", paymentVerified: null, proposalCount: null, postedAt: null });
  });

  it("throws on a job without an id or title", () => {
    expect(() => normalizeUpworkJob({ id: "" } as UpworkJobNode)).toThrow();
  });
});

describe("HN normalizer", () => {
  it("decodes HTML", () => {
    expect(htmlToText("We&#x27;re <i>hiring</i><p>Email <a href=\"mailto:a@b.co\">a@b.co</a> &amp; more")).toBe(
      "We're hiring\n\nEmail mailto:a@b.co & more",
    );
  });

  it("only keeps SEEKING FREELANCER posts", () => {
    expect(isSeekingFreelancer("SEEKING FREELANCER | Remote")).toBe(true);
    expect(isSeekingFreelancer("Seeking freelancers - remote")).toBe(true);
    expect(isSeekingFreelancer("SEEKING WORK | Remote")).toBe(false);
    const jobs = hnHits.map(normalizeHnHit).filter(Boolean);
    expect(jobs.map((j) => j!.externalId)).toEqual(["45000001", "45000002", "45000005", "45000006"]);
  });

  it("extracts budgets from free text", () => {
    expect(parseBudget("Budget: $8,000 fixed")).toEqual({ budgetType: "fixed", budgetMin: 8000, budgetMax: 8000 });
    expect(parseBudget("$90-120/hr, ~40 hours")).toEqual({ budgetType: "hourly", budgetMin: 90, budgetMax: 120 });
    expect(parseBudget("Paying $40 per hour")).toEqual({ budgetType: "hourly", budgetMin: 40, budgetMax: 40 });
    expect(parseBudget("a $15k project")).toEqual({ budgetType: "fixed", budgetMin: 15000, budgetMax: 15000 });
    expect(parseBudget("$3k - $5k")).toEqual({ budgetType: "fixed", budgetMin: 3000, budgetMax: 5000 });
    expect(parseBudget("competitive pay")).toEqual({ budgetType: "unknown", budgetMin: null, budgetMax: null });
  });

  it("marks marketplace fields unknown and builds title and url", () => {
    const j = normalizeHnHit(hnHits[0]!)!;
    expect(j).toMatchObject({
      source: "hn",
      url: "https://news.ycombinator.com/item?id=45000001",
      title: "Remote | AI support bot",
      paymentVerified: null,
      clientTotalSpend: null,
      proposalCount: null,
      budgetType: "fixed",
      budgetMax: 8000,
    });
    expect(j.postedAt?.toISOString()).toBe("2026-10-01T07:00:00.000Z");
  });
});
