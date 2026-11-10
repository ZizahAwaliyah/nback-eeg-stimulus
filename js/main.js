// ================================================================
// main.js — Orchestrator: data partisipan, navigasi layar, alur eksperimen
// ================================================================
// Alur per blok:
//   [Istirahat terhitung mundur + Instruksi] → (Latihan, kalau per_block) → (KSS pre) →
//   Hitung mundur 3-2-1 (+ Marker, + huruf sasaran 0-back) → Blok →
//   (Ringkasan blok, kalau skor tidak disembunyikan) → Cek respons → (KSS post) → blok berikutnya
// Kalau practice_placement = "before_session", semua latihan dikerjakan dulu
// (instruksi → latihan untuk tiap tingkat), baru kemudian blok 1.
// Akhir: Sesi Selesai (unduh CSV/JSON/laporan + simpan ke folder dokumentasi)

let currentConfig = null;
let currentLogger = null;
let blockOrder = [];
let currentBlockIdx = 0;
let currentKssRating = null;
let kssPhase = "pre";
let currentTargetStim = null;
let experimentStarted = false;
let sessionFinished = false;

// Huruf sasaran 0-back per blok, dipilih sekali di awal sesi supaya latihan dan
// blok sebenarnya memakai huruf yang sama.
let targetStimByBlock = [];
// Latihan di awal sesi: indeks blok yang sedang dilatih (null = tidak sedang latihan awal)
let practiceQueueIdx = null;
// Ke mana tombol "Lanjut" di layar Latihan Selesai mengarah
let practiceDoneNext = "block";
// Timer istirahat antarblok
let restInterval = null;

// Penanda sesi kunjungan (P1, P2, ...) untuk penamaan folder dokumentasi
let sessionVisitNumber = 1;

// ------------ Screen Navigation ------------

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const target = document.getElementById(screenId);
  if (target) target.classList.add("active");
  window.scrollTo(0, 0);
  updateDocumentationSummary();
}

// ------------ Fullscreen Helper ------------

function enterFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}

function exitFullscreen() {
  if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
}

// ------------ Prevent accidental refresh/close ------------

window.addEventListener("beforeunload", (e) => {
  if (experimentStarted) {
    e.preventDefault();
    e.returnValue = "Eksperimen sedang berjalan. Yakin ingin keluar? Data belum di-download.";
    return e.returnValue;
  }
});

// ------------ Initialization ------------

document.addEventListener("DOMContentLoaded", () => {
  populatePresetDropdown();

  document.getElementById("preset-select").addEventListener("change", async (e) => {
    const presetFile = e.target.value;
    if (presetFile === "custom") return;
    const config = await loadPreset(presetFile);
    applyConfigToForm(config);
  });

  document.getElementById("stimulus-type").addEventListener("change", refreshStimulusTypeUI);
  document.getElementById("n-levels").addEventListener("input", refreshStimulusTypeUI);

  document.getElementById("btn-start").addEventListener("click", handleStartExperiment);
  document.getElementById("btn-continue-to-practice-or-fatigue").addEventListener("click", handleContinueFromInstructions);
  document.getElementById("btn-skip-practice").addEventListener("click", handleSkipPractice);
  document.getElementById("btn-start-practice").addEventListener("click", handleStartPractice);
  document.getElementById("btn-continue-to-real-block").addEventListener("click", handleContinueFromPracticeDone);
  document.getElementById("btn-fatigue-continue").addEventListener("click", handleFatigueContinue);
  document.getElementById("btn-continue-after-response-check").addEventListener("click", handleContinueAfterResponseCheck);
  document.getElementById("btn-continue-from-block-summary").addEventListener("click", handleContinueFromBlockSummary);
  document.getElementById("btn-download-csv").addEventListener("click", () => currentLogger?.downloadCSV());
  document.getElementById("btn-download-json").addEventListener("click", () => currentLogger?.downloadJSON());
  document.getElementById("btn-download-report").addEventListener("click", () => currentLogger?.downloadReport());
  document.getElementById("btn-finish-session").addEventListener("click", finishSession);
  document.getElementById("btn-back-to-result").addEventListener("click", () => showScreen("screen-finished"));
  document.getElementById("btn-fill-documentation").addEventListener("click", buildDocumentationList);
  document.getElementById("btn-new-session").addEventListener("click", () => {
    experimentStarted = false;
    location.reload();
  });

  setupKssListeners();
  refreshStimulusTypeUI();
  buildDocumentationList();

  // Bersihkan error highlight saat input diketik
  ["participant-name", "researcher-name", "n-levels"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      document.getElementById(id)?.classList.remove("input-error");
      const errBox = document.getElementById("start-validation-error");
      if (errBox) errBox.style.display = "none";
    });
  });

  // Otomatis pilih dan muat preset Mutiah jika tersedia
  const presetSelect = document.getElementById("preset-select");
  if (presetSelect && AVAILABLE_PRESETS.length > 0) {
    presetSelect.value = AVAILABLE_PRESETS[0].file;
    loadPreset(AVAILABLE_PRESETS[0].file).then((config) => {
      applyConfigToForm(config);
    });
  }
});

