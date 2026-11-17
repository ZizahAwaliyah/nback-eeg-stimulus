// ================================================================
// dashboard.js — Tampilan dashboard untuk layar PENELITI
// ================================================================
// 1. Layar Setup : ringkasan sesi yang ikut berubah saat form diisi
//                  (trial/target per blok, urutan blok, perkiraan durasi,
//                  linimasa, status validasi).
// 2. Layar Hasil : kartu angka, grafik hit rate vs FA rate per blok,
//                  tabel per blok, dan penanda waktu untuk sinkronisasi EEG.
//
// File ini HANYA membaca konfigurasi dan data logger; tidak mengubah timing,
// urutan stimulus, atau isi CSV. Layar partisipan tidak memakai file ini.

const COUNTDOWN_SECONDS = 3; // runCountdown(3, ...) di main.js

// ----------------------------------------------------------------
// LAYAR SETUP
// ----------------------------------------------------------------

/** Susunan segmen sesi (latihan / blok / istirahat) beserta durasinya dalam detik. */
function planSessionSegments(cfg) {
  const trials = calculateTrialCount(cfg.block_duration_minutes, cfg.isi_ms);
  const isiSec = cfg.isi_ms / 1000;
  const levels = cfg.condition === "menaik" ? [...cfg.n_levels].sort((a, b) => a - b) : cfg.n_levels;
  const leadSec = (cfg.lead_in_ms || 0) / 1000;
  const blockSec = COUNTDOWN_SECONDS + leadSec + trials * isiSec;
  const practiceTrials = cfg.practice_trials > 0 ? Math.min(cfg.practice_trials, trials) : trials;
  const practiceSec = cfg.enable_practice ? COUNTDOWN_SECONDS + leadSec + practiceTrials * isiSec : 0;
  const restSec = Math.max(0, cfg.rest_seconds || 0);

  const segments = [];
  if (practiceSec && cfg.practice_placement === "before_session") {
    segments.push({ type: "practice", sec: practiceSec * levels.length, label: `Latihan semua tingkat` });
  }
  levels.forEach((n, i) => {
    if (i > 0 && restSec) segments.push({ type: "rest", sec: restSec, label: `Istirahat ${restSec} detik` });
    if (practiceSec && cfg.practice_placement !== "before_session") {
      segments.push({ type: "practice", sec: practiceSec, label: `Latihan ${n}-back` });
    }
    segments.push({ type: "block", sec: blockSec, n, label: `Blok ${i + 1} · ${n}-back` });
  });
  return { trials, segments, totalSec: segments.reduce((a, s) => a + s.sec, 0) };
}

