// ================================================================
// main.js — Orchestrator: data partisipan, navigasi layar, alur eksperimen
// ================================================================
// Alur: Setup → Sumber Data (form + CSV) → Instruksi + Tips → Countdown 3-2-1 →
//       Latihan penuh (opsional) → Blok → Ringkasan Blok → Cek Respons → (ulang) →
//       Sesi Selesai (unduh CSV/JSON/laporan + simpan ke folder dokumentasi)

let currentConfig = null;
let currentLogger = null;
let blockOrder = [];
let currentBlockIdx = 0;
let currentKssRating = null;
let kssPhase = "pre";
let currentTargetStim = null;
let experimentStarted = false;
let sessionFinished = false;

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

  sessionVisitNumber = parseInt(document.getElementById("visit-number").value, 10) || 1;

  buildDocumentationList();
  applyDocumentationFilename();
  showInstructionsForCurrentBlock();
}

// ------------ Instructions ------------

function showInstructionsForCurrentBlock() {
  const n = blockOrder[currentBlockIdx];

  // 0-back: stimulus target tetap, dipilih per blok dan dicatat di logger
  if (n === 0) {
    if (currentConfig.stimulus_type === "grid3x3") {
      currentTargetStim = "r2c2";
    } else {
      currentTargetStim = randomTargetStimulus(currentConfig.stimulus_pool);
    }
    currentLogger.setTargetStimulus(currentBlockIdx, currentTargetStim);
  } else {
    currentTargetStim = null;
  }

  buildInstructions(n, currentTargetStim);
  document.getElementById("block-current").textContent = currentBlockIdx + 1;
  document.getElementById("block-total").textContent = blockOrder.length;

  showScreen("screen-instructions");
}

function handleContinueFromInstructions() {
  startCountdownAndBlock();
}

// ------------ Practice (jumlah trial sama dengan blok sebenarnya) ------------

function showPracticeIntroScreen() {
  const n = blockOrder[currentBlockIdx];
  const totalTrials = calculateTrialCount(currentConfig.block_duration_minutes, currentConfig.isi_ms);
  const minutes = Math.round(((totalTrials * currentConfig.isi_ms) / 60000) * 10) / 10;

  document.getElementById("practice-intro-n").textContent = n;
  document.getElementById("practice-intro-trials").textContent = totalTrials;
  document.getElementById("practice-note").innerHTML =
    "Latihan ini memakai jumlah trial yang sama dengan blok sebenarnya " +
    `(<strong>${totalTrials} trial</strong>, sekitar ${minutes} menit). ` +
    "Data latihan <strong>tidak dicatat</strong> untuk analisis, jadi partisipan leluasa mencoba.";

  showScreen("screen-practice-intro");
}

function handleSkipPractice() {
  goToFatigueOrBlock("pre");
}

async function handleStartPractice() {
  showScreen("screen-countdown");
  await runCountdown(3);

  const n = blockOrder[currentBlockIdx];
  const totalTrials = calculateTrialCount(currentConfig.block_duration_minutes, currentConfig.isi_ms);
  const sequence = generateSequence(
    n,
    totalTrials,
    currentConfig.target_ratio,
    currentConfig.stimulus_pool,
    n === 0 ? currentTargetStim : null
  );

  showScreen("screen-block");
  enterFullscreen();

  const runner = new BlockRunner(sequence, currentConfig, currentBlockIdx, n, currentLogger, true);
  await runner.start();

  exitFullscreen();
  showScreen("screen-practice-done");
}

function handleContinueFromPracticeDone() {
  goToFatigueOrBlock("pre");
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
  showScreen("screen-countdown");
  await runCountdown(3);

  if (currentConfig.enable_practice) {
    // Latihan penuh (semua trial) sebagai pemanasan sebelum blok sebenarnya
    showPracticeIntroScreen();
  } else {
    await runCurrentBlock();
  }
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
  showBlockSummary();
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
    showInstructionsForCurrentBlock();
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
