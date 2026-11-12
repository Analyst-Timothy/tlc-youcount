const L = require("../api/_lib");

async function main() {
  const db = await L.initDb();
  const registry = await db.query(
      `SELECT role_code,count(*)::int AS total FROM youcount_role_registry
       WHERE active=true GROUP BY role_code ORDER BY role_code`,
    ),
    identities = await db.query(
      `SELECT COALESCE(role_code,'UNCLASSIFIED') AS role,count(*)::int AS total
       FROM tlc_identities GROUP BY role_code ORDER BY role_code NULLS LAST`,
    ),
    eligibility = await db.query(
      `SELECT count(*) FILTER (WHERE connect_eligible)::int AS eligible,
              count(*) FILTER (WHERE connect_exception='ordained_role')::int AS ordained_exceptions,
              count(*)::int AS total
       FROM tlc_identities`,
    ),
    invalid = await db.query(
      `SELECT count(*)::int AS total FROM tlc_identities
       WHERE identity_number !~ '^[1-9][0-9]{5}$'`,
    );
  const result = { registry, identities, eligibility: eligibility[0], invalidNumbers: invalid[0].total };
  const imported = registry.reduce((sum, row) => sum + Number(row.total), 0);
  if (imported !== 849 || result.invalidNumbers !== 0 || Number(result.eligibility.total) !== 16)
    throw new Error(`role_import_validation_failed ${JSON.stringify(result)}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
