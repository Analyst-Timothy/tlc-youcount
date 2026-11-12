const fs = require("node:fs/promises");
const L = require("../api/_lib");
const Member = require("../api/member");

async function main() {
  const db = await L.initDb();
  const rows = await db.query(`
    SELECT i.id,i.public_id,i.identity_number,i.role_code,i.status,i.created_at,
           i.connect_eligible,r.submitted_payload
    FROM tlc_identities i
    JOIN LATERAL (
      SELECT kind,submitted_payload FROM review_records WHERE identity_id=i.id
      ORDER BY updated_at DESC,id DESC LIMIT 1
    ) r ON true
    WHERE i.connect_eligible=true
      AND r.kind<>'manual_review'
    ORDER BY i.id LIMIT 1
  `);
  if (!rows.length) throw new Error("no_wallet_eligible_test_identity");
  const changes = L.decrypt(rows[0].submitted_payload)?.changes || {};
  const passState = await Member._ensureApplePassState(db, rows[0].id);
  const buffer = await Member._createApplePass(rows[0], changes, passState);
  if (buffer.length < 10000) throw new Error(`wallet_pass_too_small_${buffer.length}`);
  await fs.writeFile("/private/tmp/youcount-ota-test.pkpass", buffer);
  process.stdout.write(JSON.stringify({ ok: true, identityId: rows[0].id, bytes: buffer.length }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
