import type { NormalizedJob } from "../types";

export interface HnHit {
  objectID: string;
  created_at?: string;
  created_at_i?: number;
  author?: string;
  comment_text?: string | null;
  parent_id?: number | null;
  story_id?: number | null;
  story_title?: string | null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** HN comment HTML -> plain text with paragraph breaks. */
export function htmlToText(html: string): string {
  return html
    .replace(/<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a [^>]*href="([^"]*)"[^>]*>[^<]*<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Top-level posts in "Freelancer? Seeking freelancer?" threads start with SEEKING FREELANCER or SEEKING WORK. */
export function isSeekingFreelancer(text: string): boolean {
  return /^\W*seeking\s+freelancers?\b/i.test(text);
}

const num = (s: string) => {
  const m = s.replace(/[,\s]/g, "").match(/^(\d+(?:\.\d+)?)(k)?$/i);
  if (!m) return null;
  return Number(m[1]) * (m[2] ? 1000 : 1);
};

/**
 * Best-effort budget extraction from free text. Recognizes "$80/hr", "$60-90 per hour",
 * "budget: $5,000", "$3k-$5k". Anything else is unknown.
 */
export function parseBudget(text: string): Pick<NormalizedJob, "budgetType" | "budgetMin" | "budgetMax"> {
  const money = String.raw`\$\s?(\d[\d,]*(?:\.\d+)?\s?k?)`;
  const range = new RegExp(`${money}(?:\\s?(?:-|–|to)\\s?\\$?\\s?(\\d[\\d,]*(?:\\.\\d+)?\\s?k?))?`, "i");
  const hourly = new RegExp(`${range.source}\\s*(?:/\\s*(?:hr|hour|h)\\b|per\\s+hour|an\\s+hour|hourly)`, "i");

  const h = text.match(hourly);
  if (h) {
    const a = num(h[1]!);
    const b = h[2] ? num(h[2]) : null;
    if (a != null && a < 1000) return { budgetType: "hourly", budgetMin: a, budgetMax: b ?? a };
  }
  const fixed = new RegExp(`(?:budget|fixed|pay(?:ing)?|project)[^$\\n]{0,30}${range.source}`, "i");
  const f = text.match(fixed) ?? text.match(new RegExp(range.source, "i"));
  if (f) {
    const a = num(f[1]!);
    const b = f[2] ? num(f[2]) : null;
    if (a != null && a >= 100) return { budgetType: "fixed", budgetMin: a, budgetMax: b ?? a };
  }
  return { budgetType: "unknown", budgetMin: null, budgetMax: null };
}

function titleFrom(text: string): string {
  const firstLine = text.split("\n").find((l) => l.trim()) ?? text;
  const cleaned = firstLine.replace(/^\W*seeking\s+freelancers?\W*/i, "").trim();
  const base = cleaned || firstLine;
  return base.length > 140 ? `${base.slice(0, 137)}...` : base;
}

export function normalizeHnHit(hit: HnHit): NormalizedJob | null {
  if (!hit.comment_text) return null;
  const text = htmlToText(hit.comment_text);
  if (!isSeekingFreelancer(text)) return null;
  const postedAt = hit.created_at_i ? new Date(hit.created_at_i * 1000) : hit.created_at ? new Date(hit.created_at) : null;
  return {
    externalId: hit.objectID,
    source: "hn",
    url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    title: titleFrom(text),
    description: text,
    ...parseBudget(text),
    // HN provides no marketplace signals: these stay unknown and are passed to scoring as such.
    paymentVerified: null,
    clientTotalSpend: null,
    clientHires: null,
    clientRating: null,
    clientCountry: null,
    proposalCount: null,
    postedAt,
    skills: [],
    raw: hit,
  };
}
