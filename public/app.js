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
// If `signal` aborts, resolves with the partial text instead of throwing.
async function streamInto(url, body, el, { onDone, signal } = {}) {
  let text = "";
  let frame = 0;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); detail = typeof j.detail === "string" ? j.detail : detail; } catch {}
    throw new Error(detail);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (!frame) {
        frame = requestAnimationFrame(() => { frame = 0; renderMarkdown(el, text); onDone?.(text, false); });
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") throw err;
    text += "\n\n_(Stopped.)_";
  }
  cancelAnimationFrame(frame);
  if (!text.trim()) throw new Error("the server returned an empty response");
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
const chat = { history: [], busy: false, ctrl: null };
const SEND_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
const STOP_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`;
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
  chat.ctrl = new AbortController();
  chatSend.innerHTML = STOP_ICON;
  chatSend.setAttribute("aria-label", "Stop");
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
      signal: chat.ctrl.signal,
      onDone: () => {
        if (!md.isConnected) botBody.replaceChildren(md);
        scrollChat();
      },
    });
    if (!md.isConnected) botBody.replaceChildren(md);
    chat.history.push({ role: "assistant", content: reply });
    const copy = document.createElement("button");
    copy.className = "link-btn msg-copy";
    copy.textContent = "Copy answer";
    copy.addEventListener("click", async () => { await navigator.clipboard.writeText(reply); toast("Answer copied"); });
    botBody.appendChild(copy);
  } catch (err) {
    chat.history.pop();
    botBody.innerHTML = `<div class="md"><p>⚠️ Couldn't reach the HR Agent (${escapeHtml(err.message)}). Check that the backend is running and <code>ANTHROPIC_API_KEY</code> is set.</p></div>`;
  } finally {
    chat.busy = false;
    chatSend.innerHTML = SEND_ICON;
    chatSend.setAttribute("aria-label", "Send");
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
  if (chat.busy) return chat.ctrl.abort();
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

$("#contract-download").addEventListener("click", () => downloadMd(contract.text, $("#contract-title").textContent));

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
        <div class="card-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-contract="${c.code}">Draft contract</button>
          <button type="button" class="btn btn-ghost btn-sm" data-hire="${c.code}">⚡ Hire here</button>
        </div>
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

$("#p-compare").addEventListener("click", (e) => {
  const contractCode = e.target.closest("[data-contract]")?.dataset.contract;
  const hireCode = e.target.closest("[data-hire]")?.dataset.hire;
  if (contractCode) {
    $("#c-country").value = contractCode;
    if (planner.role) $("#c-role").value = planner.role;
    $("#c-salary").value = `${usd(planner.salary)} / year`;
    selectTab("contract", true);
    history.replaceState(null, "", "#contract");
    $("#c-role").value ? $("#contract-go").focus() : $("#c-role").focus();
  } else if (hireCode) {
    const q = `Hire a ${planner.role || "new team member"} in ${BY_CODE[hireCode].name} on a base salary of about ${usd(planner.salary)} a year (EOR fee ${usd(planner.fee)}/month).`;
    $("#hire-input").value = q;
    selectTab("hire", true);
    history.replaceState(null, "", "#hire");
    runHire(q);
  }
});

$("#p-share").addEventListener("click", async () => {
  history.replaceState(null, "", plannerHash());
  copyLink(location.origin + location.pathname + plannerHash());
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

// ---------- One-prompt hire ----------
const hire = { busy: false, contract: "", started: 0, timer: 0, ctrl: null, prompt: "" };
const STEPS = {
  compare_countries: { running: "Comparing countries", done: "Countries compared" },
  draft_contract: { running: "Drafting the contract", done: "Contract drafted" },
  create_onboarding_plan: { running: "Building the onboarding plan", done: "Onboarding plan ready" },
};
const spinner = `<span class="ic thinking"><span class="spark"></span></span>`;

// POST JSON and call onEvent for each newline-delimited JSON event in the response.
async function streamEvents(url, body, onEvent, signal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); detail = typeof j.detail === "string" ? j.detail : detail; } catch {}
    throw new Error(detail);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.trim()) onEvent(JSON.parse(line));
    }
  }
}

function setStep(step, state) {
  const el = $(`#hire-pipeline [data-step="${step}"]`);
  if (el) el.className = state;
}

function addCard(cls, head) {
  const card = document.createElement("article");
  card.className = `tcard ${cls}`;
  card.innerHTML = `<div class="tcard-head">${head}</div><div class="tcard-body"></div>`;
  $("#hire-timeline").appendChild(card);
  return card;
}

