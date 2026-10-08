// ================================================================
// main.js — Orchestrator: navigasi layar & alur eksperimen
// ================================================================
// Alur baru:
//  Setup → Instruksi + Tips → Latihan (opsional) → Skala Pre →
//  Countdown → Blok → Ringkasan Blok → Skala Post → (ulang) → Hasil Akhir

let currentConfig = null;
let currentLogger = null;
let blockOrder = [];
let currentBlockIdx = 0;
let currentKssRating = null;
let kssPhase = "pre";
let currentTargetLetter = null;
let experimentStarted = false;

// ------------ Screen Navigation ------------

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(screenId).classList.add("active");
  window.scrollTo(0, 0);
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

  document.getElementById("btn-start").addEventListener("click", handleStartExperiment);
  document.getElementById("btn-continue-to-practice-or-fatigue").addEventListener("click", handleContinueFromInstructions);
  document.getElementById("btn-skip-practice").addEventListener("click", handleSkipPractice);
  document.getElementById("btn-start-practice").addEventListener("click", handleStartPractice);
  document.getElementById("btn-continue-to-real-block").addEventListener("click", handleContinueFromPracticeDone);
  document.getElementById("btn-fatigue-continue").addEventListener("click", handleFatigueContinue);
  document.getElementById("btn-continue-from-block-summary").addEventListener("click", handleContinueFromBlockSummary);
  document.getElementById("btn-download-csv").addEventListener("click", () => currentLogger?.downloadCSV());
  document.getElementById("btn-download-json").addEventListener("click", () => currentLogger?.downloadJSON());
  document.getElementById("btn-new-session").addEventListener("click", () => {
    experimentStarted = false;
    location.reload();
  });

  setupKssListeners();
});

// ------------ Setup: Start Experiment ------------

async function handleStartExperiment() {
  const config = readConfigFromForm();
  const errors = validateConfig(config);

  if (errors.length) {
    alert("Kesalahan validasi:\n\n" + errors.join("\n"));
    return;
  }

  currentConfig = config;
  currentLogger = new ExperimentLogger(config);
  blockOrder = planBlockOrder(config.n_levels, config.condition);
  currentBlockIdx = 0;
  currentConfig.stimulus_pool = STIMULUS_POOLS[config.stimulus_type];
  experimentStarted = true;

  showInstructionsForCurrentBlock();
}

// ------------ Instructions ------------

function showInstructionsForCurrentBlock() {
  const n = blockOrder[currentBlockIdx];

  // Untuk 0-back: pilih target letter acak per blok, catat di logger
  if (n === 0) {
    currentTargetLetter = randomTargetLetter(currentConfig.stimulus_pool);
    currentLogger.setTargetLetter(currentBlockIdx, currentTargetLetter);
  } else {
    currentTargetLetter = null;
  }

  buildInstructions(n, currentTargetLetter);
  document.getElementById("block-current").textContent = currentBlockIdx + 1;
  document.getElementById("block-total").textContent = blockOrder.length;

  // Tombol: kalau sesi pertama & practice aktif, tombol "mulai latihan"; selain itu "lanjut"
  const btnText = (currentConfig.session === "S1" && currentConfig.enable_practice)
    ? "Lanjut ke Latihan →"
    : "Lanjut →";
  document.getElementById("btn-continue-to-practice-or-fatigue").textContent = btnText;

  showScreen("screen-instructions");
}

function handleContinueFromInstructions() {
  // Kalau sesi pertama DAN practice aktif → ke layar practice intro
  if (currentConfig.session === "S1" && currentConfig.enable_practice) {
    showPracticeIntroScreen();
  } else {
    goToFatigueOrBlock("pre");
  }
}

// ------------ Practice ------------

function showPracticeIntroScreen() {
  const n = blockOrder[currentBlockIdx];
  document.getElementById("practice-intro-n").textContent = n;
  document.getElementById("practice-intro-trials").textContent = currentConfig.practice_trials;
  showScreen("screen-practice-intro");
}

function handleSkipPractice() {
  goToFatigueOrBlock("pre");
}

async function handleStartPractice() {
  const n = blockOrder[currentBlockIdx];
  const targetLetter = n === 0 ? currentTargetLetter : null;
  const sequence = generateSequence(
    n,
    currentConfig.practice_trials,
    currentConfig.target_ratio,
    currentConfig.stimulus_pool,
    targetLetter
  );

  showScreen("screen-block");
  enterFullscreen();

  const runner = new BlockRunner(sequence, currentConfig, currentBlockIdx, n, currentLogger, true); // isPractice = true
  await runner.start();

  exitFullscreen();
  showScreen("screen-practice-done");
}

