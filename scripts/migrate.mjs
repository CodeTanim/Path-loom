import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";

const projectDirectory = fileURLToPath(new URL("..", import.meta.url));
nextEnv.loadEnvConfig(projectDirectory);

if (!process.env.DATABASE_URL?.trim()) {
  console.error("Set DATABASE_URL in .env.local before running the migration.");
  process.exitCode = 1;
} else {
  try {
    const sql = neon(process.env.DATABASE_URL);
    const migration = await readFile(
      new URL("../db/001_projects.sql", import.meta.url),
      "utf8",
    );
    const statements = migration.split(";").map((part) => part.trim()).filter(Boolean);
    await sql.transaction(statements.map((statement) => sql.query(statement)));
    console.info("Pathloom cloud project schema is ready.");
  } catch {
    console.error("Migration failed. Check the database connection and permissions, then retry.");
    process.exitCode = 1;
  }
}
