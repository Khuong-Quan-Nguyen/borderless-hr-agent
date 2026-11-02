const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let COUNTRIES = [];
let BY_CODE = {};

// ---------- Helpers ----------
function escapeHtml(t) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdown(el, text) {
  if (window.marked && window.DOMPurify) {
    el.innerHTML = DOMPurify.sanitize(marked.parse(text));
  } else {
    el.innerHTML = `<p style="white-space:pre-wrap">${escapeHtml(text)}</p>`;
  }
}

const thinkingHtml = (label = "Thinking") => `<span class="thinking"><span class="spark"></span>${label}…</span>`;

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}

const flagImg = (c, h) => `<img class="flag" src="https://flagcdn.com/h40/${c.code.toLowerCase()}.png" alt="" height="${h}" style="height:${h}px" loading="lazy" />`;

const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");

// POST JSON and stream the plain-text response, re-rendering as chunks arrive.
async function streamInto(url, body, el, { onDone } = {}) {
  let text = "";
  let frame = 0;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); detail = typeof j.detail === "string" ? j.detail : detail; } catch {}
    throw new Error(detail);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (!frame) {
      frame = requestAnimationFrame(() => { frame = 0; renderMarkdown(el, text); onDone?.(text, false); });
    }
  }
  cancelAnimationFrame(frame);
  renderMarkdown(el, text);
  onDone?.(text, true);
  return text;
}

// ---------- Tabs ----------
function selectTab(name, scroll = false) {
  $$(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${name}`));
  if (scroll) $("#app").scrollIntoView({ behavior: "smooth", block: "start" });
}

$$(".tab").forEach((t) => t.addEventListener("click", () => {
  selectTab(t.dataset.tab);
  history.replaceState(null, "", t.dataset.tab === "planner" ? plannerHash() : `#${t.dataset.tab}`);
}));

$$("[data-goto]").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  const name = a.dataset.goto;
  selectTab(name, true);
  history.replaceState(null, "", name === "planner" ? plannerHash() : `#${name}`);
}));

// ---------- HR Agent chat ----------
const chat = { history: [], busy: false };
const chatInput = $("#chat-input");
const chatSend = $("#chat-send");
const chatScroll = $("#chat-scroll");

function addMessage(role) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;
  wrap.innerHTML = `<div class="avatar">${role === "user" ? "Y" : "AI"}</div><div class="body"></div>`;
  $("#messages").appendChild(wrap);
  return $(".body", wrap);
}

function scrollChat() { chatScroll.scrollTop = chatScroll.scrollHeight; }

async function sendChat(text) {
  text = text.trim();
  if (!text || chat.busy) return;
  chat.busy = true;
  chatSend.disabled = true;
  $("#welcome").hidden = true;

  const userBody = addMessage("user");
  userBody.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  chat.history.push({ role: "user", content: text });

  const botBody = addMessage("assistant");
  botBody.innerHTML = thinkingHtml();
  const md = document.createElement("div");
  md.className = "md";
  scrollChat();

  try {
    const reply = await streamInto("/api/chat", { messages: chat.history }, md, {
      onDone: () => {
        if (!md.isConnected) botBody.replaceChildren(md);
        scrollChat();
      },
    });
    if (!md.isConnected) botBody.replaceChildren(md);
    if (reply.trim()) chat.history.push({ role: "assistant", content: reply });
    else chat.history.pop();
  } catch (err) {
    chat.history.pop();
    botBody.innerHTML = `<div class="md"><p>⚠️ Couldn't reach the HR Agent (${escapeHtml(err.message)}). Check that the backend is running and <code>ANTHROPIC_API_KEY</code> is set.</p></div>`;
  } finally {
    chat.busy = false;
    chatSend.disabled = false;
    chatInput.focus();
  }
}

function autoGrow() {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + "px";
}

chatInput.addEventListener("input", autoGrow);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const v = chatInput.value;
    chatInput.value = "";
    autoGrow();
    sendChat(v);
  }
});
chatSend.addEventListener("click", () => {
  const v = chatInput.value;
  chatInput.value = "";
  autoGrow();
  sendChat(v);
});
$$(".suggestion").forEach((b) => b.addEventListener("click", () => sendChat(b.dataset.q)));
$("#chat-reset").addEventListener("click", () => {
  if (chat.busy) return;
  chat.history = [];
  $("#messages").innerHTML = "";
  $("#welcome").hidden = false;
});

// ---------- Contracts ----------
const contract = { workerType: "employee", text: "" };

