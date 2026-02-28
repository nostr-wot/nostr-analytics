export type ErrorCategory =
  | "timeout"
  | "refused"
  | "rate_limit"
  | "auth_required"
  | "protocol"
  | "unknown";

const MATCHERS: [ErrorCategory, RegExp][] = [
  ["timeout", /timeout/i],
  ["refused", /econnrefused|enotfound|dns|getaddrinfo/i],
  ["rate_limit", /429|rate.?limit|too many/i],
  ["auth_required", /401|403|auth/i],
  ["protocol", /unexpected server response|protocol|invalid frame/i],
];

export function classifyError(error: string | null | undefined): ErrorCategory | null {
  if (!error) return null;
  for (const [category, pattern] of MATCHERS) {
    if (pattern.test(error)) return category;
  }
  return "unknown";
}
