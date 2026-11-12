const L = require("./_lib");

// Public capability check. Returns booleans and aggregate cache health only;
// never returns secret values or member data.
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false });
  }

  let profileCache = { ready: false, profiles: 0, lastSyncedAt: null };
  try {
    const db = await L.initDb(),
      state = await db.query(
        `SELECT value,updated_at FROM pc_sync_state
         WHERE name='people_cache_ready' LIMIT 1`,
      ),
      counts = await db.query(
        `SELECT count(*) FILTER (WHERE active=true)::int AS active,
                count(*) FILTER (WHERE active=true AND source_status='active')::int AS "activeProfiles",
                count(*) FILTER (WHERE active=true AND source_status='inactive')::int AS "inactiveProfiles",
                max(synced_at) FILTER (WHERE active=true) AS "lastSyncedAt"
         FROM pc_people_cache WHERE key_fingerprint=$1`,
        [L.hash("pc-cache-key-v1")],
      );
    profileCache = {
      ready: state[0]?.value === L.hash("pc-cache-key-v1"),
      profiles: Number(counts[0]?.active || 0),
      activeProfiles: Number(counts[0]?.activeProfiles || 0),
      inactiveProfiles: Number(counts[0]?.inactiveProfiles || 0),
      lastSyncedAt: counts[0]?.lastSyncedAt || state[0]?.updated_at || null,
    };
  } catch {}

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    delivery: {
      sms: Boolean(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_VERIFY_SERVICE_SID
      ),
      email: Boolean(process.env.SENDGRID_API_KEY || process.env.RESEND_API_KEY)
    },
    addressLookup: Boolean(process.env.IDEAL_POSTCODES_API_KEY),
    googleWallet: Boolean(
      process.env.GOOGLE_WALLET_ISSUER_ID &&
      (process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_BASE64 ||
        process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON)
    ),
    planningCenter: Boolean(process.env.pc_clientid && process.env.pc_secret),
    database: Boolean(process.env.DATABASE_URL || process.env.tlc_DATABASE_URL),
    profileCache,
  });
};
