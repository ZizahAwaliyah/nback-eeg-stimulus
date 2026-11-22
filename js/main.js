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
  // Video (mis. video istirahat) di layar yang ditinggalkan dihentikan, supaya tidak
  // tetap berjalan di belakang layar blok.
  document.querySelectorAll(".screen video").forEach((v) => {
    if (!v.closest(`#${screenId}`)) v.pause();
  });
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
    updateSetupSummary();
  });

  // Panel "Ringkasan Sesi" di layar setup ikut berubah setiap kali form diisi
  const setupScreen = document.getElementById("screen-setup");
  setupScreen.addEventListener("input", updateSetupSummary);
  setupScreen.addEventListener("change", updateSetupSummary);

  // Folder penyimpanan otomatis (diingat dari sesi sebelumnya kalau ada)
  document.getElementById("btn-pick-data-root").addEventListener("click", pickDataRoot);
  restoreDataRoot().then(updateSetupSummary);

  document.getElementById("stimulus-type").addEventListener("change", refreshStimulusTypeUI);
  document.getElementById("n-levels").addEventListener("input", refreshStimulusTypeUI);

  document.getElementById("btn-start").addEventListener("click", handleStartExperiment);
  document.getElementById("btn-continue-to-practice-or-fatigue").addEventListener("click", handleContinueFromInstructions);
  document.getElementById("btn-skip-practice").addEventListener("click", handleSkipPractice);
  document.getElementById("btn-start-practice").addEventListener("click", handleStartPractice);
  document.getElementById("btn-continue-to-real-block").addEventListener("click", handleContinueFromPracticeDone);
  document.getElementById("btn-practice-retry").addEventListener("click", handleStartPractice);
  document.getElementById("btn-practice-result-continue").addEventListener("click", advanceAfterPractice);
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

  // Otomatis pilih dan muat preset default (DEFAULT_PRESET_ID di config.js),
  // atau preset pertama di daftar kalau id itu tidak ada
  const presetSelect = document.getElementById("preset-select");
  if (presetSelect && AVAILABLE_PRESETS.length > 0) {
    const defaultPreset =
      AVAILABLE_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID) || AVAILABLE_PRESETS[0];
    presetSelect.value = defaultPreset.file;
    loadPreset(defaultPreset.file).then((config) => {
      applyConfigToForm(config);
      updateSetupSummary();
    });
  }
  updateSetupSummary();
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

  // Izin menulis ke folder harus diminta LANGSUNG dari klik ini (sebelum await lain),
  // kalau tidak browser menolak menampilkan dialog izin.
  const autosave = config.autosave_per_block && config.stimulus_type !== "grid3x3";
  if (autosave) {
    const granted = dataRootHandle ? await ensureDataRootPermission() : false;
    if (!granted) {
      if (errBox) {
        errBox.style.display = "block";
        errBox.innerHTML = folderPickerSupported()
          ? "<strong>Simpan otomatis aktif:</strong> pilih lokasi folder Data dan izinkan browser menulis ke sana, lalu klik Mulai lagi."
          : "<strong>Simpan otomatis aktif</strong>, tetapi browser ini tidak mendukungnya. Pakai Chrome/Edge, atau matikan opsi simpan otomatis.";
      }
      return;
    }
  }

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

  sessionFileBase = buildSessionFileBase(config);
  if (autosave) {
    try {
      await prepareParticipantFolder(config);
    } catch (err) {
      if (errBox) {
        errBox.style.display = "block";
        errBox.innerHTML = `<strong>Folder Data tidak bisa dibuat:</strong> ${err.message}`;
      }
      return;
    }
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

  // Latihan per blok (tepat sebelum blok): video 0-back juga tampil sebelum latihan 0-back
  const before0backPractice =
    n === 0 && !withRest && practiceEnabled() && currentConfig.practice_placement !== "before_session";
  if (currentConfig.motion_videos && before0backPractice) playMotionVideo("instruction-video", 0);
  else stopMotionVideo("instruction-video");

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
  // Video instruksi 0-back sebelum latihan 0-back
  if (currentConfig.motion_videos && n === 0) playMotionVideo("instruction-video", 0);
  else stopMotionVideo("instruction-video");
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
  if (currentConfig.motion_videos) playMotionVideo("rest-video", blockOrder[currentBlockIdx]);
  else stopMotionVideo("rest-video");

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
    // Video tetap berulang sampai peneliti menekan Lanjut
    banner.classList.add("done");
    document.getElementById("rest-timer").textContent = "Selesai";
  } else {
    banner.style.display = "none";
    stopMotionVideo("rest-video");
  }
}

