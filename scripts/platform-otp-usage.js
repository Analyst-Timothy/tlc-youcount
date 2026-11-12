const L = require("../api/_lib");

async function main() {
  const db = await L.initDb();
  const rows = await db.query(`
    SELECT
      count(*) FILTER (WHERE event='otp_requested' AND outcome='sent')::int AS sms_sent,
      count(*) FILTER (WHERE event='otp_requested' AND outcome='not_sent')::int AS sms_not_sent,
      count(*) FILTER (WHERE event='otp_verified' AND outcome='approved')::int AS verified,
      count(*) FILTER (WHERE event='otp_requested' AND outcome='sent'
        AND created_at >= date_trunc('month',now()))::int AS sms_sent_this_month,
      count(*) FILTER (WHERE event='otp_verified' AND outcome='approved'
        AND created_at >= date_trunc('month',now()))::int AS verified_this_month,
      count(*) FILTER (WHERE event='otp_requested' AND outcome='sent'
        AND (created_at AT TIME ZONE 'Europe/London')::date =
            (now() AT TIME ZONE 'Europe/London')::date)::int AS sms_sent_today,
      count(*) FILTER (WHERE event='otp_verified' AND outcome='approved'
        AND (created_at AT TIME ZONE 'Europe/London')::date =
            (now() AT TIME ZONE 'Europe/London')::date)::int AS verified_today,
      min(created_at) FILTER (WHERE event='otp_requested' AND outcome='sent') AS first_sent,
      max(created_at) FILTER (WHERE event='otp_requested' AND outcome='sent') AS last_sent
    FROM audit_events
  `);
  process.stdout.write(`${JSON.stringify(rows[0], null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
