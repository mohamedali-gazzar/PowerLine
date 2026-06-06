import { PrismaClient } from "@prisma/client";

// Single shared Prisma client. Reused across hot-reloads in dev so we don't
// exhaust connections each time nodemon restarts.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
