const state = {
  data: null,
  page: "home",
  modal: null,
  busy: false,
  auth: {
    step: "signin",
    challenge: null,
    groups: [],
    selected: new Set(),
    search: "",
  },
};
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
async function api(action, options = {}) {
  const r = await fetch(`/api/portal?action=${action}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2500);
}
async function load() {
  try {
    state.data = await api("bootstrap");
    render();
  } catch (e) {
    if (e.message === "Sign in required") renderLogin();
    else renderError(e.message);
  }
}
function renderLogin() {
  const a = state.auth;
  if (a.step === "signin") {
    $("#app").innerHTML = `<main class="login"><section class="login-card"><div class="mark">TLC</div><span class="eyebrow">Team member and volunteer portal</span><h1>Welcome back.</h1><p>Sign in to see your teams, rota and guides.</p><form id="accountLogin"><div class="field"><label>Email address</label><input name="email" type="email" autocomplete="email" required></div><div class="field"><label>Password</label><input name="password" type="password" autocomplete="current-password" required></div><button class="btn" style="width:100%">Sign in</button></form><button class="btn alt" id="showSignup" style="width:100%;margin-top:10px">Create an account</button><p style="margin-top:18px;font-size:12px">Forgotten your password or your church details have changed? <a href="https://tlc-blush.vercel.app" target="_blank" rel="noopener">Verify your details with TLC</a>.</p><details><summary>Preview the role views</summary><div class="role-grid"><button class="btn alt" data-login="member">Team member preview</button><button class="btn alt" data-login="lead">Team lead preview</button><button class="btn alt" data-login="staff">Talent Management preview</button></div></details></section></main>`;
    bindSignup();
    return;
  }
  if (a.step === "verify") {
    const visible = a.groups.filter(
      (g) =>
        !a.search ||
        `${g.name} ${g.typeName} ${g.location}`
          .toLowerCase()
          .includes(a.search.toLowerCase()),
    );
    $("#app").innerHTML =
      `<main class="login"><section class="login-card signup-wide"><button class="btn alt small" id="authBack">← Start again</button><div class="mark" style="margin-top:18px">TLC</div><span class="eyebrow">Text verification</span><h1>Check your phone</h1><p>If your name and email matched Planning Center, we sent a six-digit code to the mobile number already held by TLC. The number is never displayed.</p><form id="verifySignup"><div class="field"><label>Verification code</label><input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6-digit code" required></div><div class="field"><label>Which teams or ministries do you serve in?</label><input id="groupSearch" placeholder="Search serving teams" value="${esc(a.search)}"><div class="group-options">${visible.map((g) => `<label class="group-option"><input type="checkbox" data-group="${g.id}" ${a.selected.has(g.id) ? "checked" : ""}><span><b>${esc(g.name)}</b><small>${esc(g.typeName)}${g.location ? ` · ${esc(g.location)}` : ""}</small></span></label>`).join("") || "<p>No serving teams match that search.</p>"}</div></div><div class="notice">Select every serving group that applies. These are submitted as claims for confirmation; signup does not alter Planning Center.</div><button class="btn" style="width:100%;margin-top:16px">Verify and create account</button></form></section></main>`;
    $("#verifySignup .field:nth-of-type(2)").insertAdjacentHTML(
      "beforebegin",
      `<div class="field"><label>Create password</label><input name="password" type="password" minlength="10" autocomplete="new-password" required><small>At least 10 characters. This replaces SMS for everyday sign-in.</small></div>`,
    );
    bindSignup();
    return;
  }
  $("#app").innerHTML =
    `<main class="login"><section class="login-card"><div class="mark">TLC</div><span class="eyebrow">Team member and volunteer portal</span><h1>Create your account.</h1><p>Your name and email must exactly match your Planning Center record. We will verify you by texting the mobile number TLC already holds.</p><form id="startSignup"><div class="field"><label>First name</label><input name="firstName" autocomplete="given-name" required></div><div class="field"><label>Last name</label><input name="lastName" autocomplete="family-name" required></div><div class="field"><label>Email address</label><input name="email" type="email" autocomplete="email" required></div><button class="btn" style="width:100%">Continue and send text code</button></form><div class="notice"><b>Privacy:</b> we do not show the phone number or confirm whether a Planning Center record exists.</div><details style="margin-top:18px"><summary>Preview the role views</summary><div class="role-grid"><button class="btn alt" data-login="member">Team member preview</button><button class="btn alt" data-login="lead">Team lead preview</button><button class="btn alt" data-login="staff">Talent Management preview</button></div></details></section></main>`;
  bindSignup();
}
function bindSignup() {
  const accountLogin = $("#accountLogin");
  if (accountLogin)
    accountLogin.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api("account-login", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(new FormData(accountLogin))),
        });
        await load();
      } catch (err) {
        toast(err.message);
      }
    };
  if ($("#showSignup"))
    $("#showSignup").onclick = () => {
      state.auth.step = "details";
      renderLogin();
    };
  const start = $("#startSignup");
  if (start)
    start.onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(start));
      start.querySelector("button").disabled = true;
      try {
        const [result, catalogue] = await Promise.all([
          api("signup-start", { method: "POST", body: JSON.stringify(data) }),
          api("signup-groups"),
        ]);
        state.auth.challenge = result.challenge;
        state.auth.groups = catalogue.groups || [];
        state.auth.step = "verify";
        renderLogin();
        toast(result.message);
      } catch (err) {
        toast(err.message);
        start.querySelector("button").disabled = false;
      }
    };
  if ($("#authBack"))
    $("#authBack").onclick = () => {
      state.auth = {
        step: "signin",
        challenge: null,
        groups: [],
        selected: new Set(),
        search: "",
      };
      renderLogin();
    };
  if ($("#groupSearch"))
    $("#groupSearch").oninput = (e) => {
      state.auth.search = e.target.value;
      renderLogin();
      setTimeout(() => $("#groupSearch")?.focus(), 0);
    };
  document
    .querySelectorAll("[data-group]")
    .forEach(
      (x) =>
        (x.onchange = () =>
          x.checked
            ? state.auth.selected.add(x.dataset.group)
            : state.auth.selected.delete(x.dataset.group)),
    );
  const verify = $("#verifySignup");
  if (verify)
    verify.onsubmit = async (e) => {
      e.preventDefault();
      if (!state.auth.selected.size)
        return toast("Select at least one serving team.");
      const form = new FormData(verify),
        code = form.get("code"),
        password = form.get("password");
      try {
        await api("signup-verify", {
          method: "POST",
          body: JSON.stringify({
            challenge: state.auth.challenge,
            code,
            password,
            groupIds: [...state.auth.selected],
          }),
        });
        await load();
      } catch (err) {
        toast(err.message);
      }
    };
  document.querySelectorAll("[data-login]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await api("login", {
            method: "POST",
            body: JSON.stringify({ role: b.dataset.login }),
          });
          await load();
        } catch (e) {
          toast(e.message);
        }
      }),
  );
}
function renderError(msg) {
  $("#app").innerHTML =
    `<main class="login"><section class="login-card"><h1>Portal unavailable</h1><p>${esc(msg)}</p><button class="btn" onclick="location.reload()">Try again</button></section></main>`;
}
const navFor = (r) =>
  r === "member"
    ? [
        ["home", "Home"],
        ["schedule", "My rota"],
        ["teams", "Join a team"],
        ["docs", "Team guides"],
      ]
    : r === "lead"
      ? [
          ["home", "Home"],
          ["schedule", "My rota"],
          ["requests", "Join requests"],
          ["teams", "Teams"],
          ["docs", "Team guides"],
        ]
      : [
          ["home", "Overview"],
          ["schedule", "Scheduling"],
          ["requests", "Join requests"],
          ["roles", "Roles"],
          ["teams", "Teams"],
          ["docs", "Documentation"],
        ];
