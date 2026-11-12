const L = require("../api/_lib");

async function main() {
  const db = await L.initDb();
  const identities = await db.query(
    "SELECT id,identity_number,public_id FROM tlc_identities ORDER BY id",
  );
  const aliases = await db.query(
    "SELECT alias,identity_id FROM tlc_identity_aliases ORDER BY identity_id,alias",
  );
  let checked = 0;
  for (const identity of identities) {
    const inputs = [
      identity.identity_number,
      identity.public_id,
      String(identity.public_id).toLowerCase().replace(/\s/g, ""),
    ];
    for (const input of inputs) {
      const compact = String(input).toUpperCase().replace(/[^A-Z0-9]/g, ""),
        number = compact.match(
          /^(?:OP|OM|OA|OD|OC|TL|SG|TM|CM|AT|V)?([1-9]\d{5})$/,
        )?.[1];
      const found = await db.query(
        "SELECT id FROM tlc_identities WHERE identity_number=$1 LIMIT 1",
        [number],
      );
      if (String(found[0]?.id) !== String(identity.id))
        throw new Error(`lookup_failed_identity_${identity.id}`);
      checked += 1;
    }
  }
  for (const alias of aliases) {
    const found = await db.query(
      `SELECT i.id FROM tlc_identities i
       WHERE EXISTS(SELECT 1 FROM tlc_identity_aliases a
         WHERE a.identity_id=i.id AND upper(a.alias)=upper($1)) LIMIT 1`,
      [alias.alias],
    );
    if (String(found[0]?.id) !== String(alias.identity_id))
      throw new Error(`alias_lookup_failed_identity_${alias.identity_id}`);
    checked += 1;
  }
  process.stdout.write(
    `${JSON.stringify({ ok: true, identities: identities.length, aliases: aliases.length, lookups: checked })}\n`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