/** Putar motion/instruksi-<n>back-sound.mp4 di elemen <video> tertentu: bersuara, berulang, tidak layar penuh. */
function playMotionVideo(videoId, n) {
  const video = document.getElementById(videoId);
  if (!video) return;
  const file = `motion/instruksi-${n}back-sound.mp4`;
  video.onerror = () => {
    console.warn(`Video instruksi tidak ditemukan: ${file}`);
    video.style.display = "none";
  };
  video.muted = false;
  video.src = file;
  video.style.display = "block";
  video.currentTime = 0;
  video.play().catch((err) => {
    // Browser menolak memutar otomatis dengan suara → tetap putar tanpa suara
    console.warn("Video bersuara ditolak browser, diputar tanpa suara:", err);
    video.muted = true;
    video.play().catch((e) => console.warn("Video instruksi tidak bisa diputar:", e));
  });
}

function stopMotionVideo(videoId) {
  const video = document.getElementById(videoId);
  if (!video) return;
  video.onerror = null;
  video.pause();
  video.style.display = "none";
  video.removeAttribute("src");
  video.load(); // lepaskan berkas video dari memori
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

  if (currentConfig.show_practice_feedback) {
    // Skor dari runner.results (memori), bukan dari logger: latihan tetap tidak tercatat.
    showPracticeResult(n, runner.results, blockIdx);
    return;
  }
  advanceAfterPractice();
}

/** Layar skor latihan. "Ulangi" menjalankan latihan tingkat yang sama sekali lagi. */
function showPracticeResult(n, results, blockIdx) {
  const s = summarizeTrials(results);
  document.getElementById("practice-result-n").textContent = n;
  document.getElementById("ps-hit").textContent = `${s.hits}/${s.targets}`;
  document.getElementById("ps-miss").textContent = s.misses;
  document.getElementById("ps-fa").textContent = s.false_alarms;

  const perfect = s.misses === 0 && s.false_alarms === 0;
  document.getElementById("practice-result-note").innerHTML = perfect
    ? "Semua jawaban tepat. Anda sudah memahami tugas ini."
    : n === 0
      ? `Ingat: tekan <strong>SPASI</strong> hanya saat huruf sasaran <strong>${escapeHtml(targetStimByBlock[blockIdx] ?? "")}</strong> muncul. Kalau belum yakin, latihan bisa diulang.`
      : `Ingat: tekan <strong>SPASI</strong> hanya jika huruf sama dengan huruf <strong>${n} langkah sebelumnya</strong>. Kalau belum yakin, latihan bisa diulang.`;

  showScreen("screen-practice-result");
}

