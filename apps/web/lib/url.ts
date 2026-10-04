export type Params = Record<string, string | string[] | undefined>;

/** Build a query string from current params with overrides; undefined/"" removes a key. */
export function withParams(current: Params, patch: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val != null && val !== "") sp.set(k, val);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") sp.delete(k);
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "?";
}
