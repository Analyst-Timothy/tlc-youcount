import QrScanner from "/vendor/qr-scanner.min.js";

const root = document.querySelector("#checkinApp");
const todayInLondon = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const state = {
  authenticated: false,
  location: localStorage.getItem("tlc_welcome_location") || "Liberty Point Woodford",
  service: localStorage.getItem("tlc_welcome_service") || "First Sunday Service",
  eventId: Number(localStorage.getItem("tlc_welcome_event_id") || 0),
  events: [],
  total: 0,
  locations: [],
  recent: [],
  headcounts: [],
  headcountSummary: { readings: [], official: 0, provisional: true, spread: 0 },
  selectedReading: 1,
  workspaceTab: localStorage.getItem("tlc_attendance_tab") || "checkin",
  eventType: "all",
  showCreateEvent: false,
  importMessage: "",
  result: null,
  scanner: null,
  scanning: false,
  busy: false,
  date: todayInLondon(),
};
const eventTypeLabels = {
  sunday_service: "Sunday service",
  service: "Church service",
  conference: "Conference",
  event: "Other event",
};
const esc = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
async function request(action, body = {}) {
  const response = await fetch("/api/checkin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({
    ok: false,
    message: "Check-in is temporarily unavailable.",
  }));
  if (!response.ok) {
    const error = new Error(data.message || "Check-in is temporarily unavailable.");
    error.status = response.status;
    throw error;
  }
  return data;
}
function wordmark() {
  return `<div class="wordmark"><img src="/assets/youcount-card/logo-white.png" alt="The Liberty Church"></div>`;
}
function loginView(message = "") {
  root.innerHTML = `<main class="login-screen"><section class="login-card">${wordmark()}<span class="kicker">Welcoming team</span><h1>Service check-in</h1><p>Use the welcoming-team PIN. This does not provide access to member records or the data-team dashboard.</p><form id="pinForm"><label>Check-in PIN<input id="pin" type="password" inputmode="numeric" autocomplete="one-time-code" required autofocus></label>${message ? `<div class="error">${esc(message)}</div>` : ""}<button>Open scanner</button></form></section></main>`;
  document.querySelector("#pinForm").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      await request("login", { pin: document.querySelector("#pin").value });
      state.authenticated = true;
      await loadOverview();
      render();
      await startCamera();
    } catch (error) {
      loginView(error.message);
    }
  };
}
async function loadOverview() {
  const data = await request("overview", {
    date: state.date,
    location: state.location,
    service: state.service,
    eventId: state.eventId,
  });
  state.date = data.date || state.date;
  state.total = data.total || 0;
  state.locations = data.locations || [];
  state.events = data.events || [];
  state.eventId = Number(data.selectedEventId || 0);
  state.service = data.service || state.service;
  if (state.eventId) localStorage.setItem("tlc_welcome_event_id", String(state.eventId));
  localStorage.setItem("tlc_welcome_service", state.service);
  state.recent = data.recent || [];
  state.headcounts = data.headcounts || [];
  state.headcountSummary = data.headcountSummary || { readings: [], official: 0, provisional: true, spread: 0 };
  const nextMissing = [1, 2, 3].find((reading) => !state.headcounts.some((item) => item.reading === reading));
  if (nextMissing) state.selectedReading = nextMissing;
}

