const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("survey keeps every launch location", () => {
  const app = source("app.js");
  for (const location of [
    "Liberty Point Woodford",
    "North London",
    "Canary Wharf",
    "Croydon",
    "Birmingham",
    "Lagos",
    "Houston",
    "e-TLC",
  ]) {
    assert.match(app, new RegExp(`<option>${location}</option>`));
  }
});

test("Social Media catalogue is selectable and SOL has its public name", () => {
  const member = require("../api/member");
  assert.equal(member._displayGroupName("SOL"), "Sounds of Liberty");
  assert.match(source("api/member.js"), /"511638", \/\/ Social Media Management/);
});

test("location attendance combines inputs without exposing personal fields", () => {
  const display = require("../api/service-display");
  assert.deepEqual(
    display._aggregateLocations(
      [{ location: "North London", identified: 12 }],
      [{ location: "North London", room_total: 80 }],
      [
        { location: "North London", attendance: 92 },
        { location: "Canary Wharf", attendance: 140 },
      ],
    ),
    [
      {
        location: "North London",
        identified: 12,
        roomTotal: 80,
        enteredAttendance: 92,
        completed: 0,
      },
      {
        location: "Canary Wharf",
        identified: 0,
        roomTotal: 0,
        enteredAttendance: 140,
        completed: 0,
      },
    ],
  );
  const api = source("api/service-display.js");
  assert.doesNotMatch(api, /SELECT[^;]*(first_name|last_name|email|phone)/is);
});

test("media display remains aggregate-only and location based", () => {
  const display = source("service-display.js");
  assert.match(display, /<h2>By location<\/h2>/);
  assert.match(display, /id="displayLocation"/);
  assert.match(display, /id="displayDate"/);
  assert.match(display, /item\.enteredAttendance \|\| item\.roomTotal \|\| item\.identified/);
  assert.doesNotMatch(display, /displayName|publicId|photoRecordId/);
});

test("completion analytics store anonymous location aggregates", () => {
  const member = source("api/member.js");
  const schema = source("api/_lib.js");
  assert.match(schema, /operations_location_completions/);
  assert.match(member, /location-completion:/);
  assert.match(member, /canonicalTlcLocation/);
  assert.doesNotMatch(
    schema.match(/CREATE TABLE IF NOT EXISTS operations_location_completions[\s\S]*?\)`/)[0],
    /name|email|phone|public_id/i,
  );
});

test("admin attendance saves a location map", () => {
  const app = source("app.js");
  const api = source("api/admin.js");
  assert.match(app, /data-attendance-location/);
  assert.match(app, /adminApi\("operationsTarget", \{ attendance, locationAttendance \}\)/);
  assert.match(api, /operations_location_attendance/);
});

test("Woodford uses one canonical location name", () => {
  const checkin = source("checkin-handler.js");
  const displayApi = source("api/service-display.js");
  assert.match(checkin, /"Liberty Point Woodford"/);
  assert.doesNotMatch(checkin, /\n\s*"Woodford",/);
  assert.match(
    displayApi,
    /WHEN location='Woodford' THEN 'Liberty Point Woodford'/,
  );
});

test("TED attendance keeps three readings and calculates the rounded average", () => {
  const checkin = require("../checkin-handler");
  assert.deepEqual(checkin._defaultServices, [
    { name: "First Sunday Service", startsAt: "09:00" },
    { name: "Second Sunday Service", startsAt: "11:30" },
  ]);
  assert.equal(checkin._canonicalLocation("Woodford"), "Liberty Point Woodford");
  assert.deepEqual(
    checkin._readingSummary([
      { id: 1, reading_number: 1, male_count: 100, female_count: 120, children_count: 30, unassigned_count: 0 },
      { id: 2, reading_number: 2, male_count: 105, female_count: 125, children_count: 35, unassigned_count: 0 },
      { id: 3, reading_number: 3, male_count: 98, female_count: 122, children_count: 32, unassigned_count: 0 },
    ]),
    {
      readings: [
        { id: 1, reading: 1, male: 100, female: 120, children: 30, unassigned: 0, total: 250, notes: "", device: "", recordedAt: undefined, updatedAt: undefined },
        { id: 2, reading: 2, male: 105, female: 125, children: 35, unassigned: 0, total: 265, notes: "", device: "", recordedAt: undefined, updatedAt: undefined },
        { id: 3, reading: 3, male: 98, female: 122, children: 32, unassigned: 0, total: 252, notes: "", device: "", recordedAt: undefined, updatedAt: undefined },
      ],
      official: 256,
      provisional: false,
      lowest: 250,
      highest: 265,
      spread: 15,
    },
  );
});

test("attendance events connect scans, counts, dashboards and imports", () => {
  const schema = source("api/_lib.js"),
    handler = source("checkin-handler.js"),
    checkinUi = source("check-in.js"),
    displayApi = source("api/service-display.js"),
    displayUi = source("service-display.js");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS attendance_events/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS attendance_headcount_readings/);
  assert.match(schema, /reading_number smallint NOT NULL CHECK \(reading_number BETWEEN 1 AND 3\)/);
  assert.match(schema, /ALTER TABLE checkin_events ADD COLUMN IF NOT EXISTS attendance_event_id/);
  assert.match(handler, /action === "createEvent"/);
  assert.match(handler, /action === "importPlanningCenter"/);
  assert.match(handler, /action === "importHistory"/);
  assert.match(handler, /attendance_event_id\n\s*\)/);
  assert.match(checkinUi, /Count \$\{number\}/);
  assert.match(checkinUi, /Import Planning Center/);
  assert.match(checkinUi, /Import history CSV/);
  assert.match(displayApi, /availableEvents/);
  assert.match(displayUi, /id="displayEvent"/);
});
