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

test("TED attendance preserves legacy readings and calculates the rounded average", () => {
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
        { id: 1, reading: 1, male: 100, female: 120, children: 30, mainChurch: 220, teenagers: 0, unassigned: 0, total: 250, group: "", counterName: "", notes: "", device: "", recordedAt: undefined, updatedAt: undefined },
        { id: 2, reading: 2, male: 105, female: 125, children: 35, mainChurch: 230, teenagers: 0, unassigned: 0, total: 265, group: "", counterName: "", notes: "", device: "", recordedAt: undefined, updatedAt: undefined },
        { id: 3, reading: 3, male: 98, female: 122, children: 32, mainChurch: 220, teenagers: 0, unassigned: 0, total: 252, group: "", counterName: "", notes: "", device: "", recordedAt: undefined, updatedAt: undefined },
      ],
      official: 256,
      provisional: false,
      lowest: 250,
      highest: 265,
      spread: 15,
    },
  );
  const grouped = checkin._readingSummary([
    { id: 1, reading_number: 1, male_count: 100, female_count: 120, main_church_count: 220, group_name: "Main Church", counter_name: "A" },
    { id: 2, reading_number: 2, male_count: 105, female_count: 125, main_church_count: 230, group_name: "Main Church", counter_name: "B" },
    { id: 3, reading_number: 3, male_count: 20, female_count: 30, teenager_count: 50, group_name: "Teenagers", counter_name: "C" },
    { id: 4, reading_number: 4, male_count: 22, female_count: 32, teenager_count: 54, group_name: "Teenagers", counter_name: "D" },
    { id: 5, reading_number: 5, male_count: 15, female_count: 20, children_count: 35, group_name: "Children", counter_name: "E" },
    { id: 6, reading_number: 6, male_count: 17, female_count: 22, children_count: 39, group_name: "Children", counter_name: "F" },
  ]);
  assert.equal(grouped.readings.length, 6);
  assert.equal(grouped.official, 314);
});

test("attendance events connect scans, counts, dashboards and imports", () => {
  const schema = source("api/_lib.js"),
    handler = source("checkin-handler.js"),
    checkinUi = source("check-in.js"),
    displayApi = source("api/service-display.js"),
    displayUi = source("service-display.js");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS attendance_events/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS attendance_headcount_readings/);
  assert.match(schema, /DROP CONSTRAINT IF EXISTS attendance_headcount_readings_reading_number_check/);
  assert.match(schema, /ADD COLUMN IF NOT EXISTS counter_name text/);
  assert.match(schema, /ALTER TABLE checkin_events ADD COLUMN IF NOT EXISTS attendance_event_id/);
  assert.match(handler, /action === "createEvent"/);
  assert.match(handler, /action === "importPlanningCenter"/);
  assert.match(handler, /action === "importHistory"/);
  assert.match(handler, /action === "analytics"/);
  assert.match(handler, /date_trunc\(\$5,event_date\)/);
  assert.match(handler, /attendance_event_id\n\s*\)/);
  assert.match(checkinUi, /Headcount register/);
  assert.match(checkinUi, /name="counterName"/);
  assert.match(checkinUi, /Month on month · 12 months/);
  assert.match(checkinUi, /All locations/);
  assert.match(checkinUi, /Clear date/);
  assert.match(checkinUi, /Import Planning Center/);
  assert.match(checkinUi, /Import history CSV/);
  assert.match(displayApi, /availableEvents/);
  assert.match(displayUi, /id="displayEvent"/);
});

test("attendance operations use a branded command centre with separated CRM tabs", () => {
  const checkinUi = source("check-in.js"),
    adminApi = source("api/admin.js"),
    adminUi = source("app.js");
  for (const tab of ["Overview", "Live Check-in", "Headcounts", "Events", "Attendance History", "Imports"])
    assert.match(checkinUi, new RegExp(`\\[\\\"[^\\\"]+\\\", \\"${tab}`));
  assert.match(checkinUi, /Attendance Operations/);
  assert.match(checkinUi, /Official attendance/);
  assert.match(checkinUi, /Location split/);
  assert.match(checkinUi, /Main Church/);
  assert.match(checkinUi, /Teenagers/);
  assert.match(checkinUi, /id="serviceType"/);
  assert.match(checkinUi, /sunday_service: "Sunday service"/);
  assert.match(adminApi, /FROM attendance_events/);
  assert.match(adminApi, /serviceOptions:/);
  assert.match(adminUi, /Service and type/);
});
