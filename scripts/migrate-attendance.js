const L = require("../api/_lib");

async function main() {
  const db = await L.migrateDb();
  const tables = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('attendance_events','attendance_headcount_readings')
    ORDER BY table_name
  `);
  const [legacy] = await db.query("SELECT count(*)::int AS count FROM attendance_headcounts"),
    [events] = await db.query("SELECT count(*)::int AS count FROM attendance_events"),
    [readings] = await db.query("SELECT count(*)::int AS count FROM attendance_headcount_readings");
  const planningCenter = {};
  for (const [app, path] of [
    ["check-ins", "/event_times?per_page=1"],
    ["calendar", "/events?per_page=1"],
    ["services", "/service_types?per_page=1"],
  ]) {
    try {
      const response = await L.pcAppFetch(app, path);
      planningCenter[app] = Array.isArray(response.data) ? "reachable" : "unexpected_response";
    } catch {
      planningCenter[app] = "unavailable_or_not_permitted";
    }
  }
  console.log(JSON.stringify({
    ok: tables.length === 2,
    tables: tables.map((row) => row.table_name),
    legacyHeadcounts: Number(legacy?.count || 0),
    attendanceEvents: Number(events?.count || 0),
    attendanceReadings: Number(readings?.count || 0),
    planningCenter,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
