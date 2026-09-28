import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "./db";

/**
 * Minimal migration runner. The installed app has no Prisma CLI, so it applies
 * `prisma/migrations/<name>/migration.sql` itself, in name order, and records
 * each one in `_kanbanclass_migrations`. Create new ones with
 * `npm run db:migration -- <name>` (see README).
 */
export async function migrate(migrationsDir: string) {
  if (!existsSync(migrationsDir)) throw new Error(`Migrations folder not found: ${migrationsDir}`);
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "_kanbanclass_migrations" ("name" TEXT NOT NULL PRIMARY KEY, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
  const applied = new Set(
    (await prisma.$queryRawUnsafe<{ name: string }[]>(`SELECT "name" FROM "_kanbanclass_migrations"`)).map((r) => r.name),
  );
  const names = (await fs.readdir(migrationsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const name of names) {
    if (applied.has(name)) continue;
    const sql = await fs.readFile(path.join(migrationsDir, name, "migration.sql"), "utf8");
    // Prisma's SQLite driver runs one statement per call.
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
      .filter(Boolean);
    await prisma.$transaction([
      ...statements.map((s) => prisma.$executeRawUnsafe(s)),
      prisma.$executeRawUnsafe(`INSERT INTO "_kanbanclass_migrations" ("name") VALUES (?)`, name),
    ]);
    console.log(`Applied migration ${name}`);
  }
}