function formatDuration(sec) {
  const m = Math.round(sec / 60);
  if (sec < 90) return `${Math.round(sec)} dtk`;
  if (m < 60) return `± ${m} mnt`;
  return `± ${Math.floor(m / 60)} j ${m % 60} mnt`;
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Perbarui panel "Ringkasan Sesi" di layar setup. Aman dipanggil kapan saja. */
function updateSetupSummary() {
  if (!document.getElementById("sum-trials")) return;
  const cfg = readConfigFromForm();
  const errors = validateConfig(cfg);
  const validLevels = cfg.n_levels.length > 0 && cfg.isi_ms > 0 && cfg.block_duration_minutes > 0;
  const plan = validLevels ? planSessionSegments(cfg) : { trials: 0, segments: [], totalSec: 0 };

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("sum-trials", validLevels ? plan.trials : "-");
  set("sum-targets", validLevels && cfg.target_ratio > 0 ? Math.round(plan.trials * cfg.target_ratio) : "-");
  set("sum-blocks", cfg.n_levels.length || "-");
  set("sum-duration", validLevels ? formatDuration(plan.totalSec) : "-");

  // Urutan blok
  const order = document.getElementById("sum-order");
  if (order) {
    const levels = cfg.condition === "menaik" ? [...cfg.n_levels].sort((a, b) => a - b) : cfg.n_levels;
    order.innerHTML = levels.length
      ? levels.map((n) => `<span class="order-chip">${escapeHtml(n)}-back</span>`).join('<span class="order-arrow">→</span>') +
        (cfg.condition === "acak" ? '<span class="order-note">diacak saat sesi dimulai</span>' : "")
      : '<span class="order-note">Tingkat N belum diisi</span>';
  }

  // Linimasa: lebar segmen sebanding dengan durasinya
  const timeline = document.getElementById("sum-timeline");
  if (timeline) {
    timeline.innerHTML = plan.segments
      .map((s) => {
        const text = s.type === "block" ? s.n : "";
        return `<div class="tl-seg tl-${s.type}" style="flex-grow:${s.sec}" title="${escapeHtml(s.label)} · ${formatDuration(s.sec)}">${text}</div>`;
      })
      .join("");
  }

  // Simpan otomatis: tampilkan pemilih folder & contoh path tujuan
  const autosave = cfg.autosave_per_block === true;
  const isGrid = cfg.stimulus_type === "grid3x3";
  const folderRow = document.getElementById("autosave-folder-row");
  const preview = document.getElementById("autosave-path-preview");
  if (folderRow) folderRow.style.display = autosave ? "flex" : "none";
  if (preview) {
    preview.style.display = autosave ? "block" : "none";
    const root = typeof dataRootHandle !== "undefined" && dataRootHandle ? dataRootHandle.name : "<lokasi>";
    preview.innerHTML = isGrid
      ? "Mode kotak 3x3 berjalan di halaman terpisah, jadi simpan otomatis per blok tidak berlaku di sana."
      : `Tujuan: <code>${escapeHtml(root)}/Data/${escapeHtml(participantFolderName(cfg.participant_name))}/</code>, satu CSV per blok.`;
  }
  if (autosave && !isGrid) {
    if (!folderPickerSupported()) errors.push("Simpan otomatis butuh Chrome/Edge (atau matikan opsinya)");
    else if (!dataRootHandle) errors.push("Pilih lokasi folder Data untuk simpan otomatis");
  }

  // Status & daftar masalah
  const warnings = errors.length ? [] : getConfigWarnings(cfg);
  const chip = document.getElementById("setup-status");
  if (chip) {
    chip.className = "status-chip " + (errors.length ? "is-pending" : "is-ready");
    chip.innerHTML = errors.length
      ? `<span aria-hidden="true">!</span> ${errors.length} perlu dilengkapi`
      : '<span aria-hidden="true">✓</span> Siap dimulai';
  }
  const issues = document.getElementById("sum-issues");
  if (issues) {
    issues.innerHTML =
      errors.map((e) => `<li class="issue-error"><span aria-hidden="true">!</span>${escapeHtml(e)}</li>`).join("") +
      warnings.map((w) => `<li class="issue-warn"><span aria-hidden="true">i</span>${escapeHtml(w)}</li>`).join("");
  }
}

// ----------------------------------------------------------------
// LAYAR HASIL
// ----------------------------------------------------------------

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

/** "2026-11-17 10:03:05.120" → objek Date (waktu lokal). */
function parseLocalTs(ts) {
  if (!ts) return null;
  const d = new Date(String(ts).replace(" ", "T"));
  return isNaN(d) ? null : d;
}

function timeOnly(ts) {
  return ts ? String(ts).split(" ")[1] || ts : "-";
}

function secondsBetween(a, b) {
  const da = parseLocalTs(a);
  const db = parseLocalTs(b);
  return da && db ? (db - da) / 1000 : null;
}

/** Isi #summary-content dan #result-meta di layar Hasil Sesi. */
function buildResultDashboard() {
  const cfg = currentConfig || {};
  const trials = currentLogger.getAllTrials();
  const blocks = blockOrder.map((n, idx) => ({
    idx,
    n,
    target: currentLogger.targetStimPerBlock[idx] ?? null,
    s: currentLogger.getBlockSummary(idx),
  }));

  // --- Meta ---
  const meta = document.getElementById("result-meta");
  if (meta) {
    meta.textContent = [
      cfg.participant_name && `Partisipan: ${cfg.participant_name}`,
      cfg.researcher && `Peneliti: ${cfg.researcher}`,
      cfg.session && `${cfg.session} · ${cfg.condition}`,
      `Mulai ${currentLogger.sessionStart}`,
    ]
      .filter(Boolean)
      .join("  ·  ");
  }

  // --- Angka gabungan ---
  const sum = (key) => blocks.reduce((a, b) => a + (b.s[key] || 0), 0);
  const totalTargets = sum("targets");
  const totalHits = sum("hits");
  const totalFA = sum("false_alarms");
  const totalNonTargets = trials.length - totalTargets;
  const withResponse = trials.filter((t) => t.response).length;
  const correct = trials.filter((t) => t.correct === true || t.correct === "true").length;
  // Definisi RT keseluruhan dibiarkan sama seperti sebelumnya (semua respons).
  const rts = trials.map((t) => parseFloat(t.reaction_time_ms)).filter((v) => !isNaN(v));
  const meanRt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null;

  const kpi = (label, value, sub) =>
    `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${
      sub ? `<div class="kpi-sub">${sub}</div>` : ""
    }</div>`;

  let html = `<div class="kpi-grid kpi-grid-5">
    ${kpi("Total trial", trials.length, `${withResponse} dengan respons`)}
    ${kpi("Akurasi", trials.length ? pct(correct / trials.length) : "-", "hit + correct rejection")}
    ${kpi("Hit rate", totalTargets ? pct(totalHits / totalTargets) : "-", `${totalHits} dari ${totalTargets} target`)}
    ${kpi("False alarm rate", totalNonTargets ? pct(totalFA / totalNonTargets) : "-", `${totalFA} dari ${totalNonTargets} bukan-target`)}
    ${kpi("Rata-rata RT", meanRt !== null ? `${meanRt} ms` : "N/A", "semua respons")}
  </div>`;

  // --- Grafik + tabel ---
  html += `<div class="card dash-card">
    <div class="dash-card-head"><h2>Hit rate vs false alarm rate per blok</h2></div>
    <div class="chart-legend">
      <span><i class="sw sw-hit"></i>Hit rate</span>
      <span><i class="sw sw-fa"></i>False alarm rate</span>
    </div>
    <div class="chart-wrap" id="result-chart"><div class="chart-svg"></div><div class="chart-tip" hidden></div></div>
  </div>`;

  html += `<div class="card dash-card">
    <div class="dash-card-head"><h2>Rincian per blok</h2></div>
    <div class="table-scroll"><table class="data-table">
      <thead><tr>
        <th>Blok</th><th>Tingkat</th><th class="num">Trial</th><th class="num">Hit</th><th class="num">Miss</th>
        <th class="num">FA</th><th class="num">Akurasi</th><th class="num">Hit rate</th><th class="num">FA rate</th>
        <th class="num">d′</th><th class="num">RT hit</th>
      </tr></thead>
      <tbody>${blocks
        .map(
          ({ idx, n, target, s }) => `<tr>
          <td>${idx + 1}</td>
          <td>${n}-back${target ? ` <span class="muted">(sasaran ${escapeHtml(target)})</span>` : ""}</td>
          <td class="num">${s.total_trials}</td>
          <td class="num">${s.hits}/${s.targets}</td>
          <td class="num">${s.misses}</td>
          <td class="num">${s.false_alarms}</td>
          <td class="num">${s.total_trials ? pct(s.accuracy) : "-"}</td>
          <td class="num">${s.targets ? pct(s.hit_rate) : "-"}</td>
          <td class="num">${s.total_trials - s.targets ? pct(s.false_alarm_rate) : "-"}</td>
          <td class="num">${s.dprime ?? "N/A"}</td>
          <td class="num">${s.mean_rt_ms !== null ? `${s.mean_rt_ms} ms` : "N/A"}</td>
        </tr>`
        )
        .join("")}</tbody>
    </table></div>
  </div>`;

  html += buildMarkerTimelineHtml();

  document.getElementById("summary-content").innerHTML = html;
  resultChartBlocks = blocks;
  renderResultChart();
}

// Grafik digambar ulang sesuai lebar kartu, supaya ukuran teks sumbu tetap
// (SVG yang sekadar diperbesar membuat teks raksasa di layar lebar).
let resultChartBlocks = null;
let resultChartWidth = 0;

function renderResultChart() {
  const wrap = document.getElementById("result-chart");
  if (!wrap || !resultChartBlocks) return;
  const width = Math.round(wrap.clientWidth);
  if (!width) {
    requestAnimationFrame(renderResultChart); // layar belum tampil
    return;
  }
  resultChartWidth = width;
  wrap.querySelector(".chart-svg").innerHTML = buildRateChartSvg(resultChartBlocks, width);
  attachChartHover(resultChartBlocks);
}

window.addEventListener("resize", () => {
  const wrap = document.getElementById("result-chart");
  if (wrap && wrap.clientWidth && Math.round(wrap.clientWidth) !== resultChartWidth) renderResultChart();
});

/** Grafik batang berkelompok (SVG murni). Skala 0–100%, satu sumbu. */
function buildRateChartSvg(blocks, width) {
  if (!blocks.length) return '<p class="muted">Belum ada blok.</p>';
  const W = Math.max(280, width), H = 260;
  const pad = { l: 44, r: 12, t: 12, b: 40 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const groupW = plotW / blocks.length;
  const barW = Math.min(44, (groupW - 24) / 2);
  const gap = 2;
  const y = (v) => pad.t + plotH - v * plotH;

  const barPath = (x, v) => {
    const h = v * plotH;
    if (h <= 0) return "";
    const r = Math.min(4, h, barW / 2);
    const top = y(v), base = pad.t + plotH;
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${base}Z`;
  };

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Hit rate dan false alarm rate per blok">`;
  [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
    svg += `<line class="ch-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/>`;
    svg += `<text class="ch-tick" x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${t * 100}%</text>`;
  });
  blocks.forEach(({ idx, n, s }, i) => {
    const cx = pad.l + groupW * i + groupW / 2;
    const x1 = cx - barW - gap / 2;
    const x2 = cx + gap / 2;
    svg += `<path class="ch-hit" d="${barPath(x1, s.targets ? s.hit_rate : 0)}"/>`;
    svg += `<path class="ch-fa" d="${barPath(x2, s.total_trials - s.targets ? s.false_alarm_rate : 0)}"/>`;
    svg += `<text class="ch-label" x="${cx}" y="${H - pad.b + 18}" text-anchor="middle">Blok ${idx + 1}</text>`;
    svg += `<text class="ch-sublabel" x="${cx}" y="${H - pad.b + 33}" text-anchor="middle">${n}-back</text>`;
    // area sentuh lebih besar daripada batangnya
    svg += `<rect class="ch-hit-area" data-i="${i}" x="${pad.l + groupW * i}" y="${pad.t}" width="${groupW}" height="${plotH}"/>`;
  });
  svg += `<line class="ch-base" x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + plotH}" y2="${pad.t + plotH}"/>`;
  svg += "</svg>";
  return svg;
}

function attachChartHover(blocks) {
  const wrap = document.getElementById("result-chart");
  if (!wrap) return;
  const tip = wrap.querySelector(".chart-tip");
  wrap.querySelectorAll(".ch-hit-area").forEach((area) => {
    area.addEventListener("mouseenter", () => {
      const { idx, n, s } = blocks[+area.dataset.i];
      const nonTargets = s.total_trials - s.targets;
      tip.innerHTML = `<strong>Blok ${idx + 1} · ${n}-back</strong>
        <div><i class="sw sw-hit"></i>Hit rate <b>${s.targets ? pct(s.hit_rate) : "-"}</b> <span class="muted">(${s.hits}/${s.targets})</span></div>
        <div><i class="sw sw-fa"></i>FA rate <b>${nonTargets ? pct(s.false_alarm_rate) : "-"}</b> <span class="muted">(${s.false_alarms}/${nonTargets})</span></div>`;
      tip.hidden = false;
      area.classList.add("is-hover");
      const wr = wrap.getBoundingClientRect();
      const ar = area.getBoundingClientRect();
      const left = Math.min(Math.max(ar.left - wr.left + ar.width / 2 - tip.offsetWidth / 2, 0), wr.width - tip.offsetWidth);
      tip.style.left = `${left}px`;
      tip.style.top = `0px`;
    });
    area.addEventListener("mouseleave", () => {
      tip.hidden = true;
      area.classList.remove("is-hover");
    });
  });
}

/** Tabel penanda waktu: blok, istirahat, dan KSS, diurutkan menurut waktu. */
function buildMarkerTimelineHtml() {
  const rows = [];
  const markers = currentLogger.blockMarkers;
  blockOrder.forEach((n, idx) => {
    const start = markers.find((m) => m.block_index === idx && m.event === "start");
    const end = markers.find((m) => m.block_index === idx && m.event === "end");
    if (!start) return;
    rows.push({ ts: start.timestamp, kind: "block", what: `Blok ${idx + 1} · ${n}-back`, end: end?.timestamp });
  });
  currentLogger.restPeriods.forEach((r) => {
    rows.push({ ts: r.start, kind: "rest", what: `Istirahat sebelum blok ${r.before_block_index + 1}`, end: r.end });
  });
  currentLogger.fatigueRatings.forEach((f) => {
    rows.push({
      ts: f.timestamp,
      kind: "kss",
      what: `KSS ${f.timing === "pre" ? "sebelum" : "sesudah"} blok ${f.block_index + 1}: ${f.kss_value}`,
    });
  });
  if (!rows.length) return "";
  rows.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

  const label = { block: "Blok", rest: "Istirahat", kss: "KSS" };
  return `<div class="card dash-card">
    <div class="dash-card-head"><h2>Penanda waktu</h2><span class="muted">format sama dengan TimeStamp Mind Monitor</span></div>
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Jenis</th><th>Kejadian</th><th>Mulai</th><th>Selesai</th><th class="num">Durasi</th></tr></thead>
      <tbody>${rows
        .map((r) => {
          const dur = r.end ? secondsBetween(r.ts, r.end) : null;
          return `<tr>
            <td><span class="tag tag-${r.kind}">${label[r.kind]}</span></td>
            <td>${escapeHtml(r.what)}</td>
            <td class="mono">${escapeHtml(timeOnly(r.ts))}</td>
            <td class="mono">${r.kind === "kss" ? "" : escapeHtml(timeOnly(r.end))}</td>
            <td class="num">${dur !== null ? `${dur.toFixed(1)} dtk` : ""}</td>
          </tr>`;
        })
        .join("")}</tbody>
    </table></div>
  </div>`;
}