/** Sesudah latihan (dan sesudah layar skor, kalau ada): ke latihan/blok berikutnya. */
function advanceAfterPractice() {
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
  // Data blok ini langsung ditulis ke folder, tidak menunggu akhir sesi
  await autosaveBlock(currentBlockIdx);

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
// Isi layar hasil (kartu angka, grafik, tabel, penanda waktu) ada di dashboard.js.

function showFinishedScreen() {
  experimentStarted = false;
  sessionFinished = true;
  buildResultDashboard();
  renderExportPanel();
  document.getElementById("btn-finish-session").classList.add("btn-pulse");
  showScreen("screen-finished");
  // Berkas gabungan langsung disimpan otomatis; status tampil di panel ekspor
  autosaveSessionFiles().then(renderExportPanel);
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

  if (!participantDirHandle && !window.showDirectoryPicker) {
    setStatus(
      "Browser ini belum mendukung pemilihan folder otomatis. Gunakan tombol Download CSV / JSON / " +
        `Laporan di layar Sesi Selesai, lalu letakkan berkasnya di dalam folder bernama ${folderName}.`
    );
    showScreen("screen-documentation");
    return;
  }

  try {
    // Simpan otomatis aktif → tulis ke folder responden yang sama (Data/<nama>_<tanggal>/)
    // tanpa memilih folder lagi. Kalau tidak, perilaku lama: pilih folder, buat folder baru.
    let folder, folderLabel, names;
    if (participantDirHandle) {
      folder = participantDirHandle;
      folderLabel = participantFolderLabel;
      names = participantSessionFileNames();
    } else {
      const rootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      folder = await rootHandle.getDirectoryHandle(folderName, { create: true });
      folderLabel = folderName;
      names = {
        csv: `${folderName}_nback.csv`,
        json: `${folderName}_nback.json`,
        txt: `${folderName}_laporan.txt`,
      };
    }

    await writeSessionFiles(folder, folderLabel, names);
    setStatus(`Berkas sesi sudah tersimpan di folder "${folderLabel}".`);
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

/** Nama berkas gabungan di folder responden Data/<nama>_<tanggal>/. */
function participantSessionFileNames() {
  return {
    csv: `${sessionFileBase}_semua-blok.csv`,
    json: `${sessionFileBase}.json`,
    txt: `${sessionFileBase}_laporan.txt`,
  };
}

/** Tulis CSV gabungan, JSON, laporan, dan checklist ke satu folder. */
async function writeSessionFiles(folder, folderLabel, names) {
  await writeFileToFolder(folder, names.csv, currentLogger.toCSV());
  await writeFileToFolder(folder, names.json, currentLogger.toJSON());
  await writeFileToFolder(folder, names.txt, currentLogger.buildReportText());

  const blockFiles = autosaveLog.filter((e) => e.ok && e.kind === "block").map((e) => `  - ${e.file}`);
  const checklist = [
    `Folder dokumentasi : ${folderLabel}`,
    `Dibuat pada        : ${localTimestamp()}`,
    `Nama partisipan    : ${currentConfig?.participant_name || "-"}`,
    `Peneliti           : ${currentConfig?.researcher || "-"}`,
    `Sesi / kondisi     : ${currentConfig?.session || "-"} / ${currentConfig?.condition || "-"}`,
    `Jenis stimulus     : ${STIMULUS_TYPE_LABELS[currentConfig?.stimulus_type] || "-"}`,
    `Kunjungan ke-      : P${sessionVisitNumber}`,
    "",
    "Berkas yang SUDAH tersimpan otomatis di folder ini:",
    ...blockFiles,
    `  - ${names.csv}`,
    `  - ${names.json}`,
    `  - ${names.txt}`,
    "",
    "Berkas yang masih harus ditambahkan peneliti:",
    ...documentationList.map(
      (d) => `  - ${d.jenis} (dari: ${d.dari})` + (d.dari.startsWith("http") ? ` -> ${d.dari}` : "")
    ),
    "",
    "Setelah semua berkas lengkap, kompres folder ini (zip) untuk diarsipkan.",
  ].join("\n");

  await writeFileToFolder(folder, "CHECKLIST_DOKUMENTASI.txt", checklist);
}

/**
 * Simpan otomatis di akhir sesi (autosave_per_block aktif): CSV gabungan, JSON,
 * laporan, dan checklist langsung ke folder responden, tanpa menekan tombol.
 */
async function autosaveSessionFiles() {
  if (!currentConfig?.autosave_per_block || !participantDirHandle) return;
  if (!currentLogger.getAllTrials().length) return;
  const names = participantSessionFileNames();
  const entry = {
    kind: "session",
    label: "Berkas gabungan (CSV semua blok, JSON, laporan)",
    file: `${names.csv}, ${names.json}, ${names.txt}`,
    ok: false,
    error: null,
  };
  try {
    await writeSessionFiles(participantDirHandle, participantFolderLabel, names);
    entry.ok = true;
  } catch (err) {
    entry.error = err.message;
    console.error("Simpan otomatis akhir sesi gagal:", err);
  }
  autosaveLog.push(entry);
}
// writeFileToFolder() ada di storage.js
