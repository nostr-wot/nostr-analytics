import type { Nip65Relay, RelayCount, RelayHealthReport, RelayHealthIssue } from "./types";

const SPECIAL_PURPOSE_PATTERNS = [
  { pattern: /nwc/i, label: "Nostr Wallet Connect" },
  { pattern: /wallet/i, label: "wallet" },
  { pattern: /alby/i, label: "Alby (wallet)" },
  { pattern: /mutiny/i, label: "Mutiny (wallet)" },
  { pattern: /coinos/i, label: "Coinos (wallet)" },
  { pattern: /dvm/i, label: "DVM (data vending machine)" },
  { pattern: /pay/i, label: "payment" },
];

export function analyzeRelayHealth(
  nip65Relays: Nip65Relay[],
  relayDistribution: RelayCount[],
  totalEvents: number,
): RelayHealthReport {
  const issues: RelayHealthIssue[] = [];
  const recommendations: string[] = [];

  if (nip65Relays.length === 0) {
    return {
      score: "poor",
      issues: [{ id: "no-relay-list", severity: "error", title: "No relay list", description: "This user has no NIP-65 relay list (kind 10002). Other clients cannot discover where to find or send events." }],
      recommendations: ["Publish a NIP-65 relay list with at least 3-5 write relays and 3-5 read relays."],
    };
  }

  const writeRelays = nip65Relays.filter((r) => r.marker === "write" || r.marker === "both");

  // Check: dead relays (unreachable)
  const deadRelays = nip65Relays.filter((r) => r.health === "unreachable");
  if (deadRelays.length > 0) {
    issues.push({
      id: "dead-relays",
      severity: "error",
      title: `${deadRelays.length} unreachable relay${deadRelays.length > 1 ? "s" : ""}`,
      description: "These declared relays failed health checks in the last 24 hours.",
      relays: deadRelays.map((r) => r.url),
    });
    for (const r of deadRelays) {
      let host: string;
      try { host = new URL(r.url).hostname; } catch { host = r.url; }
      recommendations.push(`Remove ${host} — unreachable, not storing your events.`);
    }
  }

  // Check: zero-event relays (reachable but empty)
  const zeroEventRelays = nip65Relays.filter(
    (r) => r.health !== "unreachable" && r.eventPercent === 0 && (r.marker === "write" || r.marker === "both")
  );
  if (zeroEventRelays.length > 0) {
    issues.push({
      id: "zero-event-relays",
      severity: "warning",
      title: `${zeroEventRelays.length} write relay${zeroEventRelays.length > 1 ? "s" : ""} with 0 events`,
      description: "These relays are declared for writing but store none of this user's events.",
      relays: zeroEventRelays.map((r) => r.url),
    });
    for (const r of zeroEventRelays) {
      let host: string;
      try { host = new URL(r.url).hostname; } catch { host = r.url; }
      recommendations.push(`Check ${host} — declared as write relay but holds no events. May need re-publishing or removal.`);
    }
  }

  // Check: over-centralization
  if (totalEvents > 0) {
    const topRelay = relayDistribution[0];
    if (topRelay) {
      const topPercent = (topRelay.count / totalEvents) * 100;
      if (topPercent > 60) {
        let host: string;
        try { host = new URL(topRelay.relay).hostname; } catch { host = topRelay.relay; }
        issues.push({
          id: "centralization",
          severity: "warning",
          title: "Event storage is centralized",
          description: `${Math.round(topPercent)}% of events are on ${host}. If this relay goes down, most events become unavailable.`,
          relays: [topRelay.relay],
        });
        recommendations.push("Distribute events across more relays to reduce single-relay dependency.");
      }
    }
  }

  // Check: too few write relays
  if (writeRelays.length < 3) {
    issues.push({
      id: "few-write-relays",
      severity: "warning",
      title: `Only ${writeRelays.length} write relay${writeRelays.length !== 1 ? "s" : ""}`,
      description: "Fewer than 3 write relays means limited redundancy. If one goes down, discoverability drops significantly.",
    });
    recommendations.push("Add more write relays (aim for 3-5) for better redundancy.");
  }

  // Check: too many relays
  if (nip65Relays.length > 10) {
    issues.push({
      id: "too-many-relays",
      severity: "info",
      title: `${nip65Relays.length} relays declared`,
      description: "More than 10 relays has diminishing returns and slows publishing.",
    });
    recommendations.push("Consider reducing to 5-8 relays for faster publishing and simpler management.");
  }

  // Check: special-purpose relays
  const specialRelays: { url: string; label: string }[] = [];
  for (const relay of nip65Relays) {
    for (const { pattern, label } of SPECIAL_PURPOSE_PATTERNS) {
      if (pattern.test(relay.url)) {
        specialRelays.push({ url: relay.url, label });
        break;
      }
    }
  }
  if (specialRelays.length > 0) {
    issues.push({
      id: "special-purpose-relays",
      severity: "warning",
      title: `${specialRelays.length} special-purpose relay${specialRelays.length > 1 ? "s" : ""} in list`,
      description: `Relays meant for specific protocols (wallet connect, payments, DVMs) shouldn't be in a general relay list: ${specialRelays.map((r) => r.label).join(", ")}.`,
      relays: specialRelays.map((r) => r.url),
    });
    for (const r of specialRelays) {
      let host: string;
      try { host = new URL(r.url).hostname; } catch { host = r.url; }
      recommendations.push(`Remove ${host} — appears to be a ${r.label} relay, not a general-purpose relay.`);
    }
  }

  // Score
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  let score: "good" | "needs-attention" | "poor";
  if (errorCount > 0 || warningCount >= 3) {
    score = "poor";
  } else if (warningCount > 0) {
    score = "needs-attention";
  } else {
    score = "good";
  }

  return { score, issues, recommendations };
}
