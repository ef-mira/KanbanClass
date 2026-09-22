import { PrismaClient } from "@prisma/client";

// DATABASE_URL (optional) points the app at another SQLite file, e.g. a test copy.
export const prisma = new PrismaClient(process.env.DATABASE_URL ? { datasourceUrl: process.env.DATABASE_URL } : undefined);
