const { test, expect } = require("@playwright/test");

test("TED selects services, records three counts and gets an official average", async ({ page }) => {
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
      official = totals.length ? Math.round(totals.reduce((sum, total) => sum + total, 0) / totals.length) : 0;
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
        provisional: readings.length < 3,
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
    if (body.action === "headcount") {
      selectedEventId = Number(body.eventId);
      const item = {
        id: Number(body.reading),
        reading: Number(body.reading),
        mainChurch: Number(body.mainChurch || 0),
        children: Number(body.children || 0),
        teenagers: Number(body.teenagers || 0),
        total: Number(body.mainChurch || 0) + Number(body.children || 0) + Number(body.teenagers || 0),
        notes: body.notes || "",
        recordedAt: new Date().toISOString(),
      };
      readings = [...readings.filter((reading) => reading.reading !== item.reading), item]
        .sort((a, b) => a.reading - b.reading);
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
  await page.getByRole("button", { name: /Headcounts/ }).click();

  for (const [reading, values] of [[1, [200, 30, 20]], [2, [210, 35, 20]], [3, [202, 30, 20]]]) {
    await page.locator(`[data-reading="${reading}"]`).click();
    await page.getByLabel("Main Church", { exact: true }).fill(String(values[0]));
    await page.getByLabel("Children", { exact: true }).fill(String(values[1]));
    await page.getByLabel("Teenagers", { exact: true }).fill(String(values[2]));
    await page.getByRole("button", { name: `Save Count ${reading}` }).click();
    await expect(page.locator(`[data-reading="${reading}"] b`)).toHaveText(String(values[0] + values[1] + values[2]));
  }

  await expect(page.getByText("3 counts complete")).toBeVisible();
  await expect(page.locator(".attendance-total > b")).toHaveText("256");

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
});