function render() {
  const d = state.data,
    u = d.user,
    nav = navFor(u.role);
  $("#app").innerHTML =
    `<div class="shell"><aside class="side"><div class="brand"><div class="mark">TLC</div><div><b>Team Portal</b><small>Serve · Grow · Belong</small></div></div><nav class="nav">${nav.map((x) => `<button data-page="${x[0]}" class="${state.page === x[0] ? "active" : ""}">${x[1]}</button>`).join("")}</nav><div class="side-foot">Planning Center remains read-only. Portal decisions and documents are stored separately.</div></aside><main class="main"><header class="top"><div><span class="eyebrow">${u.role === "staff" ? "Talent Management" : u.role === "lead" ? "Team lead" : "Team member"}</span><h1>${title()}</h1></div><div class="person"><div class="avatar">${u.name
      .split(" ")
      .map((x) => x[0])
      .slice(0, 2)
      .join(
        "",
      )}</div><div><b>${esc(u.name)}</b><small>${u.role}</small></div><button class="btn alt small" id="logout">Sign out</button></div></header>${content()}</main><nav class="mobile-nav">${nav.map((x) => `<button data-page="${x[0]}" class="${state.page === x[0] ? "active" : ""}">${x[1]}</button>`).join("")}</nav></div>${modal()}`;
  bind();
}
function title() {
  return (
    {
      home: "Welcome to your serving home",
      schedule:
        state.data.user.role === "member" ? "My serving rota" : "Scheduling",
      teams: "Find your place to serve",
      requests: "Team join requests",
      roles: "Roles and appointments",
      docs: state.data.user.role === "staff" ? "Documentation" : "Team guides",
    }[state.page] || "Team Portal"
  );
}
function content() {
  return (
    { home, schedule, teams, requests, roles, docs }[state.page] || home
  )();
}
function home() {
  const d = state.data;
  return `<section class="hero"><div><span class="eyebrow">Version one</span><h2>Everything needed to serve well, in one place.</h2><p>See your next assignment, team membership and approved guides. Team changes remain controlled by your leaders.</p></div><div class="source"><span>Planning Center connection</span><b>${d.source.planningCenter ? "Configured" : "Preview data"}</b><span style="margin-top:8px">Portal database</span><b>${d.source.database ? "Persistent" : "Local preview memory"}</b></div></section><div class="section-head"><h2>At a glance</h2></div><div class="grid"><article class="card"><span class="badge">Next assignment</span><h3 style="margin-top:12px">${esc(d.schedule[0]?.title || "No upcoming assignment")}</h3><p>${esc(d.schedule[0]?.role || "")} · ${esc(d.schedule[0]?.location || "")}</p></article><article class="card"><span class="badge pending">Join requests</span><h3 style="margin-top:12px">${d.requests.filter((x) => x.status === "pending").length} awaiting action</h3><p>Members request; the correct team lead or Talent Management decides.</p></article><article class="card"><span class="badge">Team knowledge</span><h3 style="margin-top:12px">${d.documents.length} available guides</h3><p>Read approved guidance or maintain editable versions with permission.</p></article></div>`;
}
function schedule() {
  const rows = state.data.schedule,
    canManage = state.data.user.role !== "member",
    managed = state.data.managedEvents || [];
  const mine = rows.length
? `<div class="grid">${rows.map((x) => `<article class="card schedule"><span class="date">${new Date(x.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span><span class="badge ${x.status === "Pending" ? "pending" : ""}" style="float:right">${esc(x.status)}</span><h3 style="margin-top:14px">${esc(x.title)}</h3><p>${esc(x.role)} · ${esc(x.team)}</p><div class="detail"><span>Call time</span><b>${esc(x.callTime)}</b></div><div class="detail"><span>Starts</span><b>${esc(x.serviceTime)}</b></div><div class="detail"><span>Location</span><b>${esc(x.location || "To be confirmed")}</b></div>${x.reportTo ? `<div class="detail"><span>Notes</span><b>${esc(x.reportTo)}</b></div>` : ""}<div class="actions"><button class="btn alt small" data-calendar="${x.id}">Add to calendar</button>${x.status === "Pending" ? `<button class="btn small" data-respond="${x.id}" data-status="accepted">Accept</button><button class="btn danger small" data-respond="${x.id}" data-status="declined">Decline</button><button class="btn alt small" data-respond="${x.id}" data-status="replacement_requested">Request replacement</button>` : ""}</div></article>`).join("")}</div>`
    : `<div class="empty">You have no upcoming assignments.</div>`;
  if (!canManage)
    return `${mine}<div class="notice">Your rota is managed in this portal. Accept or decline here and add confirmed assignments to your calendar.</div>`;
  return `<div class="section-head"><h2>Team events and rotas</h2><button class="btn" data-open="event">Create event & assign</button></div>${managed.length ? `<div class="grid">${managed.map((e) => `<article class="card span6"><span class="date">${new Date(e.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span><span class="badge ${e.status === "draft" ? "pending" : ""}" style="float:right">${esc(e.status)} · ${esc(e.team_name)}</span><h3 style="margin-top:14px">${esc(e.title)}</h3><p>${esc(e.location || "Location to be confirmed")} · ${esc(e.callTime)} call</p>${e.assignments.map((a) => `<div class="detail"><span>${esc(a.name)} · ${esc(a.position)}</span><b>${esc(a.status)} <button class="btn danger small" data-remove-assignment="${a.id}" data-event="${e.id}">Remove</button></b></div>`).join("")}<div class="actions"><button class="btn alt small" data-edit-event="${e.id}">Edit</button><button class="btn alt small" data-assign-event="${e.id}">Add volunteer</button><button class="btn alt small" data-duplicate-event="${e.id}">Duplicate</button><button class="btn danger small" data-cancel-event="${e.id}">Cancel</button></div></article>`).join("")}</div>` : `<div class="empty">No upcoming team events. Create the first schedule here.</div>`}<div class="section-head"><h2>My own assignments</h2></div>${mine}`;
}
function teams() {
  const own = new Map(
    state.data.requests
      .filter((x) => x.person_id === state.data.user.id)
      .map((x) => [x.team_id, x]),
  );
  return `<div class="grid">${state.data.teams
    .map((t) => {
      const r = own.get(t.id);
      return `<article class="card"><span class="badge">${esc(t.location)}</span><h3 style="margin-top:12px">${esc(t.name)}</h3><p>${esc(t.purpose)}</p><div class="detail"><span>Team lead</span><b>${esc(t.lead)}</b></div>${state.data.user.role === "member" ? `<div class="actions">${r ? `<span class="badge ${r.status}">${esc(r.status)}</span>` : `<button class="btn small" data-join="${t.id}">Request to join</button>`}</div>` : ""}</article>`;
    })
    .join("")}</div>`;
}
function requests() {
  const rows = state.data.requests;
  return rows.length
    ? `<div class="grid">${rows.map((r) => `<article class="card span6"><span class="badge ${r.status}">${esc(r.status)}</span><h3 style="margin-top:12px">${esc(r.person_name)}</h3><p>Requested ${esc(r.team_name)}</p><p>${esc(r.message || "No message supplied.")}</p>${r.status === "pending" ? `<div class="actions"><button class="btn small" data-decide="${r.id}" data-status="approved">Approve</button><button class="btn danger small" data-decide="${r.id}" data-status="declined">Decline</button></div>` : ""}</article>`).join("")}</div>`
    : `<div class="empty">No join requests yet.</div>`;
}
function roles() {
  const rows = state.data.roles;
  const accounts = state.data.accounts || [];
  return `<div class="section-head"><h2>Verified accounts</h2><div class="actions"><button class="btn alt" id="syncTeams">Sync teams from Planning Center</button><button class="btn" data-open="appoint">Appoint position</button></div></div>${accounts.length ? `<div class="grid">${accounts.map((a) => `<article class="card span6"><span class="badge">${esc(a.status)}</span><h3 style="margin-top:12px">${esc(a.name)}</h3><p>${a.groups.length ? "Serving teams" : "No serving teams assigned"}</p>${a.groups.map((g) => `<div class="detail"><span>${esc(g.name)}</span><b>${esc(g.status)}${g.status === "claimed" ? ` <button class="btn small" data-confirm-group="${g.id}" data-person="${a.id}">Confirm</button>` : ""} <button class="btn danger small" data-remove-group="${g.id}" data-person="${a.id}">Remove</button></b></div>`).join("")}<div class="actions"><button class="btn alt small" data-add-group="${a.id}">Add serving team</button></div></article>`).join("")}</div>` : `<div class="empty">Accounts will appear after members complete verification.</div>`}<div class="section-head"><h2>Elevated appointments</h2></div>${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Person</th><th>Position</th><th>Scope</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.person_name)}</td><td>${esc(r.role === "staff" ? "Talent Management" : "Team Lead")}</td><td>${esc(r.team_name || "All teams")}</td><td><span class="badge">${esc(r.status)}</span></td><td>${r.status === "active" ? `<button class="btn danger small" data-revoke="${r.id}">Revoke</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No elevated appointments have been made.</div>`}`;
}
function docs() {
  const canEdit = state.data.user.role !== "member";
  return `<div class="section-head"><h2>Approved team knowledge</h2>${canEdit ? `<div class="actions"><button class="btn alt" data-open="upload">Upload file</button><button class="btn" data-open="document">Create guide</button></div>` : ""}</div><div class="grid">${state.data.documents.map((d) => `<article class="card"><span class="badge">${esc(d.file_type || "GUIDE")}</span><h3 style="margin-top:12px">${esc(d.title)}</h3><p>${esc(d.summary || d.team_name || "")}</p><div class="detail"><span>Version</span><b>${esc(d.version || 1)}</b></div><div class="detail"><span>Access</span><b>${canEdit ? "Edit" : "Read only"}</b></div><div class="actions"><button class="btn alt small" data-doc="${d.id}">Open</button>${d.source_url ? `<a class="btn alt small" href="${esc(d.source_url)}" target="_blank" rel="noopener">Source file</a>` : ""}${canEdit ? `<button class="btn small" data-edit="${d.id}">Edit</button><button class="btn alt small" data-permission="${d.id}">Permissions</button>` : ""}</div></article>`).join("")}</div><div class="notice"><b>DOCX, PDF and CSV sources:</b> v1 preserves uploaded files in managed blob storage and maintains editable portal content as versioned text. Original PDF layout itself is not edited in-browser.</div>`;
}
function modal() {
  if (!state.modal) return "";
  if (state.modal.type === "upload")
    return wrap(
      "Upload a source file",
      `<form id="uploadForm"><div class="field"><label>DOCX, PDF or CSV · maximum 3 MB</label><input name="file" type="file" accept=".docx,.pdf,.csv" required></div><div class="field"><label>Guide title</label><input name="title" required></div><div class="field"><label>Team visibility</label><select name="teamId"><option value="">All teams</option>${state.data.teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></div><button class="btn">Upload and preserve source</button></form>`,
    );
  if (state.modal.type === "join") {
    const t = state.data.teams.find((x) => x.id === state.modal.id);
    return wrap(
      `Join ${esc(t.name)}`,
      `<p>Your request goes to ${esc(t.lead)} for approval.</p><form id="joinForm"><div class="field"><label>Why would you like to join? (optional)</label><textarea name="message"></textarea></div><button class="btn">Send request</button></form>`,
    );
  }
  if (state.modal.type === "appoint")
    return wrap(
      "Appoint an existing platform member",
      `<form id="appointForm"><div class="field"><label>Verified member</label><select name="personId" required><option value="">Choose an account</option>${(state.data.accounts || []).map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></div><div class="field"><label>Portal position</label><select name="role" id="appointmentRole"><option value="lead">Team Lead</option><option value="staff">Talent Management</option></select></div><div class="field" id="appointmentScope"><label>Serving-team scope</label><select name="teamId">${state.data.teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></div><button class="btn">Create appointment</button></form>`,
    );
  if (state.modal.type === "event") {
    const existing =
      (state.data.managedEvents || []).find((x) => x.id === state.modal.id) || {};
    const allowedTeams =
      state.data.user.role === "staff"
        ? state.data.teams
        : state.data.teams.filter((t) =>
            (state.data.user.teamIds || [state.data.user.teamId]).includes(t.id),
          );
    return wrap(
      "Create an event and rota",
      `<form id="eventForm"><input type="hidden" name="id" value="${esc(existing.id || "")}"><div class="field"><label>Event name</label><input name="title" value="${esc(existing.title || "")}" placeholder="Sunday service" maxlength="140" required></div>${existing.id ? "" : `<div class="field"><label>Serving team</label><select name="teamId" required><option value="">Choose a team</option>${allowedTeams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></div>`}<div class="field"><label>Date</label><input name="date" type="date" min="${new Date().toISOString().slice(0, 10)}" value="${esc(existing.date || "")}" required></div><div class="form-grid"><div class="field"><label>Call time</label><input name="callTime" type="time" value="${esc(existing.callTime || "")}" required></div><div class="field"><label>Start time</label><input name="startTime" type="time" value="${esc(existing.startTime || "")}" required></div><div class="field"><label>End time</label><input name="endTime" type="time" value="${esc(existing.endTime || "")}"></div></div><div class="field"><label>Location</label><input name="location" value="${esc(existing.location || "")}" placeholder="Woodford campus"></div>${existing.id ? "" : `<div class="field"><label>Position / duty</label><input name="position" placeholder="Data Team member" maxlength="100" required></div><div class="field"><label>Assign verified volunteers</label><select name="personIds" multiple size="${Math.min(8, Math.max(3, (state.data.schedulableMembers || []).length))}" required>${(state.data.schedulableMembers || []).map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select><small>Use Ctrl/Command to select more than one person.</small></div><div class="field"><label>Repeat</label><select name="repeat"><option value="1">One event</option><option value="4">Weekly · 4 occurrences</option><option value="8">Weekly · 8 occurrences</option><option value="12">Weekly · 12 occurrences</option></select></div>`}<div class="field"><label>Status</label><select name="status"><option value="published" ${existing.status === "published" ? "selected" : ""}>Published</option><option value="draft" ${existing.status === "draft" ? "selected" : ""}>Draft</option></select></div><div class="field"><label>Instructions (optional)</label><textarea name="notes" placeholder="Where to report, clothing, equipment or other notes">${esc(existing.notes || "")}</textarea></div><button class="btn">${existing.id ? "Save changes" : "Create rota"}</button></form>`,
      "wide",
    );
  }
  if (state.modal.type === "membership")
    return wrap("Add serving team", `<form id="membershipForm"><input type="hidden" name="personId" value="${esc(state.modal.id)}"><div class="field"><label>Serving team</label><select name="groupId" required><option value="">Choose a team</option>${state.data.teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></div><button class="btn">Add and confirm team</button></form>`);
  if (state.modal.type === "assignment")
    return wrap("Add or update volunteer", `<form id="assignmentForm"><input type="hidden" name="eventId" value="${esc(state.modal.id)}"><div class="field"><label>Verified volunteer</label><select name="personId" required><option value="">Choose a person</option>${(state.data.schedulableMembers || []).map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></div><div class="field"><label>Position / duty</label><input name="position" required maxlength="100"></div><button class="btn">Assign volunteer</button></form>`);
  if (state.modal.type === "document") {
    const d = state.data.documents.find((x) => x.id === state.modal.id) || {};
    return wrap(
      d.id ? "Edit guide" : "Create guide",
      `<form id="docForm"><input type="hidden" name="id" value="${esc(d.id || "")}"><div class="field"><label>Title</label><input name="title" required value="${esc(d.title || "")}"></div><div class="field"><label>Summary</label><input name="summary" value="${esc(d.summary || "")}"></div><div class="field"><label>Team visibility</label><select name="teamId"><option value="">All teams</option>${state.data.teams.map((t) => `<option value="${t.id}" ${d.team_id === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div><div class="field"><label>Editable content</label><textarea name="content">${esc(d.content || "")}</textarea></div><button class="btn">Save new version</button></form>`,
      "wide",
    );
  }
  if (state.modal.type === "read") {
    const d = state.data.documents.find((x) => x.id === state.modal.id);
    return wrap(
      esc(d.title),
      `<p>${esc(d.content || "No preview text is available.").replace(/\n/g, "<br>")}</p><div class="notice">Version ${esc(d.version || 1)} · ${esc(d.team_name || "All teams")}</div>`,
    );
  }
  if (state.modal.type === "permission")
    return wrap(
      "Document permissions",
      `<p>Grant a specific existing member read-only or edit access.</p><form id="permissionForm"><input type="hidden" name="documentId" value="${esc(state.modal.id)}"><div class="field"><label>Planning Center person ID</label><input name="personId" required></div><div class="field"><label>Permission</label><select name="permission"><option value="read">Read only</option><option value="edit">Edit approved</option></select></div><button class="btn">Save permission</button></form>`,
    );
  return "";
}
function wrap(title, body, cls = "") {
  return `<div class="modal-bg"><section class="modal ${cls}"><div class="modal-head"><h2>${title}</h2><button class="close">×</button></div>${body}</section></div>`;
}
async function refresh(msg) {
  state.data = await api("bootstrap");
  state.modal = null;
  render();
  if (msg) toast(msg);
}
function bind() {
  document.querySelectorAll("[data-page]").forEach(
    (b) =>
      (b.onclick = () => {
        state.page = b.dataset.page;
        render();
      }),
  );
  $("#logout").onclick = async () => {
    await api("logout");
    state.data = null;
    state.page = "home";
    renderLogin();
  };
  document.querySelectorAll("[data-join]").forEach(
    (b) =>
      (b.onclick = () => {
        state.modal = { type: "join", id: b.dataset.join };
        render();
      }),
  );
  document.querySelectorAll("[data-open]").forEach(
    (b) =>
      (b.onclick = () => {
        state.modal = { type: b.dataset.open };
        render();
      }),
  );
  document.querySelectorAll("[data-doc]").forEach(
    (b) =>
      (b.onclick = () => {
        state.modal = { type: "read", id: b.dataset.doc };
        render();
      }),
  );
  document.querySelectorAll("[data-edit]").forEach(
    (b) =>
      (b.onclick = () => {
        state.modal = { type: "document", id: b.dataset.edit };
        render();
      }),
  );
  document.querySelectorAll("[data-permission]").forEach(
    (b) =>
      (b.onclick = () => {
        state.modal = { type: "permission", id: b.dataset.permission };
        render();
      }),
  );
  document.querySelectorAll(".close,.modal-bg").forEach(
    (b) =>
      (b.onclick = (e) => {
        if (e.target === b) {
          state.modal = null;
          render();
        }
      }),
  );
  document.querySelectorAll("[data-decide]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await api("decide", {
            method: "POST",
            body: JSON.stringify({
              id: b.dataset.decide,
              status: b.dataset.status,
            }),
          });
          await refresh(`Request ${b.dataset.status}.`);
        } catch (e) {
          toast(e.message);
        }
      }),
  );
  document.querySelectorAll("[data-revoke]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("Revoke this elevated appointment?")) return;
        try {
          await api("revoke-role", {
            method: "POST",
            body: JSON.stringify({ id: b.dataset.revoke }),
          });
          await refresh("Appointment revoked.");
        } catch (e) {
          toast(e.message);
        }
      }),
  );
  document.querySelectorAll("[data-confirm-group]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await api("confirm-group", {
            method: "POST",
            body: JSON.stringify({
              personId: b.dataset.person,
              groupId: b.dataset.confirmGroup,
              status: "confirmed",
            }),
          });
          await refresh("Serving team confirmed.");
        } catch (e) {
          toast(e.message);
        }
      }),
  );
  if ($("#syncTeams"))
    $("#syncTeams").onclick = async () => {
      try {
        toast("Syncing Planning Center teams…");
        const result = await api("sync-teams", { method: "POST", body: "{}" });
        await refresh(`${result.groups} Planning Center teams synchronised.`);
      } catch (e) {
        toast(e.message);
      }
    };
  document.querySelectorAll("[data-add-group]").forEach(
    (b) =>
      (b.onclick = () => {
        state.modal = { type: "membership", id: b.dataset.addGroup };
        render();
      }),
  );
  document.querySelectorAll("[data-remove-group]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("Remove this serving-team membership?")) return;
        try {
          await api("account-group", {
            method: "POST",
            body: JSON.stringify({
              operation: "remove",
              personId: b.dataset.person,
              groupId: b.dataset.removeGroup,
            }),
          });
          await refresh("Serving team removed.");
        } catch (e) {
          toast(e.message);
        }
      }),
  );
  document.querySelectorAll("[data-edit-event]").forEach(
    (b) =>
      (b.onclick = () => {
        state.modal = { type: "event", id: b.dataset.editEvent };
        render();
      }),
  );
  document.querySelectorAll("[data-assign-event]").forEach(
    (b) =>
      (b.onclick = () => {
        state.modal = { type: "assignment", id: b.dataset.assignEvent };
        render();
      }),
  );
  document.querySelectorAll("[data-cancel-event]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("Cancel this event and remove it from member rotas?")) return;
        try {
          await api("update-event", { method: "POST", body: JSON.stringify({ id: b.dataset.cancelEvent, status: "cancelled" }) });
          await refresh("Event cancelled.");
        } catch (e) { toast(e.message); }
      }),
  );
  document.querySelectorAll("[data-duplicate-event]").forEach(
    (b) =>
      (b.onclick = async () => {
        const date = prompt("New event date (YYYY-MM-DD)");
        if (!date) return;
        try {
          await api("duplicate-event", { method: "POST", body: JSON.stringify({ id: b.dataset.duplicateEvent, date }) });
          await refresh("Draft rota duplicated.");
        } catch (e) { toast(e.message); }
      }),
  );
  document.querySelectorAll("[data-remove-assignment]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("Remove this volunteer from the event?")) return;
        try {
          await api("assignment", { method: "POST", body: JSON.stringify({ operation: "remove", eventId: b.dataset.event, assignmentId: b.dataset.removeAssignment }) });
          await refresh("Volunteer removed from rota.");
        } catch (e) { toast(e.message); }
      }),
  );
  document.querySelectorAll("[data-calendar]").forEach(
    (b) =>
      (b.onclick = () => {
        const x = state.data.schedule.find((s) => s.id === b.dataset.calendar),
          start =
            x.date.replaceAll("-", "") +
            "T" +
            x.serviceTime.replace(":", "") +
            "00",
          url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(x.title + " — " + x.role)}&dates=${start}/${start}&location=${encodeURIComponent(x.location)}&details=${encodeURIComponent("Call time: " + x.callTime + ". Report to: " + x.reportTo)}`;
        window.open(url, "_blank", "noopener");
      }),
  );
  document.querySelectorAll("[data-respond]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await api("respond-assignment", {
            method: "POST",
            body: JSON.stringify({ id: b.dataset.respond, status: b.dataset.status }),
          });
          await refresh(`Assignment ${b.dataset.status}.`);
        } catch (e) {
          toast(e.message);
        }
      }),
  );
  bindForms();
  if ($("#appointmentRole"))
    $("#appointmentRole").onchange = (e) => {
      $("#appointmentScope").hidden = e.target.value === "staff";
    };
}
function bindForms() {
  const submit = async (form, action, success) => {
    const data = Object.fromEntries(new FormData(form));
    try {
      await api(action, { method: "POST", body: JSON.stringify(data) });
      await refresh(success);
    } catch (e) {
      toast(e.message);
    }
  };
  if ($("#joinForm"))
    $("#joinForm").onsubmit = async (e) => {
      e.preventDefault();
      const teamId = state.modal?.id,
        data = Object.fromEntries(new FormData(e.currentTarget));
      try {
        await api("join", {
          method: "POST",
          body: JSON.stringify({ ...data, teamId }),
        });
        await refresh("Join request sent.");
      } catch (err) {
        toast(err.message);
      }
    };
  if ($("#appointForm"))
    $("#appointForm").onsubmit = (e) => {
      e.preventDefault();
      submit(e.currentTarget, "appoint", "Appointment created.");
    };
  if ($("#eventForm"))
    $("#eventForm").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget,
        data = Object.fromEntries(new FormData(form));
      if (form.querySelector("[name=personIds]"))
        data.personIds = [...form.querySelector("[name=personIds]").selectedOptions].map(
          (x) => x.value,
        );
      try {
        await api(data.id ? "update-event" : "create-event", { method: "POST", body: JSON.stringify(data) });
        await refresh(data.id ? "Event updated." : "Event created and volunteers assigned.");
      } catch (err) {
        toast(err.message);
      }
    };
  if ($("#membershipForm"))
    $("#membershipForm").onsubmit = (e) => {
      e.preventDefault();
      submit(e.currentTarget, "account-group", "Serving team added and confirmed.");
    };
  if ($("#assignmentForm"))
    $("#assignmentForm").onsubmit = (e) => {
      e.preventDefault();
      submit(e.currentTarget, "assignment", "Volunteer assigned.");
    };
  if ($("#docForm"))
    $("#docForm").onsubmit = (e) => {
      e.preventDefault();
      submit(e.currentTarget, "document", "New document version saved.");
    };
  if ($("#permissionForm"))
    $("#permissionForm").onsubmit = (e) => {
      e.preventDefault();
      submit(e.currentTarget, "permission", "Permission updated.");
    };
  if ($("#uploadForm"))
    $("#uploadForm").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget,
        file = form.file.files[0];
      if (!file) return toast("Choose a file.");
      if (file.size > 3 * 1024 * 1024)
        return toast("File must be 3 MB or smaller.");
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      try {
        await api("upload", {
          method: "POST",
          body: JSON.stringify({
            name: file.name,
            mime: file.type,
            base64,
            title: form.title.value,
            teamId: form.teamId.value,
          }),
        });
        await refresh("Source file uploaded.");
      } catch (err) {
        toast(err.message);
      }
    };
}
load();
