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
