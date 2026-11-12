const fs = require("node:fs");
const L = require("../api/_lib");

function parseCsv(input) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") {
      row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift().map((value) => value.replace(/^\uFEFF/, ""));
  return rows.filter((values) => values.some(Boolean)).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
  );
}

async function main() {
  const filename = process.argv[2];
  if (!filename) throw new Error("Pass the role lookup CSV path.");
  const input = parseCsv(fs.readFileSync(filename, "utf8")),
    allowed = new Set(["OP", "OM", "OA", "OD", "OC", "TL", "SG", "TM"]),
    seen = new Set(),
    rows = input.map((row) => {
      const personId = String(row["Person ID"] || "").trim(),
        roleCode = String(row.Code || "").trim().toUpperCase();
      if (!/^\d+$/.test(personId) || !allowed.has(roleCode))
        throw new Error(`Invalid role row for Planning Center ID ${personId || "missing"}.`);
      if (seen.has(personId)) throw new Error(`Duplicate Planning Center ID ${personId}.`);
      seen.add(personId);
      return {
        personId,
        roleCode,
        category: String(row.Category || "").trim(),
        allRoles: String(row["All roles"] || "").trim(),
      };
    }),
    db = await L.migrateDb(),
    personIds = rows.map((row) => row.personId);
  await db.query(
    `INSERT INTO youcount_role_registry(
       planning_center_id,role_code,category,all_roles,source,active,imported_at
     ) SELECT * FROM unnest(
       $1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::boolean[],$7::timestamptz[]
     ) ON CONFLICT(planning_center_id) DO UPDATE SET
       role_code=excluded.role_code,category=excluded.category,all_roles=excluded.all_roles,
       source=excluded.source,active=true,imported_at=excluded.imported_at`,
    [
      personIds,
      rows.map((row) => row.roleCode),
      rows.map((row) => row.category),
      rows.map((row) => row.allRoles),
      rows.map(() => "YouCount role lookup 2026-11-09.csv"),
      rows.map(() => true),
      rows.map(() => new Date().toISOString()),
    ],
  );
  await db.query(
    `UPDATE youcount_role_registry SET active=false
     WHERE source=$1 AND NOT (planning_center_id=ANY($2::text[]))`,
    ["YouCount role lookup 2026-11-09.csv", personIds],
  );
  const matches = await db.query(`
    SELECT DISTINCT ON (p.identity_id)
      p.identity_id,i.role_code AS previous_role,r.role_code AS approved_role
    FROM tlc_identity_profiles p
    JOIN tlc_identities i ON i.id=p.identity_id
    JOIN youcount_role_registry r ON r.planning_center_id=p.planning_center_id AND r.active=true
    ORDER BY p.identity_id,CASE r.role_code
      WHEN 'OP' THEN 1 WHEN 'OM' THEN 2 WHEN 'OA' THEN 3 WHEN 'OD' THEN 4
      WHEN 'OC' THEN 5 WHEN 'TL' THEN 6 WHEN 'SG' THEN 7 WHEN 'TM' THEN 8 ELSE 99 END
  `);
  let changed = 0, ordainedExceptions = 0;
  for (const match of matches) {
    if (["OP", "OM", "OA"].includes(match.approved_role)) {
      await db.query(
        `UPDATE tlc_identities SET connect_eligible=true,status='full',
           connect_source='approved_role_lookup',connect_exception='ordained_role',updated_at=now()
         WHERE id=$1`,
        [match.identity_id],
      );
      ordainedExceptions += 1;
    }
    if (match.previous_role !== match.approved_role) {
      await L.setIdentityPublicId(db, match.identity_id, {
        roleCode: match.approved_role,
        source: "approved_role_lookup_import",
        actor: "data_team_approved_file",
      });
      await db.query(
        "UPDATE wallet_pass_state SET updated_at=now() WHERE identity_id=$1",
        [match.identity_id],
      );
      changed += 1;
    }
  }
  process.stdout.write(`${JSON.stringify({
    imported: rows.length,
    matchedIdentities: matches.length,
    changedIdentities: changed,
    ordainedExceptions,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
