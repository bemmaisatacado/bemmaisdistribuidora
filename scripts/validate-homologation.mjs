import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  isolatedProject,
  migrationOrder,
  executionOptions,
  validateContainer,
  sequentialSuites,
  reportEntry,
} from "./lib/homologation.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const results = [];
const add = (name, status, detail) => results.push(reportEntry(name, status, detail));
const dockerHost =
  process.platform === "win32" ? "npipe:////./pipe/docker_engine" : "unix:///var/run/docker.sock";
// Never inherit database URLs/passwords, CLI tokens, Docker contexts or proxies.
const childEnv = Object.fromEntries(
  [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOME",
    "APPDATA",
    "LOCALAPPDATA",
  ]
    .filter((k) => process.env[k])
    .map((k) => [k, process.env[k]]),
);
function command(executable, args, input = "", timeout = 120000) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd: root,
      shell: false,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let done = false;
    const finish = (code) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve({ code, output });
      }
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(1);
    }, timeout);
    child.stdout.on("data", (d) => {
      if (output.length < 100000) output += d.toString();
    });
    child.stderr.resume(); // Raw SQL errors/credentials are never printed.
    child.on("error", () => finish(1));
    child.on("close", (c) => finish(c ?? 1));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
const docker = (args, input) => command("docker", ["--host", dockerHost, ...args], input);
async function main() {
  const options = executionOptions(process.argv.slice(2), process.env.BEMMAIS_HOMOLOGATION_ACK);
  const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
  const principal = config.match(/^project_id\s*=\s*"([\w-]+)"/m)?.[1];
  if (!principal || principal === isolatedProject)
    throw new Error("PRINCIPAL_TARGET_NOT_IDENTIFIED");
  const files = migrationOrder(
    (await readdir(new URL("../supabase/migrations/", import.meta.url))).filter((n) =>
      n.endsWith(".sql"),
    ),
  );
  const manifest = [];
  for (const file of files) {
    const sql = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
    if (/^\s*\\/m.test(sql)) throw new Error("MIGRATION_PSQL_COMMAND_REJECTED");
    manifest.push({ file, sha256: createHash("sha256").update(sql).digest("hex") });
  }
  add("migration_inventory", "PASS", manifest);
  for (const tool of ["docker", "psql", "postgres", "podman", "deno"]) {
    const r = await command(tool, ["--version"], "", 10000);
    add(
      `tool_${tool}`,
      r.code === 0 ? "PASS" : "SKIPPED",
      r.code === 0 ? "Available; version output withheld" : "Not executable in this environment",
    );
  }
  if (!options.run) {
    for (const suite of sequentialSuites)
      add(suite, "SKIPPED", "Preflight only; no database connection");
    add("concurrency_payment", "SKIPPED", "Requires confirmed disposable local database");
    add("concurrency_checkout", "SKIPPED", "Two-session fixture procedure documented");
    add("edge_runtime", "SKIPPED", "Not contacted in preflight");
    return;
  }
  const inspected = await docker(["inspect", `supabase_db_${isolatedProject}`]);
  if (inspected.code !== 0) throw new Error("ISOLATED_POSTGRES_UNAVAILABLE");
  let info;
  try {
    info = JSON.parse(inspected.output)[0];
  } catch {
    throw new Error("ISOLATED_TARGET_NOT_VERIFIED");
  }
  const container = validateContainer(info, principal);
  const sql = (input) =>
    docker(
      [
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-qAt",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        "BEMMAIS_ISOLATED_TEST=on",
      ],
      `SET statement_timeout='60s'; SET lock_timeout='10s';\n${input}`,
    );
  const identity = await sql(`SELECT current_database()='postgres' AND current_user='postgres'
    AND current_setting('server_version_num')::int>=150000
    AND to_regprocedure('auth.uid()') IS NOT NULL
    AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated');`);
  if (identity.code !== 0 || identity.output.trim() !== "t")
    throw new Error("DATABASE_IDENTITY_FAILED");
  add(
    "isolated_database_identity",
    "PASS",
    "Dedicated local container, label, database, role and Supabase auth verified",
  );
  if (options.migrate) {
    const empty = await sql(
      "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p');",
    );
    if (empty.code !== 0 || empty.output.trim() !== "0")
      throw new Error("MIGRATIONS_REQUIRE_FRESH_DATABASE");
    for (const file of files) {
      const body = await readFile(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      );
      const r = await sql(`BEGIN;\n${body}\nCOMMIT;`);
      add(
        `migration:${file}`,
        r.code === 0 ? "PASS" : "FAIL",
        "Local SQL application, not CLI migration history",
      );
      if (r.code !== 0) throw new Error("MIGRATION_EXECUTION_FAILED");
    }
  } else add("migration_application", "SKIPPED", "No --migrate permission");
  for (const suite of sequentialSuites) {
    const r = await sql(await readFile(new URL(`../tests/sql/${suite}`, import.meta.url), "utf8"));
    add(suite, r.code === 0 ? "PASS" : "FAIL", "Real PostgreSQL execution; fixtures rolled back");
    if (r.code !== 0) throw new Error("SQL_SUITE_FAILED");
  }
  // These committed fixtures are ONLY in the confirmed disposable container.
  async function fixture() {
    const org = randomUUID(),
      order = randomUUID(),
      a = randomUUID(),
      b = randomUUID();
    const r = await sql(`BEGIN;
      INSERT INTO public.organizations(id,name) VALUES('${org}','Disposable concurrency fixture');
      INSERT INTO public.orders(id,organization_id,status,total_amount,subtotal_amount) VALUES('${order}','${org}','pending_payment',399.90,399.90);
      INSERT INTO public.payments(id,order_id,organization_id,provider,provider_payment_id,amount,currency,method)
      VALUES('${a}','${order}','${org}','local_fixture','${a}',399.90,'BRL','pix'),('${b}','${order}','${org}','local_fixture','${b}',399.90,'BRL','card'); COMMIT;`);
    if (r.code !== 0) throw new Error("CONCURRENCY_FIXTURE_FAILED");
    return { order, a, b };
  }
  const confirm = (p, event, status) =>
    sql(`BEGIN; SET LOCAL ROLE service_role;
    SET LOCAL request.jwt.claims='{"role":"service_role"}';
    SELECT public.confirm_verified_payment_event('local_fixture','${event}','payment.${status}','${p}','${p}',399.90,'BRL','${status}');
    SELECT pg_sleep(0.5); COMMIT;`);
  const assertCount = async (query, expected) => {
    const r = await sql(query);
    if (r.code !== 0 || r.output.trim() !== String(expected))
      throw new Error("CONCURRENCY_ASSERTION_FAILED");
  };
  const race = await fixture();
  const both = await Promise.all([
    confirm(race.a, randomUUID(), "paid"),
    confirm(race.b, randomUUID(), "paid"),
  ]);
  if (both.filter((r) => r.code === 0).length !== 1) throw new Error("DOUBLE_PAID_RACE_FAILED");
  await assertCount(
    `SELECT count(*) FROM public.payments WHERE order_id='${race.order}' AND status='paid';`,
    1,
  );
  await assertCount(
    `SELECT count(*) FROM public.orders WHERE id='${race.order}' AND status='paid' AND payment_status='paid';`,
    1,
  );
  const repeat = await fixture(),
    event = randomUUID();
  const duplicates = await Promise.all([
    confirm(repeat.a, event, "paid"),
    confirm(repeat.a, event, "paid"),
  ]);
  if (duplicates.some((r) => r.code !== 0)) throw new Error("DUPLICATE_EVENT_RACE_FAILED");
  await assertCount(
    `SELECT count(*) FROM public.payment_provider_events WHERE provider='local_fixture' AND provider_event_id='${event}';`,
    1,
  );
  if ((await confirm(repeat.a, randomUUID(), "processing")).code === 0)
    throw new Error("PAID_REGRESSION_ACCEPTED");
  await assertCount(
    `SELECT count(*) FROM public.payments WHERE id='${repeat.a}' AND status='paid';`,
    1,
  );
  add(
    "concurrency_payment",
    "PASS",
    "Two sessions: one paid/order, duplicate event and non-regression; fixtures retained only locally",
  );
  add(
    "concurrency_checkout",
    "SKIPPED",
    "Manual two-session fixture: super-admin-hardening-concurrency.sql; not certified by payment race",
  );
  if (options.edge) {
    const gateway = await docker(["inspect", `supabase_kong_${isolatedProject}`]);
    let gatewayInfo;
    try {
      gatewayInfo = JSON.parse(gateway.output)[0];
    } catch {
      throw new Error("EDGE_TARGET_NOT_VERIFIED");
    }
    if (
      gateway.code !== 0 ||
      gatewayInfo?.Config?.Labels?.["com.supabase.cli.project"] !== isolatedProject ||
      !gatewayInfo?.NetworkSettings?.Ports?.["8000/tcp"]?.some((p) => p.HostPort === "55321")
    )
      throw new Error("EDGE_TARGET_NOT_VERIFIED");
    const url = "http://127.0.0.1:55321/functions/v1/payment-webhook?provider=unknown";
    const get = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const post = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"status":"paid"}',
      signal: AbortSignal.timeout(5000),
    });
    if (
      get.status !== 405 ||
      post.status !== 503 ||
      (await post.json()).code !== "PAYMENT_PROVIDER_UNAVAILABLE"
    )
      throw new Error("EDGE_RUNTIME_FAILED");
    add(
      "edge_runtime",
      "PASS",
      "Actual local runtime rejects unknown provider; no provider authenticity adapter configured",
    );
  } else
    add("edge_runtime", "SKIPPED", "Requires separately served isolated Edge Runtime and --edge");
}
main()
  .catch((error) => {
    const safe =
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "HOMOLOGATION_FAILED";
    add("runner", "FAIL", safe);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const name of [
      ...sequentialSuites,
      "concurrency_payment",
      "concurrency_checkout",
      "edge_runtime",
    ]) {
      if (!results.some((r) => r.name === name))
        add(name, "SKIPPED", "Execution blocked before this stage");
    }
    console.log(
      JSON.stringify(
        {
          sqlCertification: "Only PASS SQL entries are executed; SKIPPED is not approval",
          results,
        },
        null,
        2,
      ),
    );
  });
