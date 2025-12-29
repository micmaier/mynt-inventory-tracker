import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const DATABASE_URL =
  process.env.DATABASE_URL || "file:/workspaces/mynt-inventory-tracker/prisma/dev.db";

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: ["error", "warn"],
    datasources: {
      db: { url: DATABASE_URL },
    },
  });

if (process.env.NODE_ENV !== "production") global.prisma = prisma;
