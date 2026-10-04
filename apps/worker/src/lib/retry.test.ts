import { describe, expect, it, vi } from "vitest";
import { HttpError, isRetryable, mapLimit, withRetry } from "./retry";

const noSleep = () => Promise.resolve();

describe("withRetry", () => {
  it("retries retryable errors then succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new HttpError(503, "down")).mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValue("ok");
    expect(await withRetry(fn, { sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry client errors", async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(401, "nope"));
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry budget", async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(429, "slow down"));
    await expect(withRetry(fn, { sleep: noSleep, retries: 2 })).rejects.toThrow("slow down");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("classifies errors", () => {
    expect(isRetryable(new HttpError(500, ""))).toBe(true);
    expect(isRetryable(new HttpError(404, ""))).toBe(false);
    expect(isRetryable(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryable(new Error("bad input"))).toBe(false);
  });
});

describe("mapLimit", () => {
  it("keeps order and bounds concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 3, 2, 4], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 30, 20, 40]);
    expect(peak).toBe(2);
  });
});
