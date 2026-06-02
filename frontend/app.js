/* fourpi frontend — vanilla JS. Talks to Flask via fetch, renders everything. */
"use strict";

const API = "";  // same origin
let DATA = null; // last analysis result
let chartState = null; // { full, opt, cutL, cutR } for trim feature
let selectedMode = "default"; // current increment mode (persists before data loads)

/* ----------------------------- helpers ----------------------------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function gradBg(value, center, span, higherBetter) {
  let t = (value - center) / span;
  if (!higherBetter) t = -t;
  t = Math.max(-1, Math.min(1, t));
  const a = (Math.abs(t) * 0.5).toFixed(3);
  return t >= 0 ? `background:rgba(158,206,106,${a})` : `background:rgba(247,118,142,${a})`;
}

function fmtm(v) { return (v === null || v === undefined || Number.isNaN(v)) ? "&mdash;" : v.toFixed(3); }

/* ----------------------------- overlay ------------------------------------ */
function setBusy(on, text) {
  if (text) $("overlayText").textContent = text;
  document.body.classList.toggle("busy", on);
}

function toast(msg) {
  const t = $("toast") || (() => {
    const d = document.createElement("div"); d.id = "toast"; d.className = "toast";
    document.body.appendChild(d); return d;
  })();
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 4000);
}

/* ----------------------------- data load ---------------------------------- */
async function loadDefault() {
  setBusy(true, "Loading dataset…");
  try {
    const res = await fetch(`${API}/api/analyze/default`);
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
    DATA = await res.json();
    renderAll(DATA);
  } catch (err) {
    toast("Could not load default dataset: " + err.message);
  } finally {
    setBusy(false);
  }
}