function parseCsv(text) {
  const records = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index <= text.length; index += 1) {
    const character = text[index] || "\n";
    if (quoted && character === '"' && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (!quoted && character === ",") {
      row.push(field.trim()); field = "";
    } else if (!quoted && character === "\n") {
      row.push(field.trim()); field = "";
      if (row.some(Boolean)) records.push(row);
      row = [];
    } else if (character !== "\r") field += character;
  }
  if (records.length < 2) return [];
  const aliases = {
    date: "date", location: "location", campus: "location",
    service: "service", event: "service", "service name": "service",
    reading: "reading", round: "reading", count: "total", total: "total",
    male: "male", men: "male", female: "female", women: "female",
    children: "children", kids: "children", notes: "notes",
    "start time": "startTime", time: "startTime",
  };
  const headers = records[0].map((header) => aliases[header.toLowerCase()] || header);
  return records.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
  );
}
function resultMarkup() {
  if (!state.result)
    return `<div class="ready"><i>⌗</i><div><b>Ready to scan</b><span>Hold the member’s QR code inside the frame.</span></div></div>`;
  const item = state.result;
  return `<div class="result ${item.error ? "failed" : item.duplicate ? "duplicate" : "success"}">${item.photoRecordId ? `<img src="/api/photo?record=${encodeURIComponent(item.photoRecordId)}" alt="">` : `<i>${item.error ? "!" : item.duplicate ? "↻" : "✓"}</i>`}<div><small>${item.error ? "Needs attention" : item.duplicate ? "Already checked in" : "Welcome"}</small><b>${esc(item.name || item.message)}</b>${item.publicId ? `<span>${esc(item.publicId)}</span>` : ""}</div></div>`;
}
function confirmationOverlay() {
  const item = state.result;
  if (!item || item.inlineOnly) return "";
  return `<div class="scan-confirmation ${item.error ? "failed" : item.duplicate ? "duplicate" : "success"}" role="status" aria-live="assertive"><div><i>${item.error ? "!" : item.duplicate ? "↻" : "✓"}</i><small>${item.error ? "Please try again" : item.duplicate ? "Already checked in" : "Checked in"}</small><b>${esc(item.name || item.message)}</b>${item.publicId ? `<span>${esc(item.publicId)}</span>` : ""}</div></div>`;
}
function playScanSound(kind) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext,
      context = new AudioContext(),
      notes =
        kind === "success"
          ? [[659, 0], [880, 0.12]]
          : kind === "duplicate"
            ? [[440, 0], [440, 0.16]]
            : [[220, 0], [165, 0.17]];
    notes.forEach(([frequency, delay], index) => {
      const oscillator = context.createOscillator(),
        gain = context.createGain(),
        starts = context.currentTime + delay;
      oscillator.type = kind === "error" ? "square" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, starts);
      gain.gain.exponentialRampToValueAtTime(0.18, starts + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, starts + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(starts);
      oscillator.stop(starts + 0.18);
      if (index === notes.length - 1)
        oscillator.onended = () => context.close().catch(() => {});
    });
  } catch {}
}
function render() {
  if (!state.authenticated) return loginView();
  const live = state.date === todayInLondon(),
    selectedEvent = state.events.find((item) => Number(item.id) === state.eventId),
    selectedCount = state.headcounts.find((item) => item.reading === state.selectedReading),
    countSummary = state.headcountSummary || {},
    readings = countSummary.readings || state.headcounts,
    varianceWarning = readings.length > 1 && countSummary.official && countSummary.spread / countSummary.official > 0.1;
  const visibleEvents = state.eventType === "all"
      ? state.events
      : state.events.filter((event) => (event.eventType || "service") === state.eventType),
    tabs = [
      ["checkin", "Check-in", "Scan cards"],
      ["counts", "Counts", "Record headcounts"],
      ["events", "Events & imports", "Set up services"],
      ["history", "History", "Review arrivals"],
    ];
  root.innerHTML = `<div class="scanner-app"><header>${wordmark()}<div><span>${live ? "Identified in this service" : "Selected service"}</span><b>${state.total}</b><button id="logout" aria-label="Log out">×</button></div></header><main class="crm-layout">
    <aside class="crm-sidebar"><span class="kicker">Attendance CRM</span><nav>${tabs.map(([id, label, description]) => `<button type="button" data-workspace-tab="${id}" class="${state.workspaceTab === id ? "active" : ""}"><b>${label}</b><small>${description}</small></button>`).join("")}</nav><p>TED attendance workspace</p></aside><section class="crm-content">
    <section class="service-settings">
      <label>Calendar date<input id="historyDate" type="date" value="${esc(state.date)}"></label>
      <label>Location<select id="location">${state.locations.map((location) => `<option ${location === state.location ? "selected" : ""}>${esc(location)}</option>`).join("")}</select></label>
      <label>Service type<select id="serviceType"><option value="all">All service types</option>${Object.entries(eventTypeLabels).map(([value, label]) => `<option value="${value}" ${state.eventType === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label>Service or event<select id="service">${visibleEvents.map((event) => `<option value="${event.id}" ${Number(event.id) === state.eventId ? "selected" : ""}>${event.startsAt ? `${esc(event.startsAt)} · ` : ""}${esc(event.name)} · ${esc(eventTypeLabels[event.eventType] || "Church service")}</option>`).join("")}</select></label>
    </section>
    ${state.workspaceTab === "events" ? `<section class="workspace-panel events-workspace"><header><div><span class="kicker">Events & imports</span><h1>Set up attendance</h1><p>Create services here, or bring them in from an existing source.</p></div></header><div class="event-actions"><button type="button" id="toggleCreateEvent">+ Create event</button><button type="button" id="importPlanningCenter">Import Planning Center</button><label class="file-action">Import history CSV<input id="historyImport" type="file" accept=".csv,text/csv"></label><a href="/attendance-history-template.csv" download>Download CSV template</a></div>${state.importMessage ? `<p class="event-message" role="status">${esc(state.importMessage)}</p>` : ""}${state.showCreateEvent ? `<section class="event-creator"><div><span class="kicker">New attendance event</span><h2>Create a service or event</h2></div><form id="createEventForm"><label>Name<input name="name" required placeholder="e.g. Midweek Service"></label><label>Start time<input name="startsAt" type="time"></label><label>End time<input name="endsAt" type="time"></label><label>Type<select name="eventType"><option value="sunday_service">Sunday service</option><option value="service">Church service</option><option value="conference">Conference</option><option value="event">Other event</option></select></label><button>Create and select</button><button type="button" class="quiet" id="cancelCreateEvent">Cancel</button></form></section>` : ""}<div class="event-library"><h2>Services on ${new Date(`${state.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</h2>${state.events.map((event) => `<button type="button" data-event-id="${event.id}" class="${Number(event.id) === state.eventId ? "active" : ""}"><span><b>${esc(event.name)}</b><small>${esc(event.location || state.location)} · ${esc(eventTypeLabels[event.eventType] || "Church service")}</small></span><strong>${esc(event.startsAt || "Time not set")}</strong></button>`).join("") || `<p class="empty">No events have been created for this date.</p>`}</div></section>` : ""}
    ${state.workspaceTab === "checkin" ? (live ? `<section class="camera-card"><header class="selected-service"><span class="kicker">Now recording</span><b>${esc(selectedEvent?.name || state.service)}</b><small>${esc(state.location)} · ${esc(eventTypeLabels[selectedEvent?.eventType] || "Church service")}${selectedEvent?.startsAt ? ` · ${esc(selectedEvent.startsAt)}` : ""}</small></header><div class="camera-frame"><video id="camera" playsinline muted></video><div class="scan-guide"><i></i><span>Place QR code here</span></div></div><div class="camera-actions"><button id="cameraToggle">Start camera</button><span id="cameraStatus">Camera is off</span></div><form id="manualScan"><input id="code" autocomplete="off" autocapitalize="characters" placeholder="Or scan/type 482193"><button>Check in</button></form>${resultMarkup()}</section>` : `<section class="camera-card history-mode"><span class="kicker">Attendance history</span><h1>${new Date(`${state.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h1><p>Scanning is disabled while viewing an earlier date. Counts and identified check-ins remain available.</p><button id="returnToday">Return to today</button></section>`) : ""}
    ${state.workspaceTab === "counts" ? `<aside class="attendance-panel"><div class="attendance-heading"><span class="kicker">Official attendance</span><em class="${countSummary.provisional ? "provisional" : "complete"}">${countSummary.provisional ? "Provisional" : "3 counts complete"}</em></div><div class="attendance-total"><b>${countSummary.official || 0}</b><span>average of ${readings.length || 0} count${readings.length === 1 ? "" : "s"}<br>${state.total} identified check-ins</span></div>
      ${varianceWarning ? `<div class="variance-warning">Counts vary by ${countSummary.spread}. Review them before closing the service.</div>` : ""}
      <div class="reading-tabs">${[1, 2, 3].map((number) => { const item = readings.find((reading) => reading.reading === number); return `<button type="button" data-reading="${number}" class="${state.selectedReading === number ? "active" : ""} ${item ? "saved" : ""}"><span>Count ${number}</span><b>${item?.total ?? "—"}</b><small>${item ? new Date(item.recordedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "Not recorded"}</small></button>`; }).join("")}</div>
      ${live ? `<form id="headcountForm"><input type="hidden" name="reading" value="${state.selectedReading}"><div><label>Male<input name="male" type="number" min="0" max="50000" value="${selectedCount?.male ?? ""}" placeholder="0"></label><label>Female<input name="female" type="number" min="0" max="50000" value="${selectedCount?.female ?? ""}" placeholder="0"></label><label>Children<input name="children" type="number" min="0" max="50000" value="${selectedCount?.children ?? ""}" placeholder="0"></label></div><label>Count notes<textarea name="notes" rows="2" maxlength="300" placeholder="Optional">${esc(selectedCount?.notes || "")}</textarea></label><button>Save Count ${state.selectedReading}</button><p id="headcountStatus"></p></form>` : ""}
      <div class="headcount-history"><b>${countSummary.provisional ? "Awaiting all 3 counts" : `Official average ${countSummary.official}`}</b><span>${readings.length ? `Range ${countSummary.lowest}–${countSummary.highest}` : "No manual count saved yet"}</span>${readings.map((item) => `<p><strong>Count ${item.reading} · ${item.total}</strong><span>${item.male} male · ${item.female} female · ${item.children} children${item.unassigned ? ` · ${item.unassigned} unassigned` : ""}</span></p>`).join("")}</div>
    </aside>` : ""}
    ${state.workspaceTab === "history" ? `<section class="recent"><div><span class="kicker">${live ? "Live arrivals" : "Attendance record"}</span><h2>${live ? "Recently checked in" : "Recorded check-ins"}</h2></div>${state.recent.slice(0, 100).map((item) => `<article>${item.photoRecordId ? `<img src="/api/photo?record=${encodeURIComponent(item.photoRecordId)}" alt="">` : `<i>${esc(item.name[0])}</i>`}<div><b>${esc(item.name)}</b><span>${esc(item.service)} · ${new Date(item.checkedInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span></div><strong>✓</strong></article>`).join("") || `<p class="empty">No check-ins match this service.</p>`}</section>` : ""}
  </section></main>${confirmationOverlay()}</div>`;
  bind();
}
function bind() {
  document.querySelectorAll("[data-workspace-tab]").forEach((button) => {
    button.onclick = async () => {
      await stopCamera();
      state.workspaceTab = button.dataset.workspaceTab;
      localStorage.setItem("tlc_attendance_tab", state.workspaceTab);
      render();
      if (state.workspaceTab === "checkin" && state.date === todayInLondon()) await startCamera();
    };
  });
  document.querySelector("#historyDate").onchange = async (event) => {
    await stopCamera();
    state.date = event.target.value || todayInLondon();
    state.eventId = 0;
    await loadOverview();
    render();
    if (state.date === todayInLondon()) await startCamera();
  };
  document.querySelector("#location").onchange = async (event) => {
    await stopCamera();
    state.location = event.target.value;
    state.eventId = 0;
    localStorage.setItem("tlc_welcome_location", state.location);
    await loadOverview();
    render();
    if (state.date === todayInLondon()) await startCamera();
  };
  document.querySelector("#service").onchange = async (event) => {
    await stopCamera();
    state.eventId = Number(event.target.value || 0);
    state.service = state.events.find((item) => Number(item.id) === state.eventId)?.name || "First Sunday Service";
    localStorage.setItem("tlc_welcome_event_id", String(state.eventId));
    localStorage.setItem("tlc_welcome_service", state.service);
    await loadOverview();
    render();
    if (state.date === todayInLondon()) await startCamera();
  };
  document.querySelector("#serviceType").onchange = async (event) => {
    await stopCamera();
    state.eventType = event.target.value || "all";
    const firstMatch = state.events.find((item) => state.eventType === "all" || (item.eventType || "service") === state.eventType);
    if (firstMatch) {
      state.eventId = Number(firstMatch.id);
      state.service = firstMatch.name;
      await loadOverview();
    }
    render();
    if (state.workspaceTab === "checkin" && state.date === todayInLondon()) await startCamera();
  };
  document.querySelectorAll("[data-event-id]").forEach((button) => {
    button.onclick = async () => {
      state.eventId = Number(button.dataset.eventId || 0);
      state.service = state.events.find((item) => Number(item.id) === state.eventId)?.name || state.service;
      await loadOverview();
      render();
    };
  });
  if (document.querySelector("#toggleCreateEvent")) document.querySelector("#toggleCreateEvent").onclick = async () => {
    await stopCamera();
    state.showCreateEvent = !state.showCreateEvent;
    render();
  };
  if (document.querySelector("#cancelCreateEvent"))
    document.querySelector("#cancelCreateEvent").onclick = async () => {
      state.showCreateEvent = false;
      render();
      if (state.date === todayInLondon()) await startCamera();
    };
  if (document.querySelector("#createEventForm"))
    document.querySelector("#createEventForm").onsubmit = async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button:not([type="button"])'),
        values = new FormData(event.currentTarget);
      button.disabled = true;
      try {
        const data = await request("createEvent", {
          date: state.date,
          location: state.location,
          name: values.get("name"),
          startsAt: values.get("startsAt"),
          endsAt: values.get("endsAt"),
          eventType: values.get("eventType"),
        });
        state.eventId = Number(data.event?.id || data.selectedEventId || 0);
        state.service = data.event?.name || state.service;
        state.showCreateEvent = false;
        state.importMessage = `${state.service} is ready for attendance.`;
        await loadOverview();
        render();
        if (state.date === todayInLondon()) await startCamera();
      } catch (error) {
        state.importMessage = error.message;
        render();
      }
    };
  if (document.querySelector("#importPlanningCenter")) document.querySelector("#importPlanningCenter").onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    state.importMessage = "Checking Planning Center…";
    try {
      const data = await request("importPlanningCenter", {
        date: state.date,
        location: state.location,
      });
      state.eventId = Number(data.selectedEventId || state.eventId);
      state.importMessage = data.imported
        ? `${data.imported} Planning Center event${data.imported === 1 ? "" : "s"} added.`
        : "No Planning Center event times were found for this date.";
      await loadOverview();
    } catch (error) {
      state.importMessage = `${error.message} You can still create the event here.`;
    }
    render();
    if (state.date === todayInLondon()) await startCamera();
  };
  if (document.querySelector("#historyImport")) document.querySelector("#historyImport").onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error("The CSV needs a header row and at least one attendance row.");
      state.importMessage = `Importing ${rows.length} historical row${rows.length === 1 ? "" : "s"}…`;
      const data = await request("importHistory", { rows });
      state.importMessage = `${data.imported} row${data.imported === 1 ? "" : "s"} imported${data.failed ? ` · ${data.failed} need review` : ""}.`;
      await loadOverview();
    } catch (error) {
      state.importMessage = error.message;
    }
    render();
    if (state.date === todayInLondon()) await startCamera();
  };
  document.querySelectorAll("[data-reading]").forEach((button) => {
    button.onclick = async () => {
      await stopCamera();
      state.selectedReading = Number(button.dataset.reading);
      render();
      if (state.date === todayInLondon()) await startCamera();
    };
  });
  if (document.querySelector("#cameraToggle"))
    document.querySelector("#cameraToggle").onclick = () =>
      state.scanning ? stopCamera() : startCamera();
  if (document.querySelector("#manualScan"))
    document.querySelector("#manualScan").onsubmit = async (event) => {
      event.preventDefault();
      await scan(document.querySelector("#code").value);
    };
  if (document.querySelector("#headcountForm"))
    document.querySelector("#headcountForm").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget,
        button = form.querySelector("button"),
        status = form.querySelector("#headcountStatus"),
        values = new FormData(form);
      button.disabled = true;
      status.textContent = "Saving…";
      try {
        const data = await request("headcount", {
          date: state.date, location: state.location, service: state.service, eventId: state.eventId,
          reading: values.get("reading"),
          male: values.get("male"), female: values.get("female"), children: values.get("children"),
          notes: values.get("notes"), device: navigator.userAgent.includes("Mobile") ? "Attendance team phone" : "Attendance desk",
        });
        state.headcounts = data.headcounts || [];
        state.headcountSummary = data.headcountSummary || state.headcountSummary;
        state.eventId = Number(data.selectedEventId || state.eventId);
        state.total = data.total || state.total;
        state.recent = data.recent || state.recent;
        render();
        document.querySelector("#headcountStatus")?.replaceChildren(document.createTextNode("Headcount saved."));
      } catch (error) {
        status.textContent = error.message;
        button.disabled = false;
      }
    };
  if (document.querySelector("#returnToday"))
    document.querySelector("#returnToday").onclick = async () => {
      state.date = todayInLondon();
      await loadOverview();
      render();
      await startCamera();
    };
  document.querySelector("#logout").onclick = async () => {
    await stopCamera();
    try { await request("logout"); } catch {}
    state.authenticated = false;
    loginView();
  };
}
async function startCamera() {
  const video = document.querySelector("#camera"),
    status = document.querySelector("#cameraStatus"),
    button = document.querySelector("#cameraToggle");
  if (!video || state.scanning) return;
  try {
    state.scanner = new QrScanner(
      video,
      (result) => scan(result?.data || result),
      {
        preferredCamera: "environment",
        returnDetailedScanResult: true,
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 6,
      },
    );
    await state.scanner.start();
    state.scanning = true;
    video.classList.add("visible");
    button.textContent = "Stop camera";
    status.textContent = "Camera is live";
  } catch (error) {
    state.result = { error: true, inlineOnly: true, message: "Allow camera access in your browser settings, or use a handheld scanner." };
    render();
  }
}
async function stopCamera() {
  if (state.scanner) {
    try { await state.scanner.stop(); } catch {}
    try { state.scanner.destroy(); } catch {}
  }
  state.scanner = null;
  state.scanning = false;
  const video = document.querySelector("#camera"),
    status = document.querySelector("#cameraStatus"),
    button = document.querySelector("#cameraToggle");
  video?.classList.remove("visible");
  if (button) button.textContent = "Start camera";
  if (status) status.textContent = "Camera is off";
}
async function scan(code) {
  if (state.busy || !String(code || "").trim()) return;
  state.busy = true;
  state.scanner?.pause();
  try {
    const data = await request("scan", {
      code,
      location: state.location,
      service: state.service,
      eventId: state.eventId,
      device: navigator.userAgent.includes("Mobile") ? "Welcome team phone" : "Welcome desk scanner",
    });
    state.result = { ...data.checkin, duplicate: data.duplicate };
    playScanSound(data.duplicate ? "duplicate" : "success");
    if (navigator.vibrate) navigator.vibrate(data.duplicate ? [80, 50, 80] : 120);
    await loadOverview();
  } catch (error) {
    if (error.status === 401) {
      await stopCamera();
      state.authenticated = false;
      return loginView("Your scanner session expired. Enter the PIN again.");
    }
    state.result = { error: true, message: error.message };
    playScanSound("error");
  }
  await stopCamera();
  state.busy = false;
  render();
  const delay = state.result?.error ? 2200 : state.result?.duplicate ? 1800 : 1350;
  setTimeout(async () => {
    state.result = null;
    render();
    await startCamera();
  }, delay);
}

try {
  await loadOverview();
  state.authenticated = true;
  render();
  await startCamera();
} catch {
  loginView();
}
