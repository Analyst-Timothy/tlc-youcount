const L = require("./_lib");

const COOKIE = "tlc_service_display";
const configuredPin = () => String(process.env.SERVICE_DISPLAY_PIN || "");

function cookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((part) => part.length === 2),
  );
}

function sessionValue() {
  const expires = Date.now() + 14 * 60 * 60 * 1000;
  return `${expires}.${L.hash(`service-display:${expires}`)}`;
}

function authorised(req) {
  const value = cookies(req)[COOKIE];
  if (!value) return false;
  const [expires, signature] = value.split(".");
  return (
    Number(expires) > Date.now() &&
    L.safeEqual(signature || "", L.hash(`service-display:${expires}`))
  );
}

function number(value) {
  return Number(value || 0);
}

function aggregateLocations(
  checkinBreakdown = [],
  headcountBreakdown = [],
  locationAttendanceRows = [],
) {
  const locations = new Map();
  for (const row of [
    ...checkinBreakdown,
    ...headcountBreakdown,
    ...locationAttendanceRows,
  ]) {
    const key = row.location;
    const current = locations.get(key) || {
      location: row.location,
      identified: 0,
      roomTotal: 0,
      enteredAttendance: 0,
    };
    if (row.identified != null) current.identified = number(row.identified);
    if (row.room_total != null) current.roomTotal = number(row.room_total);
    if (row.attendance != null)
      current.enteredAttendance = number(row.attendance);
    locations.set(key, current);
  }
  return [...locations.values()];
}

