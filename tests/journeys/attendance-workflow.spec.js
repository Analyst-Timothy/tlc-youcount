const { test, expect } = require("@playwright/test");

test("TED records unlimited spreadsheet headcounts and gets a group average", async ({ page }) => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  let events = [
      { id: 1, date: today, location: "North London", name: "First Sunday Service", startsAt: "09:00", eventType: "sunday_service", source: "default", status: "planned" },
      { id: 2, date: today, location: "North London", name: "Second Sunday Service", startsAt: "11:30", eventType: "sunday_service", source: "default", status: "planned" },
    ],
    selectedEventId = 1,
    readings = [],
    nextEventId = 3;
  const response = () => {
    const totals = readings.map((item) => item.total),
      groups = [...new Set(readings.map((item) => item.group))],
      official = groups.reduce((sum, group) => { const values = readings.filter((item) => item.group === group).map((item) => item.total); return sum + Math.round(values.reduce((a,b) => a+b,0) / values.length); }, 0);
    return {
      ok: true,
      date: today,
      today,
      total: 0,
      locations: ["Liberty Point Woodford", "North London"],
      events,
      selectedEventId,
      selectedEvent: events.find((item) => item.id === selectedEventId),
      service: events.find((item) => item.id === selectedEventId)?.name,
      recent: [],
      headcounts: readings,
      headcountSummary: {
        readings,
        official,
        provisional: readings.length < 1,
        lowest: totals.length ? Math.min(...totals) : 0,
        highest: totals.length ? Math.max(...totals) : 0,
        spread: totals.length ? Math.max(...totals) - Math.min(...totals) : 0,
      },
    };
  };

  await page.addInitScript(() => {
    localStorage.setItem("tlc_welcome_location", "North London");
    localStorage.setItem("tlc_welcome_event_id", "1");
  });
  await page.route("**/api/checkin", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "overview") {
      if (Number(body.eventId)) selectedEventId = Number(body.eventId);
      return route.fulfill({ json: response() });
    }
    if (body.action === "analytics") {
      return route.fulfill({ json: { ok:true, analytics:{ total:1024,serviceCount:6,average:171,peak:{date:today,location:"North London",service:"First Sunday Service",attendance:220},periods:[{label:"2026-10-01",attendance:480},{label:"2026-11-01",attendance:544}],locations:[{label:"North London",attendance:600},{label:"Canary Wharf",attendance:424}],services:[],records:[{date:today,location:"North London",service:"First Sunday Service",time:"09:00",attendance:220}] } } });
    }
    if (body.action === "headcount") {
      selectedEventId = Number(body.eventId);
      const total = Number(body.male || 0) + Number(body.female || 0),
        item = {
        id: readings.length + 1,
        reading: readings.length + 1,
        male: Number(body.male || 0), female: Number(body.female || 0),
        mainChurch: body.group === "Main Church" ? total : 0,
        children: body.group === "Children" ? total : 0,
        teenagers: body.group === "Teenagers" ? total : 0,
        total, group: body.group, counterName: body.counterName,
        recordedAt: new Date().toISOString(),
      };
      readings = [...readings, item];
      return route.fulfill({ json: response() });
    }
    if (body.action === "createEvent") {
      const event = { id: nextEventId++, date: today, location: "North London", name: body.name, startsAt: body.startsAt, source: "local", status: "planned" };
      events.push(event);
      selectedEventId = event.id;
      readings = [];
      return route.fulfill({ json: { ...response(), event } });
    }
    if (body.action === "importPlanningCenter") {
      const event = { id: nextEventId++, date: today, location: "North London", name: "Planning Center Conference", startsAt: "18:00", source: "planning_center", status: "planned" };
      events.push(event);
      selectedEventId = event.id;
      return route.fulfill({ json: { ...response(), imported: 1 } });
    }
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/check-in.html");
  await expect(page.getByLabel("Service or event")).toContainText("First Sunday Service");
  await expect(page.getByLabel("Service or event")).toContainText("Second Sunday Service");
  await expect(page.getByLabel("Service type")).toContainText("Sunday service");
  await expect(page.getByText("Month by month")).toBeVisible();
  await expect(page.locator('#analyticsFilters select[name="location"]')).toContainText("All locations");
  await page.getByRole("button", { name: /Headcounts/ }).click();

  for (const [index, values] of [[100, 120], [105, 125], [98, 122], [101, 121], [102, 123], [99, 119]].entries()) {
    await page.getByLabel("Male", { exact: true }).fill(String(values[0]));
    await page.getByLabel("Female", { exact: true }).fill(String(values[1]));
    await page.getByLabel("Recorded by", { exact: true }).fill("TED Tester");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".sheet-table-row")).toHaveCount(index + 1);
  }

  await expect(page.getByText("Live average")).toBeVisible();
  await expect(page.locator(".attendance-total > b")).toHaveText("223");

  await page.getByRole("button", { name: /^Events/ }).click();
  await page.getByRole("button", { name: "+ Create event" }).click();
  await page.getByLabel("Name").fill("Growth Track");
  await page.getByLabel("Start time").fill("14:00");
  await page.getByRole("button", { name: "Create and select" }).click();
  await expect(page.getByLabel("Service or event")).toContainText("Growth Track");

  await page.getByRole("button", { name: /^Imports/ }).click();
  await page.getByRole("button", { name: "Import Planning Center" }).click();
  await expect(page.getByText("1 Planning Center event added.")).toBeVisible();
  await expect(page.getByLabel("Service or event")).toContainText("Planning Center Conference");

  await page.getByRole("button", { name: /^Attendance History/ }).click();
  await expect(page.getByText("1 service record")).toBeVisible();
  await page.locator('#analyticsFilters input[name="date"]').fill(today);
  await page.getByRole("button", { name:"Apply", exact:true }).click();
  await expect(page.getByRole("button", { name:"Clear date" })).toBeEnabled();
  await page.getByRole("button", { name:"Clear date" }).click();
  await page.locator('#analyticsFilters select[name="period"]').selectOption("quarterly");
  await page.getByRole("button", { name:"Apply", exact:true }).click();
  await expect(page.getByText("Quarter by quarter")).toBeVisible();
});
