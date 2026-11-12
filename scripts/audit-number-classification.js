const L = require("../api/_lib");

async function main() {
  const db = await L.initDb();
  const rows = await db.query(`
    SELECT i.id,i.connect_eligible,i.connect_source,i.role_code,r.kind,r.submitted_payload
    FROM tlc_identities i
    LEFT JOIN LATERAL (
      SELECT kind,submitted_payload FROM review_records WHERE identity_id=i.id
      ORDER BY updated_at DESC,id DESC LIMIT 1
    ) r ON true
    WHERE i.role_code IS NULL ORDER BY i.id
  `);
  const result = rows.map((row) => {
    let payload = {};
    try { payload = L.decrypt(row.submitted_payload) || {}; } catch {}
    return {
      identityId: row.id,
      kind: row.kind,
      connectSource: row.connect_source,
      membershipStatus: payload.changes?.membershipStatus || null,
      journeyType: payload.journeyType || payload.route || null,
    };
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
