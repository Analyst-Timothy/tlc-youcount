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

const DISPLAY_LOCATIONS = [
  "Liberty Point Woodford",
  "North London",
  "Canary Wharf",
  "Croydon",
  "Birmingham",
  "Lagos",
  "Houston",
  "e-TLC",
];
const londonDate = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const selectedDate = (value) => {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return londonDate();
  const today = new Date(`${londonDate()}T12:00:00Z`),
    requested = new Date(`${date}T12:00:00Z`),
    days = Math.round((today - requested) / 86400000);
  return days >= 0 && days <= 31 ? date : londonDate();
};
const selectedLocation = (value) =>
  DISPLAY_LOCATIONS.includes(String(value || "")) ? String(value) : "";

function aggregateLocations(
  checkinBreakdown = [],
  headcountBreakdown = [],
  locationAttendanceRows = [],
  completionBreakdown = [],
) {
  const locations = new Map();
  for (const row of [
    ...checkinBreakdown,
    ...headcountBreakdown,
    ...locationAttendanceRows,
    ...completionBreakdown,
  ]) {
    const key = row.location;
    const current = locations.get(key) || {
      location: row.location,
      identified: 0,
      roomTotal: 0,
      enteredAttendance: 0,
      completed: 0,
    };
    if (row.identified != null) current.identified = number(row.identified);
    if (row.room_total != null) current.roomTotal = number(row.room_total);
    if (row.attendance != null)
      current.enteredAttendance = number(row.attendance);
    if (row.completed != null) current.completed = number(row.completed);
    locations.set(key, current);
  }
  return [...locations.values()];
}

