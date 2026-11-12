const fs = require("node:fs");
const L = require("../api/_lib");

function parseCsv(input) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row); row = []; field = "";
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
  const rows = parseCsv(fs.readFileSync(filename, "utf8"));
  const allowed = new Set(["OP", "OM", "OA", "OD", "OC", "TL", "SG", "TM"]),
    priority = new Map(["OP", "OM", "OA", "OD", "OC", "TL", "SG", "TM"].map((code, index) => [code, index])),
    byPerson = new Map(),
    emailCounts = new Map(),
    codeCounts = {};
  for (const row of rows) {
    const personId = String(row["Person ID"] || "").trim(),
      code = String(row.Code || "").trim().toUpperCase(),
      email = String(row.Email || "").trim().toLowerCase();
    if (!/^\d+$/.test(personId) || !allowed.has(code))
      throw new Error(`Invalid role row for Planning Center ID ${personId || "missing"}.`);
    if (byPerson.has(personId)) throw new Error(`Duplicate Planning Center ID ${personId}.`);
    byPerson.set(personId, code);
    codeCounts[code] = (codeCounts[code] || 0) + 1;
    if (email) emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
  }
  const db = await L.initDb(),
    links = await db.query(
      `SELECT p.identity_id,p.planning_center_id,i.role_code
       FROM tlc_identity_profiles p JOIN tlc_identities i ON i.id=p.identity_id
       ORDER BY p.identity_id`,
    ),
    grouped = new Map();
  for (const link of links) {
    const code = byPerson.get(String(link.planning_center_id));
    if (!code) continue;
    const current = grouped.get(String(link.identity_id));
    if (!current || priority.get(code) < priority.get(current.proposedRole))
      grouped.set(String(link.identity_id), {
        identityId: String(link.identity_id),
        currentRole: link.role_code || null,
        proposedRole: code,
      });
  }
  const changes = [...grouped.values()].filter((item) => item.currentRole !== item.proposedRole);
  process.stdout.write(`${JSON.stringify({
    rows: rows.length,
    codeCounts,
    duplicateEmailAddresses: [...emailCounts.values()].filter((count) => count > 1).length,
    linkedProfiles: links.length,
    matchedIdentities: grouped.size,
    proposedChanges: changes,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
