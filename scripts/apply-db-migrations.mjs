import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

const { parsed, error } = config();
if (error) {
  throw error;
}

const databaseUrl = parsed?.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to apply db migrations.");
}

const migrationsDir = resolve("db/migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (migrationFiles.length === 0) {
  console.log("No db migrations found.");
  process.exit(0);
}

for (const file of migrationFiles) {
  const filePath = join(migrationsDir, file);
  console.log(`Applying ${file}...`);

  const result = spawnSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", filePath],
    { stdio: "inherit" }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Applied ${migrationFiles.length} db migration(s).`);
