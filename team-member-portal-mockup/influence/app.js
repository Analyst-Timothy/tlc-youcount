const API = "/influence-api",
  TOKEN = "influence_web_session";
const state = {
  account: null,
  requests: [],
  page: "home",
  filter: "all",
  modal: null,
  activity: [],
  policy: 0,
  policyAgreed: false,
};
const policy = [
  [
    "Lead with love and respect",
    "Treat everyone with dignity and kindness. Respect different backgrounds and perspectives, disagree graciously, and never bully, harass or discriminate.",
  ],
  [
    "Build meaningful connections",
    "Welcome others, share encouragement and opportunities, and contribute positively. Honour our faith with humility.",
  ],
  [
    "Protect privacy and safety",
    "Do not share private messages, personal information or images without permission. Respect boundaries and report safeguarding concerns.",
  ],
  [
    "Share responsibly",
    "Share accurate, appropriate and useful content. No spam, unsolicited sales, unauthorised fundraising, rumours or unwanted romantic contact.",
  ],
  [
    "Our community promise",
    "I commit to treating others with love and respect, protecting fellow members and contributing positively to our community.",
  ],
];
const directory = [
  ["Grace Mensah", "People & Culture", "GM", "#df18a4"],
  ["David Adebayo", "Finance & Growth", "DA", "#4a49fa"],
  ["Maya Thompson", "Brand & Communications", "MT", "#6b6ade"],
  ["Samuel Okoro", "Technology", "SO", "#16816d"],
];
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
async function api(action, body = {}) {
  const token = localStorage.getItem(TOKEN);
  const r = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...body }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok)
    throw new Error(d.message || "Something went wrong. Please try again.");
  if (d.token) localStorage.setItem(TOKEN, d.token);
  return d;
}
function toast(message) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}
function initials(x) {
  return (
    `${x.firstName?.[0] || ""}${x.lastName?.[0] || ""}`.toUpperCase() || "IN"
  );
}
function avatar(x, small = "") {
  return x.avatarData
    ? `<img class="avatar ${small}" src="${esc(x.avatarData)}" alt="">`
    : `<span class="avatar ${small}">${esc(initials(x))}</span>`;
}
function relative(value) {
  const ms = Date.now() - new Date(value).getTime(),
    h = Math.floor(ms / 36e5),
    d = Math.floor(ms / 864e5);
  return h < 1
    ? "Just now"
    : h < 24
      ? `${h}h ago`
      : d === 1
        ? "Yesterday"
        : `${d}d ago`;
}
function category(x) {
  return (
    { service: "Service", career: "Career", support: "Private support" }[x] || x
  );
}
function brand() {
  return `<div class="brand"><b>TLC</b><span>Influence<br>Network</span></div>`;
}
async function boot() {
  if (!localStorage.getItem(TOKEN)) return auth();
  try {
    const d = await api("bootstrap");
    state.account = d.account;
    state.requests = d.requests || [];
    render();
  } catch (e) {
    localStorage.removeItem(TOKEN);
    auth();
  }
}
function auth(step = "join", ctx = {}) {
  $("#app").innerHTML =
    `<main class="auth"><div class="auth-wrap"><div class="auth-brand">${brand()}</div><section class="auth-card"><div class="accent"></div>${step === "join" ? `<h1>Join the network</h1><p>Use the email registered in TLC Planning Center.</p><form id="authForm"><div class="field"><label>Email address</label><input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div><div class="auth-actions"><button class="button wide">Send verification code</button><button type="button" class="link" id="showLogin">Already created a password? Sign in</button></div></form>` : step === "code" ? `<button class="link" id="authBack">← Back</button><h1>Check your email</h1><p>Enter the six-digit code sent to ${esc(ctx.email)}.</p><form id="authForm"><div class="field"><label>Verification code</label><input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required placeholder="000000"></div><button class="button wide">Verify email</button></form>` : step === "password" ? `<h1>Welcome${ctx.name ? `, ${esc(ctx.name)}` : ""}</h1><p>Create a password for quicker access next time.</p><form id="authForm"><div class="field"><label>Create password</label><input name="password" type="password" minlength="10" autocomplete="new-password" required placeholder="At least 10 characters"></div><button class="button wide">Create account</button></form>` : `<button class="link" id="authBack">← Back</button><h1>Welcome back</h1><p>Sign in with your Influence Network details.</p><form id="authForm"><div class="field"><label>Email address</label><input name="email" type="email" autocomplete="email" required></div><div class="field"><label>Password</label><input name="password" type="password" autocomplete="current-password" required></div><button class="button wide">Sign in</button></form>`}<p class="auth-note">Membership is limited to email addresses registered with TLC.</p><p class="error" id="authError" hidden></p></section></div></main>`;
  $("#showLogin")?.addEventListener("click", () => auth("login"));
  $("#authBack")?.addEventListener("click", () => auth());
  const f = $("#authForm");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const b = f.querySelector("button[type=submit],button:not([type])"),
      data = Object.fromEntries(new FormData(f));
    b.disabled = true;
    try {
      if (step === "join") {
        await api("requestOtp", data);
        auth("code", { email: data.email });
      } else if (step === "code") {
        const d = await api("verifyOtp", { email: ctx.email, code: data.code });
        if (d.existing) {
          state.account = d.account;
          await boot();
        } else
          auth("password", { setupToken: d.setupToken, name: d.firstName });
      } else if (step === "password") {
        const d = await api("setPassword", {
          setupToken: ctx.setupToken,
          password: data.password,
        });
        state.account = d.account;
        await boot();
      } else {
        const d = await api("login", data);
        state.account = d.account;
        await boot();
      }
    } catch (err) {
      const el = $("#authError");
      el.hidden = false;
      el.textContent = err.message;
      b.disabled = false;
    }
  };
}
function render() {
  if (state.account.policyRequired) return renderPolicy();
  if (state.account.profileRequired && state.page !== "profile")
    return renderProfile(true);
  const nav = [
    ["home", "Home"],
    ["requests", "Requests"],
    ["ask", "Ask"],
    ["network", "Network"],
    ["activity", "Activity"],
  ];
  $("#app").innerHTML =
    `<div class="shell"><header class="topbar"><div class="top-inner">${brand()}<nav class="nav">${nav.map((x) => `<button data-page="${x[0]}" class="${state.page === x[0] ? "active" : ""}">${x[1]}</button>`).join("")}</nav><button class="member" id="profileButton">${avatar(state.account)}<span>${esc(state.account.firstName)}</span></button></div></header><main class="page" id="view">${view()}</main><nav class="mobile-nav">${nav.map((x) => `<button data-page="${x[0]}" class="${state.page === x[0] ? "active" : ""}">${x[1]}</button>`).join("")}</nav></div>${state.modal ? modal() : ""}`;
  bind();
}
function view() {
  return (
    {
      home: home,
      requests: requestsPage,
      ask: askPage,
      network: networkPage,
      activity: activityPage,
      profile: () => profileHTML(false),
    }[state.page]?.() || home()
  );
}
function home() {
  const a = state.account;
  return `<section class="home-hero"><div class="hero-shade"><h1>Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"},<br>${esc(a.firstName)}</h1><p>A stronger you.<br>A kinder community.</p></div></section><form class="composer" id="quickAsk"><input name="detail" required minlength="15" placeholder="What do you need help with?"><button class="button">Post request</button></form><div class="section-head"><h2>Ways we can help</h2><button data-page="ask">See all →</button></div><div class="ways">${[
    ["service", "♟", "Find support for your community work"],
    ["career", "▣", "Get advice, opportunities and introductions"],
    ["support", "♥", "A safe space for personal challenges"],
  ]
    .map(
      (x) =>
        `<button class="way ${x[0]}" data-ask-kind="${x[0]}"><span class="way-icon">${x[1]}</span><b>${category(x[0])}</b><small>${x[2]}</small></button>`,
    )
    .join(
      "",
    )}</div><div class="section-head"><h2>From your network</h2><button data-page="requests">See all →</button></div><div class="grid"><div class="feed">${state.requests.slice(0, 3).map(requestCard).join("") || empty("No requests yet")}</div><aside class="rail"><div class="rail-card"><h3>Private by design</h3><p>Requests are visible to verified members. Every response is shared only with the person who asked.</p></div></aside></div>`;
}
function requestCard(r) {
  return `<article class="request" data-request="${r.id}"><div class="request-head">${avatar(r)}<div class="request-person"><b>${esc(r.firstName)} ${esc(r.lastName)}</b><span class="meta">${relative(r.createdAt)} · <span class="tag ${r.category}">${category(r.category)}</span></span></div>${r.isMine ? `<span class="tag mine">Your request</span>` : ""}</div><h3>${esc(r.title)}</h3><p>${esc(r.detail)}</p><div class="request-foot">⌁ ${r.responseCount} private ${r.responseCount === 1 ? "response" : "responses"}<button>${r.isMine ? "View responses" : "Reply privately"}</button></div></article>`;
}
function requestsPage() {
  const list =
    state.filter === "all"
      ? state.requests
      : state.requests.filter((x) => x.category === state.filter);
  return `<div class="page-title"><div><h1>Open requests</h1><p class="muted">Respond where you can make a genuine difference.</p></div><button class="button" data-page="ask">Ask the network</button></div><div class="chips">${["all", "service", "career", "support"].map((x) => `<button class="chip ${state.filter === x ? "active" : ""}" data-filter="${x}">${x === "all" ? "All" : category(x)}</button>`).join("")}</div><div class="grid"><div class="feed">${list.map(requestCard).join("") || empty("No matching requests")}</div><aside class="rail"><div class="rail-card"><h3>How it works</h3><p>Choose a request, send a private response and let the requester decide how to continue.</p></div></aside></div>`;
}
function askPage() {
  return `<div class="page-title"><div><h1>Ask for what you need</h1><p class="muted">Specific requests are easier for the right person to answer.</p></div></div><section class="profile-card" style="display:block;max-width:720px"><form id="askForm"><div class="field"><label>Choose a route</label><div class="chips">${["service", "career", "support"].map((x, i) => `<label class="chip"><input type="radio" name="category" value="${x}" ${i === 0 ? "checked" : ""}> ${category(x)}</label>`).join("")}</div></div><div class="field"><label>What do you need?</label><input name="title" minlength="5" maxlength="120" required placeholder="A short, clear headline"></div><div class="field"><label>Add helpful context</label><textarea name="detail" minlength="15" maxlength="1200" required placeholder="What would a useful response look like?"></textarea></div><p class="private-note">Visible to verified members. Responses are private and capped at five.</p><button class="button">Publish request</button></form></section>`;
}
function networkPage() {
  return `<div class="page-title"><div><h1>The network</h1><p class="muted">Discover the experience already in our community.</p></div></div><div class="people">${directory.map((x) => `<article class="profile-card"><span class="avatar" style="background:${x[3]}">${x[2]}</span><div><h3>${x[0]}</h3><span class="meta">${x[1]}</span></div></article>`).join("")}</div><p class="muted" style="text-align:center;margin-top:25px;font-size:12px">Directory search will connect to verified TLC profile data in the next release.</p>`;
}
function activityPage() {
  return `<div class="page-title"><div><h1>Activity</h1><p class="muted">Private responses to your requests.</p></div><button class="button secondary" id="refreshActivity">Refresh</button></div><div class="feed">${state.activity.length ? state.activity.map(responseCard).join("") : empty("No responses yet. Responses to your requests will appear here.")}</div>`;
}
function responseCard(x) {
  return `<article class="response-card"><div class="request-head">${avatar(x, "small")}<div><b>${esc(x.firstName)} ${esc(x.lastName)}</b><div class="meta">${relative(x.createdAt)} · Private response</div></div></div>${x.title ? `<div class="meta" style="margin-top:12px">Response to “${esc(x.title)}”</div>` : ""}<p>${esc(x.message)}</p></article>`;
}
function empty(text) {
  return `<div class="empty">${esc(text)}</div>`;
}
function profileHTML(required) {
  const a = state.account;
  return `<div class="page-title"><div><h1>${required ? "Complete your profile" : "Your profile"}</h1><p class="muted">Help the right people find you.</p></div></div><section class="profile-card" style="display:block"><form id="profileForm" class="profile-panel"><div class="photo-picker">${avatar(a)}<label class="button secondary">Choose photo<input id="avatarInput" type="file" accept="image/jpeg,image/png,image/webp" hidden></label></div><div><div class="field"><label>First name</label><input name="firstName" value="${esc(a.firstName)}" required></div><div class="field"><label>Last name</label><input name="lastName" value="${esc(a.lastName)}"></div><div class="field"><label>Professional headline</label><input name="headline" minlength="3" maxlength="120" required value="${esc(a.headline || "")}" placeholder="Product designer · Mentor"></div><div class="field"><label>Location</label><input name="location" value="${esc(a.location || "London")}"></div><div class="field"><label>About you</label><textarea name="bio" maxlength="500">${esc(a.bio || "")}</textarea></div><input type="hidden" name="avatarData" value=""><button class="button">Save profile</button>${required ? "" : ` <button type="button" class="button danger" id="logout">Sign out</button>`}</div></form></section>`;
}
function renderProfile(required) {
  state.page = "profile";
  render();
  if (required)
    document
      .querySelectorAll("[data-page]")
      .forEach((x) => (x.disabled = true));
}
function renderPolicy() {
  const i = state.policy,
    p = policy[i];
  $("#app").innerHTML =
    `<main class="policy"><section class="policy-card">${brand()}<div class="progress"><i style="width:${(i + 1) * 20}%"></i></div><span class="meta">COMMUNITY GUIDELINES · ${i + 1}/5</span><h1>${p[0]}</h1><p class="muted">${p[1]}</p>${i === 4 ? `<label><input type="checkbox" id="policyAgree" ${state.policyAgreed ? "checked" : ""}> I have read and agree to the Community Guidelines.</label>` : ""}<div class="policy-actions">${i ? `<button class="button secondary" id="policyBack">Back</button>` : ""}<button class="button" id="policyNext" ${i === 4 && !state.policyAgreed ? "disabled" : ""}>${i === 4 ? "Accept and enter" : "Next"}</button></div></section></main>`;
  $("#policyBack")?.addEventListener("click", () => {
    state.policy--;
    renderPolicy();
  });
  $("#policyAgree")?.addEventListener("change", (e) => {
    state.policyAgreed = e.target.checked;
    renderPolicy();
  });
  $("#policyNext").onclick = async () => {
    if (i < 4) {
      state.policy++;
      renderPolicy();
    } else {
      await api("acceptPolicy");
      state.account.policyRequired = false;
      render();
    }
  };
}
function modal() {
  const r = state.modal.request;
  if (state.modal.type === "respond")
    return `<div class="modal-bg"><section class="modal"><div class="modal-head"><div><span class="tag ${r.category}">${category(r.category)}</span><h2>${esc(r.title)}</h2></div><button class="close" data-close>×</button></div><p class="muted">${esc(r.detail)}</p><p class="private-note">Your name and message go only to the requester. They will not appear publicly.</p><form id="responseForm"><div class="field"><label>Your private response</label><textarea name="message" minlength="5" maxlength="1200" required placeholder="How can you help?"></textarea></div><button class="button">Send private response</button></form></section></div>`;
  return `<div class="modal-bg"><section class="modal"><div class="modal-head"><div><span class="tag mine">Your request</span><h2>${esc(r.title)}</h2></div><button class="close" data-close>×</button></div><p class="muted">${esc(r.detail)}</p><h3>Private responses</h3><div class="feed">${state.modal.loading ? "<p>Loading…</p>" : state.modal.responses?.length ? state.modal.responses.map(responseCard).join("") : empty("No one has responded yet.")}</div></section></div>`;
}
function bind() {
  document.querySelectorAll("[data-page]").forEach(
    (b) =>
      (b.onclick = async () => {
        state.page = b.dataset.page;
        if (state.page === "activity") await loadActivity();
        render();
      }),
  );
  $("#profileButton")?.addEventListener("click", () => {
    state.page = "profile";
    render();
  });
  document.querySelectorAll("[data-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        state.filter = b.dataset.filter;
        render();
      }),
  );
  document.querySelectorAll("[data-ask-kind]").forEach(
    (b) =>
      (b.onclick = () => {
        state.page = "ask";
        render();
        setTimeout(
          () =>
            (document.querySelector(
              `[name=category][value=${b.dataset.askKind}]`,
            ).checked = true),
        );
      }),
  );
  document
    .querySelectorAll("[data-request]")
    .forEach(
      (el) =>
        (el.onclick = () =>
          openRequest(state.requests.find((x) => x.id === el.dataset.request))),
    );
  $("#quickAsk")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = new FormData(e.target).get("detail");
    await createRequest({
      category: "service",
      title: text.slice(0, 110),
      detail: text,
    });
    e.target.reset();
  });
  $("#askForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createRequest(Object.fromEntries(new FormData(e.target)));
    state.page = "requests";
    render();
  });
  $("#refreshActivity")?.addEventListener("click", async () => {
    await loadActivity();
    render();
  });
  bindProfile();
  $("[data-close]")?.addEventListener("click", () => {
    state.modal = null;
    render();
  });
  $("#responseForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const d = await api("respond", {
        requestId: state.modal.request.id,
        ...Object.fromEntries(new FormData(e.target)),
      });
      state.requests = d.requests || state.requests;
      state.modal = null;
      render();
      toast("Private response sent");
    } catch (err) {
      toast(err.message);
    }
  });
}
async function createRequest(data) {
  try {
    const d = await api("createRequest", data);
    state.requests = d.requests || state.requests;
    toast("Request posted");
  } catch (e) {
    toast(e.message);
  }
}
async function openRequest(r) {
  if (!r) return;
  if (r.isMine) {
    state.modal = {
      type: "responses",
      request: r,
      loading: true,
      responses: [],
    };
    render();
    try {
      const d = await api("requestResponses", { requestId: r.id });
      state.modal = {
        type: "responses",
        request: r,
        responses: d.responses || [],
      };
      render();
    } catch (e) {
      toast(e.message);
    }
  } else {
    state.modal = { type: "respond", request: r };
    render();
  }
}
async function loadActivity() {
  try {
    const d = await api("activity");
    state.activity = d.activity || [];
  } catch (e) {
    toast(e.message);
  }
}
function bindProfile() {
  const f = $("#profileForm");
  if (!f) return;
  let avatarData = "";
  $("#avatarInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1400000)
      return toast("Choose an image smaller than 1.4 MB");
    const reader = new FileReader();
    reader.onload = () => {
      avatarData = reader.result;
      toast("Photo ready to save");
    };
    reader.readAsDataURL(file);
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(f));
      data.avatarData = avatarData;
      const d = await api("saveProfile", data);
      state.account = d.account;
      state.page = "home";
      render();
      toast("Profile saved");
    } catch (err) {
      toast(err.message);
    }
  };
  $("#logout")?.addEventListener("click", async () => {
    try {
      await api("logout");
    } catch {}
    localStorage.removeItem(TOKEN);
    auth();
  });
}
boot();