function handleContinueFromPracticeDone() {
  goToFatigueOrBlock("pre");
}

// ------------ Fatigue Scale (shared between pre & post) ------------

function goToFatigueOrBlock(phase) {
  kssPhase = phase;
  if (currentConfig.enable_fatigue_scale) {
    const n = blockOrder[currentBlockIdx];
    const titlePrefix = phase === "pre"
      ? `Sebelum Blok ${currentBlockIdx + 1} (${n}-back)`
      : `Setelah Blok ${currentBlockIdx + 1} (${n}-back)`;
    showFatigueScreen(titlePrefix);
  } else {
    if (phase === "pre") {
      startCountdownAndBlock();
    } else {
      afterBlockPost();
    }
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
  await runCurrentBlock();
}

async function runCurrentBlock() {
  showScreen("screen-block");
  enterFullscreen();

  const n = blockOrder[currentBlockIdx];
  const targetLetter = n === 0 ? currentTargetLetter : null;
  const totalTrials = calculateTrialCount(currentConfig.block_duration_minutes, currentConfig.isi_ms);
  const sequence = generateSequence(
    n,
    totalTrials,
    currentConfig.target_ratio,
    currentConfig.stimulus_pool,
    targetLetter
  );

  const runner = new BlockRunner(sequence, currentConfig, currentBlockIdx, n, currentLogger, false);
  await runner.start();

  exitFullscreen();
  showBlockSummary();
}

// ------------ Block Summary (Opsi Y - setelah tiap blok) ------------

function showBlockSummary() {
  const n = blockOrder[currentBlockIdx];
  const summary = currentLogger.getBlockSummary(currentBlockIdx);

  document.getElementById("block-summary-title").textContent =
    `Blok ${currentBlockIdx + 1} Selesai! (${n}-back)`;

  document.getElementById("block-summary-content").innerHTML = `
    <div class="summary-grid">
      <div class="summary-row"><span>Score</span><strong>${(summary.accuracy * 100).toFixed(1)}%</strong></div>
      <div class="summary-row"><span>Hits</span><strong>${summary.hits}/${summary.targets}</strong></div>
      <div class="summary-row"><span>Misses</span><strong>${summary.misses}</strong></div>
      <div class="summary-row"><span>False Alarms</span><strong>${summary.false_alarms}</strong></div>
      <div class="summary-row"><span>Hit Rate</span><strong>${(summary.hit_rate * 100).toFixed(1)}%</strong></div>
      <div class="summary-row"><span>False Alarm Rate</span><strong>${(summary.false_alarm_rate * 100).toFixed(1)}%</strong></div>
      <div class="summary-row"><span>Rata-rata RT</span><strong>${summary.mean_rt_ms ?? "N/A"} ms</strong></div>
    </div>
  `;

  showScreen("screen-block-summary");
}

function handleContinueFromBlockSummary() {
  goToFatigueOrBlock("post");
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

// ------------ Final Finished Screen ------------

function showFinishedScreen() {
  experimentStarted = false; // boleh refresh setelah sesi selesai
  const container = document.getElementById("summary-content");
  container.innerHTML = "";

  blockOrder.forEach((n, idx) => {
    const summary = currentLogger.getBlockSummary(idx);
    const div = document.createElement("div");
    div.className = "summary-block";
    div.innerHTML = `
      <h3>Blok ${idx + 1}: ${n}-back</h3>
      <div class="summary-stats">
        <div class="stat">
          <div class="stat-label">Akurasi</div>
          <div class="stat-value">${(summary.accuracy * 100).toFixed(1)}%</div>
        </div>
        <div class="stat">
          <div class="stat-label">Hits</div>
          <div class="stat-value">${summary.hits}/${summary.targets}</div>
        </div>
        <div class="stat">
          <div class="stat-label">False Alarms</div>
          <div class="stat-value">${summary.false_alarms}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Rata-rata RT</div>
          <div class="stat-value">${summary.mean_rt_ms ?? "N/A"} ms</div>
        </div>
      </div>
    `;
    container.appendChild(div);
  });

  // Auto-highlight download button sebagai pengingat
  const btn = document.getElementById("btn-download-csv");
  btn.classList.add("btn-pulse");

  showScreen("screen-finished");
}
