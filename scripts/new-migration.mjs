// Writes prisma/migrations/<timestamp>_<name>/migration.sql with the SQL needed
// to bring the existing migrations up to prisma/schema.prisma. The app applies
// it to the user's database on next launch (server/migrate.ts).
//   npm run db:migration -- add_lesson_tags
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const name = (process.argv[2] ?? "").replace(/[^a-z0-9_]/gi, "_");
if (!name) {
  console.error("Usage: npm run db:migration -- <name>");
  process.exit(1);
}

// Prisma resolves a CLI --shadow-database-url against the working directory (the project root).
const shadow = path.resolve(".shadow.db");
rmSync(shadow, { force: true });
let sql;
try {
  sql = execFileSync(
    "npx",
    [
      "prisma", "migrate", "diff",
      "--from-migrations", "prisma/migrations",
      "--to-schema-datamodel", "prisma/schema.prisma",
      // Relative, so the space in the project path never reaches the shell.
      "--shadow-database-url", "file:./.shadow.db",
      "--script",
    ],
    { encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, DATABASE_URL: "file:./.unused.db" } },
  );
} finally {
  rmSync(shadow, { force: true });
}

if (!sql.trim() || /empty migration/i.test(sql)) {
  console.log("Schema matches the existing migrations; nothing to write.");
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const dir = path.join("prisma", "migrations", `${stamp}_${name}`);
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "migration.sql"), sql);
console.log(`Wrote ${dir}/migration.sql`);
