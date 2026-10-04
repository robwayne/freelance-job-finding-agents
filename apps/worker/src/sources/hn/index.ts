import { fetchJson } from "../../lib/retry";
import { normalizeAll, type Source } from "../types";
import { normalizeHnHit, type HnHit } from "./normalize";

const ALGOLIA = "https://hn.algolia.com/api/v1";

interface AlgoliaResponse<T> {
  hits: T[];
  nbPages?: number;
}

interface StoryHit {
  objectID: string;
  title: string;
  created_at_i: number;
}

/** Hacker News "Ask HN: Freelancer? Seeking freelancer?" monthly threads via Algolia (no auth). */
export function createHnSource(): Source {
  return {
    id: "hn",
    async fetchJobs(since, ctx) {
      const retry = { onRetry: (err: unknown, attempt: number) => ctx.logger.warn({ attempt, err: String(err) }, "retrying HN request") };
      const stories = await fetchJson<AlgoliaResponse<StoryHit>>(
        `${ALGOLIA}/search_by_date?tags=story,author_whoishiring&query=${encodeURIComponent("Freelancer? Seeking freelancer?")}&hitsPerPage=5`,
        {},
        retry,
      );
      // Threads are monthly; check the latest two so the first days of a month still see last month's posts.
      const threads = stories.hits
        .filter((s) => /freelancer\?/i.test(s.title))
        .sort((a, b) => b.created_at_i - a.created_at_i)
        .slice(0, 2);

      const sinceSec = Math.floor(since.getTime() / 1000);
      const hits: HnHit[] = [];
      for (const thread of threads) {
        for (let page = 0; page < 10; page++) {
          const res = await fetchJson<AlgoliaResponse<HnHit>>(
            `${ALGOLIA}/search_by_date?tags=comment,story_${thread.objectID}&numericFilters=created_at_i>=${sinceSec}&hitsPerPage=500&page=${page}`,
            {},
            retry,
          );
          // Only top-level comments are posts; replies are discussion.
          hits.push(...res.hits.filter((h) => String(h.parent_id) === thread.objectID));
          if (page + 1 >= (res.nbPages ?? 1)) break;
        }
      }
      const { jobs, skipped } = normalizeAll(hits, normalizeHnHit, ctx.logger);
      return { jobs: jobs.filter((j) => !j.postedAt || j.postedAt >= since), skipped, mode: `${threads.length} thread(s)` };
    },
  };
}