// ------------ Setup: Start Experiment ------------

async function handleStartExperiment() {
  const config = readConfigFromForm();
  const errors = validateConfig(config);
  const errBox = document.getElementById("start-validation-error");

  document.getElementById("participant-name")?.classList.remove("input-error");
  document.getElementById("researcher-name")?.classList.remove("input-error");
  document.getElementById("n-levels")?.classList.remove("input-error");

  if (errors.length) {
    if (errBox) {
      errBox.style.display = "block";
      errBox.innerHTML = `<strong>⚠️ Mohon lengkapi formulir sebelum mulai:</strong><ul style="margin: 6px 0 0 18px; padding: 0;">${errors.map((e) => `<li>${e}</li>`).join("")}</ul>`;
      errBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (!config.participant_name) {
      const p = document.getElementById("participant-name");
      if (p) {
        p.classList.add("input-error");
        p.focus();
      }
    } else if (!config.researcher) {
      const r = document.getElementById("researcher-name");
      if (r) {
        r.classList.add("input-error");
        r.focus();
      }
    }
    return;
  }

  if (errBox) errBox.style.display = "none";

  const warnings = getConfigWarnings(config);
  if (warnings.length) {
    const ok = confirm(
      "Perhatian (bukan kesalahan, tapi perlu dicek):\n\n" +
        warnings.map((w) => "- " + w).join("\n") +
        "\n\nLanjutkan tetap?"
    );
    if (!ok) return;
  }

  // Jika jenis stimulus adalah Kotak 3x3 (grid3x3), alihkan ke halaman 3x3
  if (config.stimulus_type === "grid3x3") {
    localStorage.setItem("nback_eeg_config", JSON.stringify(config));
    window.location.href = "nback-3x3.html";
    return;
  }

  currentConfig = config;
  currentLogger = new ExperimentLogger(config);
  blockOrder = planBlockOrder(config.n_levels, config.condition);
  currentBlockIdx = 0;
  currentConfig.stimulus_pool = STIMULUS_POOLS[config.stimulus_type];
  currentConfig.tz_offset_minutes = new Date().getTimezoneOffset();
  experimentStarted = true;

  // Satu huruf sasaran per blok 0-back, dicatat di JSON (target_stimulus_per_block)
  targetStimByBlock = blockOrder.map((n) =>
    n !== 0
      ? null
      : currentConfig.stimulus_type === "grid3x3"
        ? "r2c2" // mode kotak: kotak tengah, seperti sebelumnya
        : randomTargetStimulus(currentConfig.stimulus_pool)
  );
  targetStimByBlock.forEach((t, idx) => {
    if (t !== null) currentLogger.setTargetStimulus(idx, t);
  });

  document.body.classList.toggle("theme-dark", config.dark_theme === true);

  sessionVisitNumber = parseInt(document.getElementById("visit-number").value, 10) || 1;

  buildDocumentationList();
  applyDocumentationFilename();

  if (practiceEnabled() && currentConfig.practice_placement === "before_session") {
    practiceQueueIdx = 0;
    showPracticeInstructions(practiceQueueIdx);
  } else {
    showInstructionsForCurrentBlock();
  }
}

function practiceEnabled() {
  return currentConfig.enable_practice === true;
}

/** Jumlah trial latihan: practice_trials, atau sepanjang blok kalau 0/kosong. */
function practiceTrialCount() {
  const full = calculateTrialCount(currentConfig.block_duration_minutes, currentConfig.isi_ms);
  const n = parseInt(currentConfig.practice_trials, 10);
  return n > 0 ? Math.min(n, full) : full;
}

// ------------ Instructions ------------

function showInstructionsForCurrentBlock(withRest = false) {
  const n = blockOrder[currentBlockIdx];
  currentTargetStim = targetStimByBlock[currentBlockIdx] ?? null;

  buildInstructions(n, currentTargetStim);
  setPhaseLabel(null);
  document.querySelector("#screen-instructions .progress-info").innerHTML =
    `Blok <span id="block-current">${currentBlockIdx + 1}</span> dari ` +
    `<span id="block-total">${blockOrder.length}</span>`;

  showScreen("screen-instructions");
  if (withRest && currentConfig.rest_seconds > 0) startRest();
  else stopRest(false);
}

/** Instruksi untuk latihan awal sesi (practice_placement = before_session). */
function showPracticeInstructions(idx) {
  const n = blockOrder[idx];
  currentTargetStim = targetStimByBlock[idx] ?? null;
  buildInstructions(n, currentTargetStim);
  setPhaseLabel(`LATIHAN ${idx + 1} DARI ${blockOrder.length} · data tidak dicatat`);
  document.querySelector("#screen-instructions .progress-info").textContent =
    `Latihan ${idx + 1} dari ${blockOrder.length}`;
  stopRest(false);
  showScreen("screen-instructions");
}

function setPhaseLabel(text) {
  const el = document.getElementById("practice-phase-label");
  if (!el) return;
  el.style.display = text ? "block" : "none";
  el.textContent = text || "";
}

function handleContinueFromInstructions() {
  if (restInterval) return; // istirahat belum selesai
  if (practiceQueueIdx !== null) {
    showPracticeIntroScreen(blockOrder[practiceQueueIdx]);
  } else if (practiceEnabled() && currentConfig.practice_placement !== "before_session") {
    showPracticeIntroScreen(blockOrder[currentBlockIdx]);
  } else {
    goToFatigueOrBlock("pre");
  }
}

// ------------ Istirahat antarblok ------------
// Layar instruksi blok berikutnya ditampilkan bersama hitung mundur istirahat;
// tombol Lanjut baru aktif setelah waktu habis. Awal & akhir istirahat dicatat di JSON.

function startRest() {
  stopRest(false);
  const banner = document.getElementById("rest-banner");
  const timerEl = document.getElementById("rest-timer");
  const btn = document.getElementById("btn-continue-to-practice-or-fatigue");
  const totalMs = currentConfig.rest_seconds * 1000;
  const startPerf = performance.now();
  const restRecord = {
    before_block_index: currentBlockIdx,
    before_block_n: blockOrder[currentBlockIdx],
    planned_seconds: currentConfig.rest_seconds,
    start: localTimestamp(),
    end: null,
  };
  currentLogger.logRest(restRecord);

  banner.style.display = "block";
  banner.classList.remove("done");
  btn.disabled = true;

  const tick = () => {
    const remaining = Math.max(0, totalMs - (performance.now() - startPerf));
    const sec = Math.ceil(remaining / 1000);
    timerEl.textContent = `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
    if (remaining <= 0) {
      restRecord.end = localTimestamp();
      stopRest(true);
    }
  };
  tick();
  restInterval = setInterval(tick, 200);
}

function stopRest(finished) {
  if (restInterval) clearInterval(restInterval);
  restInterval = null;
  const banner = document.getElementById("rest-banner");
  const btn = document.getElementById("btn-continue-to-practice-or-fatigue");
  if (btn) btn.disabled = false;
  if (!banner) return;
  if (finished) {
    banner.classList.add("done");
    document.getElementById("rest-timer").textContent = "Selesai";
  } else {
    banner.style.display = "none";
  }
}

// ------------ Practice (jumlah trial sama dengan blok sebenarnya) ------------

function showPracticeIntroScreen(n) {
  const trials = practiceTrialCount();
  const seconds = Math.round((trials * currentConfig.isi_ms) / 1000);
  const duration = seconds >= 90 ? `sekitar ${Math.round((seconds / 60) * 10) / 10} menit` : `sekitar ${seconds} detik`;

  document.getElementById("practice-intro-n").textContent = n;
  document.getElementById("practice-intro-trials").textContent = trials;
  document.getElementById("practice-note").innerHTML =
    `Latihan berisi <strong>${trials} trial</strong> (${duration}). ` +
    "Data latihan <strong>tidak dicatat</strong> untuk analisis, jadi partisipan leluasa mencoba.";

  const skipBtn = document.getElementById("btn-skip-practice");
  skipBtn.textContent = practiceQueueIdx !== null ? "Lewati Semua Latihan" : "Lewati Latihan";

  showScreen("screen-practice-intro");
}

function handleSkipPractice() {
  if (practiceQueueIdx !== null) {
    // Latihan awal sesi dilewati seluruhnya → langsung ke blok 1
    practiceQueueIdx = null;
    showInstructionsForCurrentBlock();
  } else {
    goToFatigueOrBlock("pre");
  }
}

async function handleStartPractice() {
  const blockIdx = practiceQueueIdx !== null ? practiceQueueIdx : currentBlockIdx;
  const n = blockOrder[blockIdx];
  const target = targetStimByBlock[blockIdx] ?? null;

  showScreen("screen-countdown");
  await runCountdown(3, { showMarker: false, targetStim: target, label: "Latihan akan mulai dalam..." });

  const sequence = generateSequence(
    n,
    practiceTrialCount(),
    currentConfig.target_ratio,
    currentConfig.stimulus_pool,
    n === 0 ? target : null
  );

  showScreen("screen-block");
  enterFullscreen();

  const runner = new BlockRunner(sequence, currentConfig, blockIdx, n, currentLogger, true);
  await runner.start();

  exitFullscreen();

  if (practiceQueueIdx !== null) {
    practiceQueueIdx++;
    if (practiceQueueIdx < blockOrder.length) {
      showPracticeInstructions(practiceQueueIdx);
      return;
    }
    practiceQueueIdx = null;
    practiceDoneNext = "instructions";
  } else {
    practiceDoneNext = "block";
  }
  showScreen("screen-practice-done");
}

function handleContinueFromPracticeDone() {
  if (practiceDoneNext === "instructions") {
    showInstructionsForCurrentBlock();
  } else {
    goToFatigueOrBlock("pre");
  }
}

// ------------ Fatigue Scale (dipakai sebelum & sesudah blok) ------------

function goToFatigueOrBlock(phase) {
  kssPhase = phase;
  if (currentConfig.enable_fatigue_scale) {
    const n = blockOrder[currentBlockIdx];
    const titlePrefix =
      phase === "pre"
        ? `Sebelum Blok ${currentBlockIdx + 1} (${n}-back)`
        : `Setelah Blok ${currentBlockIdx + 1} (${n}-back)`;
    showFatigueScreen(titlePrefix);
  } else if (phase === "pre") {
    startCountdownAndBlock();
  } else {
    afterBlockPost();
  }
}

function showFatigueScreen(titlePrefix) {
  document.getElementById("fatigue-title").textContent = `Skala Kelelahan: ${titlePrefix}`;
  currentKssRating = null;
  document.getElementById("btn-fatigue-continue").disabled = true;
  document.querySelectorAll(".kss-option").forEach((opt) => opt.classList.remove("selected"));
  showScreen("screen-fatigue");
}

function setupKssListeners() {
  document.querySelectorAll(".kss-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      document.querySelectorAll(".kss-option").forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      currentKssRating = parseInt(opt.dataset.value, 10);
      document.getElementById("btn-fatigue-continue").disabled = false;
    });
  });
}

function handleFatigueContinue() {
  if (currentKssRating === null) return;

  currentLogger.logFatigue({
    block_index: currentBlockIdx,
    block_n: blockOrder[currentBlockIdx],
    timing: kssPhase,
    kss_value: currentKssRating,
    timestamp: localTimestamp(),
  });

  if (kssPhase === "pre") {
    startCountdownAndBlock();
  } else {
    afterBlockPost();
  }
}

// ------------ Block Execution ------------

async function startCountdownAndBlock() {
  // Dulu: latihan dipanggil dari sini, dan setelah latihan alur kembali ke sini lagi,
  // sehingga blok sebenarnya tidak pernah dimulai. Latihan sekarang diatur di
  // handleContinueFromInstructions, jadi fungsi ini hanya hitung mundur + blok.
  showScreen("screen-countdown");
  await runCountdown(3, { showMarker: true, targetStim: currentTargetStim });
  await runCurrentBlock();
}

async function runCurrentBlock() {
  showScreen("screen-block");
  enterFullscreen();

  const n = blockOrder[currentBlockIdx];
  const totalTrials = calculateTrialCount(currentConfig.block_duration_minutes, currentConfig.isi_ms);
  const sequence = generateSequence(
    n,
    totalTrials,
    currentConfig.target_ratio,
    currentConfig.stimulus_pool,
    n === 0 ? currentTargetStim : null
  );

  const runner = new BlockRunner(sequence, currentConfig, currentBlockIdx, n, currentLogger, false);
  await runner.start();

  exitFullscreen();
  if (currentConfig.hide_block_feedback) {
    // Skor tidak diperlihatkan ke partisipan; tetap cek blok tanpa respons
    handleContinueFromBlockSummary();
  } else {
    showBlockSummary();
  }
}

// ------------ Block Summary ------------

function countBlockResponses(blockIndex) {
  const trials = currentLogger.getAllTrials().filter((t) => t.block_index === blockIndex);
  const responded = trials.filter((t) => t.response).length;
  return { total: trials.length, responded: responded, none: trials.length > 0 && responded === 0 };
}

function showBlockSummary() {
  const n = blockOrder[currentBlockIdx];
  const summary = currentLogger.getBlockSummary(currentBlockIdx);
  const info = countBlockResponses(currentBlockIdx);

  document.getElementById("block-summary-title").textContent =
    `Blok ${currentBlockIdx + 1} Selesai! (${n}-back)`;

  document.getElementById("block-summary-content").innerHTML = `
    <div class="summary-grid">
      <div class="summary-row"><span>Akurasi</span><strong>${(summary.accuracy * 100).toFixed(1)}%</strong></div>
      <div class="summary-row"><span>Hit</span><strong>${summary.hits}/${summary.targets}</strong></div>
      <div class="summary-row"><span>Kelewatan (miss)</span><strong>${summary.misses}</strong></div>
      <div class="summary-row"><span>Salah tekan (false alarm)</span><strong>${summary.false_alarms}</strong></div>
      <div class="summary-row"><span>Hit rate</span><strong>${(summary.hit_rate * 100).toFixed(1)}%</strong></div>
      <div class="summary-row"><span>False alarm rate</span><strong>${(summary.false_alarm_rate * 100).toFixed(1)}%</strong></div>
      <div class="summary-row"><span>Rata-rata RT</span><strong>${summary.mean_rt_ms ?? "N/A"} ms</strong></div>
      <div class="summary-row"><span>d' (daya beda target)</span><strong>${summary.dprime ?? "N/A"}</strong></div>
    </div>
    <p class="note">${
      info.none
        ? "Blok ini <strong>tidak merekam satu pun respons</strong> — akan ada pemeriksaan sebelum lanjut."
        : `${info.responded} dari ${info.total} trial memiliki respons SPASI/klik.`
    }</p>
  `;

  showScreen("screen-block-summary");
}

function handleContinueFromBlockSummary() {
  const info = countBlockResponses(currentBlockIdx);
  if (info.none) {
    showResponseCheckScreen(info);
  } else {
    goToFatigueOrBlock("post");
  }
}

function showResponseCheckScreen(info) {
  const n = blockOrder[currentBlockIdx];
  document.getElementById("response-check-body").innerHTML = `
    <p>Blok ${currentBlockIdx + 1} (${n}-back) berisi <strong>${info.total} trial</strong>,
    tetapi <strong>tidak ada satu pun respons</strong> yang terekam.</p>
    <p>Kemungkinan penyebab:</p>
    <ul>
      <li>Partisipan memang tidak menekan SPASI sama sekali.</li>
      <li>Fokus jendela tidak berada di halaman ini saat partisipan menekan SPASI.</li>
      <li>Partisipan menekan tombol lain (bukan SPASI), atau menekan setelah kotak mati.</li>
    </ul>
    <p class="warning">Semua trial tetap tersimpan di CSV dengan kolom <code>response_ts</code> dan
    <code>reaction_time_ms</code> kosong — tercatat sebagai tidak ada jawaban, bukan error sistem.</p>
    <p>Pilih tindakan:</p>
  `;
  document.getElementById("response-check-choice").value = "ulang";
  showScreen("screen-response-check");
}

function handleContinueAfterResponseCheck() {
  const choice = document.getElementById("response-check-choice").value;

  if (choice === "ulang") {
    // Buang trial blok ini supaya tidak dobel di CSV, lalu ulangi blok yang sama
    currentLogger.trials = currentLogger.trials.filter((t) => t.block_index !== currentBlockIdx);
    currentLogger.blockMarkers = currentLogger.blockMarkers.filter(
      (m) => m.block_index !== currentBlockIdx
    );
    startCountdownAndBlock();
  } else {
    // "lanjut" maupun "berhenti" sama-sama menyimpan data blok ini apa adanya
    goToFatigueOrBlock("post");
  }
}

// ------------ After Post-fatigue: next block or finish ------------

function afterBlockPost() {
  currentBlockIdx++;
  if (currentBlockIdx < blockOrder.length) {
    showInstructionsForCurrentBlock(true);
  } else {
    showFinishedScreen();
  }
}

// ------------ Final Summary ------------

function buildSummaryHtml() {
  let html = '<div class="summary-blocks">';
  blockOrder.forEach((n, idx) => {
    const s = currentLogger.getBlockSummary(idx);
    html += `
      <div class="summary-block">
        <h3>Blok ${idx + 1}: ${n}-back</h3>
        <div class="summary-stats">
          <div class="stat"><div class="stat-label">Akurasi</div><div class="stat-value">${(s.accuracy * 100).toFixed(1)}%</div></div>
          <div class="stat"><div class="stat-label">Hit</div><div class="stat-value">${s.hits}/${s.targets}</div></div>
          <div class="stat"><div class="stat-label">Miss</div><div class="stat-value">${s.misses}</div></div>
          <div class="stat"><div class="stat-label">False alarm</div><div class="stat-value">${s.false_alarms}</div></div>
          <div class="stat"><div class="stat-label">Rata-rata RT</div><div class="stat-value">${s.mean_rt_ms ?? "N/A"} ms</div></div>
          <div class="stat"><div class="stat-label">d'</div><div class="stat-value">${s.dprime ?? "N/A"}</div></div>
        </div>
      </div>
    `;
  });
  html += "</div>";

  const trials = currentLogger.getAllTrials();
  const withResponse = trials.filter((t) => t.response).length;
  const correct = trials.filter((t) => t.correct === true || t.correct === "true").length;
  const rts = trials.map((t) => parseFloat(t.reaction_time_ms)).filter((v) => !isNaN(v));
  const meanRt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null;

  html += `
    <table class="summary-table">
      <tr><td>Total trial</td><td><strong>${trials.length}</strong></td></tr>
      <tr><td>Trial dengan respons</td><td><strong>${withResponse}</strong> (${
        trials.length ? ((withResponse / trials.length) * 100).toFixed(1) : 0
      }%)</td></tr>
      <tr><td>Akurasi keseluruhan</td><td><strong>${
        trials.length ? ((correct / trials.length) * 100).toFixed(1) : 0
      }%</strong></td></tr>
      <tr><td>Rata-rata RT keseluruhan</td><td><strong>${meanRt ?? "N/A"} ms</strong></td></tr>
    </table>
  `;
  return html;
}

function showFinishedScreen() {
  experimentStarted = false;
  sessionFinished = true;
  document.getElementById("summary-content").innerHTML = buildSummaryHtml();
  document.getElementById("btn-download-csv").classList.add("btn-pulse");
  showScreen("screen-finished");
}

// ================================================================
// DOKUMENTASI: daftar berkas yang harus dikumpulkan setelah sesi
// ================================================================

let documentationList = [];

function buildDocumentationList() {
  documentationList = [
    {
      jenis: "Data respons N-back (CSV)",
      dari: "Halaman ini",
      catatan: "Tombol Download CSV di layar Sesi Selesai",
    },
    {
      jenis: "Data lengkap sesi (JSON)",
      dari: "Halaman ini",
      catatan: "Backup: trial, penanda blok, skala kelelahan, konfigurasi",
    },
    {
      jenis: "Catatan/laporan sesi (TXT)",
      dari: "Halaman ini",
      catatan: "Tombol Download Laporan di layar Sesi Selesai",
    },
    {
      jenis: "Rekaman EEG resting state (CSV)",
      dari: "Mind Monitor (HP)",
      catatan: "Ekspor CSV dari Mind Monitor",
    },
    {
      jenis: "Rekaman EEG tugas N-back (CSV)",
      dari: "Mind Monitor (HP)",
      catatan: "Satu berkas per sesi; blok 1/2/3 dipadankan dengan CSV halaman ini",
    },
  ];

  updateDocumentationSummary();
  applyDocumentationFilename();
}

/** Nama folder dokumentasi otomatis: nama_tanggal_jam_P{kunjungan}. */
function buildDocumentationFilename() {
  const now = new Date();
  const tgl = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${now.getFullYear()}`;
  const jam = `${pad(now.getHours())}.${pad(now.getMinutes())}`;
  const nama = sanitizeFilenamePart(
    document.getElementById("participant-name")?.value || "partisipan"
  );
  const visit = parseInt(document.getElementById("visit-number")?.value, 10) || 1;
  return `${nama}_${tgl}_${jam}_P${visit}`;
}

function applyDocumentationFilename() {
  const el = document.getElementById("doc-folder-name");
  if (el) el.textContent = buildDocumentationFilename();
}

function updateDocumentationSummary() {
  const list = document.getElementById("doc-list");
  if (!list) return;
  if (!documentationList.length) {
    list.innerHTML = '<li class="note">Daftar dokumentasi belum diisi.</li>';
    return;
  }
  list.innerHTML = documentationList
    .map(
      (d) =>
        `<li><strong>${d.jenis}</strong><br><span class="note">Dari: ${
          d.dari.startsWith("http")
            ? `<a href="${d.dari}" target="_blank" rel="noopener">${d.dari}</a>`
            : d.dari
        } — ${d.catatan}</span></li>`
    )
    .join("");
}

// ================================================================
// SELESAI: simpan berkas sesi ke folder dokumentasi (pemilih folder)
// ================================================================

async function finishSession() {
  const folderName = buildDocumentationFilename();
  const status = document.getElementById("doc-save-status");
  const setStatus = (text) => {
    if (status) status.textContent = text;
  };

  if (!currentLogger || !currentLogger.getAllTrials().length) {
    setStatus("Belum ada data trial. Jalankan blok dulu sebelum menyimpan dokumentasi.");
    showScreen("screen-documentation");
    return;
  }

  if (!window.showDirectoryPicker) {
    setStatus(
      "Browser ini belum mendukung pemilihan folder otomatis. Gunakan tombol Download CSV / JSON / " +
        `Laporan di layar Sesi Selesai, lalu letakkan berkasnya di dalam folder bernama ${folderName}.`
    );
    showScreen("screen-documentation");
    return;
  }

  try {
    const rootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    const folder = await rootHandle.getDirectoryHandle(folderName, { create: true });

    await writeFileToFolder(folder, `${folderName}_nback.csv`, currentLogger.toCSV());
    await writeFileToFolder(folder, `${folderName}_nback.json`, currentLogger.toJSON());
    await writeFileToFolder(folder, `${folderName}_laporan.txt`, currentLogger.buildReportText());

    const checklist = [
      `Folder dokumentasi : ${folderName}`,
      `Dibuat pada        : ${localTimestamp()}`,
      `Nama partisipan    : ${currentConfig?.participant_name || "-"}`,
      `Peneliti           : ${currentConfig?.researcher || "-"}`,
      `Sesi / kondisi     : ${currentConfig?.session || "-"} / ${currentConfig?.condition || "-"}`,
      `Jenis stimulus     : ${STIMULUS_TYPE_LABELS[currentConfig?.stimulus_type] || "-"}`,
      `Kunjungan ke-      : P${sessionVisitNumber}`,
      "",
      "Berkas yang SUDAH tersimpan otomatis di folder ini:",
      `  - ${folderName}_nback.csv`,
      `  - ${folderName}_nback.json`,
      `  - ${folderName}_laporan.txt`,
      "",
      "Berkas yang masih harus ditambahkan peneliti:",
      ...documentationList.map(
        (d) => `  - ${d.jenis} (dari: ${d.dari})` + (d.dari.startsWith("http") ? ` -> ${d.dari}` : "")
      ),
      "",
      "Setelah semua berkas lengkap, kompres folder ini (zip) untuk diarsipkan.",
    ].join("\n");

    await writeFileToFolder(folder, "CHECKLIST_DOKUMENTASI.txt", checklist);
    setStatus(`Berkas sesi sudah tersimpan di folder "${folderName}".`);
  } catch (err) {
    if (err && err.name === "AbortError") {
      setStatus(
        "Penyimpanan dibatalkan. Data masih aman di halaman ini — unduh manual lewat tombol Download."
      );
      showScreen("screen-documentation");
      return;
    }
    setStatus(`Gagal menyimpan otomatis: ${err.message}. Unduh manual lewat tombol Download.`);
  }
  showScreen("screen-documentation");
}

async function writeFileToFolder(dirHandle, filename, content) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}
