import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

/**
 * Creates a fresh test database and applies the Supabase shim plus every
 * migration in supabase/migrations, in filename order.
 *
 * TEST_DATABASE_ADMIN_URL must point at a Postgres 16+ server with PostGIS,
 * e.g. postgres://postgres@127.0.0.1:54329/postgres (see docs/TESTING.md).
 */
const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const DB_NAME = process.env.TEST_DATABASE_NAME ?? "evcp_test";

// Migrations that were never applied to the live project are skipped so tests match production.
const SKIP = new Set(["20261026000003_split_connector_policies.sql"]);

export default async function setup() {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${DB_NAME} with (force)`);
  await admin.query(`create database ${DB_NAME}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${DB_NAME}`;
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(readFileSync(path.join(__dirname, "supabase-shim.sql"), "utf8"));
    const dir = path.resolve(__dirname, "../../../supabase/migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (SKIP.has(file)) continue;
      // The `http` extension (used only for data imports) is not available locally.
      const sql = readFileSync(path.join(dir, file), "utf8").replace(/^create extension if not exists http .*$/gim, "");
      try {
        await db.query(sql);
      } catch (err) {
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await db.end();
  }
}