function downloadMd(text, name) {
  const blob = new Blob([text], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[^\w]+/g, "-").toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderMiniCompare(body, data) {
  const min = Math.min(...data.rows.map((r) => r.total));
  body.innerHTML = `<div class="mini-compare">${data.rows.map((r) => `
    <div class="mini" data-code="${r.code}">
      <div class="name">${flagImg(r, 18)} ${escapeHtml(r.name)}</div>
      <div class="total">${usd(r.total)} <small>/ year</small></div>
      <div class="meta"><span>Employer ~${(r.employer_rate * 100).toFixed(1)}%</span><span>${r.pto_days} days leave</span></div>
      <div class="meta"><span>${r.total === min && data.rows.length > 1 ? "Lowest cost" : `+${usd(r.total - min)}`}</span><span class="risk ${r.misclass_risk}">${r.misclass_risk} risk</span></div>
    </div>`).join("")}</div>`;
}

function renderChecklist(body, items) {
  body.innerHTML = `<ul class="checklist">${items.map((it) => `
    <li><input type="checkbox" aria-label="Done" /><span class="when">${escapeHtml(it.when)}</span><span class="task">${escapeHtml(it.task)}</span><span class="owner ${escapeHtml(it.owner)}">${escapeHtml(it.owner)}</span></li>`).join("")}</ul>`;
  body.addEventListener("change", (e) => e.target.closest("li")?.classList.toggle("checked", e.target.checked));
}

function runHireEvents() {
  const cards = {};
  let note = null;
  let noteText = "";
  let contractFrame = 0;

  const finishCard = (card, label) => {
    card.classList.remove("running");
    card.classList.add("done");
    $(".ic", card).outerHTML = `<span class="ic">✓</span>`;
    $(".label", card).textContent = label;
  };

  return (e) => {
    const card = cards[e.id];
    switch (e.t) {
      case "text": {
        if (!note) {
          if ($('#hire-pipeline [data-step="create_onboarding_plan"]').className === "done") setStep("summary", "active");
          note = addCard("note", `<span class="ic">✦</span><span class="label">Agent</span>`);
          noteText = "";
        }
        noteText += e.d;
        renderMarkdown($(".tcard-body", note), noteText);
        break;
      }
      case "tool_start":
        note = null;
        cards[e.id] = addCard("running", `${spinner}<span class="label">${STEPS[e.name]?.running || e.name}…</span><span class="sub"></span>`);
        setStep(e.name, "active");
        break;
      case "tool_call": {
        if (!card) break;
        const sub = $(".sub", card);
        const i = e.input;
        if (e.name === "compare_countries") {
          sub.textContent = `${i.country_codes.map((c) => BY_CODE[c]?.name || c).join(" vs. ")} · ${usd(i.salary_usd)} base`;
        } else if (e.name === "draft_contract") {
          sub.textContent = `${i.worker_type === "contractor" ? "Contractor" : "Employment"} agreement · ${BY_CODE[i.country_code]?.name || i.country_code}`;
          $$(".mini.chosen").forEach((m) => m.classList.remove("chosen"));
          const mini = $(`.mini[data-code="${i.country_code}"]`);
          if (mini) {
            mini.classList.add("chosen");
            mini.insertAdjacentHTML("afterbegin", `<span class="badge-best">Recommended</span>`);
          }
          hire.contract = "";
          hire.contractName = `${sub.textContent} ${i.role}`;
          $(".tcard-body", card).innerHTML = `<div class="paper"><div class="md">${thinkingHtml("Researching local requirements")}</div></div>`;
        } else if (e.name === "create_onboarding_plan") {
          sub.textContent = BY_CODE[i.country_code]?.name || "";
        }
        break;
      }
      case "contract_delta":
        hire.contract += e.d;
        if (!contractFrame) {
          contractFrame = requestAnimationFrame(() => {
            contractFrame = 0;
            const md = $(".paper .md", card);
            if (md) renderMarkdown(md, hire.contract);
          });
        }
        break;
      case "tool_result":
        if (!card) break;
        finishCard(card, STEPS[e.name]?.done || e.name);
        setStep(e.name, "done");
        if (e.name === "compare_countries") {
          renderMiniCompare($(".tcard-body", card), e.data);
          $(".tcard-head", card).insertAdjacentHTML("beforeend", `<span class="actions"><button class="btn btn-ghost btn-sm" data-act="planner">Open in Planner</button></span>`);
          $('[data-act="planner"]', card).addEventListener("click", () => {
            Object.assign(planner, { countries: e.data.rows.map((r) => r.code), salary: Math.round(e.data.salary_usd), fee: e.data.eor_fee });
            updatePlanner({ syncInputs: true });
            selectTab("planner", true);
            history.replaceState(null, "", plannerHash());
          });
        } else if (e.name === "draft_contract") {
          cancelAnimationFrame(contractFrame);
          contractFrame = 0;
          renderMarkdown($(".paper .md", card), hire.contract);
          $(".tcard-head", card).insertAdjacentHTML("beforeend", `<span class="actions"><button class="btn btn-ghost btn-sm" data-act="copy">Copy</button><button class="btn btn-ghost btn-sm" data-act="dl">Download .md</button></span>`);
          const text = hire.contract;
          const name = hire.contractName;
          $('[data-act="copy"]', card).addEventListener("click", async () => { await navigator.clipboard.writeText(text); toast("Contract copied to clipboard"); });
          $('[data-act="dl"]', card).addEventListener("click", () => downloadMd(text, name));
        } else if (e.name === "create_onboarding_plan") {
          renderChecklist($(".tcard-body", card), e.data.items);
          const md = `# Onboarding checklist · ${e.data.country}\n\n` + e.data.items.map((it) => `- [ ] **${it.when}** · ${it.task} _(${it.owner})_`).join("\n");
          $(".tcard-head", card).insertAdjacentHTML("beforeend", `<span class="actions"><button class="btn btn-ghost btn-sm" data-act="copy">Copy checklist</button></span>`);
          $('[data-act="copy"]', card).addEventListener("click", async () => { await navigator.clipboard.writeText(md); toast("Checklist copied"); });
        }
        break;
      case "tool_error":
        if (!card) break;
        card.classList.replace("running", "error");
        $(".ic", card).outerHTML = `<span class="ic">!</span>`;
        $(".tcard-body", card).innerHTML = `<p>⚠️ ${escapeHtml(e.msg)}</p>`;
        setStep(e.name, "");
        break;
      case "error":
        addCard("error", `<span class="ic">!</span><span class="label">${escapeHtml(e.msg)}</span>`);
        break;
      case "done":
        if (note && note === $("#hire-timeline").lastElementChild) {
          note.classList.replace("note", "summary");
          $(".label", note).textContent = "Hiring summary";
          setStep("summary", "done");
          $(".tcard-head", note).insertAdjacentHTML("beforeend", `<span class="actions"><button class="btn btn-ghost btn-sm" data-act="share">Copy share link</button></span>`);
          $('[data-act="share"]', note).addEventListener("click", () => copyLink(hireLink(hire.prompt)));
        }
        break;
    }
  };
}

const hireLink = (q) => `${location.origin}${location.pathname}#hire?${new URLSearchParams({ q })}`;

async function copyLink(url) {
  try { await navigator.clipboard.writeText(url); toast("Share link copied"); }
  catch { prompt("Copy this link:", url); }
}

async function runHire(text) {
  text = text.trim();
  if (text.length < 3 || hire.busy) return;
  hire.busy = true;
  hire.prompt = text;
  hire.ctrl = new AbortController();
  const go = $("#hire-go");
  go.textContent = "■ Stop";
  go.classList.replace("btn-brand", "btn-ghost");
  $("#hire-timeline").innerHTML = "";
  $("#hire-pipeline").hidden = false;
  $$("#hire-pipeline [data-step]").forEach((s) => (s.className = ""));
  hire.started = Date.now();
  const tick = () => ($("#hire-timer").textContent = `${Math.round((Date.now() - hire.started) / 1000)}s`);
  tick();
  hire.timer = setInterval(tick, 1000);
  try {
    await streamEvents("/api/hire", { prompt: text }, runHireEvents(), hire.ctrl.signal);
  } catch (err) {
    if (err.name === "AbortError") addCard("error", `<span class="ic">■</span><span class="label">Stopped.</span>`);
    else addCard("error", `<span class="ic">!</span><span class="label">Couldn't reach the agent (${escapeHtml(err.message)}).</span>`);
    $$(".tcard.running").forEach((c) => c.classList.replace("running", "error"));
    $$(".tcard.error .thinking").forEach((sp) => (sp.outerHTML = `<span class="ic">!</span>`));
  } finally {
    clearInterval(hire.timer);
    tick();
    hire.busy = false;
    go.textContent = "Run agent";
    go.classList.replace("btn-ghost", "btn-brand");
  }
}

$("#hire-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (hire.busy) return hire.ctrl.abort();
  runHire($("#hire-input").value);
});
$("#hire-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runHire($("#hire-input").value); }
});
$$(".example").forEach((b) => b.addEventListener("click", () => {
  $("#hire-input").value = b.dataset.q;
  runHire(b.dataset.q);
}));

// ---------- Boot ----------
async function boot() {
  fetch("/api/health")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((h) => {
      const ready = h.api_key_configured !== false;
      $("#status").className = `status ${ready ? "ok" : "down"}`;
      $("#status-text").textContent = ready ? "Agent online" : "API key not configured";
    })
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

  const [tab, query] = location.hash.slice(1).split("?");
  if (["hire", "agent", "contract", "planner"].includes(tab)) selectTab(tab, true);
  // #hire?q=... pre-fills the prompt and runs it, so a demo link or QR code starts the agent directly.
  const q = tab === "hire" && new URLSearchParams(query || "").get("q");
  if (q) {
    $("#hire-input").value = q;
    runHire(q);
  }
}

boot();
