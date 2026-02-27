import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PID_FILE = path.resolve(process.cwd(), ".scheduler.pid");
export const LOG_FILE = path.resolve(process.cwd(), ".scheduler.log");

function readPid(): number | null {
  try {
    const content = fs.readFileSync(PID_FILE, "utf-8").trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function cleanStalePid(): void {
  const pid = readPid();
  if (pid !== null && !isProcessAlive(pid)) {
    try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
  }
}

export function isSchedulerRunning(): boolean {
  cleanStalePid();
  const pid = readPid();
  return pid !== null && isProcessAlive(pid);
}

export function startScheduler(): boolean {
  if (isSchedulerRunning()) return false; // already running

  const logFd = fs.openSync(LOG_FILE, "a");

  const tsxBin = path.resolve(process.cwd(), "node_modules", ".bin", "tsx");

  const child = spawn(
    tsxBin,
    ["scripts/scheduler-worker.ts"],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", logFd, logFd],
    }
  );

  child.on("error", (err) => {
    console.error("[scheduler] Failed to spawn worker:", err.message);
  });
  child.unref();
  fs.closeSync(logFd);

  return true;
}

export function stopScheduler(): boolean {
  const pid = readPid();
  if (pid === null) return false;

  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    // Process doesn't exist — clean up stale PID
    try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
    return false;
  }
}

export function getSchedulerLog(lines: number = 50): string {
  try {
    const stat = fs.statSync(LOG_FILE);
    const maxBytes = 64 * 1024;

    if (stat.size > maxBytes) {
      const fd = fs.openSync(LOG_FILE, "r");
      const buffer = Buffer.alloc(maxBytes);
      fs.readSync(fd, buffer, 0, maxBytes, stat.size - maxBytes);
      fs.closeSync(fd);
      const content = buffer.toString("utf-8");
      return content.split("\n").slice(-lines).join("\n");
    }

    const content = fs.readFileSync(LOG_FILE, "utf-8");
    return content.split("\n").slice(-lines).join("\n");
  } catch {
    return "";
  }
}