async function uploadFile(file) {
  setBusy(true, `Processing ${file.name}…`);
  const fd = new FormData();
  fd.append("file", file);
  fd.append("mode", selectedMode);
  try {
    const res = await fetch(`${API}/api/analyze`, { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText);
    DATA = body;
    renderAll(DATA);
  } catch (err) {
    toast("Error: " + err.message);
  } finally {
    setBusy(false);
  }
}

/* ----------------------------- mode switching ----------------------------- */
function markActiveMode(mode) {
  const labels = { default: "Default increment", quadratic: "Quadratic increment", every2nd: "Increment of every 2nd" };
  document.querySelectorAll(".mode-row").forEach(r => {
    r.classList.toggle("active", r.getAttribute("data-mode") === mode);
  });
  const nm = $("modeName");
  if (nm) nm.textContent = labels[mode] || mode;
}

async function setMode(mode) {
  $("modeMenu").classList.remove("open");
  if (mode === selectedMode && DATA && DATA.mode === mode) return; // no change
  selectedMode = mode;
  markActiveMode(mode);  // reflect choice immediately, even before data loads
  setBusy(true, "Recomputing…");
  try {
    const res = await fetch(`${API}/api/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText);
    if (body.pending) {           // no dataset yet — choice is remembered
      setBusy(false);
      return;
    }
    DATA = body;
    renderAll(DATA);
    markActiveMode(DATA.mode);
  } catch (err) {
    toast("Error: " + err.message);
  } finally {
    setBusy(false);
  }
}
let editIdx = null; // currently looked-up index

function openEditModal() {
  if (!DATA) return;
  editIdx = null;
  $("idxInput").value = "";
  $("valInput").value = "";
  $("curVal").textContent = "–";
  $("valField").style.display = "none";
  $("editApply").disabled = true;
  $("editRange").textContent = `Enter an index (0 .. ${DATA.num - 1}) to look it up, then change and save.`;
  $("editModal").classList.add("open");
  setTimeout(() => $("idxInput").focus(), 50);
}

function closeEditModal() { $("editModal").classList.remove("open"); }

async function lookupIndex() {
  const raw = $("idxInput").value.trim();
  if (!/^\d+$/.test(raw)) { toast("Enter a valid non-negative integer index."); return; }
  const idx = parseInt(raw, 10);
  try {
    const res = await fetch(`${API}/api/digit/${idx}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText);
    editIdx = body.index;
    $("curVal").textContent = body.value;
    $("valInput").value = body.value;
    $("valField").style.display = "block";
    $("editApply").disabled = false;
    setTimeout(() => { $("valInput").focus(); $("valInput").select(); }, 50);
  } catch (err) {
    toast("Error: " + err.message);
    $("valField").style.display = "none";
    $("editApply").disabled = true;
  }
}

async function applyEdits() {
  if (editIdx === null) { toast("Look up an index first."); return; }
  const v = $("valInput").value.trim();
  if (!/^[0-9]$/.test(v)) { toast("New value must be a single digit 0–9."); return; }
  const val = parseInt(v, 10);
  closeEditModal();

  setBusy(true, `Processing ${DATA.source || "data"}…`);
  try {
    const res = await fetch(`${API}/api/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edits: [{ index: editIdx, value: val }] })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText);
    DATA = body;
    renderAll(DATA);
  } catch (err) {
    toast("Error: " + err.message);
  } finally {
    setBusy(false);
  }
}

/* ----------------------------- rendering ---------------------------------- */
function renderAll(d) {
  renderSource(d);
  renderSequences(d);
  renderCards(d);
  renderStatRow(d);
  renderCumChart(d);
  renderTable(d);
  renderAvgTable(d);
  renderDetail(6);
  if (d.mode) { selectedMode = d.mode; markActiveMode(d.mode); }
}

function renderSource(d) {
  $("sourceLine").innerHTML =
    `Source: <code>${esc(d.source)}</code> &middot; ${d.num} digits &middot; built in ${d.build_s} s`;
}

function renderSequences(d) {
  const sep = '<span class="sep">,</span> ';
  $("rawSeqVals").innerHTML = d.first_digits.join(sep === "" ? "" : "").length
    ? d.first_digits.map(String).join(sep) : "";
  $("cumSeqVals").innerHTML = d.first_cumsum.map(String).join(sep);
}

function renderCards(d) {
  $("cards").innerHTML = `
    <div class="card"><div class="lbl">max cumsum</div><div class="val">${d.max_val}</div></div>
    <div class="card"><div class="lbl">avg digit</div><div class="val">${d.avg_digit.toFixed(4)}</div></div>
    <div class="card"><div class="lbl">mean exact%</div><div class="val">${d.stats.mean_e.toFixed(2)}%</div></div>
    <div class="card"><div class="lbl">mean avg|diff|</div><div class="val">${d.stats.mean_d.toFixed(3)}</div></div>`;
}

function renderStatRow(d) {
  const rs = d.raw_stats;
  const freqRows = [...d.digit_freq].sort((a, b) => b.pct - a.pct).map(r => {
    const barw = Math.min(100, r.pct * 6);
    const cls = r.dev >= 0 ? "pos" : "neg";
    const sign = r.dev >= 0 ? "+" : "";
    return `<tr><td>${r.digit}</td><td>${r.count}</td>
      <td>${r.pct.toFixed(3)}%<br><span class="bar" style="width:${barw.toFixed(0)}px"></span></td>
      <td class="${cls}">${sign}${r.dev.toFixed(3)}%</td></tr>`;
  }).join("");

  const chi2pass = rs.chi2 < rs.chi2_crit_05;
  const chiCls = chi2pass ? "pos" : "neg";
  const randRows = `
    <tr><td>chi-square (df=${rs.dof})</td><td class="${chiCls}">${rs.chi2.toFixed(2)} (${chi2pass ? "pass" : "FAIL"})</td><td>&lt;${rs.chi2_crit_05.toFixed(2)}</td></tr>
    <tr><td>entropy (bits)</td><td>${rs.entropy.toFixed(5)}</td><td>${rs.max_entropy.toFixed(5)}</td></tr>
    <tr><td>entropy %</td><td>${rs.entropy_pct.toFixed(4)}%</td><td>100%</td></tr>
    <tr><td>mean</td><td>${rs.mean.toFixed(5)}</td><td>${rs.mean_exp.toFixed(2)}</td></tr>
    <tr><td>variance</td><td>${rs.var.toFixed(4)}</td><td>${rs.var_exp.toFixed(2)}</td></tr>
    <tr><td>std dev</td><td>${rs.std.toFixed(4)}</td><td>${Math.sqrt(rs.var_exp).toFixed(4)}</td></tr>
    <tr><td>serial corr (lag 1)</td><td>${(rs.serial_corr >= 0 ? "+" : "") + rs.serial_corr.toFixed(5)}</td><td>~0</td></tr>
    <tr><td>frac &ge; 5 (monobit)</td><td>${rs.high_frac.toFixed(5)}</td><td>0.5</td></tr>
    <tr><td>runs (&ge;/&lt; 5)</td><td>${rs.runs}</td><td>~${Number.isNaN(rs.exp_runs) ? "—" : rs.exp_runs.toFixed(0)}</td></tr>
    <tr><td>rarest digit</td><td>${rs.min_digit} (${rs.min_count})</td><td>&mdash;</td></tr>
    <tr><td>most common digit</td><td>${rs.max_digit} (${rs.max_count})</td><td>&mdash;</td></tr>`;

  const s = d.stats;
  const ksumRows = `
    <tr><td>mean</td><td>${s.mean_d.toFixed(3)}</td><td>${s.mean_e.toFixed(2)}%</td></tr>
    <tr><td>median</td><td>${s.med_d.toFixed(3)}</td><td>${s.med_e.toFixed(2)}%</td></tr>
    <tr><td>std dev</td><td>${s.std_d.toFixed(3)}</td><td>${s.std_e.toFixed(2)}%</td></tr>
    <tr><td>min (k=${s.min_dk} / k=${s.min_ek})</td><td>${s.min_d.toFixed(3)}</td><td>${s.min_e.toFixed(2)}%</td></tr>
    <tr><td>max (k=${s.max_dk} / k=${s.max_ek})</td><td>${s.max_d.toFixed(3)}</td><td>${s.max_e.toFixed(2)}%</td></tr>
    <tr><td>range</td><td>${(s.max_d - s.min_d).toFixed(3)}</td><td>${(s.max_e - s.min_e).toFixed(2)}%</td></tr>
    <tr><td>theoretical (pure random)</td><td>~1.500</td><td>~22.22%</td></tr>`;

  $("statRow").innerHTML = `
    <div class="statcol"><h3>Digit frequency (raw)</h3><div class="body">
      <table><thead><tr><th>digit</th><th>count</th><th>%</th><th>Δ vs 10%</th></tr></thead>
      <tbody>${freqRows}</tbody></table></div></div>
    <div class="statcol"><h3>Randomness statistics (raw)</h3><div class="body">
      <table class="kv"><thead><tr><th>metric</th><th>value</th><th>ideal</th></tr></thead>
      <tbody>${randRows}</tbody></table></div></div>
    <div class="statcol"><h3>k-summary (k = 2..100)</h3><div class="body">
      <table><thead><tr><th>metric</th><th>avg|diff|</th><th>exact%</th></tr></thead>
      <tbody>${ksumRows}</tbody></table></div></div>`;
}

function renderTable(d) {
  const body = $("ktabBody");
  body.innerHTML = d.k_rows.map(row => {
    const tag = `<span class="tag ${row.family_cls}">${row.family}</span>`;
    const avgBg = gradBg(row.avg, 1.5, 1.0, false);
    const exBg = gradBg(row.exact, 22.22, 22.22, true);
    return `<tr data-root="${row.is_root}" data-core="${row.core}" data-k="${row.k}">
      <td>${row.k}</td><td>${tag}</td>
      <td style="${avgBg}">${row.avg.toFixed(3)}</td>
      <td style="${exBg}">${row.exact.toFixed(1)}%</td>
      <td>${fmtm(row.R)}</td><td>${fmtm(row.r)}</td><td>${fmtm(row.p)}</td>
      <td>${row.levels}</td></tr>`;
  }).join("");

  // row click -> chart
  [...body.rows].forEach(tr => {
    tr.addEventListener("click", () => {
      [...body.rows].forEach(r => r.classList.remove("selected"));
      const ar = document.querySelector("#avgTable .avgrow"); if (ar) ar.classList.remove("selected");
      tr.classList.add("selected");
      const k = tr.getAttribute("data-k");
      drawChart(DATA.k_evolution[k] || [], {
        title: `Evolution of k = ${k} (cumulative avg|diff| over its levels)`,
        xlabel: "target = k·2^n", isAvg: false
      });
      renderDetail(k);
    });
  });
}

function renderAvgTable(d) {
  const s = d.stats;
  const avgBg = gradBg(s.mean_d, 1.5, 1.0, false);
  const exBg = gradBg(s.mean_e, 22.22, 22.22, true);
  const body = $("avgTableBody");
  body.innerHTML = `<tr class="avgrow">
    <td>AVG</td><td></td>
    <td style="${avgBg}">${s.mean_d.toFixed(3)}</td>
    <td style="${exBg}">${s.mean_e.toFixed(1)}%</td>
    <td>${s.mean_R.toFixed(3)}</td><td>${s.mean_r.toFixed(3)}</td><td>${s.mean_p.toFixed(3)}</td>
    <td></td></tr>`;
  body.rows[0].addEventListener("click", () => {
    [...$("ktabBody").rows].forEach(r => r.classList.remove("selected"));
    body.rows[0].classList.add("selected");
    const data = DATA.avg_evolution.map((v, i) => [i, v, 0]);
    drawChart(data, { title: "Evolution of AVG (mean cumulative avg|diff| across all k)", xlabel: "level n", isAvg: true });
  });
}

function renderDetail(k) {
  const rows = (DATA.k_detail && DATA.k_detail[String(k)]) || [];
  const fmtd = (x) => x === 0 ? "EXACT" : (x > 0 ? "+" + x : "" + x);
  $("detailSummary").innerHTML = `Detailed: k = ${k} &nbsp;(${k}&middot;2<sup>n</sup>)`;
  $("detailTargetHdr").innerHTML = `${k}&middot;2^n`;
  $("k6Body").innerHTML = rows.map(r =>
    `<tr class="${r.diff === 0 ? "exact" : ""}"><td>${r.n}</td><td>${r.target}</td><td>${r.nearest}</td><td>${fmtd(r.diff)}</td></tr>`
  ).join("") || '<tr><td colspan="4" style="text-align:left;color:var(--muted)">No data for this k.</td></tr>';
}

function renderCumChart(d) {
  const pts = d.cumsum_sampled || [];
  const area = $("cumChartArea");
  $("cumChartTitle") && ($("cumChartTitle").textContent = "");
  if (!pts.length) { area.innerHTML = '<div class="hint">No data.</div>'; return; }

  const W = 920, H = 280, padL = 64, padR = 18, padT = 16, padB = 34;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const xmin = xs[0], xmax = xs[xs.length - 1];
  let ymin = Math.min(...ys), ymax = Math.max(...ys);
  if (ymin === ymax) { ymin -= 0.5; ymax += 0.5; }
  const padY = (ymax - ymin) * 0.05; ymin -= padY; ymax += padY;
  const X = v => padL + (v - xmin) / (xmax - xmin) * (W - padL - padR);
  const Y = v => H - padB - (v - ymin) / (ymax - ymin) * (H - padT - padB);
  const fmtBig = v => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : (v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : Math.round(v));

  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let i = 0; i <= 4; i++) {
    const yv = ymin + (ymax - ymin) * i / 4, yy = Y(yv);
    s += `<line class="grid" x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}"/>`;
    s += `<text class="lbl" x="${padL - 6}" y="${yy + 3}" text-anchor="end">${fmtBig(yv)}</text>`;
  }
  s += `<line class="axis" x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}"/>`;
  s += `<line class="axis" x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}"/>`;
  // x labels at ~8 ticks across the real index range
  for (let t = 0; t <= 8; t++) {
    const xv = xmin + (xmax - xmin) * t / 8;
    s += `<text class="lbl" x="${X(xv)}" y="${H - padB + 16}" text-anchor="middle">${fmtBig(xv)}</text>`;
  }
  s += `<text class="lbl" x="${(padL + W - padR) / 2}" y="${H - 4}" text-anchor="middle">index (1..${d.cumsum_total})</text>`;
  let path = "";
  for (let i = 0; i < pts.length; i++) path += (i ? " L" : "M") + X(pts[i][0]).toFixed(1) + " " + Y(pts[i][1]).toFixed(1);
  s += `<path d="${path}" fill="none" stroke="#7aa2f7" stroke-width="2"/>`;
  s += "</svg>";
  s += `<div class="hint" style="margin-top:6px">${d.cumsum_total} values total${pts.length < d.cumsum_total ? `, sampled to ${pts.length} points` : ""}</div>`;
  area.innerHTML = s;
}

/* ----------------------------- table sort --------------------------------- */
function sortTable(col, type) {
  const t = $("ktab"), tb = $("ktabBody");
  const rows = [...tb.rows];
  const asc = t.getAttribute("data-col") == col ? !(t.getAttribute("data-asc") === "1") : true;
  rows.sort((a, b) => {
    let x = a.cells[col].innerText, y = b.cells[col].innerText;
    if (type === "n") { x = parseFloat(x) || 0; y = parseFloat(y) || 0; return asc ? x - y : y - x; }
    return asc ? x.localeCompare(y) : y.localeCompare(x);
  });
  rows.forEach(r => tb.appendChild(r));
  t.setAttribute("data-col", col); t.setAttribute("data-asc", asc ? "1" : "0");
}

/* ----------------------------- toggle members ----------------------------- */
function toggleMembers() {
  const btn = $("toggleMembers");
  const hide = btn.getAttribute("data-hidden") !== "1";
  [...$("ktabBody").rows].forEach(r => {
    if (r.getAttribute("data-root") !== "1") r.classList.toggle("hidden-member", hide);
  });
  btn.setAttribute("data-hidden", hide ? "1" : "0");
  btn.textContent = hide ? "show members" : "hide members";
}

/* ----------------------------- chart -------------------------------------- */
function drawChart(data, opt) {
  // entry point: store full series, reset trim, render
  chartState = { full: data || [], opt: opt || {}, cutL: 0, cutR: 0 };
  renderChart();
}

function trimPoint(side) {
  // side: 'L' (first) or 'R' (last). Keep at least 2 points.
  if (!chartState) return;
  const remaining = chartState.full.length - chartState.cutL - chartState.cutR;
  if (remaining <= 2) return;
  if (side === "L") chartState.cutL++;
  else chartState.cutR++;
  renderChart();
}

function resetTrim() {
  if (!chartState) return;
  chartState.cutL = 0; chartState.cutR = 0;
  renderChart();
}

function renderChart() {
  const opt = chartState.opt;
  const area = $("chartArea");
  $("chartTitle").textContent = opt.title || "Evolution";
  const full = chartState.full;
  if (!full.length) { area.innerHTML = '<div class="hint">No data.</div>'; return; }
  // visible slice after trimming first/last points
  const data = full.slice(chartState.cutL, full.length - chartState.cutR);
  const trimmed = chartState.cutL + chartState.cutR;
  if (!data.length) { area.innerHTML = '<div class="hint">No data.</div>'; return; }

  const W = 620, H = 380, padL = 50, padR = 18, padT = 18, padB = 40;
  const xs = data.map(d => d[0]), ys = data.map(d => d[1]);
  const avgSlice = [];
  // align AVG reference to the same (trimmed) level window
  if (!opt.isAvg) for (let i = chartState.cutL; i < full.length - chartState.cutR && i < DATA.avg_evolution.length; i++) avgSlice.push(DATA.avg_evolution[i]);
  const allY = ys.concat(avgSlice);
  let xmin = Math.min(...xs), xmax = Math.max(...xs);
  let ymin = Math.min(...allY), ymax = Math.max(...allY);
  if (ymin === ymax) { ymin -= 0.5; ymax += 0.5; }
  const padY = (ymax - ymin) * 0.1; ymin -= padY; ymax += padY;

  const lg = v => Math.log(v) / Math.LN2;
  const useLog = !opt.isAvg;
  const lxmin = useLog ? lg(xmin) : xmin, lxmax = useLog ? lg(xmax) : xmax;
  const X = v => { const tv = useLog ? lg(v) : v; return lxmax === lxmin ? padL : padL + (tv - lxmin) / (lxmax - lxmin) * (W - padL - padR); };
  const Y = v => H - padB - (v - ymin) / (ymax - ymin) * (H - padT - padB);

  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let i = 0; i <= 4; i++) {
    const yv = ymin + (ymax - ymin) * i / 4, yy = Y(yv);
    s += `<line class="grid" x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}"/>`;
    s += `<text class="lbl" x="${padL - 6}" y="${yy + 3}" text-anchor="end">${yv.toFixed(2)}</text>`;
  }
  s += `<line class="axis" x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}"/>`;
  s += `<line class="axis" x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}"/>`;

  const step = Math.max(1, Math.ceil(data.length / 10));
  for (let i = 0; i < data.length; i++) {
    if (i % step !== 0 && i !== data.length - 1) continue;
    s += `<text class="lbl" x="${X(data[i][0])}" y="${H - padB + 16}" text-anchor="middle">${data[i][0]}</text>`;
  }
  s += `<text class="lbl" x="${(padL + W - padR) / 2}" y="${H - 4}" text-anchor="middle">${esc(opt.xlabel || "")}</text>`;

  if (!opt.isAvg) {
    let ap = "", aN = 0;
    for (let i = 0; i < data.length; i++) {
      const ai = chartState.cutL + i;
      if (ai >= DATA.avg_evolution.length) break;
      ap += (aN ? " L" : "M") + X(data[i][0]).toFixed(1) + " " + Y(DATA.avg_evolution[ai]).toFixed(1); aN++;
    }
    if (aN > 1) s += `<path d="${ap}" fill="none" stroke="#5a6473" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  }

  // trend line: least-squares linear fit of y over the plotted x-coordinate
  // (log2 of target for k-mode, raw level index for AVG-mode), drawn dashed yellow
  if (data.length >= 2) {
    const tx = data.map(d => useLog ? lg(d[0]) : d[0]);
    const ty = data.map(d => d[1]);
    const n = tx.length;
    const mx = tx.reduce((a, b) => a + b, 0) / n;
    const my = ty.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (tx[i] - mx) * (ty[i] - my); den += (tx[i] - mx) ** 2; }
    const slope = den > 1e-12 ? num / den : 0;
    const intercept = my - slope * mx;
    // endpoints at first and last x
    const x0 = data[0][0], x1 = data[data.length - 1][0];
    const t0 = useLog ? lg(x0) : x0, t1 = useLog ? lg(x1) : x1;
    const yA = slope * t0 + intercept, yB = slope * t1 + intercept;
    s += `<path d="M${X(x0).toFixed(1)} ${Y(yA).toFixed(1)} L${X(x1).toFixed(1)} ${Y(yB).toFixed(1)}" `
      + `fill="none" stroke="#e0af68" stroke-width="1.2" stroke-dasharray="4 4"/>`;
  }

  let path = "";
  for (let i = 0; i < data.length; i++) path += (i ? " L" : "M") + X(data[i][0]).toFixed(1) + " " + Y(data[i][1]).toFixed(1);
  s += `<path d="${path}" fill="none" stroke="#7aa2f7" stroke-width="2"/>`;

  const steps = [];
  for (let i = 1; i < data.length; i++) steps.push(Math.abs(data[i][1] - data[i - 1][1]));
  const mean = steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : 0;
  const sd = steps.length ? Math.sqrt(steps.reduce((a, b) => a + (b - mean) ** 2, 0) / steps.length) : 0;
  const thr = mean + sd;
  const anomalous = i => {
    if (i === 0 || i === data.length - 1) return true;
    return Math.abs(data[i][1] - data[i - 1][1]) > thr || Math.abs(data[i + 1][1] - data[i][1]) > thr;
  };

  for (let i = 0; i < data.length; i++) {
    const cx = X(data[i][0]), cy = Y(data[i][1]);
    const isExact = data[i][2] === 1;
    const color = isExact ? "#9ece6a" : "#7aa2f7", r = isExact ? 4.5 : 3.5;
    const isEdge = (i === 0 || i === data.length - 1) && data.length > 2;
    const side = i === 0 ? "L" : "R";
    s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${color}"/>`;
    if (isEdge) {
      // larger transparent hitbox for right-click removal
      s += `<circle class="edge-pt" data-side="${side}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="10" fill="transparent" style="cursor:context-menu"/>`;
    }
    if (anomalous(i)) s += `<text class="ttl" x="${cx.toFixed(1)}" y="${(cy - 8).toFixed(1)}" text-anchor="middle">${data[i][1].toFixed(2)}</text>`;
  }
  s += "</svg>";
  const trimNote = trimmed > 0
    ? ` &middot; <span style="color:var(--bad)">${trimmed} point(s) trimmed</span> <button id="resetTrimBtn" class="btn" style="padding:2px 8px;font-size:11px;margin-left:4px">reset</button>`
    : "";
  s += `<div class="hint" style="margin-top:6px">
    <span style="color:#7aa2f7">&#9679;</span> avg|diff| &nbsp;
    <span style="color:#9ece6a">&#9679;</span> exact match (diff=0) &nbsp;
    ${opt.isAvg ? "" : '<span style="color:#5a6473">&#9472;&#9472;</span> AVG (all k) &nbsp;'}
    <span style="color:#e0af68">&#9472;&#9472;</span> trend &nbsp;
    labels on anomalous jumps &middot; right-click an end point to trim it${trimNote}</div>`;
  area.innerHTML = s;

  // wire right-click trim on edge points
  area.querySelectorAll(".edge-pt").forEach(el => {
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      trimPoint(el.getAttribute("data-side"));
    });
  });
  const rb = $("resetTrimBtn");
  if (rb) rb.addEventListener("click", resetTrim);
}

