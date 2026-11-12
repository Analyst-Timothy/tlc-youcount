const { execFileSync } = require("child_process");
const L = require("../api/_lib");

const [connectFile, ordainedFile] = process.argv.slice(2);
if (!connectFile || !ordainedFile) {
  console.error("Usage: node scripts/import-connect-registry.js <connect.xlsx> <ordained.xlsx>");
  process.exit(1);
}

function xmlText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)));
}

function zipEntry(file, entry, optional = false) {
  try {
    return execFileSync("unzip", ["-p", file, entry], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    if (optional) return "";
    throw error;
  }
}

function worksheet(file, sheetNumber) {
  const sharedXml = zipEntry(file, "xl/sharedStrings.xml", true),
    shared = [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) =>
      [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
        .map((part) => xmlText(part[1]))
        .join(""),
    ),
    sheet = zipEntry(file, `xl/worksheets/sheet${sheetNumber}.xml`),
    rows = [];
  for (const rowMatch of sheet.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const row = {};
    for (const cell of rowMatch[1].matchAll(/<c\s+([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = cell[1].match(/\br="([A-Z]+)\d+"/)?.[1],
        type = cell[1].match(/\bt="([^"]+)"/)?.[1] || "",
        raw = cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1] ??
          cell[2].match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)?.[1] ?? "";
      if (!ref) continue;
      row[ref] = type === "s" ? shared[Number(raw)] || "" : xmlText(raw);
    }
    rows.push(row);
  }
  const headers = rows.shift() || {},
    byColumn = Object.fromEntries(Object.entries(headers).map(([column, name]) => [column, String(name).trim()]));
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([column, value]) => [byColumn[column] || column, String(value).trim()]),
    ),
  );
}

function phoneForms(value) {
  const digits = L.digits(value), forms = new Set();
  if (!digits) return [];
  forms.add(digits);
  if (digits.startsWith("44") && digits.length >= 11) forms.add(`0${digits.slice(2)}`);
  if (digits.startsWith("0") && digits.length >= 10) forms.add(`44${digits.slice(1)}`);
  return [...forms];
}

function identifiers(row, ordained = false) {
  const result = [],
    pcId = String(row[ordained ? "Person ID" : "Planning Center ID"] || "").replace(/\.0$/, ""),
    emails = [
      row[ordained ? "Primary Email" : "Email"],
      ...String(row["Other emails"] || "").split(/[;,|\n]+/),
    ],
    phones = [row[ordained ? "Primary Phone" : "Mobile"]];
  if (/^\d+$/.test(pcId)) result.push(["planning_center_id", `connect:pc:${pcId}`]);
  for (const email of emails) {
    const normalized = L.normalizeEmail(email);
    if (normalized && normalized.includes("@")) result.push(["email", `connect:email:${normalized}`]);
  }
  for (const phone of phones)
    for (const normalized of phoneForms(phone)) result.push(["phone", `connect:phone:${normalized}`]);
  return result;
}

async function main() {
  const db = await L.migrateDb(),
    completed = worksheet(connectFile, 2),
    ordained = worksheet(ordainedFile, 3),
    entries = new Map();
  for (const row of completed)
    for (const [type, value] of identifiers(row))
      entries.set(`${type}:${value}`, {
        type,
        hash: L.hash(value),
        eligibility: "completed",
        source: "connect_completers_consolidated",
        date: row["Connect date (best)"] || row["Connect year"] || null,
      });
  for (const row of ordained)
    for (const [type, value] of identifiers(row, true)) {
      const key = `${type}:${value}`;
      if (!entries.has(key))
        entries.set(key, {
          type,
          hash: L.hash(value),
          eligibility: "ordained_exception",
          source: "ordained_leaders_exception",
          date: null,
        });
    }
  await db.query("BEGIN");
  try {
    for (const entry of entries.values())
      await db.query(
        `INSERT INTO connect_eligibility_registry(identifier_type,identifier_hash,eligibility,source,connect_date)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(identifier_type,identifier_hash) DO UPDATE SET
           eligibility=CASE WHEN connect_eligibility_registry.eligibility='completed' THEN 'completed' ELSE excluded.eligibility END,
           source=CASE WHEN connect_eligibility_registry.eligibility='completed' THEN connect_eligibility_registry.source ELSE excluded.source END,
           connect_date=COALESCE(connect_eligibility_registry.connect_date,excluded.connect_date),
           imported_at=now()`,
        [entry.type, entry.hash, entry.eligibility, entry.source, entry.date],
      );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
  const profiles = await db.query(
    `SELECT DISTINCT p.identity_id,p.planning_center_id
     FROM tlc_identity_profiles p`,
  );
  let identitiesUpdated = 0;
  for (const profile of profiles) {
    const match = await db.query(
      `SELECT eligibility,source FROM connect_eligibility_registry
       WHERE identifier_type='planning_center_id' AND identifier_hash=$1 LIMIT 1`,
      [L.hash(`connect:pc:${String(profile.planning_center_id).trim()}`)],
    );
    if (!match.length) continue;
    const exempt = match[0].eligibility === "ordained_exception";
    await db.query(
      `UPDATE tlc_identities SET connect_completed=$1,connect_eligible=true,status='full',
         connect_source=$2,connect_exception=$3,updated_at=now() WHERE id=$4`,
      [!exempt, match[0].source, exempt ? "ordained_leader" : null, profile.identity_id],
    );
    await L.setIdentityPublicId(db, profile.identity_id, {
      eligible: true,
      exception: exempt ? "ordained_leader" : null,
    });
    identitiesUpdated += 1;
  }
  const counts = await db.query(
    `SELECT eligibility,count(*)::int AS identifiers
     FROM connect_eligibility_registry GROUP BY eligibility ORDER BY eligibility`,
  );
  console.log(JSON.stringify({ completedRows: completed.length, ordainedRows: ordained.length, identifiers: entries.size, identitiesUpdated, registry: counts }));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