async function summary(db) {
  const [journey] = await db.query(`
      SELECT
        count(*) FILTER (
          WHERE started_at >= date_trunc('day',now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London'
        )::int AS started_today,
        count(*) FILTER (
          WHERE completed_at >= date_trunc('day',now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London'
        )::int AS completed_today,
        count(*) FILTER (
          WHERE status='active' AND last_seen_at>now()-interval '5 minutes'
        )::int AS active_now,
        count(*) FILTER (
          WHERE status='active' AND last_seen_at>now()-interval '5 minutes'
            AND stage_entered_at<now()-interval '5 minutes'
        )::int AS may_need_help,
        count(*) FILTER (
          WHERE completed_at>now()-interval '15 minutes'
        )::int AS completed_last_15,
        coalesce(avg(extract(epoch FROM (completed_at-started_at))/60)
          FILTER (WHERE completed_at >= date_trunc('day',now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London'),0) AS average_minutes,
        coalesce(percentile_cont(0.5) WITHIN GROUP (
          ORDER BY extract(epoch FROM (completed_at-started_at))/60
        ) FILTER (WHERE completed_at >= date_trunc('day',now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London'),0) AS median_minutes
      FROM journey_presence
    `),
    targetRows = await db.query(`
      SELECT service_attendance,updated_at FROM operations_settings
      WHERE setting_date=(now() AT TIME ZONE 'Europe/London')::date
    `),
    checkinRows = await db.query(`
      SELECT count(*)::int AS count FROM checkin_events
      WHERE service_date=(now() AT TIME ZONE 'Europe/London')::date
    `),
    headcountRows = await db.query(`
      SELECT coalesce(sum(male_count+female_count+children_count),0)::int AS total,
             max(updated_at) AS updated_at
      FROM attendance_headcounts
      WHERE service_date=(now() AT TIME ZONE 'Europe/London')::date
    `),
    locationAttendanceRows = await db.query(`
      SELECT location,attendance,updated_at
      FROM operations_location_attendance
      WHERE setting_date=(now() AT TIME ZONE 'Europe/London')::date
      ORDER BY location
    `),
    failures = await db.query(`
      SELECT count(*)::int AS count FROM audit_events
      WHERE created_at>now()-interval '60 minutes'
        AND outcome IN ('failed','no_match','no_contact_match','locked','not_sent')
    `),
    stages = await db.query(`
      SELECT stage,stage_label,count(*)::int AS count
      FROM journey_presence
      WHERE status='active' AND last_seen_at>now()-interval '5 minutes'
      GROUP BY stage,stage_label ORDER BY min(stage_entered_at)
    `),
    timeline = await db.query(`
      SELECT to_char(completed_at AT TIME ZONE 'Europe/London','HH24:00') AS label,
             count(*)::int AS count
      FROM journey_presence
      WHERE completed_at >= date_trunc('day',now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London'
      GROUP BY 1 ORDER BY 1
    `),
    journeyTypes = await db.query(`
      SELECT journey_type,
             count(*) FILTER (
               WHERE started_at >= date_trunc('day',now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London'
             )::int AS started,
             count(*) FILTER (
               WHERE completed_at >= date_trunc('day',now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London'
             )::int AS completed
      FROM journey_presence
      WHERE started_at >= date_trunc('day',now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London'
      GROUP BY journey_type ORDER BY journey_type
    `),
    checkinBreakdown = await db.query(`
      SELECT location,count(*)::int AS identified
      FROM checkin_events
      WHERE service_date=(now() AT TIME ZONE 'Europe/London')::date
      GROUP BY location ORDER BY location
    `),
    headcountBreakdown = await db.query(`
      SELECT location,
             sum(male_count+female_count+children_count)::int AS room_total
      FROM attendance_headcounts
      WHERE service_date=(now() AT TIME ZONE 'Europe/London')::date
      GROUP BY location ORDER BY location
    `);

  const enteredAttendance = number(targetRows[0]?.service_attendance),
    locationEnteredAttendance = locationAttendanceRows.reduce(
      (total, row) => total + number(row.attendance),
      0,
    ),
    roomAttendance = number(headcountRows[0]?.total),
    attendance = locationEnteredAttendance || roomAttendance || enteredAttendance,
    completed = number(journey?.completed_today);

  return {
    ok: true,
    date: new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }),
    refreshedAt: new Date().toISOString(),
    summary: {
      attendance,
      attendanceSource: locationEnteredAttendance
        ? "Location attendance"
        : roomAttendance
          ? "Room headcount"
          : enteredAttendance
            ? "Service attendance"
            : "Not entered",
      attendanceUpdatedAt: locationEnteredAttendance
        ? locationAttendanceRows.reduce(
            (latest, row) =>
              !latest || new Date(row.updated_at) > new Date(latest)
                ? row.updated_at
                : latest,
            null,
          )
        : roomAttendance
          ? headcountRows[0]?.updated_at || null
          : targetRows[0]?.updated_at || null,
      enteredAttendance,
      locationEnteredAttendance,
      roomAttendance,
      identifiedCheckins: number(checkinRows[0]?.count),
      startedToday: number(journey?.started_today),
      completedToday: completed,
      activeNow: number(journey?.active_now),
      mayNeedHelp: number(journey?.may_need_help),
      completedLast15: number(journey?.completed_last_15),
      averageMinutes: Math.round(number(journey?.average_minutes) * 10) / 10,
      medianMinutes: Math.round(number(journey?.median_minutes) * 10) / 10,
      verificationIssues: number(failures[0]?.count),
      completionRate: attendance ? Math.min(100, Math.round((completed / attendance) * 100)) : 0,
    },
    stages: stages.map((row) => ({
      stage: row.stage,
      label: row.stage_label,
      count: number(row.count),
    })),
    timeline: timeline.map((row) => ({ label: row.label, count: number(row.count) })),
    journeyTypes: journeyTypes.map((row) => ({
      type: row.journey_type,
      started: number(row.started),
      completed: number(row.completed),
    })),
    locations: aggregateLocations(
      checkinBreakdown,
      headcountBreakdown,
      locationAttendanceRows,
    ),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return L.json(res, 405, { ok: false });
  res.setHeader("Cache-Control", "no-store");
  try {
    const action = String(req.body?.action || ""),
      ipHash = L.hash(L.clientIp(req));
    if (action === "login") {
      const db = await L.initDb(),
        submitted = String(req.body?.pin || "");
      if (!(await L.consumeRate(db, "service_display_login", ipHash, 10, 30)))
        return L.json(res, 429, { ok: false, message: "Too many attempts. Ask the service lead for access." });
      if (!configuredPin() || !L.safeEqual(submitted, configuredPin())) {
        await L.audit(db, null, ipHash, "service_display_login", null, "failed");
        return L.json(res, 401, {
          ok: false,
          message: configuredPin() ? "That display PIN was not recognised." : "The display PIN has not been configured yet.",
        });
      }
      res.setHeader(
        "Set-Cookie",
        `${COOKIE}=${sessionValue()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=50400`,
      );
      await L.audit(db, null, ipHash, "service_display_login", null, "approved");
      return L.json(res, 200, { ok: true });
    }
    if (action === "logout") {
      res.setHeader(
        "Set-Cookie",
        `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      );
      return L.json(res, 200, { ok: true });
    }
    if (!authorised(req)) return L.json(res, 401, { ok: false });
    if (action !== "summary") return L.json(res, 400, { ok: false });
    return L.json(res, 200, await summary(await L.initDb()));
  } catch (error) {
    console.error("Service display failed", error.message);
    return L.json(res, 503, {
      ok: false,
      message: "The live service display is temporarily unavailable.",
    });
  }
};

module.exports._aggregateLocations = aggregateLocations;
