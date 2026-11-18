const L = require("./api/_lib");

const COOKIE = "tlc_checkin_staff";
const LOCATIONS = [
  "Liberty Point Woodford",
  "North London",
  "Canary Wharf",
  "Croydon",
  "Birmingham",
  "Lagos",
  "Houston",
  "Other",
];
const configuredPin = () => String(process.env.CHECKIN_STAFF_PIN || "");
const cookieMap = (req) =>
  Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((part) => part.length === 2),
  );
function sessionValue() {
  const expires = Date.now() + 12 * 60 * 60 * 1000;
  return `${expires}.${L.hash(`checkin-staff:${expires}`)}`;
}
function authorised(req) {
  const value = cookieMap(req)[COOKIE];
  if (!value) return false;
  const [expires, signature] = value.split(".");
  return (
    Number(expires) > Date.now() &&
    L.safeEqual(signature || "", L.hash(`checkin-staff:${expires}`))
  );
}
const clean = (value, max = 80) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9 &'().-]/g, "")
    .slice(0, max);
const canonicalLocation = (value) => {
  const location = clean(value);
  return location === "Woodford" ? "Liberty Point Woodford" : location;
};
const DEFAULT_SERVICES = [
  { name: "First Sunday Service", startsAt: "09:00" },
  { name: "Second Sunday Service", startsAt: "11:30" },
];
const validDate = (value, fallback) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : fallback;
const cleanTime = (value) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""))
    ? String(value)
    : null;
