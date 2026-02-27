import fs from "node:fs";
import { LOG_FILE } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send existing tail first
      let lastSize = 0;
      try {
        const stat = fs.statSync(LOG_FILE);
        lastSize = stat.size;
        const tailBytes = Math.min(lastSize, 8 * 1024);
        const fd = fs.openSync(LOG_FILE, "r");
        const buffer = Buffer.alloc(tailBytes);
        fs.readSync(fd, buffer, 0, tailBytes, lastSize - tailBytes);
        fs.closeSync(fd);
        const tail = buffer.toString("utf-8");
        const firstNewline = tail.indexOf("\n");
        const clean = firstNewline >= 0 ? tail.slice(firstNewline + 1) : tail;
        if (clean) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(clean)}\n\n`)
          );
        }
      } catch {
        // File doesn't exist yet
      }

      // Watch for new data
      let watcher: fs.FSWatcher | null = null;
      try {
        watcher = fs.watch(LOG_FILE, () => {
          try {
            const stat = fs.statSync(LOG_FILE);
            if (stat.size > lastSize) {
              const fd = fs.openSync(LOG_FILE, "r");
              const newBytes = stat.size - lastSize;
              const buffer = Buffer.alloc(newBytes);
              fs.readSync(fd, buffer, 0, newBytes, lastSize);
              fs.closeSync(fd);
              const newContent = buffer.toString("utf-8");
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(newContent)}\n\n`)
              );
              lastSize = stat.size;
            }
          } catch {
            // File may have been truncated or deleted
          }
        });
      } catch {
        // File doesn't exist yet — watcher will fail, that's ok
      }

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          if (watcher) watcher.close();
        }
      }, 15_000);

      controller.enqueue(encoder.encode(": connected\n\n"));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
