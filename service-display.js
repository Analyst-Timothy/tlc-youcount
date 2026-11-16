const root = document.getElementById("serviceDisplay");
let refreshTimer = null;

const esc = (value) =>
  String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);

async function displayApi(action, body = {}) {
  const response = await fetch("/api/service-display", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok) {
    const error = new Error(data.message || "Display unavailable");
    error.status = response.status;
    throw error;
  }
  return data;
}

function login(message = "") {
  clearInterval(refreshTimer);
  root.innerHTML = `<main class="login-shell"><section class="login-card">
    <div class="colour-ribbon"><i></i><i></i><i></i><i></i><i></i></div>
    <img src="/assets/tlc-logo.png" alt="The Liberty Church">
    <span class="eyebrow">Media display · read only</span>
    <h1>Live Service</h1>
    <p>Aggregate service and YouCount activity. This screen never shows names or member records.</p>
    ${message ? `<p class="login-error" role="alert">${esc(message)}</p>` : ""}
    <form id="displayLogin"><label for="displayPin">Display PIN</label><input id="displayPin" name="pin" type="password" inputmode="numeric" autocomplete="one-time-code" required autofocus><button>Open display</button></form>
  </section></main>`;
  document.getElementById("displayLogin").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      await displayApi("login", { pin: document.getElementById("displayPin").value });
      await refresh();
      startRefresh();
    } catch (error) {
      login(error.message);
    }
  };
}

function timelineRows(rows = []) {
  const currentHour = Number(new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", hour12: false, timeZone: "Europe/London",
  }).format(new Date()));
  const start = Math.min(8, currentHour);
  const end = Math.max(start + 4, currentHour);
  const counts = new Map(rows.map((row) => [row.label, Number(row.count || 0)]));
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const label = `${String(start + index).padStart(2, "0")}:00`;
    return { label, count: counts.get(label) || 0 };
  });
}

