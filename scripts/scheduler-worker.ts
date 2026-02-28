import fs from "node:fs";
import path from "node:path";
import { runCollectionCycle } from "../lib/collector";
import { DEFAULT_FETCH_INTERVAL_MINUTES } from "../lib/constants";
import { ensureRelaysExist } from "../lib/relay-health";

const PID_FILE = path.resolve(process.cwd(), ".scheduler.pid");

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(): void {
  // Clean up stale PID file if the process is dead
  try {
    const content = fs.readFileSync(PID_FILE, "utf-8").trim();
    const existingPid = parseInt(content, 10);
    if (!isNaN(existingPid) && isProcessAlive(existingPid)) {
      console.error(
        `[scheduler] Another instance is already running (PID ${existingPid}). Exiting.`
      );
      process.exit(1);
    }
    console.log("[scheduler] Cleaning up stale PID file.");
    try {
      fs.unlinkSync(PID_FILE);
    } catch (unlinkErr: unknown) {
      if ((unlinkErr as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkErr;
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // Atomic create — fails if another instance raced us
  try {
    fs.writeFileSync(PID_FILE, String(process.pid), { flag: "wx" });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      console.error("[scheduler] Lock file appeared during startup — another instance won. Exiting.");
      process.exit(1);
    }
    throw err;
  }
  console.log(`[scheduler] PID ${process.pid} written to ${PID_FILE}`);
}

function releaseLock(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
      if (pid === process.pid) {
        fs.unlinkSync(PID_FILE);
        console.log("[scheduler] PID file removed.");
      }
    }
  } catch {
    // best-effort cleanup
  }
}

// -- Main -----------------------------------------------------------------

let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
let shuttingDown = false;

function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[scheduler] Shutting down...");
  if (timeoutHandle) clearTimeout(timeoutHandle);
  releaseLock();
  process.exit(0);
}

acquireLock();

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("uncaughtException", (err) => {
  console.error("[scheduler] Uncaught exception:", err);
  releaseLock();
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[scheduler] Unhandled rejection:", reason);
  releaseLock();
  process.exit(1);
});

const intervalMinutes = parseInt(
  process.env.FETCH_INTERVAL_MINUTES || String(DEFAULT_FETCH_INTERVAL_MINUTES),
  10
);
const intervalMs = intervalMinutes * 60 * 1000;

console.log(
  `[scheduler] Started. Fetching every ${intervalMinutes} minutes.`
);

async function runCycle() {
  await runCollectionCycle().catch(console.error);
}

// Fix #8: Use tail-recursive setTimeout to prevent overlapping cycles
async function runLoop() {
  await runCycle();
  if (!shuttingDown) {
    timeoutHandle = setTimeout(runLoop, intervalMs);
  }
}

// Seed Relay table, then start the loop
ensureRelaysExist()
  .then(() => runLoop())
  .catch((err) => {
    console.error("[scheduler] Fatal: failed to seed relays:", err);
    releaseLock();
    process.exit(1);
  });
