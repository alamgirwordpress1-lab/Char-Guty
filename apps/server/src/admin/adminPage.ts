/**
 * The admin console: a single self-contained page with no build step. A sidebar leads to
 * the dashboard and to paged, filterable lists of players, matches and coin transactions;
 * a player opens in a side drawer with their history and the ban controls. Where you are
 * lives in the URL hash, so a refresh or a shared link lands on the same filtered view.
 * The token sits in sessionStorage: a refresh keeps you signed in, closing the tab forgets it.
 *
 * The markup is one template literal, so the script inside avoids backticks, "${" and
 * backslashes - all three would be read by TypeScript rather than reach the browser.
 */
export function adminPage(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Char Guty admin</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0b1220; --side: #0e1628; --card: #121c33; --card2: #0f182c; --line: #1f2b47;
    --text: #e6ebf6; --muted: #8e9bb8; --faint: #5d6a88; --accent: #4f8cff; --accent2: #7aa7ff;
    --green: #34d399; --red: #f87171; --amber: #fbbf24; --gold: #ffd166; --violet: #a78bfa;
  }
  * { box-sizing: border-box; }
  /* The hidden attribute has to beat display rules like #login's grid, or a hidden element still shows. */
  [hidden] { display: none !important; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 "Segoe UI", system-ui, -apple-system, sans-serif; }
  button, input, select { font: inherit; }
  a { color: var(--accent2); text-decoration: none; }
  .mono { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 12px; }
  .muted { color: var(--muted); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }

  /* sign in */
  #login { min-height: 100vh; display: grid; place-items: center; padding: 20px; }
  .login-card { width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 28px; }
  .login-card h1 { margin: 12px 0 4px; font-size: 20px; }
  .login-card p { margin: 0 0 18px; color: var(--muted); }

  /* shell */
  .sidebar { position: fixed; inset: 0 auto 0 0; width: 232px; background: var(--side); border-right: 1px solid var(--line);
             display: flex; flex-direction: column; z-index: 30; transition: transform .2s ease; }
  .brand { display: flex; align-items: center; gap: 10px; padding: 18px 18px 22px; }
  .logo { width: 34px; height: 34px; border-radius: 10px; background: linear-gradient(135deg, #ffd166, #f59e0b);
          color: #1b1300; font-weight: 800; display: grid; place-items: center; font-size: 14px; }
  .brand b { display: block; font-size: 15px; }
  .brand small { color: var(--muted); font-size: 12px; }
  .nav { display: flex; flex-direction: column; gap: 2px; padding: 0 10px; flex: 1; }
  .nav a { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 9px; color: var(--muted); font-weight: 500; }
  .nav a:hover { background: #16213b; color: var(--text); }
  .nav a.active { background: #1b2a4d; color: #fff; }
  .nav svg { width: 18px; height: 18px; flex: none; }
  .side-foot { padding: 14px; border-top: 1px solid var(--line); }
  .content { margin-left: 232px; min-height: 100vh; }
  .topbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 12px; padding: 14px 28px;
            background: rgba(11,18,32,.92); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); }
  .topbar h1 { font-size: 18px; margin: 0; flex: 1; }
  .updated { color: var(--faint); font-size: 12px; }
  .icon-btn { display: none; }
  main { padding: 24px 28px 60px; }
  .scrim { position: fixed; inset: 0; background: rgba(3,7,18,.6); z-index: 25; }

  /* controls */
  .btn { border: 1px solid var(--line); background: #17223c; color: var(--text); padding: 8px 14px; border-radius: 9px; cursor: pointer; white-space: nowrap; }
  .btn:hover { border-color: #2d3d63; background: #1b2846; }
  .btn:disabled { opacity: .45; cursor: default; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn.primary:hover { background: #3f7cf0; }
  .btn.danger { background: #b42318; border-color: #b42318; color: #fff; }
  .btn.block { width: 100%; }
  .input, select { background: var(--card2); color: var(--text); border: 1px solid var(--line); border-radius: 9px; padding: 8px 11px; min-width: 0; }
  .input:focus, select:focus { outline: 2px solid rgba(79,140,255,.45); border-color: var(--accent); }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .banner { margin: 16px 28px 0; padding: 10px 14px; border-radius: 10px; background: rgba(248,113,113,.12); border: 1px solid rgba(248,113,113,.35); color: #fecaca; }

  /* cards and panels */
  .stats { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
  .stat { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; }
  .stat .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .stat .value { font-size: 28px; font-weight: 700; margin: 4px 0 2px; font-variant-numeric: tabular-nums; }
  .stat .hint { color: var(--faint); font-size: 12px; }
  .stat.live .value { color: var(--green); }
  .stat.warn .value { color: var(--red); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
  .card-head h2 { font-size: 15px; margin: 0; }
  .card-body { padding: 16px 18px; }
  .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }

  /* toolbar */
  .toolbar { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 14px; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .field span { color: var(--muted); font-size: 12px; }
  .field.grow { flex: 1; min-width: 220px; }
  .field.grow .input { width: 100%; }

  /* tables */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 12px; font-weight: 600; color: var(--muted); padding: 10px 18px; background: var(--card2);
       border-bottom: 1px solid var(--line); white-space: nowrap; }
  td { padding: 11px 18px; border-bottom: 1px solid var(--line); white-space: nowrap; vertical-align: middle; }
  td.players { white-space: normal; min-width: 150px; }
  tbody tr:last-child td { border-bottom: 0; }
  tr.clickable { cursor: pointer; }
  tr.clickable:hover td { background: #16213b; }
  .who { display: flex; align-items: center; gap: 10px; }
  .avatar { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: #22335c; color: #cfe0ff; font-weight: 700; font-size: 13px; flex: none; }
  .who .name { font-weight: 600; }
  .who .sub { color: var(--faint); }
  .plink { color: var(--accent2); cursor: pointer; }
  .plink:hover { text-decoration: underline; }
  .badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid transparent; }
  .badge.green { color: var(--green); background: rgba(52,211,153,.1); border-color: rgba(52,211,153,.25); }
  .badge.red { color: var(--red); background: rgba(248,113,113,.1); border-color: rgba(248,113,113,.25); }
  .badge.amber { color: var(--amber); background: rgba(251,191,36,.1); border-color: rgba(251,191,36,.25); }
  .badge.blue { color: var(--accent2); background: rgba(79,140,255,.1); border-color: rgba(79,140,255,.25); }
  .badge.violet { color: var(--violet); background: rgba(167,139,250,.1); border-color: rgba(167,139,250,.25); }
  .badge.grey { color: var(--muted); background: rgba(142,155,184,.1); border-color: rgba(142,155,184,.2); }
  .plus { color: var(--green); font-weight: 600; }
  .minus { color: var(--red); font-weight: 600; }
  .empty { padding: 40px 18px; text-align: center; color: var(--muted); }
  .pager { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 18px; border-top: 1px solid var(--line); flex-wrap: wrap; }

  /* chart */
  #chartBox { min-height: 260px; }
  .chart { width: 100%; height: auto; display: block; }
  .chart .bar-a { fill: var(--accent); }
  .chart .bar-b { fill: var(--gold); }
  .chart .axis { fill: var(--faint); font-size: 12px; }
  .chart .gridline { stroke: var(--line); }
  .legend { display: flex; gap: 16px; color: var(--muted); font-size: 12px; margin-top: 6px; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  .dot.a { background: var(--accent); } .dot.b { background: var(--gold); }

  /* drawer */
  .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(560px, 100%); background: var(--side); border-left: 1px solid var(--line);
            z-index: 40; overflow-y: auto; box-shadow: -20px 0 50px rgba(0,0,0,.4); }
  .drawer-head { display: flex; align-items: center; gap: 14px; padding: 20px 22px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--side); z-index: 1; }
  .drawer-head .avatar { width: 44px; height: 44px; font-size: 18px; }
  .drawer-head h2 { margin: 0; font-size: 18px; }
  .drawer section { padding: 18px 22px; border-bottom: 1px solid var(--line); }
  .drawer h3 { margin: 0 0 12px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
  .tile .value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .tile .label { color: var(--muted); font-size: 12px; }
  .kv { display: grid; grid-template-columns: 110px 1fr; gap: 6px 12px; }
  .kv dt { color: var(--muted); }
  .kv dd { margin: 0; word-break: break-all; }
  .tabs { display: flex; gap: 6px; margin-bottom: 12px; }
  .tab { border: 1px solid var(--line); background: transparent; color: var(--muted); padding: 6px 12px; border-radius: 8px; cursor: pointer; }
  .tab.active { background: #1b2a4d; color: #fff; border-color: #2b3d68; }
  .mini td, .mini th { padding: 8px 10px; }
  .ban-box { background: rgba(248,113,113,.07); border: 1px solid rgba(248,113,113,.25); border-radius: 12px; padding: 14px; }

  .token-row { display: flex; gap: 8px; }
  .token-row .input { flex: 1; }
  .login-error { margin: 12px 0 0; padding: 9px 12px; border-radius: 9px; background: rgba(248,113,113,.12);
                 border: 1px solid rgba(248,113,113,.35); color: #fecaca; font-size: 13px; }
  #signin { margin-top: 14px; }

  @media (max-width: 1700px) { .two { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 1600px) { .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 640px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 860px) {
    .sidebar { transform: translateX(-100%); }
    .sidebar.open { transform: none; }
    .content { margin-left: 0; }
    .icon-btn { display: inline-flex; }
    main { padding: 18px 16px 50px; }
    .topbar { padding: 12px 16px; }
    .banner { margin: 12px 16px 0; }
    .tiles { grid-template-columns: repeat(2, 1fr); }
  }
</style></head>
<body>

<div id="login" hidden>
  <div class="login-card">
    <div class="logo">CG</div>
    <h1>Char Guty admin</h1>
    <p>Paste the value of ADMIN_TOKEN from the server's environment settings.</p>
    <div class="field"><span>Admin token</span>
      <div class="token-row"><input id="token" class="input" type="password" autocomplete="off" spellcheck="false" />
      <button id="showToken" class="btn" type="button">Show</button></div>
    </div>
    <p id="loginError" class="login-error" role="alert" hidden></p>
    <button id="signin" class="btn primary block">Sign in</button>
  </div>
</div>

<div id="shell" hidden>
  <aside id="sidebar" class="sidebar">
    <div class="brand"><div class="logo">CG</div><div><b>Char Guty</b><small>Admin console</small></div></div>
    <nav class="nav">
      <a href="#/dashboard" data-route="dashboard"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>Dashboard</a>
      <a href="#/players" data-route="players"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><path d="M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5.5-5-6.5"/></svg>Players</a>
      <a href="#/matches" data-route="matches"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 10h8M8 14h5"/></svg>Matches</a>
      <a href="#/ledger" data-route="ledger"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h4.5a1.5 1.5 0 0 1 0 3H10a1.5 1.5 0 0 0 0 3h5"/></svg>Transactions</a>
    </nav>
    <div class="side-foot"><button id="signout" class="btn block">Sign out</button></div>
  </aside>
  <div id="scrim" class="scrim" hidden></div>

  <div class="content">
    <header class="topbar">
      <button id="menu" class="btn icon-btn" aria-label="Menu">Menu</button>
      <h1 id="title">Dashboard</h1>
      <span id="updated" class="updated"></span>
      <button id="refresh" class="btn">Refresh</button>
    </header>
    <div id="banner" class="banner" hidden></div>
    <main id="view"></main>
  </div>

  <aside id="drawer" class="drawer" hidden></aside>
</div>

<script>
var TITLES = { dashboard: "Dashboard", players: "Players", matches: "Matches", ledger: "Transactions" };
var REASONS = { signup_bonus: "Signup bonus", match_stake: "Match stake", match_stake_refund: "Stake refund",
                match_win: "Match win", rewarded_ad: "Rewarded ad" };
var MODES = { friend: ["Friends", "violet"], random: ["Online", "blue"], computer: ["Vs computer", "grey"] };

var token = sessionStorage.getItem("cg_admin_token") || "";
var refreshTimer = null;
var reasonsCache = null;
var restoreFocus = null;

function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function num(n) { return Number(n || 0).toLocaleString(); }
function fullDate(d) { return d ? new Date(d).toLocaleString() : "-"; }
function ago(d) {
  if (!d) return "-";
  var s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  if (s < 30 * 86400) return Math.floor(s / 86400) + " d ago";
  return new Date(d).toLocaleDateString();
}
function initial(name) { return (String(name).trim().charAt(0) || "?").toUpperCase(); }
function badge(text, tone) { return "<span class='badge " + tone + "'>" + esc(text) + "</span>"; }
function reasonLabel(r) { return REASONS[r] || String(r).split("_").join(" "); }
function modeBadge(m) { var info = MODES[m] || [m, "grey"]; return badge(info[0], info[1]); }
function empty(text) { return "<div class='empty'>" + esc(text) + "</div>"; }

async function api(path, options) {
  var res = await fetch(path, Object.assign({}, options, {
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }
  }));
  if (res.status === 401) { signOut("The server stopped accepting this token. Sign in again."); throw new Error("Signed out"); }
  if (!res.ok) throw new Error("Request failed (" + res.status + ")");
  return res.json();
}

/* ---------- auth ---------- */
function showShell(signedIn) {
  $("#login").hidden = signedIn;
  $("#shell").hidden = !signedIn;
  clearInterval(refreshTimer);
  if (signedIn) {
    if (!location.hash) location.hash = "#/dashboard"; else render();
    refreshTimer = setInterval(function () {
      if (parseHash().route === "dashboard" && $("#drawer").hidden) render();
    }, 30000);
  } else {
    setTimeout(function () { $("#token").focus(); }, 0);
  }
}
function signOut(message) {
  token = "";
  sessionStorage.removeItem("cg_admin_token");
  closeDrawer();
  showShell(false);
  loginError(typeof message === "string" ? message : "");
}
function loginError(text) {
  $("#loginError").textContent = text || "";
  $("#loginError").hidden = !text;
}
/* Sign-in asks the server directly instead of going through api(), so a rejected token
   reads as a wrong token rather than as an expired session. */
async function checkToken(candidate) {
  var res;
  try {
    res = await fetch("/admin/stats", { headers: { Authorization: "Bearer " + candidate } });
  } catch (err) {
    return "Could not reach the server. Check the connection and try again.";
  }
  if (res.ok) return null;
  if (res.status === 401) return "That token does not match ADMIN_TOKEN on the server. Copy the value again - every character counts.";
  if (res.status === 404) return "The admin console is switched off: ADMIN_TOKEN is not set on the server.";
  return "The server had a problem (" + res.status + "). Wait a minute and try again.";
}
$("#signin").onclick = async function () {
  /* Pasting drags along spaces, and sometimes the quotes around a value; neither is part of the token. */
  var candidate = $("#token").value.trim().replace(/^["']+|["']+$/g, "");
  if (!candidate) { loginError("Paste the admin token first."); return; }
  if (/^[*]+$/.test(candidate)) {
    loginError("That is the hidden version of the token - only stars. Reveal the real value in the server settings, then copy it.");
    return;
  }
  var button = $("#signin");
  button.disabled = true;
  button.textContent = "Checking...";
  var problem = await checkToken(candidate);
  button.disabled = false;
  button.textContent = "Sign in";
  if (problem) { loginError(problem); return; }
  loginError("");
  token = candidate;
  sessionStorage.setItem("cg_admin_token", token);
  $("#token").value = "";
  showShell(true);
};
$("#showToken").onclick = function () {
  var field = $("#token");
  var reveal = field.type === "password";
  field.type = reveal ? "text" : "password";
  $("#showToken").textContent = reveal ? "Hide" : "Show";
};
$("#token").onkeydown = function (e) { if (e.key === "Enter") $("#signin").click(); };
$("#signout").onclick = function () { signOut(); };
$("#refresh").onclick = function () { render(); };
$("#menu").onclick = function () { $("#sidebar").classList.add("open"); $("#scrim").hidden = false; };
$("#scrim").onclick = function () { closeDrawer(); closeSidebar(); };
document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeDrawer(); closeSidebar(); } });
function closeSidebar() { $("#sidebar").classList.remove("open"); if ($("#drawer").hidden) $("#scrim").hidden = true; }

/* ---------- routing ---------- */
function parseHash() {
  var raw = location.hash.slice(1).replace(/^[/]/, "");
  var parts = raw.split("?");
  var params = {};
  new URLSearchParams(parts[1] || "").forEach(function (v, k) { params[k] = v; });
  return { route: TITLES[parts[0]] ? parts[0] : "dashboard", params: params };
}
function go(route, params) {
  var qs = new URLSearchParams();
  Object.keys(params || {}).forEach(function (k) {
    var v = params[k];
    if (v !== "" && v != null && v !== "all" && !(k === "page" && String(v) === "1")) qs.set(k, v);
  });
  var next = "#/" + route + (qs.toString() ? "?" + qs.toString() : "");
  if (location.hash === next) render(); else location.hash = next;
}
window.addEventListener("hashchange", function () { if (token) render(); });

async function render() {
  var state = parseHash();
  $$(".nav a").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-route") === state.route); });
  $("#title").textContent = TITLES[state.route];
  closeSidebar();
  $("#banner").hidden = true;
  var views = { dashboard: viewDashboard, players: viewPlayers, matches: viewMatches, ledger: viewLedger };
  try {
    await views[state.route](state.params);
    $("#updated").textContent = "Updated " + new Date().toLocaleTimeString();
    if (restoreFocus) {
      var el = $("[data-filter='" + restoreFocus + "']");
      if (el) { el.focus(); var len = el.value.length; if (el.setSelectionRange) el.setSelectionRange(len, len); }
      restoreFocus = null;
    }
  } catch (err) {
    $("#banner").textContent = err.message;
    $("#banner").hidden = false;
  }
}

/* ---------- shared list pieces ---------- */
function selectField(name, label, value, items) {
  return "<label class='field'><span>" + esc(label) + "</span><select data-filter='" + name + "'>" +
    items.map(function (it) {
      return "<option value='" + esc(it[0]) + "'" + (it[0] === value ? " selected" : "") + ">" + esc(it[1]) + "</option>";
    }).join("") + "</select></label>";
}
function searchField(value, placeholder) {
  return "<label class='field grow'><span>Search</span><input class='input' data-filter='q' type='search' value='" +
    esc(value || "") + "' placeholder='" + esc(placeholder) + "' autocomplete='off' /></label>";
}
function bindFilters(route, params) {
  $$("[data-filter]").forEach(function (el) {
    var key = el.getAttribute("data-filter");
    var apply = function () {
      var next = Object.assign({}, params);
      next[key] = el.value;
      next.page = "";
      if (el.tagName === "INPUT") restoreFocus = key;
      go(route, next);
    };
    if (el.tagName === "INPUT") {
      var timer = null;
      el.oninput = function () { clearTimeout(timer); timer = setTimeout(apply, 350); };
    } else {
      el.onchange = apply;
    }
  });
}
function pager(data) {
  var pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  var from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  var to = Math.min(data.page * data.pageSize, data.total);
  return "<div class='pager'><span class='muted'>Showing " + num(from) + " - " + num(to) + " of " + num(data.total) + "</span>" +
    "<div class='row'><button class='btn' data-page='" + (data.page - 1) + "'" + (data.page <= 1 ? " disabled" : "") + ">Previous</button>" +
    "<span class='muted'>Page " + data.page + " of " + pages + "</span>" +
    "<button class='btn' data-page='" + (data.page + 1) + "'" + (data.page >= pages ? " disabled" : "") + ">Next</button></div></div>";
}
function bindPager(route, params) {
  $$("[data-page]").forEach(function (b) {
    b.onclick = function () { var next = Object.assign({}, params); next.page = b.getAttribute("data-page"); go(route, next); };
  });
}
function bindPlayerLinks(root) {
  $$("[data-player]", root).forEach(function (el) {
    el.onclick = function (e) { e.stopPropagation(); openPlayer(el.getAttribute("data-player")); };
  });
}
function query(params, defaults) {
  var qs = new URLSearchParams();
  Object.keys(defaults).forEach(function (k) {
    var v = params[k] != null && params[k] !== "" ? params[k] : defaults[k];
    if (v !== "") qs.set(k, v);
  });
  return qs.toString();
}

/* ---------- tables ---------- */
function playersTable(rows) {
  if (rows.length === 0) return empty("No players match these filters.");
  return "<div class='table-wrap'><table><thead><tr><th>Player</th><th>Account</th><th class='num'>Coins</th>" +
    "<th class='num'>Win points</th><th>Joined</th><th>Status</th></tr></thead><tbody>" +
    rows.map(function (u) {
      return "<tr class='clickable' data-player='" + esc(u.id) + "'><td><div class='who'><span class='avatar'>" + esc(initial(u.nickname)) +
        "</span><div><div class='name'>" + esc(u.nickname) + "</div><div class='sub mono'>" + esc(u.id.slice(0, 8)) + "</div></div></div></td>" +
        "<td>" + (u.isGuest ? badge("Guest", "grey") : badge("Registered", "blue")) + "</td>" +
        "<td class='num'>" + num(u.coins) + "</td><td class='num'>" + num(u.winPoints) + "</td>" +
        "<td title='" + esc(fullDate(u.createdAt)) + "'>" + esc(ago(u.createdAt)) + "</td>" +
        "<td>" + (u.bannedAt ? badge("Banned", "red") : badge("Active", "green")) + "</td></tr>";
    }).join("") + "</tbody></table></div>";
}
function matchesTable(rows) {
  if (rows.length === 0) return empty("No matches match these filters.");
  return "<div class='table-wrap'><table><thead><tr><th>Started</th><th>Mode</th><th class='num'>Pot</th><th>Players</th>" +
    "<th>Status</th><th>Winner</th></tr></thead><tbody>" +
    rows.map(function (m) {
      return "<tr><td title='" + esc(fullDate(m.startedAt)) + "'>" + esc(ago(m.startedAt)) + "</td><td>" + modeBadge(m.mode) + "</td>" +
        "<td class='num'>" + num(m.pot) + "</td><td class='players'>" + m.players.map(function (p) {
          return p.nickname === "Computer" ? "<span class='muted'>Computer</span>"
            : "<span class='plink' data-player='" + esc(p.id) + "'>" + esc(p.nickname) + "</span>";
        }).join(", ") + "</td>" +
        "<td>" + (m.endedAt ? badge("Finished", "green") : badge("In progress", "amber")) + "</td>" +
        "<td>" + (m.winner ? (m.winner.nickname === "Computer" ? "<span class='muted'>Computer</span>"
          : "<span class='plink' data-player='" + esc(m.winner.id) + "'>" + esc(m.winner.nickname) + "</span>") : "<span class='muted'>-</span>") +
        "</td></tr>";
    }).join("") + "</tbody></table></div>";
}
function ledgerTable(rows) {
  if (rows.length === 0) return empty("No transactions match these filters.");
  return "<div class='table-wrap'><table><thead><tr><th>When</th><th>Player</th><th class='num'>Change</th><th>Currency</th><th>Reason</th></tr></thead><tbody>" +
    rows.map(function (l) {
      return "<tr><td title='" + esc(fullDate(l.createdAt)) + "'>" + esc(ago(l.createdAt)) + "</td>" +
        "<td><span class='plink' data-player='" + esc(l.userId) + "'>" + esc(l.nickname) + "</span></td>" +
        "<td class='num'><span class='" + (l.delta >= 0 ? "plus" : "minus") + "'>" + (l.delta > 0 ? "+" : "") + num(l.delta) + "</span></td>" +
        "<td>" + (l.currency === "coin" ? badge("Coins", "amber") : badge("Win points", "violet")) + "</td>" +
        "<td>" + esc(reasonLabel(l.reason)) + "</td></tr>";
    }).join("") + "</tbody></table></div>";
}

/* ---------- views ---------- */
function statCard(label, value, hint, tone) {
  return "<div class='stat " + (tone || "") + "'><div class='label'>" + esc(label) + "</div><div class='value'>" + value +
    "</div><div class='hint'>" + (hint || "&nbsp;") + "</div></div>";
}
/* Drawn at the box's real width, so the bars spread across any screen while the text keeps its size. */
var chartDays = null;
var chartWidth = 0;
function drawChart() {
  var box = document.getElementById("chartBox");
  if (!box || !chartDays) return;
  chartWidth = box.clientWidth;
  box.innerHTML = chart(chartDays, chartWidth || 760);
}
new ResizeObserver(function () {
  var box = document.getElementById("chartBox");
  if (box && box.clientWidth !== chartWidth) drawChart();
}).observe(document.getElementById("view"));
function chart(days, w) {
  var h = 260, left = 34, right = 10, bottom = 26, top = 14;
  var max = Math.max.apply(null, [1].concat(days.map(function (d) { return Math.max(d.signups, d.matches); })));
  var slot = (w - left - right) / days.length;
  var bw = Math.max(3, Math.min(24, slot / 2 - 3));
  var every = Math.max(1, Math.ceil(40 / slot));
  var plot = h - bottom - top;
  var out = "";
  [0, 0.5, 1].forEach(function (f) {
    var y = top + plot * (1 - f);
    out += "<line x1='" + left + "' x2='" + (w - right) + "' y1='" + y + "' y2='" + y + "' class='gridline'/>" +
      "<text x='" + (left - 6) + "' y='" + (y + 4) + "' class='axis' text-anchor='end'>" + Math.round(max * f) + "</text>";
  });
  days.forEach(function (d, i) {
    var cx = left + i * slot + slot / 2;
    var hs = plot * d.signups / max, hm = plot * d.matches / max;
    out += "<rect class='bar-a' rx='2' x='" + (cx - bw - 1) + "' y='" + (top + plot - hs) + "' width='" + bw + "' height='" + hs + "'><title>" +
      esc(d.day) + ": " + d.signups + " new players</title></rect>";
    out += "<rect class='bar-b' rx='2' x='" + (cx + 1) + "' y='" + (top + plot - hm) + "' width='" + bw + "' height='" + hm + "'><title>" +
      esc(d.day) + ": " + d.matches + " matches</title></rect>";
    if ((days.length - 1 - i) % every === 0) {
      out += "<text x='" + cx + "' y='" + (h - 8) + "' class='axis' text-anchor='middle'>" + d.day.slice(8, 10) + "/" + d.day.slice(5, 7) + "</text>";
    }
  });
  return "<svg class='chart' width='" + w + "' height='" + h + "' viewBox='0 0 " + w + " " + h + "' role='img' aria-label='New players and matches per day'>" + out + "</svg>";
}

async function viewDashboard() {
  var results = await Promise.all([
    api("/admin/stats"), api("/admin/activity?days=14"),
    api("/admin/players?sort=newest&pageSize=6"), api("/admin/matches?pageSize=6")
  ]);
  var stats = results[0], activity = results[1], players = results[2], matches = results[3];
  var p = stats.players, m = stats.matches;
  $("#view").innerHTML =
    "<div class='stats'>" +
      statCard("Online now", stats.live ? num(stats.live.players) : "-", stats.live ? num(stats.live.rooms) + " open rooms" : "Live count unavailable", "live") +
      statCard("Total players", num(p.total), num(p.guests) + " guests, " + num(p.total - p.guests) + " registered") +
      statCard("New players", num(p.last24h), "last 24 hours - " + num(p.last7d) + " in 7 days") +
      statCard("Matches", num(m.last24h), "last 24 hours - " + num(m.total) + " all time") +
      statCard("Coins in play", num(stats.coinsInCirculation), "across all wallets") +
      statCard("Banned", num(p.banned), "accounts blocked", p.banned > 0 ? "warn" : "") +
    "</div>" +
    "<div class='card'><div class='card-head'><h2>Activity - last 14 days</h2></div><div class='card-body'><div id='chartBox'></div>" +
      "<div class='legend'><span><i class='dot a'></i>New players</span><span><i class='dot b'></i>Matches</span><span>Days in Dhaka time</span></div></div></div>" +
    "<div class='two'>" +
      "<div class='card'><div class='card-head'><h2>Newest players</h2><a href='#/players'>View all</a></div>" + playersTable(players.rows) + "</div>" +
      "<div class='card'><div class='card-head'><h2>Latest matches</h2><a href='#/matches'>View all</a></div>" + matchesTable(matches.rows) + "</div>" +
    "</div>";
  chartDays = activity;
  drawChart();
  bindPlayerLinks($("#view"));
}

async function viewPlayers(params) {
  var data = await api("/admin/players?" + query(params, { q: "", status: "all", type: "all", sort: "newest", page: "1", pageSize: "25" }));
  $("#view").innerHTML =
    "<div class='toolbar'>" + searchField(params.q, "Nickname or user id") +
      selectField("status", "Status", params.status || "all", [["all", "All statuses"], ["active", "Active"], ["banned", "Banned"]]) +
      selectField("type", "Account", params.type || "all", [["all", "All accounts"], ["guest", "Guest"], ["registered", "Registered"]]) +
      selectField("sort", "Sort by", params.sort || "newest", [["newest", "Newest first"], ["oldest", "Oldest first"], ["coins", "Most coins"], ["winPoints", "Most win points"]]) +
    "</div>" +
    "<div class='card'>" + playersTable(data.rows) + pager(data) + "</div>";
  bindFilters("players", params);
  bindPager("players", params);
  bindPlayerLinks($("#view"));
}

async function viewMatches(params) {
  var data = await api("/admin/matches?" + query(params, { q: "", mode: "all", status: "all", page: "1", pageSize: "25" }));
  $("#view").innerHTML =
    "<div class='toolbar'>" + searchField(params.q, "Player nickname or id") +
      selectField("mode", "Mode", params.mode || "all", [["all", "All modes"], ["random", "Online"], ["friend", "Friends"], ["computer", "Vs computer"]]) +
      selectField("status", "Status", params.status || "all", [["all", "All"], ["finished", "Finished"], ["unfinished", "In progress"]]) +
    "</div>" +
    "<div class='card'>" + matchesTable(data.rows) + pager(data) + "</div>";
  bindFilters("matches", params);
  bindPager("matches", params);
  bindPlayerLinks($("#view"));
}

async function viewLedger(params) {
  if (!reasonsCache) reasonsCache = await api("/admin/ledger/reasons");
  var data = await api("/admin/ledger?" + query(params, { q: "", currency: "all", reason: "all", page: "1", pageSize: "25" }));
  $("#view").innerHTML =
    "<div class='toolbar'>" + searchField(params.q, "Player nickname or id") +
      selectField("currency", "Currency", params.currency || "all", [["all", "Coins and win points"], ["coin", "Coins"], ["wp", "Win points"]]) +
      selectField("reason", "Reason", params.reason || "all", [["all", "All reasons"]].concat(reasonsCache.map(function (r) { return [r, reasonLabel(r)]; }))) +
    "</div>" +
    "<div class='card'>" + ledgerTable(data.rows) + pager(data) + "</div>";
  bindFilters("ledger", params);
  bindPager("ledger", params);
  bindPlayerLinks($("#view"));
}

/* ---------- player drawer ---------- */
function closeDrawer() {
  $("#drawer").hidden = true;
  $("#drawer").innerHTML = "";
  if (!$("#sidebar").classList.contains("open")) $("#scrim").hidden = true;
}

async function openPlayer(id, tab) {
  var drawer = $("#drawer");
  drawer.hidden = false;
  $("#scrim").hidden = false;
  drawer.innerHTML = "<div class='drawer-head'><span class='muted'>Loading player...</span></div>";
  var u;
  try {
    u = await api("/admin/players/" + encodeURIComponent(id));
  } catch (err) {
    drawer.innerHTML = "<div class='drawer-head'><span class='muted'>" + esc(err.message) + "</span></div>";
    return;
  }
  var active = tab || "ledger";
  var wins = u.matches.filter(function (m) { return m.endedAt && m.won; }).length;
  drawer.innerHTML =
    "<div class='drawer-head'><span class='avatar'>" + esc(initial(u.nickname)) + "</span><div style='flex:1;min-width:0'>" +
      "<h2>" + esc(u.nickname) + "</h2><div class='row' style='margin-top:4px'>" +
      (u.isGuest ? badge("Guest", "grey") : badge("Registered", "blue")) + " " +
      (u.bannedAt ? badge("Banned", "red") : badge("Active", "green")) + "</div></div>" +
      "<button id='closeDrawer' class='btn'>Close</button></div>" +
    "<section><div class='tiles'>" +
      "<div class='tile'><div class='value'>" + num(u.coins) + "</div><div class='label'>Coins</div></div>" +
      "<div class='tile'><div class='value'>" + num(u.winPoints) + "</div><div class='label'>Win points</div></div>" +
      "<div class='tile'><div class='value'>" + num(wins) + " / " + num(u.matches.length) + "</div><div class='label'>Recent wins</div></div>" +
    "</div></section>" +
    "<section><h3>Profile</h3><dl class='kv'>" +
      "<dt>User id</dt><dd class='mono'>" + esc(u.id) + " <span class='plink' id='copyId'>Copy</span></dd>" +
      "<dt>Joined</dt><dd>" + esc(fullDate(u.createdAt)) + "</dd>" +
      (u.bannedAt ? "<dt>Banned</dt><dd>" + esc(fullDate(u.bannedAt)) + "</dd><dt>Reason</dt><dd>" + esc(u.banReason || "-") + "</dd>" : "") +
    "</dl></section>" +
    "<section><h3>Moderation</h3>" +
      (u.bannedAt
        ? "<p class='muted' style='margin-top:0'>This player cannot sign in or join rooms.</p><button id='unban' class='btn primary'>Unban player</button>"
        : "<div class='ban-box'><div class='field'><span>Reason (shown only here)</span><input id='banReason' class='input' placeholder='e.g. coin farming' /></div>" +
          "<div style='height:10px'></div><button id='ban' class='btn danger'>Ban player</button></div>") +
    "</section>" +
    "<section><div class='tabs'><button class='tab" + (active === "ledger" ? " active" : "") + "' data-tab='ledger'>Transactions</button>" +
      "<button class='tab" + (active === "matches" ? " active" : "") + "' data-tab='matches'>Matches</button></div>" +
      "<div class='card'>" + (active === "ledger" ? drawerLedger(u) : drawerMatches(u)) + "</div></section>";

  $("#closeDrawer").onclick = closeDrawer;
  $("#copyId").onclick = function () {
    if (navigator.clipboard) navigator.clipboard.writeText(u.id);
    $("#copyId").textContent = "Copied";
  };
  $$("[data-tab]", drawer).forEach(function (t) { t.onclick = function () { openPlayer(id, t.getAttribute("data-tab")); }; });
  var ban = $("#ban");
  if (ban) ban.onclick = async function () {
    if (!confirm("Ban " + u.nickname + "? They will not be able to sign in or play.")) return;
    ban.disabled = true;
    await api("/admin/players/" + encodeURIComponent(id) + "/ban", { method: "POST", body: JSON.stringify({ reason: $("#banReason").value }) });
    await openPlayer(id, active);
    render();
  };
  var unban = $("#unban");
  if (unban) unban.onclick = async function () {
    unban.disabled = true;
    await api("/admin/players/" + encodeURIComponent(id) + "/unban", { method: "POST" });
    await openPlayer(id, active);
    render();
  };
}
function drawerLedger(u) {
  if (u.ledger.length === 0) return empty("No transactions yet.");
  return "<div class='table-wrap'><table class='mini'><thead><tr><th>When</th><th class='num'>Change</th><th>Reason</th></tr></thead><tbody>" +
    u.ledger.map(function (l) {
      return "<tr><td title='" + esc(fullDate(l.createdAt)) + "'>" + esc(ago(l.createdAt)) + "</td><td class='num'><span class='" +
        (l.delta >= 0 ? "plus" : "minus") + "'>" + (l.delta > 0 ? "+" : "") + num(l.delta) + "</span> " +
        (l.currency === "coin" ? "coins" : "WP") + "</td><td>" + esc(reasonLabel(l.reason)) + "</td></tr>";
    }).join("") + "</tbody></table></div>";
}
function drawerMatches(u) {
  if (u.matches.length === 0) return empty("No matches yet.");
  return "<div class='table-wrap'><table class='mini'><thead><tr><th>Started</th><th>Mode</th><th class='num'>Pot</th><th>Result</th></tr></thead><tbody>" +
    u.matches.map(function (m) {
      return "<tr><td title='" + esc(fullDate(m.startedAt)) + "'>" + esc(ago(m.startedAt)) + "</td><td>" + modeBadge(m.mode) + "</td>" +
        "<td class='num'>" + num(m.pot) + "</td><td>" +
        (m.endedAt ? (m.won ? badge("Won", "green") : badge("Lost", "grey")) : badge("In progress", "amber")) + "</td></tr>";
    }).join("") + "</tbody></table></div>";
}

showShell(token !== "");
</script>
</body></html>`;
}