$$("#worker-type button").forEach((b) => b.addEventListener("click", () => {
  contract.workerType = b.dataset.v;
  $$("#worker-type button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
}));

$("#contract-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const go = $("#contract-go");
  const out = $("#contract-out");
  const country = BY_CODE[$("#c-country").value]?.name || $("#c-country").value;
  const body = {
    country,
    worker_type: contract.workerType,
    role: $("#c-role").value.trim(),
    salary: $("#c-salary").value.trim(),
    start_date: $("#c-start").value,
    company: $("#c-company").value.trim(),
    notes: $("#c-notes").value.trim(),
  };
  go.disabled = true;
  go.textContent = "Drafting…";
  $("#contract-copy").disabled = $("#contract-download").disabled = true;
  $("#contract-title").textContent = `${contract.workerType === "employee" ? "Employment" : "Contractor"} agreement · ${country}`;
  out.innerHTML = thinkingHtml("Researching local requirements");
  try {
    contract.text = await streamInto("/api/contract", body, out);
    $("#contract-copy").disabled = $("#contract-download").disabled = !contract.text;
  } catch (err) {
    out.innerHTML = `<p>⚠️ Couldn't generate the draft (${escapeHtml(err.message)}).</p>`;
  } finally {
    go.disabled = false;
    go.textContent = "Generate draft";
  }
});

$("#contract-copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(contract.text);
  toast("Draft copied to clipboard");
});

$("#contract-download").addEventListener("click", () => {
  const blob = new Blob([contract.text], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${$("#contract-title").textContent.replace(/[^\w]+/g, "-").toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- Hiring Planner ----------
const planner = { countries: ["GB", "DE", "PT", "BR"], salary: 90000, fee: 500, role: "" };

// Mirrors estimate_cost() in api/countries.py so the comparison updates instantly.
function estimateCost(c, salary, fee) {
  const gross = salary * (1 + c.extra_months / 12);
  const taxes = gross * c.employer_rate;
  const fees = fee * 12;
  return { gross, taxes, fees, total: gross + taxes + fees };
}

function plannerHash() {
  const p = new URLSearchParams({ c: planner.countries.join(","), s: planner.salary, f: planner.fee });
  if (planner.role) p.set("r", planner.role);
  return `#planner?${p}`;
}

function readPlannerHash() {
  const [name, query] = location.hash.slice(1).split("?");
  if (name !== "planner" || !query) return;
  const p = new URLSearchParams(query);
  const codes = (p.get("c") || "").split(",").filter((c) => BY_CODE[c]).slice(0, 4);
  if (codes.length) planner.countries = codes;
  if (+p.get("s") > 0) planner.salary = +p.get("s");
  if (p.get("f") !== null && +p.get("f") >= 0) planner.fee = +p.get("f");
  planner.role = p.get("r") || "";
}

function renderChips() {
  $("#p-chips").innerHTML = planner.countries.map((code) => {
    const c = BY_CODE[code];
    return `<span class="chip">${flagImg(c, 16)} ${c.name}<button type="button" data-rm="${code}" aria-label="Remove ${c.name}">×</button></span>`;
  }).join("");
  $("#p-count").textContent = `(${planner.countries.length}/4)`;
  $("#p-search").disabled = planner.countries.length >= 4;
  $("#p-search").placeholder = planner.countries.length >= 4 ? "Maximum of 4 countries" : "Add a country…";
}

function renderCompare() {
  const rows = planner.countries.map((code) => ({ c: BY_CODE[code], cost: estimateCost(BY_CODE[code], planner.salary, planner.fee) }));
  const max = Math.max(...rows.map((r) => r.cost.total), 1);
  const min = Math.min(...rows.map((r) => r.cost.total));
  if (!rows.length) {
    $("#p-compare").innerHTML = `<div class="empty">Add at least one country to compare.</div>`;
    return;
  }
  $("#p-compare").style.setProperty("--cols", rows.length === 4 ? 2 : rows.length);
  $("#p-compare").innerHTML = rows.map(({ c, cost }) => {
    const best = rows.length > 1 && cost.total === min;
    const pct = (v) => (v / max) * 100;
    const delta = best || rows.length < 2 ? "" : `+${usd(cost.total - min)} vs. lowest`;
    return `
      <article class="ccard ${best ? "best" : ""}">
        ${best ? `<span class="badge-best">Lowest cost</span>` : ""}
        <div class="head">${flagImg(c, 28)}<div>${c.name}<small>Paid in ${c.currency}</small></div></div>
        <div>
          <div class="total">${usd(cost.total)} <small>/ year</small></div>
          <div class="delta">${delta || usd(cost.total / 12) + " / month"}</div>
        </div>
        <div class="bar" title="Gross ${usd(cost.gross)} · Employer ${usd(cost.taxes)} · EOR ${usd(cost.fees)}">
          <span style="width:${pct(cost.gross)}%;background:var(--seg-1)"></span>
          <span style="width:${pct(cost.taxes)}%;background:var(--seg-2)"></span>
          <span style="width:${pct(cost.fees)}%;background:var(--seg-3)"></span>
        </div>
        <dl class="facts">
          <div><dt>Employer contributions</dt><dd>~${(c.employer_rate * 100).toFixed(1)}% · ${usd(cost.taxes)}</dd></div>
          <div><dt>Mandatory extra pay</dt><dd>${c.extra_months ? `+${c.extra_months} mo · ${usd(cost.gross - planner.salary)}` : "None"}</dd></div>
          <div><dt>Min. paid leave</dt><dd>${c.pto_days ? `${c.pto_days} days` : "None statutory"}</dd></div>
          <div><dt>Notice</dt><dd>${c.notice}</dd></div>
          <div><dt>Probation</dt><dd>${c.probation}</dd></div>
          <div><dt>Contractor risk</dt><dd><span class="risk ${c.misclass_risk}">${c.misclass_risk}</span></dd></div>
        </dl>
        <div class="note">${c.notes}</div>
      </article>`;
  }).join("");
}

function updatePlanner({ syncInputs = false } = {}) {
  if (syncInputs) {
    $("#p-salary").value = planner.salary;
    $("#p-salary-range").value = planner.salary;
    $("#p-fee").value = planner.fee;
    $("#p-role").value = planner.role;
  }
  renderChips();
  renderCompare();
  $("#p-brief").disabled = !planner.countries.length;
  if ($("#panel-planner").classList.contains("active")) history.replaceState(null, "", plannerHash());
}

function renderDropdown() {
  const q = $("#p-search").value.trim().toLowerCase();
  const matches = COUNTRIES.filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
  $("#p-dropdown").innerHTML = matches.map((c, i) => {
    const picked = planner.countries.includes(c.code);
    return `<button type="button" data-add="${c.code}" ${picked ? "disabled" : ""} class="${i === 0 ? "hl" : ""}">${flagImg(c, 18)} ${c.name}${picked ? " ✓" : ""}</button>`;
  }).join("") || `<div style="padding:10px;color:var(--ink-3);font-size:14px">No match — more countries coming soon.</div>`;
}

function addCountry(code) {
  if (!code || planner.countries.includes(code) || planner.countries.length >= 4) return;
  planner.countries.push(code);
  $("#p-search").value = "";
  $("#p-dropdown").classList.remove("open");
  updatePlanner();
}

$("#p-search").addEventListener("focus", () => { renderDropdown(); $("#p-dropdown").classList.add("open"); });
$("#p-search").addEventListener("input", () => { renderDropdown(); $("#p-dropdown").classList.add("open"); });
$("#p-search").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); addCountry($("#p-dropdown button:not(:disabled)")?.dataset.add); }
  if (e.key === "Escape") $("#p-dropdown").classList.remove("open");
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".country-picker")) $("#p-dropdown").classList.remove("open");
});
$("#p-dropdown").addEventListener("click", (e) => addCountry(e.target.closest("[data-add]")?.dataset.add));
$("#p-chips").addEventListener("click", (e) => {
  const code = e.target.closest("[data-rm]")?.dataset.rm;
  if (!code) return;
  planner.countries = planner.countries.filter((c) => c !== code);
  updatePlanner();
});

