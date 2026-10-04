/** Comma or whitespace separated list of emails allowed to sign in. Shared by proxy and server code. */
export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[\s,]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowed(email: string | null | undefined, raw = process.env.ALLOWED_EMAILS): boolean {
  return !!email && parseAllowlist(raw).has(email.toLowerCase());
}