async function ensureEvent(db, details = {}) {
  const date = validDate(details.date, new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" })),
    location = canonicalLocation(details.location),
    name = clean(details.name || details.service),
    startsAt = cleanTime(details.startsAt),
    endsAt = cleanTime(details.endsAt),
    eventType = clean(details.eventType || "service", 30).toLowerCase() || "service",
    source = clean(details.source || "local", 40).toLowerCase() || "local",
    externalApp = clean(details.externalApp, 40) || null,
    externalId = clean(details.externalId, 120) || null;
  if (!location || !name) throw new Error("attendance_event_invalid");
  const rows = await db.query(
    `INSERT INTO attendance_events(
       event_date,location,name,starts_at,ends_at,event_type,source,
       external_app,external_id,status,created_by
     ) VALUES($1::date,$2,$3,$4::time,$5::time,$6,$7,$8,$9,'planned',$10)
     ON CONFLICT(event_date,location,name) DO UPDATE SET
       starts_at=COALESCE(excluded.starts_at,attendance_events.starts_at),
       ends_at=COALESCE(excluded.ends_at,attendance_events.ends_at),
       event_type=COALESCE(excluded.event_type,attendance_events.event_type),
       external_app=COALESCE(excluded.external_app,attendance_events.external_app),
       external_id=COALESCE(excluded.external_id,attendance_events.external_id),
       updated_at=now()
     RETURNING id,event_date,location,name,starts_at,ends_at,event_type,source,
       external_app,external_id,status`,
    [date, location, name, startsAt, endsAt, eventType, source, externalApp, externalId, details.createdBy || "TED team"],
  );
  return rows[0];
}
async function ensureDefaultServices(db, date, location) {
  if (!location) return;
  await db.query(
    `INSERT INTO attendance_events(
       event_date,location,name,starts_at,event_type,source,status,created_by
     ) VALUES
       ($1::date,$2,$3,$4::time,'sunday_service','default','planned','system'),
       ($1::date,$2,$5,$6::time,'sunday_service','default','planned','system')
     ON CONFLICT(event_date,location,name) DO UPDATE SET
       event_type='sunday_service',starts_at=excluded.starts_at,updated_at=now()`,
    [date, location, DEFAULT_SERVICES[0].name, DEFAULT_SERVICES[0].startsAt,
      DEFAULT_SERVICES[1].name, DEFAULT_SERVICES[1].startsAt],
  );
}
const eventJson = (row) => ({
  id: Number(row.id),
  date: String(row.event_date),
  location: row.location,
  name: row.name,
  startsAt: row.starts_at ? String(row.starts_at).slice(0, 5) : "",
  endsAt: row.ends_at ? String(row.ends_at).slice(0, 5) : "",
  eventType: row.event_type,
  source: row.source,
  externalApp: row.external_app || "",
  externalId: row.external_id || "",
  status: row.status,
});

function readingSummary(rows = []) {
  const readings = rows.map((row) => {
    const male = Number(row.male_count || 0),
      female = Number(row.female_count || 0),
      children = Number(row.children_count || 0),
      unassigned = Number(row.unassigned_count || 0),
      mainChurch = Number(row.main_church_count || 0) || male + female + unassigned,
      teenagers = Number(row.teenager_count || 0);
    return {
      id: Number(row.id),
      reading: Number(row.reading_number),
      male,
      female,
      children,
      mainChurch,
      teenagers,
      unassigned,
      total: mainChurch + children + teenagers,
      notes: row.notes || "",
      device: row.device_label || "",
      recordedAt: row.recorded_at,
      updatedAt: row.updated_at,
    };
  });
  const totals = readings.map((item) => item.total),
    official = totals.length
      ? Math.round(totals.reduce((sum, total) => sum + total, 0) / totals.length)
      : 0;
  return {
    readings,
    official,
    provisional: readings.length < 3,
    lowest: totals.length ? Math.min(...totals) : 0,
    highest: totals.length ? Math.max(...totals) : 0,
    spread: totals.length ? Math.max(...totals) - Math.min(...totals) : 0,
  };
}

async function importPlanningCenterEvents(db, date, location) {
  const imported = [];
  let document;
  try {
    document = await L.pcAppFetch(
      "check-ins",
      "/event_times?include=event&per_page=100&order=starts_at",
    );
  } catch {
    throw new Error("planning_center_events_unavailable");
  }
  const eventNames = new Map(
    (document.included || [])
      .filter((item) => String(item.type || "").toLowerCase() === "event")
      .map((item) => [String(item.id), clean(item.attributes?.name || "Planning Center event")]),
  );
  for (const item of document.data || []) {
    const startsAt = item.attributes?.starts_at;
    if (!startsAt) continue;
    const startsDate = new Date(startsAt).toLocaleDateString("en-CA", {
      timeZone: "Europe/London",
    });
    if (startsDate !== date) continue;
    const eventId = String(item.relationships?.event?.data?.id || ""),
      name = eventNames.get(eventId) || clean(item.attributes?.name) || "Planning Center event",
      time = new Date(startsAt).toLocaleTimeString("en-GB", {
        timeZone: "Europe/London",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    imported.push(
      await ensureEvent(db, {
        date,
        location,
        name,
        startsAt: time,
        source: "planning_center",
        externalApp: "check-ins",
        externalId: String(item.id),
        createdBy: "Planning Center import",
      }),
    );
  }
  return imported;
}

async function saveReading(db, event, details = {}) {
  const reading = Math.max(1, Math.min(3, Math.round(Number(details.reading) || 1))),
    male = Math.max(0, Math.min(50000, Math.round(Number(details.male) || 0))),
    female = Math.max(0, Math.min(50000, Math.round(Number(details.female) || 0))),
    children = Math.max(0, Math.min(50000, Math.round(Number(details.children) || 0))),
    unassigned = Math.max(0, Math.min(50000, Math.round(Number(details.unassigned) || 0))),
    mainChurch = Math.max(0, Math.min(50000, Math.round(Number(details.mainChurch) || male + female + unassigned))),
    teenagers = Math.max(0, Math.min(50000, Math.round(Number(details.teenagers) || 0))),
    notes = String(details.notes || "").trim().slice(0, 300),
    device = clean(details.device, 60) || "Attendance team device";
  if (mainChurch + children + teenagers < 1)
    throw new Error("attendance_count_required");
  await db.query(
    `INSERT INTO attendance_headcount_readings(
       attendance_event_id,reading_number,male_count,female_count,children_count,
       unassigned_count,main_church_count,teenager_count,notes,device_label
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT(attendance_event_id,reading_number) DO UPDATE SET
       male_count=excluded.male_count,female_count=excluded.female_count,
       children_count=excluded.children_count,unassigned_count=excluded.unassigned_count,
       main_church_count=excluded.main_church_count,teenager_count=excluded.teenager_count,
       notes=excluded.notes,device_label=excluded.device_label,recorded_at=now(),updated_at=now()`,
    [event.id, reading, 0, 0, children, 0, mainChurch, teenagers, notes || null, device],
  );
  const rows = await db.query(
    `SELECT id,reading_number,male_count,female_count,children_count,unassigned_count,
            main_church_count,teenager_count,
            notes,device_label,recorded_at,updated_at
     FROM attendance_headcount_readings WHERE attendance_event_id=$1 ORDER BY reading_number`,
    [event.id],
  );
  const summary = readingSummary(rows),
    divisor = Math.max(1, rows.length),
    average = (key) => Math.round(rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / divisor);
  // Keep the legacy aggregate current while the data-team admin view transitions
  // to event IDs. This is the rounded average, never the latest count alone.
  await db.query(
    `INSERT INTO attendance_headcounts(
       service_date,location,service_label,male_count,female_count,children_count,
       main_church_count,teenager_count,notes,device_label
     ) VALUES($1::date,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT(service_date,location,service_label) DO UPDATE SET
       male_count=excluded.male_count,female_count=excluded.female_count,
       children_count=excluded.children_count,notes=excluded.notes,
       main_church_count=excluded.main_church_count,teenager_count=excluded.teenager_count,
       device_label=excluded.device_label,updated_at=now()`,
    [event.event_date, event.location, event.name, 0, 0,
      average("children_count"),average("main_church_count"),average("teenager_count"),
      `Official average of ${rows.length} count${rows.length === 1 ? "" : "s"}${notes ? ` · ${notes}` : ""}`,
      device],
  );
  return summary;
}

async function overview(db, body = {}) {
  const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/London",
    }),
    date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ""))
      ? String(body.date)
      : today,
    location = canonicalLocation(body.location),
    requestedEventId = Number(body.eventId || 0),
    requestedService = clean(body.service),
    defaults = await ensureDefaultServices(db, date, location),
    events = await db.query(
      `SELECT id,event_date,location,name,starts_at,ends_at,event_type,source,
              external_app,external_id,status
       FROM attendance_events
       WHERE event_date=$1::date AND ($2='' OR location=$2)
       ORDER BY starts_at NULLS LAST,name`,
      [date, location],
    ),
    selectedEvent = events.find((row) => Number(row.id) === requestedEventId)
      || events.find((row) => row.name === requestedService)
      || events[0]
      || null,
    selectedEventId = Number(selectedEvent?.id || 0),
    service = selectedEvent?.name || requestedService,
    rows = await db.query(
      `SELECT c.id,c.checked_in_at,c.location,c.service_label,i.public_id,
              r.id AS record_id,r.submitted_payload
       FROM checkin_events c
       JOIN tlc_identities i ON i.id=c.identity_id
       LEFT JOIN LATERAL (
         SELECT id,submitted_payload FROM review_records
         WHERE identity_id=i.id ORDER BY updated_at DESC,id DESC LIMIT 1
       ) r ON true
       WHERE c.service_date=$1::date
         AND ($2='' OR c.location=$2)
         AND ($3::bigint=0
           OR c.attendance_event_id=$3
           OR (c.attendance_event_id IS NULL AND c.service_label=$4))
       ORDER BY c.checked_in_at DESC LIMIT 100`,
      [date, location, selectedEventId, service],
    ),
    total = await db.query(
      `SELECT count(*)::int AS count FROM checkin_events
       WHERE service_date=$1::date AND ($2='' OR location=$2)
         AND ($3::bigint=0 OR attendance_event_id=$3
           OR (attendance_event_id IS NULL AND service_label=$4))`,
      [date, location, selectedEventId, service],
    ),
    readings = selectedEventId
      ? await db.query(
          `SELECT id,reading_number,male_count,female_count,children_count,
                  unassigned_count,main_church_count,teenager_count,notes,device_label,recorded_at,updated_at
           FROM attendance_headcount_readings
           WHERE attendance_event_id=$1 ORDER BY reading_number`,
          [selectedEventId],
        )
      : [],
    summary = readingSummary(readings);
  const locationSummary = service
    ? await db.query(
        `WITH event_totals AS (
           SELECT e.id,e.location,
                  round(avg(r.main_church_count+r.children_count+r.teenager_count))::int AS official
           FROM attendance_events e
           LEFT JOIN attendance_headcount_readings r ON r.attendance_event_id=e.id
           WHERE e.event_date=$1::date AND e.name=$2
           GROUP BY e.id,e.location
         ), identified AS (
           SELECT location,count(*)::int AS identified
           FROM checkin_events
           WHERE service_date=$1::date AND service_label=$2
           GROUP BY location
         )
         SELECT t.location,coalesce(t.official,0)::int AS official,
                coalesce(i.identified,0)::int AS identified
         FROM event_totals t LEFT JOIN identified i ON i.location=t.location
         ORDER BY t.location`,
        [date, service],
      )
    : [];
  return {
    date,
    today,
    total: Number(total[0]?.count || 0),
    locations: LOCATIONS,
    events: events.map(eventJson),
    selectedEventId,
    selectedEvent: selectedEvent ? eventJson(selectedEvent) : null,
    service,
    headcounts: summary.readings,
    headcountSummary: summary,
    locationSummary: locationSummary.map((row) => ({
      location: row.location,
      official: Number(row.official || 0),
      identified: Number(row.identified || 0),
    })),
    recent: rows.map((row) => {
      let changes = {};
      try {
        changes = L.decrypt(row.submitted_payload)?.changes || {};
      } catch {}
      return {
        id: row.id,
        publicId: row.public_id,
        name:
          `${changes.firstName || ""} ${changes.lastName || ""}`.trim() ||
          "TLC attendee",
        photoRecordId: row.record_id || null,
        location: row.location,
        service: row.service_label,
        checkedInAt: row.checked_in_at,
      };
    }),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return L.json(res, 405, { ok: false });
  try {
    const action = String(req.body?.action || ""),
      ipHash = L.hash(L.clientIp(req));
    if (action === "login") {
      const db = await L.migrateDb(),
        pin = String(req.body?.pin || "");
      if (!(await L.consumeRate(db, "checkin_staff_login", ipHash, 8, 30)))
        return L.json(res, 429, {
          ok: false,
          message: "Too many attempts. Ask the service lead for help.",
        });
      if (!configuredPin() || !L.safeEqual(pin, configuredPin())) {
        await L.audit(db, null, ipHash, "checkin_staff_login", null, "failed");
        return L.json(res, 401, {
          ok: false,
          message: configuredPin()
            ? "That check-in PIN was not recognised."
            : "The welcoming-team PIN has not been configured yet.",
        });
      }
      res.setHeader(
        "Set-Cookie",
        `${COOKIE}=${sessionValue()}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`,
      );
      await L.audit(db, null, ipHash, "checkin_staff_login", null, "approved");
      return L.json(res, 200, { ok: true });
    }
    if (action === "logout") {
      res.setHeader(
        "Set-Cookie",
        `${COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      );
      return L.json(res, 200, { ok: true });
    }
    if (!authorised(req)) return L.json(res, 401, { ok: false });
    const db = ["overview", "headcount", "createEvent", "importPlanningCenter", "importHistory"].includes(action)
      ? await L.migrateDb()
      : await L.initDb();
    if (action === "overview")
      return L.json(res, 200, { ok: true, ...(await overview(db, req.body || {})) });
    if (action === "createEvent") {
      const event = await ensureEvent(db, {
        date: req.body?.date,
        location: req.body?.location,
        name: req.body?.name,
        startsAt: req.body?.startsAt,
        endsAt: req.body?.endsAt,
        eventType: req.body?.eventType,
        source: "local",
        createdBy: "TED team",
      });
      await L.audit(db, null, ipHash, "attendance_event_created", {
        eventId: event.id,
        date: event.event_date,
        location: event.location,
        name: event.name,
      }, "created");
      return L.json(res, 200, {
        ok: true,
        event: eventJson(event),
        ...(await overview(db, { date: event.event_date, location: event.location, eventId: event.id })),
      });
    }
    if (action === "importPlanningCenter") {
      const date = validDate(req.body?.date, new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" })),
        location = canonicalLocation(req.body?.location);
      if (!location)
        return L.json(res, 400, { ok: false, message: "Choose a location before importing events." });
      const imported = await importPlanningCenterEvents(db, date, location);
      await L.audit(db, null, ipHash, "planning_center_attendance_events_imported", {
        date,
        location,
        count: imported.length,
      }, imported.length ? "imported" : "none_found");
      return L.json(res, 200, {
        ok: true,
        imported: imported.length,
        ...(await overview(db, { date, location, eventId: imported[0]?.id })),
      });
    }
    if (action === "importHistory") {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 1000) : [];
      if (!rows.length)
        return L.json(res, 400, { ok: false, message: "Choose a CSV file containing attendance rows." });
      let imported = 0;
      const errors = [];
      for (let index = 0; index < rows.length; index += 1) {
        const item = rows[index] || {};
        try {
          const date = validDate(item.date, "");
          if (!date) throw new Error("date_required");
          const event = await ensureEvent(db, {
            date,
            location: item.location,
            name: item.service || item.event,
            startsAt: item.startTime,
            eventType: item.eventType || "service",
            source: "spreadsheet",
            createdBy: "TED historical import",
          });
          await saveReading(db, event, {
            reading: item.reading || 1,
            mainChurch: item.mainChurch || (Number(item.male || 0) + Number(item.female || 0)) || item.total,
            children: item.children,
            teenagers: item.teenagers,
            notes: item.notes,
            device: "Historical spreadsheet import",
          });
          imported += 1;
        } catch (error) {
          errors.push({ row: index + 2, message: error.message });
        }
      }
      await L.audit(db, null, ipHash, "attendance_history_imported", {
        imported,
        failed: errors.length,
      }, imported ? "imported" : "failed");
      return L.json(res, 200, { ok: true, imported, failed: errors.length, errors: errors.slice(0, 20) });
    }
    if (action === "headcount") {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.date || ""))
          ? String(req.body.date)
          : new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }),
        location = canonicalLocation(req.body?.location),
        service = clean(req.body?.service);
      if (!location || (!service && !Number(req.body?.eventId)))
        return L.json(res, 400, { ok: false, message: "Choose a location and service." });
      const eventRows = Number(req.body?.eventId)
          ? await db.query(
              `SELECT id,event_date,location,name,starts_at,ends_at,event_type,source,
                      external_app,external_id,status
               FROM attendance_events WHERE id=$1 AND event_date=$2::date AND location=$3 LIMIT 1`,
              [Number(req.body.eventId), date, location],
            )
          : [],
        event = eventRows[0] || await ensureEvent(db, { date, location, name: service, source: "local" });
      let summary;
      try {
        summary = await saveReading(db, event, req.body || {});
      } catch (error) {
        if (error.message === "attendance_count_required")
          return L.json(res, 400, { ok: false, message: "Enter at least one attendance count." });
        throw error;
      }
      await L.audit(db, null, ipHash, "attendance_headcount_saved", {
        eventId: event.id,
        date,
        location,
        service: event.name,
        reading: Number(req.body?.reading || 1),
        officialAverage: summary.official,
      }, "saved");
      return L.json(res, 200, {
        ok: true,
        ...(await overview(db, { date, location, eventId: event.id })),
      });
    }
    if (action === "scan") {
      const raw = String(req.body?.code || "").trim().slice(0, 300),
        compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, ""),
        identityNumber = compact.match(/^(?:OP|OM|OA|OD|OC|TL|SG|TM|CM|AT|V)?([1-9]\d{5})$/)?.[1] || null,
        legacyId = raw.toUpperCase().replace(/\s+/g, "-").match(/^TLC-(?:\d{4,}[ABP]|\d{7})$/)?.[0] || null,
        publicId = identityNumber || legacyId,
        location = canonicalLocation(req.body?.location),
        service = clean(req.body?.service),
        device = clean(req.body?.device, 60) || "Welcome team scanner";
      if (!publicId || !location || !service)
        return L.json(res, 400, {
          ok: false,
          message: "Hold a valid YouCount QR code inside the frame.",
        });
      if (!(await L.consumeRate(db, "checkin_staff_scan", ipHash, 5000, 60)))
        return L.json(res, 429, {
          ok: false,
          message: "This scanner has been paused. Ask the service lead for help.",
        });
      const eventRows = Number(req.body?.eventId)
          ? await db.query(
              `SELECT id,event_date,location,name,starts_at,ends_at,event_type,source,
                      external_app,external_id,status
               FROM attendance_events
               WHERE id=$1 AND event_date=(now() AT TIME ZONE 'Europe/London')::date
                 AND location=$2 LIMIT 1`,
              [Number(req.body.eventId), location],
            )
          : [],
        attendanceEvent = eventRows[0] || await ensureEvent(db, {
          date: new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }),
          location,
          name: service,
          source: "local",
        });
      const identities = await db.query(
        `SELECT i.id,i.public_id,i.identity_number,i.role_code,r.id AS record_id,r.submitted_payload
         FROM tlc_identities i
         LEFT JOIN LATERAL (
           SELECT id,submitted_payload FROM review_records
           WHERE identity_id=i.id ORDER BY updated_at DESC,id DESC LIMIT 1
         ) r ON true
         WHERE i.identity_number=$1 OR upper(i.public_id)=upper($1)
            OR EXISTS (SELECT 1 FROM tlc_identity_aliases a WHERE a.identity_id=i.id AND upper(a.alias)=upper($1))
         LIMIT 1`,
        [publicId],
      );
      const identity = identities[0];
      if (!identity) {
        await L.audit(
          db,
          null,
          ipHash,
          "checkin_scan",
          { publicId, location, service, device },
          "not_found",
        );
        return L.json(res, 404, {
          ok: false,
          message: "Card not recognised. Please direct the person to Member Care.",
        });
      }
      let changes = {};
      try {
        changes = L.decrypt(identity.submitted_payload)?.changes || {};
      } catch {}
      const inserted = await db.query(
        `INSERT INTO checkin_events(
           identity_id,location,service_label,service_date,source,device_label,attendance_event_id
         )
         VALUES($1,$2,$3,(now() AT TIME ZONE 'Europe/London')::date,'welcome_scanner',$4,$5)
         ON CONFLICT(identity_id,service_date,location,service_label) DO NOTHING
         RETURNING id,checked_in_at`,
        [identity.id, location, attendanceEvent.name, device, attendanceEvent.id],
      );
      const duplicate = !inserted.length;
      await L.audit(
        db,
        null,
        ipHash,
        "checkin_scan",
        { publicId, location, service: attendanceEvent.name, eventId: attendanceEvent.id, device },
        duplicate ? "already_checked_in" : "checked_in",
      );
      return L.json(res, 200, {
        ok: true,
        duplicate,
        checkin: {
          publicId: identity.public_id,
          name:
            `${changes.firstName || ""} ${changes.lastName || ""}`.trim() ||
            "TLC attendee",
          photoRecordId: identity.record_id || null,
          location,
          service: attendanceEvent.name,
          eventId: Number(attendanceEvent.id),
          checkedInAt: inserted[0]?.checked_in_at || null,
        },
      });
    }
    return L.json(res, 400, { ok: false });
  } catch (error) {
    console.error("Check-in endpoint failed", error.message);
    if (error.message === "planning_center_events_unavailable")
      return L.json(res, 503, {
        ok: false,
        message:
          "Planning Center event access is not enabled for this integration yet.",
      });
    return L.json(res, 503, {
      ok: false,
      message: "Check-in is temporarily unavailable. Please try again.",
    });
  }
};

module.exports._readingSummary = readingSummary;
module.exports._canonicalLocation = canonicalLocation;
module.exports._defaultServices = DEFAULT_SERVICES;
