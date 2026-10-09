import test from "node:test";
import assert from "node:assert/strict";
import {
  migrationOrder,
  executionOptions,
  validateContainer,
  isolationAcknowledgement,
  reportEntry,
} from "../scripts/lib/homologation.mjs";

test("homologation defaults to preflight without SQL and requires explicit execution acknowledgement", () => {
  assert.deepEqual(executionOptions([], undefined), { run: false, migrate: false, edge: false });
  assert.throws(() => executionOptions(["--run"], undefined), /ISOLATION_ACK_REQUIRED/);
  assert.throws(() => executionOptions(["--migrate"], isolationAcknowledgement), /RUN_REQUIRED/);
  assert.equal(executionOptions(["--run", "--migrate"], isolationAcknowledgement).migrate, true);
});
test("homologation rejects URLs, remote flags, reset and conflicting options", () => {
  for (const args of [
    ["--db-url"],
    ["--linked"],
    ["--reset"],
    ["https://production.invalid"],
    ["--check", "--run"],
  ]) {
    assert.throws(() => executionOptions(args, isolationAcknowledgement), /UNSAFE_ARGUMENTS/);
  }
});
test("container identity requires the dedicated name, project label and running state", () => {
  const info = {
    Name: "/supabase_db_bemmais-homologation",
    State: { Running: true },
    Config: { Labels: { "com.supabase.cli.project": "bemmais-homologation" } },
  };
  assert.equal(validateContainer(info, "principal"), "supabase_db_bemmais-homologation");
  assert.throws(
    () => validateContainer(info, "bemmais-homologation"),
    /ISOLATED_TARGET_NOT_VERIFIED/,
  );
  assert.throws(
    () => validateContainer({ ...info, Config: { Labels: {} } }, "principal"),
    /ISOLATED_TARGET_NOT_VERIFIED/,
  );
  assert.throws(
    () => validateContainer({ ...info, Name: "/supabase_db_principal" }, "principal"),
    /ISOLATED_TARGET_NOT_VERIFIED/,
  );
});
test("migration ordering is chronological and duplicate versions fail closed", () => {
  assert.deepEqual(migrationOrder(["20261009000000_b.sql", "20261008000000_a.sql"]), [
    "20261008000000_a.sql",
    "20261009000000_b.sql",
  ]);
  assert.throws(
    () => migrationOrder(["20261008000000_a.sql", "20261008000000_b.sql"]),
    /MIGRATION_VERSION_DUPLICATE/,
  );
  assert.throws(() => migrationOrder(["../outside.sql"]), /MIGRATION_NAME_INVALID/);
});
test("SKIPPED reports are explicit, never represented as SQL approval", () => {
  assert.deepEqual(reportEntry("SQL", "SKIPPED", "No database"), {
    name: "SQL",
    status: "SKIPPED",
    detail: "No database",
  });
  assert.throws(() => reportEntry("SQL", "MOCK_PASS", ""), /INVALID_REPORT_STATUS/);
});
