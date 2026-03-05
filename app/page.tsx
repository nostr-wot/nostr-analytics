import { prisma } from "@/lib/db";

export const revalidate = 300;

async function getStats() {
  const [globalStats, relayCount, npubCount, relaySnapshots] = await Promise.all([
    prisma.globalStats.findFirst({ where: { id: 1 } }),
    prisma.relay.count(),
    prisma.trackedNpub.count(),
    prisma.relaySnapshot.findMany({ select: { uptime24h: true } }),
  ]);

  const avgUptime =
    relaySnapshots.length > 0
      ? relaySnapshots.reduce((sum, r) => sum + (r.uptime24h ?? 0), 0) /
        relaySnapshots.length
      : 0;

  return {
    totalEvents: globalStats?.totalEvents ?? 0,
    relayCount,
    npubCount,
    avgUptime: Math.round(avgUptime * 10) / 10,
  };
}

const features = [
  {
    title: "Event Storage Asymmetry",
    color: "amber",
    description:
      "Discover which relays hold which events. Identify gaps where relays are missing events they should have, and detect uneven distribution across your relay set.",
  },
  {
    title: "Relay List Quality",
    color: "blue",
    description:
      "Evaluate NIP-65 relay declarations against reality. Check if declared relays are actually reachable, online, and storing the user's events.",
  },
  {
    title: "Storage Centralization",
    color: "purple",
    description:
      "Identify how concentrated a user's events are across relays. Spot single-relay dependencies and measure how decentralized their storage actually is.",
  },
  {
    title: "Activity Patterns",
    color: "emerald",
    description:
      "Activity heatmaps by day and hour, daily active windows, timezone estimation from behavior, and peak activity hours across the full event history.",
  },
  {
    title: "Relay Health Monitoring",
    color: "red",
    description:
      "Track relay latency, uptime history, and error categorization. Detect timeouts, rate limits, auth failures, and protocol errors with automatic backoff.",
  },
  {
    title: "Event Collection",
    color: "cyan",
    description:
      "Bulk collection from 19+ relays, exhaustive single-relay rechecks, NIP-65 outbox fetching, and deep fetch across all known endpoints.",
  },
] as const;

const analyticsCards = [
  {
    title: "Activity Heatmap",
    description:
      "7x24 grid showing event frequency by day of week and hour, with timezone adjustment.",
  },
  {
    title: "Event Type Distribution",
    description:
      "Donut chart breaking down event kinds \u2014 notes, reactions, zaps, DMs, relay lists, and more.",
  },
  {
    title: "Relay Distribution",
    description:
      "See which relays store the most events, and how balanced the distribution is.",
  },
  {
    title: "Relay Timeline",
    description:
      "Stacked area chart showing events per relay over time, with outbox relay filtering.",
  },
  {
    title: "Daily Activity Window",
    description:
      "Visualize when a user is typically active each day \u2014 first and last event times as a band chart.",
  },
  {
    title: "DM Responsiveness",
    description:
      "Peak DM hours, response patterns, and a responsiveness score to find the best time to reach someone.",
  },
];

const colorMap: Record<string, { border: string; text: string }> = {
  amber: { border: "border-amber-400/20", text: "text-amber-400" },
  blue: { border: "border-blue-400/20", text: "text-blue-400" },
  purple: { border: "border-purple-400/20", text: "text-purple-400" },
  emerald: { border: "border-emerald-400/20", text: "text-emerald-400" },
  red: { border: "border-red-400/20", text: "text-red-400" },
  cyan: { border: "border-cyan-400/20", text: "text-cyan-400" },
};

export default async function HomePage() {
  const stats = await getStats();

  return (
    <div className="space-y-16">
      {/* Section 1: Hero */}
      <section className="pt-8 pb-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Nostr WoT{" "}
          <span className="text-zinc-400">Analytics</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-400">
          Monitor relay health, track event distribution, and analyze npub
          behavior across the Nostr network.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <a
            href="/npubs"
            className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            Explore Npubs
          </a>
          <a
            href="/relays"
            className="rounded-lg border border-zinc-700 px-6 py-2.5 text-sm font-semibold text-zinc-100 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
          >
            Relay Status
          </a>
        </div>
      </section>

      {/* Section 2: Live Stats Bar */}
      <section>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            value={stats.npubCount.toLocaleString()}
            label="Tracked Npubs"
          />
          <StatCard
            value={stats.relayCount.toLocaleString()}
            label="Monitored Relays"
          />
          <StatCard
            value={stats.totalEvents.toLocaleString()}
            label="Events Collected"
          />
          <StatCard
            value={`${stats.avgUptime}%`}
            label="Avg Relay Uptime"
          />
        </div>
      </section>

      {/* Section 3: Feature Grid */}
      <section>
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          What You Can Analyze
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const colors = colorMap[feature.color];
            return (
              <div
                key={feature.title}
                className={`rounded-lg border bg-zinc-900/50 p-5 ${colors.border}`}
              >
                <h3 className={`text-sm font-semibold ${colors.text}`}>
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 4: Analytics Preview */}
      <section>
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          Analytics Per Profile
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Each tracked npub gets a full analytics dashboard with these
          visualizations:
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {analyticsCards.map((card) => (
            <div
              key={card.title}
              className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-5"
            >
              <h3 className="text-sm font-semibold text-zinc-200">
                {card.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                {card.description}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <a
            href="/npubs"
            className="text-sm text-zinc-400 transition-colors hover:text-white"
          >
            Browse tracked npubs to see analytics in action &rarr;
          </a>
        </div>
      </section>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-center">
      <div className="text-2xl font-bold tabular-nums text-white">{value}</div>
      <div className="mt-1 text-sm text-zinc-500">{label}</div>
    </div>
  );
}
