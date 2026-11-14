/**
 * One-off probe: find the Supavisor pooler region that serves this project.
 *
 * Budget: 14 hosts x 4s timeout, sequential, no retries. Prints only the
 * winning host, never the password.
 */
import { Client } from "pg";

const env = await Bun.file("D:/Q_project/projects/flux/backend/.env").text();
const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
const url = new URL(line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, ""));
const password = decodeURIComponent(url.password);
const ref = url.hostname.split(".")[1];
console.log("project ref:", ref);

const regions = [
  "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1",
  "ap-northeast-2", "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-central-1", "eu-central-2", "eu-west-1", "eu-west-2", "eu-west-3",
];

const candidates = [];
for (const prefix of ["aws-0", "aws-1"]) {
  for (const r of regions) candidates.push(`${prefix}-${r}.pooler.supabase.com`);
}

for (const host of candidates) {
  const started = Date.now();
  const client = new Client({
    host,
    port: 5432,
    user: `postgres.${ref}`,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 4000,
  });
  try {
    await client.connect();
    const r = await client.query("select current_database() as db, version() as v");
    console.log(`OK ${host} in ${Date.now() - started}ms ->`, r.rows[0].db);
    console.log(String(r.rows[0].v).split(",")[0]);
    await client.end();
    process.exit(0);
  } catch (err) {
    const msg = String(err?.message || err).slice(0, 90);
    console.log(`no  ${host} -> ${msg}`);
    try { await client.end(); } catch {}
  }
}
console.log("no pooler host answered");
process.exit(1);
