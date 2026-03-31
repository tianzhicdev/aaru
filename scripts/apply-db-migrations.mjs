import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

function parseArgs(argv) {
  const args = {
    env: null,
    envFile: ".env",
    databaseUrl: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--env" && next) {
      args.env = next;
      index += 1;
      continue;
    }

    if (arg === "--env-file" && next) {
      args.envFile = next;
      index += 1;
      continue;
    }

    if (arg === "--database-url" && next) {
      args.databaseUrl = next;
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/apply-db-migrations.mjs [--env dev|production] [--env-file path] [--database-url value]");
      process.exit(0);
    }
  }

  return args;
}

function firstDefined(...values) {
  return values.find((value) => typeof value === "string" && value.length > 0);
}

const args = parseArgs(process.argv.slice(2));
const { parsed, error } = config({ path: args.envFile });
if (error) {
  throw error;
}

const source = { ...parsed, ...process.env };
const databaseUrl = args.databaseUrl ?? (
  args.env === "dev"
    ? firstDefined(source.DATABASE_URL_DEV, source.DATABASE_URL)
    : firstDefined(source.DATABASE_URL)
);

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
