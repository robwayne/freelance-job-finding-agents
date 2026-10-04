import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { userState } from "../schema";

/** A visit ends after this long without loading the jobs page. */
const VISIT_GAP_MS = 30 * 60_000;

/**
 * Record a jobs page view and return the cutoff for "new since last visit".
 * Within one visit (page loads less than 30 min apart) the cutoff stays put, so filtering
 * and sorting don't clear the indicator.
 */
export async function touchJobsVisit(db: Database, email: string, now = new Date()): Promise<Date | null> {
  const [row] = await db.select().from(userState).where(eq(userState.email, email));
  if (!row) {
    await db.insert(userState).values({ email, jobsLastSeenAt: now, jobsPrevSeenAt: null }).onConflictDoNothing();
    return null;
  }
  const last = row.jobsLastSeenAt;
  const newVisit = !last || now.getTime() - last.getTime() > VISIT_GAP_MS;
  const prev = newVisit ? last : row.jobsPrevSeenAt;
  await db.update(userState).set({ jobsLastSeenAt: now, jobsPrevSeenAt: prev }).where(eq(userState.email, email));
  return prev;
}
