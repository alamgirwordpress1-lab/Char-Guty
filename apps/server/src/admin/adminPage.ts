/**
 * The admin console: one self-contained page, no build step and no separate app. It
 * keeps the token in sessionStorage (so a refresh does not lock the operator out, and
 * closing the tab forgets it) and talks to the same /admin routes that serve it.
 */
export function adminPage(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Char Guty admin</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 24px; background: #0a173f; color: #e8eeff;
         font: 15px/1.5 "Segoe UI", system-ui, sans-serif; }
  main { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 16px; }
  h2 { font-size: 18px; margin: 24px 0 8px; color: #ffd166; }
  input, button { font: inherit; border-radius: 8px; border: 1px solid #3a5aa0; padding: 8px 12px; }
  input { background: #07143a; color: #e8eeff; min-width: 260px; }
  button { background: #2e6fd8; color: #fff; border-color: #2e6fd8; cursor: pointer; }
  button.danger { background: #b3261e; border-color: #b3261e; }
  button.ghost { background: transparent; color: #b9c6e4; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 10px; }
  th, td { border-bottom: 1px solid #1e336e; }
  th { color: #8fa6d8; font-weight: 600; }
  tr.clickable:hover { background: #12255c; cursor: pointer; }
  .muted { color: #8fa6d8; }
  .banned { color: #ff8a80; font-weight: 600; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .card { background: #07143a; border: 1px solid #1e336e; border-radius: 12px; padding: 16px; margin-top: 12px; }
  .error { color: #ff8a80; }
</style></head>
<body><main>
<h1>Char Guty admin</h1>

<div id="login" class="card">
  <div class="row">
    <input id="token" type="password" placeholder="Admin token" autocomplete="off" />
    <button id="signin">Sign in</button>
  </div>
  <p class="muted">The token is the ADMIN_TOKEN set on the server.</p>
</div>

<div id="app" hidden>
  <div class="row">
    <input id="q" placeholder="Nickname or user id" autocomplete="off" />
    <button id="search">Search</button>
    <button id="signout" class="ghost">Sign out</button>
  </div>
  <p id="error" class="error"></p>
  <div id="results"></div>
  <div id="detail"></div>
</div>

<script>
const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem("cg_admin_token") || "";

function show(signedIn) {
  $("login").hidden = signedIn;
  $("app").hidden = !signedIn;
}
show(token !== "");

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
  });
  if (res.status === 401) {
    signOut();
    throw new Error("Wrong token");
  }
  if (!res.ok) throw new Error("Request failed (" + res.status + ")");
  return res.json();
}

function signOut() {
  token = "";
  sessionStorage.removeItem("cg_admin_token");
  show(false);
}

$("signin").onclick = async () => {
  token = $("token").value.trim();
  try {
    await api("/admin/users?q=" + encodeURIComponent("__probe__"));
    sessionStorage.setItem("cg_admin_token", token);
    show(true);
  } catch (err) {
    $("token").value = "";
    alert(err.message);
  }
};
$("signout").onclick = signOut;

const fmt = (d) => (d ? new Date(d).toLocaleString() : "-");

async function search() {
  $("error").textContent = "";
  $("detail").innerHTML = "";
  try {
    const users = await api("/admin/users?q=" + encodeURIComponent($("q").value));
    if (users.length === 0) {
      $("results").innerHTML = "<p class='muted'>No players found.</p>";
      return;
    }
    $("results").innerHTML =
      "<table><tr><th>Nickname</th><th>Coins</th><th>Win points</th><th>Joined</th><th>Status</th></tr>" +
      users
        .map(
          (u) =>
            "<tr class='clickable' data-id='" + u.id + "'><td>" + escapeHtml(u.nickname) +
            (u.isGuest ? " <span class='muted'>(guest)</span>" : "") +
            "</td><td>" + u.coins + "</td><td>" + u.winPoints + "</td><td>" + fmt(u.createdAt) +
            "</td><td>" + (u.bannedAt ? "<span class='banned'>Banned</span>" : "Active") + "</td></tr>",
        )
        .join("") +
      "</table>";
    for (const row of $("results").querySelectorAll("tr.clickable")) {
      row.onclick = () => openUser(row.dataset.id);
    }
  } catch (err) {
    $("error").textContent = err.message;
  }
}
$("search").onclick = search;
$("q").onkeydown = (e) => { if (e.key === "Enter") search(); };

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function openUser(id) {
  const u = await api("/admin/users/" + id);
  $("detail").innerHTML =
    "<div class='card'><h2>" + escapeHtml(u.nickname) + "</h2>" +
    "<p class='muted'>" + u.id + " &middot; joined " + fmt(u.createdAt) +
    (u.isGuest ? " &middot; guest" : "") + "</p>" +
    "<p><b>" + u.coins + "</b> coins &middot; <b>" + u.winPoints + "</b> win points</p>" +
    (u.bannedAt
      ? "<p class='banned'>Banned " + fmt(u.bannedAt) +
        (u.banReason ? " - " + escapeHtml(u.banReason) : "") + "</p>" +
        "<button id='unban'>Unban</button>"
      : "<div class='row'><input id='reason' placeholder='Reason (optional)' />" +
        "<button id='ban' class='danger'>Ban</button></div>") +
    "<h2>Coins and win points</h2>" +
    (u.ledger.length === 0 ? "<p class='muted'>Nothing yet.</p>" :
      "<table><tr><th>When</th><th>Change</th><th>Reason</th></tr>" +
      u.ledger.map((l) =>
        "<tr><td>" + fmt(l.createdAt) + "</td><td>" + (l.delta > 0 ? "+" : "") + l.delta + " " +
        (l.currency === "coin" ? "coins" : "WP") + "</td><td>" + escapeHtml(l.reason) + "</td></tr>").join("") +
      "</table>") +
    "<h2>Matches</h2>" +
    (u.matches.length === 0 ? "<p class='muted'>None yet.</p>" :
      "<table><tr><th>Started</th><th>Mode</th><th>Pot</th><th>Players</th><th>Result</th></tr>" +
      u.matches.map((m) =>
        "<tr><td>" + fmt(m.startedAt) + "</td><td>" + escapeHtml(m.mode) + "</td><td>" + m.pot +
        "</td><td>" + m.playerCount + "</td><td>" +
        (m.endedAt ? (m.won ? "Won" : "Lost") : "In progress") + "</td></tr>").join("") +
      "</table>") +
    "</div>";

  const ban = $("ban");
  if (ban) {
    ban.onclick = async () => {
      await api("/admin/users/" + id + "/ban", {
        method: "POST",
        body: JSON.stringify({ reason: $("reason").value }),
      });
      await openUser(id);
      await search();
    };
  }
  const unban = $("unban");
  if (unban) {
    unban.onclick = async () => {
      await api("/admin/users/" + id + "/unban", { method: "POST" });
      await openUser(id);
      await search();
    };
  }
}
</script>
</main></body></html>`;
}