async function summary(db, options = {}) {
  const date = selectedDate(options.date),
    location = selectedLocation(options.location),
    today = londonDate();
  const [journey] = await db.query(`
      SELECT
        count(*) FILTER (
          WHERE (started_at AT TIME ZONE 'Europe/London')::date=$1::date
            AND ($2='' OR location=$2)
        )::int AS started_today,
        count(*) FILTER (
          WHERE $1::date=(now() AT TIME ZONE 'Europe/London')::date
            AND status='active' AND last_seen_at>now()-interval '5 minutes'
            AND ($2='' OR location=$2)
        )::int AS active_now,
        count(*) FILTER (
          WHERE $1::date=(now() AT TIME ZONE 'Europe/London')::date
            AND status='active' AND last_seen_at>now()-interval '5 minutes'
            AND stage_entered_at<now()-interval '5 minutes'
            AND ($2='' OR location=$2)
        )::int AS may_need_help,
        coalesce(avg(extract(epoch FROM (completed_at-started_at))/60)
          FILTER (WHERE (completed_at AT TIME ZONE 'Europe/London')::date=$1::date
            AND ($2='' OR location=$2)),0) AS average_minutes,
        coalesce(percentile_cont(0.5) WITHIN GROUP (
          ORDER BY extract(epoch FROM (completed_at-started_at))/60
        ) FILTER (WHERE (completed_at AT TIME ZONE 'Europe/London')::date=$1::date
          AND ($2='' OR location=$2)),0) AS median_minutes
      FROM journey_presence
    `, [date, location]),
    [completionStats] = await db.query(`
      SELECT count(*)::int AS completed,
             count(*) FILTER (WHERE completed_at>now()-interval '15 minutes')::int AS completed_last_15
      FROM operations_location_completions
      WHERE completion_date=$1::date AND ($2='' OR location=$2)
    `, [date, location]),
    targetRows = await db.query(`
      SELECT service_attendance,updated_at FROM operations_settings
      WHERE setting_date=$1::date
    `, [date]),
    checkinRows = await db.query(`
      SELECT count(*)::int AS count FROM checkin_events
      WHERE service_date=$1::date AND ($2='' OR
        CASE WHEN location='Woodford' THEN 'Liberty Point Woodford' ELSE location END=$2)
    `, [date, location]),
    headcountRows = await db.query(`
      SELECT coalesce(sum(male_count+female_count+children_count),0)::int AS total,
             max(updated_at) AS updated_at
      FROM attendance_headcounts
      WHERE service_date=$1::date AND ($2='' OR
        CASE WHEN location='Woodford' THEN 'Liberty Point Woodford' ELSE location END=$2)
    `, [date, location]),
    locationAttendanceRows = await db.query(`
      SELECT location,attendance,updated_at
      FROM operations_location_attendance
      WHERE setting_date=$1::date AND ($2='' OR location=$2)
      ORDER BY location
    `, [date, location]),
    failures = await db.query(`
      SELECT count(*)::int AS count FROM audit_events
      WHERE ($1::date<>(now() AT TIME ZONE 'Europe/London')::date OR created_at>now()-interval '60 minutes')
        AND (created_at AT TIME ZONE 'Europe/London')::date=$1::date
        AND outcome IN ('failed','no_match','no_contact_match','locked','not_sent')
    `, [date]),
    stages = await db.query(`
      SELECT stage,stage_label,count(*)::int AS count
      FROM journey_presence
      WHERE $1::date=(now() AT TIME ZONE 'Europe/London')::date
        AND status='active' AND last_seen_at>now()-interval '5 minutes'
        AND ($2='' OR location=$2)
      GROUP BY stage,stage_label ORDER BY min(stage_entered_at)
    `, [date, location]),
    timeline = await db.query(`
      SELECT to_char(completed_at AT TIME ZONE 'Europe/London','HH24:00') AS label,
             count(*)::int AS count
      FROM operations_location_completions
      WHERE completion_date=$1::date AND ($2='' OR location=$2)
      GROUP BY 1 ORDER BY 1
    `, [date, location]),
    journeyTypes = await db.query(`
      SELECT journey_type,
             count(*) FILTER (
               WHERE (started_at AT TIME ZONE 'Europe/London')::date=$1::date
                 AND ($2='' OR location=$2)
             )::int AS started,
             count(*) FILTER (
               WHERE (completed_at AT TIME ZONE 'Europe/London')::date=$1::date
                 AND ($2='' OR location=$2)
             )::int AS completed
      FROM journey_presence
      WHERE (started_at AT TIME ZONE 'Europe/London')::date=$1::date
        AND ($2='' OR location=$2)
      GROUP BY journey_type ORDER BY journey_type
    `, [date, location]),
    checkinBreakdown = await db.query(`
      SELECT CASE WHEN location='Woodford' THEN 'Liberty Point Woodford' ELSE location END AS location,
             count(*)::int AS identified
      FROM checkin_events
      WHERE service_date=$1::date AND ($2='' OR
        CASE WHEN location='Woodford' THEN 'Liberty Point Woodford' ELSE location END=$2)
      GROUP BY 1 ORDER BY 1
    `, [date, location]),
    headcountBreakdown = await db.query(`
      SELECT CASE WHEN location='Woodford' THEN 'Liberty Point Woodford' ELSE location END AS location,
             sum(male_count+female_count+children_count)::int AS room_total
      FROM attendance_headcounts
      WHERE service_date=$1::date AND ($2='' OR
        CASE WHEN location='Woodford' THEN 'Liberty Point Woodford' ELSE location END=$2)
      GROUP BY 1 ORDER BY 1
    `, [date, location]),
    completionBreakdown = await db.query(`
      SELECT location,count(*)::int AS completed
      FROM operations_location_completions
      WHERE completion_date=$1::date AND ($2='' OR location=$2)
      GROUP BY location ORDER BY location
    `, [date, location]);

  const enteredAttendance = number(targetRows[0]?.service_attendance),
    locationEnteredAttendance = locationAttendanceRows.reduce(
      (total, row) => total + number(row.attendance),
      0,
    ),
    roomAttendance = number(headcountRows[0]?.total),
    attendance = locationEnteredAttendance || roomAttendance || enteredAttendance,
    completed = number(completionStats?.completed);

  return {
    ok: true,
    date,
    selectedLocation: location || "all",
    availableLocations: DISPLAY_LOCATIONS,
    isToday: date === today,
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
      completedLast15: date === today ? number(completionStats?.completed_last_15) : 0,
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
      completionBreakdown,
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
    return L.json(res, 200, await summary(await L.initDb(), req.body || {}));
  } catch (error) {
    console.error("Service display failed", error.message);
    return L.json(res, 503, {
      ok: false,
      message: "The live service display is temporarily unavailable.",
    });
  }
};

module.exports._aggregateLocations = aggregateLocations;
module.exports._summary = summary;
module.exports._selectedDate = selectedDate;