/* ----------------------------- wiring ------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  // toolbar menu
  $("rawDataBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    $("rawDataMenu").classList.toggle("open");
  });
  $("menuNewData").addEventListener("click", () => {
    $("rawDataMenu").classList.remove("open");
    $("fileInput").click();
  });
  $("fileInput").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (f) uploadFile(f);
  });
  document.addEventListener("click", () => $("rawDataMenu").classList.remove("open"));

  // change-mode menu
  $("changeModeBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    $("modeMenu").classList.toggle("open");
  });
  document.querySelectorAll(".mode-row").forEach(r => {
    r.addEventListener("click", (e) => {
      e.stopPropagation();
      setMode(r.getAttribute("data-mode"));
    });
  });
  document.addEventListener("click", () => $("modeMenu").classList.remove("open"));

  // table header sort
  document.querySelectorAll("#ktab thead th").forEach(th => {
    th.addEventListener("click", () => sortTable(+th.getAttribute("data-col"), th.getAttribute("data-type")));
  });

  // toggle members
  $("toggleMembers").addEventListener("click", toggleMembers);

  // edit-by-index modal
  $("rawSeqPanel").addEventListener("click", openEditModal);
  $("editClose").addEventListener("click", closeEditModal);
  $("editCancel").addEventListener("click", closeEditModal);
  $("fetchBtn").addEventListener("click", lookupIndex);
  $("editApply").addEventListener("click", applyEdits);
  $("idxInput").addEventListener("keydown", (e) => { if (e.key === "Enter") lookupIndex(); });
  $("valInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && !$("editApply").disabled) applyEdits(); });
  $("valInput").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, "").slice(0, 1); });
  $("editModal").addEventListener("click", (e) => {
    if (e.target === $("editModal")) closeEditModal();
  });

  // initial load
  loadDefault();
});