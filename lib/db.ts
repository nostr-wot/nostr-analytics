import { PrismaClient } from "@/prisma/generated/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL || "file:./dev.db" });
  const client = new PrismaClient({ adapter });
  // Enable WAL mode and set busy timeout for concurrent access
  client.$executeRawUnsafe("PRAGMA journal_mode=WAL").catch((err) => {
    console.warn("[db] Failed to enable WAL mode:", err);
  });
  client.$executeRawUnsafe("PRAGMA busy_timeout=5000").catch((err) => {
    console.warn("[db] Failed to set busy_timeout:", err);
  });
  return client;
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
