const L = require("../api/_lib");

async function main() {
  const db = await L.migrateDb();
  const rows = await db.query(`
    SELECT count(*)::int AS total,
      count(identity_number)::int AS numbered,
      count(DISTINCT identity_number)::int AS distinct_numbered,
      count(*) FILTER (WHERE identity_number !~ '^[1-9][0-9]{5}$')::int AS invalid,
      count(*) FILTER (WHERE is_test)::int AS test_records
    FROM tlc_identities
  `);
  const registry = await db.query(
    "SELECT count(*)::int AS total FROM youcount_number_registry",
  );
  const aliases = await db.query(
    "SELECT count(*)::int AS total FROM tlc_identity_aliases",
  );
  const roles = await db.query(
    `SELECT COALESCE(role_code,'UNCLASSIFIED') AS role,count(*)::int AS total
     FROM tlc_identities GROUP BY role_code ORDER BY role_code NULLS LAST`,
  );
  const result = {
    identities: rows[0],
    registry: registry[0]?.total || 0,
    aliases: aliases[0]?.total || 0,
    roles,
  };
  if (
    result.identities.total !== result.identities.numbered ||
    result.identities.numbered !== result.identities.distinct_numbered ||
    result.identities.invalid !== 0 ||
    result.registry < result.identities.total
  ) {
    throw new Error(`numbering_migration_validation_failed ${JSON.stringify(result)}`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
