export const isolatedProject = "bemmais-homologation";
export const isolationAcknowledgement = "DISPOSABLE_LOCAL_BEMMAIS_ONLY";
export const sequentialSuites = [
  "payment-hardening.sql",
  "order-cancellation.sql",
  "order-fulfillment.sql",
  "logistics-foundation.sql",
  "checkout-address.sql",
  "super-admin-hardening.sql",
  "executive-dashboard.sql",
  "homologation-security.sql",
];
export function migrationOrder(names) {
  if (!names.length || names.some((n) => !/^\d{14}_[a-zA-Z0-9_-]+\.sql$/.test(n)))
    throw new Error("MIGRATION_NAME_INVALID");
  const ordered = [...names].sort();
  if (new Set(ordered.map((n) => n.slice(0, 14))).size !== ordered.length)
    throw new Error("MIGRATION_VERSION_DUPLICATE");
  return ordered;
}
export function executionOptions(args, acknowledgement) {
  const allowed = ["--check", "--run", "--migrate", "--edge"];
  if (
    args.some((a) => !allowed.includes(a)) ||
    new Set(args).size !== args.length ||
    (args.includes("--check") && args.length > 1)
  )
    throw new Error("UNSAFE_ARGUMENTS");
  const run = args.includes("--run");
  if ((args.includes("--migrate") || args.includes("--edge")) && !run)
    throw new Error("RUN_REQUIRED");
  if (run && acknowledgement !== isolationAcknowledgement)
    throw new Error("ISOLATION_ACK_REQUIRED");
  return { run, migrate: args.includes("--migrate"), edge: args.includes("--edge") };
}
export function validateContainer(info, principalProject) {
  const name = `supabase_db_${isolatedProject}`;
  if (
    !principalProject ||
    principalProject === isolatedProject ||
    info?.Name !== `/${name}` ||
    info?.State?.Running !== true ||
    info?.Config?.Labels?.["com.supabase.cli.project"] !== isolatedProject
  )
    throw new Error("ISOLATED_TARGET_NOT_VERIFIED");
  return name;
}
export function reportEntry(name, status, detail) {
  if (!["PASS", "FAIL", "SKIPPED"].includes(status)) throw new Error("INVALID_REPORT_STATUS");
  return { name, status, detail };
}