$("#p-salary").addEventListener("input", (e) => {
  planner.salary = Math.max(0, +e.target.value || 0);
  $("#p-salary-range").value = planner.salary;
  updatePlanner();
});
$("#p-salary-range").addEventListener("input", (e) => {
  planner.salary = +e.target.value;
  $("#p-salary").value = planner.salary;
  updatePlanner();
});
$("#p-fee").addEventListener("input", (e) => { planner.fee = Math.max(0, +e.target.value || 0); updatePlanner(); });
$("#p-role").addEventListener("input", (e) => { planner.role = e.target.value.trim(); updatePlanner(); });

$("#p-share").addEventListener("click", async () => {
  const url = location.origin + location.pathname + plannerHash();
  history.replaceState(null, "", plannerHash());
  try { await navigator.clipboard.writeText(url); toast("Share link copied"); }
  catch { prompt("Copy this link:", url); }
});

$("#p-brief").addEventListener("click", async () => {
  if (!planner.countries.length || !(planner.salary > 0)) return toast("Add a salary and at least one country");
  const btn = $("#p-brief");
  const box = $("#p-brief-box");
  const out = $("#p-brief-out");
  box.hidden = false;
  btn.disabled = true;
  out.innerHTML = thinkingHtml("Analysing countries");
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  try {
    await streamInto("/api/brief", {
      countries: planner.countries, salary_usd: planner.salary, eor_fee: planner.fee, role: planner.role,
    }, out);
  } catch (err) {
    out.innerHTML = `<p>⚠️ Couldn't generate the brief (${escapeHtml(err.message)}).</p>`;
  } finally {
    btn.disabled = false;
  }
});

// ---------- Boot ----------
async function boot() {
  fetch("/api/health")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then(() => { $("#status").className = "status ok"; $("#status-text").textContent = "Agent online"; })
    .catch(() => { $("#status").className = "status down"; $("#status-text").textContent = "Backend offline"; });

  try {
    COUNTRIES = await (await fetch("/api/countries")).json();
  } catch {
    COUNTRIES = [];
  }
  BY_CODE = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));
  planner.countries = planner.countries.filter((c) => BY_CODE[c]);
  $("#stat-countries").textContent = COUNTRIES.length || "24";

  $("#c-country").innerHTML = COUNTRIES.map((c) => `<option value="${c.code}">${c.name}</option>`).join("");
  $("#c-country").value = "DE";

  readPlannerHash();
  updatePlanner({ syncInputs: true });

  const tab = location.hash.slice(1).split("?")[0];
  if (["agent", "contract", "planner"].includes(tab)) selectTab(tab, true);
}

boot();