function render(data) {
  const summary = data.summary || {},
    timeline = timelineRows(data.timeline),
    chartMaximum = Math.max(1, ...timeline.map((item) => item.count)),
    stageMaximum = Math.max(1, ...(data.stages || []).map((item) => item.count)),
    totalJourneyStarts = (data.journeyTypes || []).reduce((total, item) => total + item.started, 0),
    dateLabel = new Date(`${data.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    refreshed = new Date(data.refreshedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  root.innerHTML = `<div class="display-shell">
    <div class="colour-ribbon"><i></i><i></i><i></i><i></i><i></i></div>
    <header class="display-header"><div class="brand-lockup"><img src="/assets/tlc-logo.png" alt="The Liberty Church"><div><span>Sunday pilot</span><b>Live Service</b></div></div><div class="header-actions"><span class="live-state"><i></i>Live · ${esc(refreshed)}</span><button class="icon-button" id="fullscreenDisplay" title="Full screen" aria-label="Open full screen">⛶</button><button class="icon-button" id="displayLogout" title="Log out" aria-label="Log out">×</button></div></header>
    <main class="display-main">
      <section class="hero-grid">
        <article class="metric-card attendance"><div class="metric-label"><span>People in service</span><i></i></div><div class="metric-value">${summary.attendance || "—"}</div><div class="metric-note">${esc(summary.attendanceSource)}${summary.identifiedCheckins ? ` · <strong>${summary.identifiedCheckins}</strong> identified check-ins` : ""}</div></article>
        <article class="metric-card"><div class="metric-label">YouCount completed</div><div class="metric-value">${summary.completedToday || 0}</div><div class="metric-note"><strong>${summary.completedLast15 || 0}</strong> in the last 15 minutes</div></article>
        <article class="metric-card"><div class="metric-label">Active now</div><div class="metric-value">${summary.activeNow || 0}</div><div class="metric-note">currently completing YouCount</div></article>
        <article class="metric-card"><div class="metric-label">Average journey</div><div class="metric-value">${summary.averageMinutes || 0}<small class="metric-unit">min</small></div><div class="metric-note">median <strong>${summary.medianMinutes || 0} min</strong></div></article>
      </section>
      <section class="dashboard-grid">
        <article class="panel"><header><div><span class="eyebrow">Today’s momentum</span><h2>Completions by hour</h2></div><small>${summary.startedToday || 0} journeys started today</small></header>
          <div class="chart-wrap">${timeline.map((item) => `<div class="chart-column"><b>${item.count || ""}</b><i style="height:${Math.max(2,Math.round((item.count/chartMaximum)*88))}%"></i><span>${esc(item.label.slice(0,2))}</span></div>`).join("")}</div>
          <div class="insight-strip"><article><b>${summary.startedToday || 0}</b><span>Started today</span></article><article><b>${summary.completedToday || 0}</b><span>Completed today</span></article><article><b>${summary.mayNeedHelp || 0}</b><span>May need help</span></article><article><b>${summary.verificationIssues || 0}</b><span>Issues in last hour</span></article></div>
        </article>
        <article class="panel"><header><div><span class="eyebrow">Service progress</span><h2>People counted</h2></div><small>${summary.attendance ? `${summary.completedToday || 0} of ${summary.attendance}` : "Awaiting attendance"}</small></header>
          <div class="progress-ring" style="--value:${Math.round((summary.completionRate || 0)*3.6)}deg"><div><b>${summary.completionRate || 0}%</b><span>of attendance</span></div></div>
          <div class="funnel">${(data.journeyTypes || []).map((item) => `<div class="funnel-row"><span>${esc(item.type === "member" ? "Members" : item.type === "attendee" ? "Attenders" : item.type === "visitor" ? "Visitors" : "Other")}</span><div class="funnel-track"><i style="width:${Math.max(3,Math.round((item.started/Math.max(1,totalJourneyStarts))*100))}%"></i></div><b>${item.completed}/${item.started}</b></div>`).join("") || `<div class="empty">Journey mix will appear as people begin.</div>`}</div>
        </article>
      </section>
      <section class="dashboard-grid">
        <article class="panel"><header><div><span class="eyebrow">Live funnel</span><h2>Where people are now</h2></div><small>Aggregate activity only</small></header><div class="funnel">${(data.stages || []).map((item) => `<div class="funnel-row"><span>${esc(item.label)}</span><div class="funnel-track"><i style="width:${Math.max(4,Math.round((item.count/stageMaximum)*100))}%"></i></div><b>${item.count}</b></div>`).join("") || `<div class="empty">No active journeys right now.</div>`}</div></article>
        <article class="panel"><header><div><span class="eyebrow">Attendance</span><h2>By location</h2></div><small>${summary.identifiedCheckins || 0} identified</small></header><div class="location-strip">${(data.locations || []).map((item) => { const attendance = item.enteredAttendance || item.roomTotal || item.identified; return `<article class="location-card"><b>${esc(item.location)}</b><span>${item.enteredAttendance ? "Admin attendance" : item.roomTotal ? "Room headcount" : "Identified check-ins"}</span><strong>${attendance}</strong><span>${item.identified ? `${item.identified} identified` : "No identified check-ins yet"}</span></article>`; }).join("") || `<div class="empty">Attendance breakdown will appear after the first location count or check-in.</div>`}</div></article>
      </section>
    </main>
    <footer class="display-footer"><span>${esc(dateLabel)}</span><span>Read-only aggregate display · no member names or personal details</span></footer>
    <div class="refresh-track" aria-hidden="true"><i></i></div>
  </div>`;
  document.getElementById("fullscreenDisplay").onclick = () => document.documentElement.requestFullscreen?.();
  document.getElementById("displayLogout").onclick = async () => { await displayApi("logout").catch(() => {}); login(); };
}

async function refresh() {
  try {
    render(await displayApi("summary"));
  } catch (error) {
    if (error.status === 401) return login();
    const state = document.querySelector(".live-state");
    if (state) state.innerHTML = "Refresh delayed";
  }
}

function startRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(refresh, 15000);
}

refresh().then(startRefresh);
