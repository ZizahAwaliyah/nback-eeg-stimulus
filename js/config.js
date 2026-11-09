// ================================================================
// config.js — Manajemen preset dan konfigurasi default
// ================================================================

const DEFAULT_CONFIG = {
  researcher: "",
  participant_name: "",
  n_levels: [1, 2, 3],
  block_duration_minutes: 4,
  isi_ms: 2000,
  stimulus_duration_ms: 500,
  target_ratio: 0.25,
  stimulus_type: "grid3x3",
  enable_fatigue_scale: false,
  enable_practice: true,
  practice_trials: 5,
  practice_full_countdown: true, // latihan juga pakai countdown 3-2-1
  randomize_grid_layout: false,  // acak posisi sel di layar (analisis harus pakai urutan tampil)
  enable_click_response: true,   // SPASI + klik/tap sel di layar
};

// Pool stimulus per jenis. Untuk grid3x3: 9 sel, kode "r{baris}c{kolom}".
const STIMULUS_POOLS = {
  letters: ["B", "D", "F", "G", "H", "J", "K", "L"],
  digits: ["1", "2", "3", "4", "5", "6", "7", "8"],
  grid3x3: ["r1c1", "r1c2", "r1c3", "r2c1", "r2c2", "r2c3", "r3c1", "r3c2", "r3c3"],
};

// Label bahasa Indonesia untuk tiap jenis stimulus
const STIMULUS_TYPE_LABELS = {
  letters: "Huruf (B,D,F,G,H,J,K,L)",
  digits: "Angka (1-8)",
  grid3x3: "Kotak 3x3 (posisi)",
};

const AVAILABLE_PRESETS = [
  { id: "mutiah", name: "Mutiah (1/2/3-back, 4 menit, kotak 3x3)", file: "presets/mutiah.json" },
  { id: "mutiah-groundtruth", name: "Mutiah + Ground Truth (0/1/2/3-back, 4 menit, kotak 3x3)", file: "presets/mutiah_0123.json" },
  { id: "azizah", name: "Azizah (0/1/2-back, 4 menit)", file: "presets/azizah.json" },
  { id: "template", name: "Template Kosong (edit sesuai kebutuhan)", file: "presets/template.json" },
];

async function loadPreset(presetFile) {
  try {
    const response = await fetch(presetFile);
    if (!response.ok) throw new Error(`Gagal memuat ${presetFile}`);
    const preset = await response.json();
    return { ...DEFAULT_CONFIG, ...preset };
  } catch (err) {
    console.error("Error loading preset:", err);
    alert(`Tidak dapat memuat preset: ${err.message}`);
    return { ...DEFAULT_CONFIG };
  }
}

function populatePresetDropdown() {
  const select = document.getElementById("preset-select");
  AVAILABLE_PRESETS.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.file;
    option.textContent = preset.name;
    select.appendChild(option);
  });
}

/** Aktifkan/nonaktifkan field yang tidak relevan untuk jenis stimulus terpilih. */
function refreshStimulusTypeUI() {
  const type = document.getElementById("stimulus-type").value;
  const isGrid = type === "grid3x3";

  const hint = document.getElementById("grid-hint");
  if (hint) hint.style.display = isGrid ? "block" : "none";

  const row = document.getElementById("row-randomize-layout");
  if (row) row.style.display = isGrid ? "flex" : "none";

  const clickRow = document.getElementById("row-click-response");
  if (clickRow) clickRow.style.display = isGrid ? "flex" : "none";

  if (isGrid) {
    const warn = document.getElementById("grid-zero-warning");
    if (warn) warn.style.display = "none";
  }
}

function parseNLevels() {
  return document
    .getElementById("n-levels")
    .value.split(",")
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => !isNaN(n));
}

function applyConfigToForm(config) {
  document.getElementById("researcher-name").value = config.researcher || "";
  document.getElementById("participant-name").value = config.participant_name || "";
  document.getElementById("n-levels").value = (config.n_levels || [1, 2, 3]).join(",");
  document.getElementById("block-duration").value = config.block_duration_minutes;
  document.getElementById("isi").value = config.isi_ms;
  document.getElementById("stim-duration").value = config.stimulus_duration_ms;
  document.getElementById("target-ratio").value = config.target_ratio;
  document.getElementById("stimulus-type").value = config.stimulus_type;
  document.getElementById("enable-fatigue").checked = config.enable_fatigue_scale;
  document.getElementById("enable-practice").checked = config.enable_practice !== false;

  const randLayout = document.getElementById("randomize-layout");
  if (randLayout) randLayout.checked = config.randomize_grid_layout === true;

  const clickResp = document.getElementById("enable-click-response");
  if (clickResp) clickResp.checked = config.enable_click_response !== false;

  refreshStimulusTypeUI();
}

function readConfigFromForm() {
  const randomizeEl = document.getElementById("randomize-layout");
  const clickEl = document.getElementById("enable-click-response");

  return {
    researcher: document.getElementById("researcher-name").value.trim(),
    participant_name: document.getElementById("participant-name").value.trim(),
    session: document.getElementById("session").value,
    condition: document.getElementById("condition").value,
    n_levels: parseNLevels(),
    block_duration_minutes: parseFloat(document.getElementById("block-duration").value),
    isi_ms: parseInt(document.getElementById("isi").value, 10),
    stimulus_duration_ms: parseInt(document.getElementById("stim-duration").value, 10),
    target_ratio: parseFloat(document.getElementById("target-ratio").value),
    stimulus_type: document.getElementById("stimulus-type").value,
    enable_fatigue_scale: document.getElementById("enable-fatigue").checked,
    enable_practice: document.getElementById("enable-practice").checked,
    practice_trials: 5,
    practice_full_countdown: true,
    randomize_grid_layout: randomizeEl ? randomizeEl.checked : false,
    enable_click_response: clickEl ? clickEl.checked : false,
  };
}

function validateConfig(config) {
  const errors = [];
  if (!config.participant_name) errors.push("Nama partisipan harus diisi");
  if (!config.researcher) errors.push("Nama peneliti harus diisi");
  if (!config.n_levels.length) errors.push("Tingkat N harus diisi (contoh: 1,2,3)");
  if (config.n_levels.some((n) => n < 0 || !Number.isInteger(n))) {
    errors.push("Tingkat N harus bilangan bulat 0 atau lebih");
  }
  if (new Set(config.n_levels).size !== config.n_levels.length) {
    errors.push("Tingkat N tidak boleh ada yang sama (contoh: 1,2,2 salah)");
  }
  if (!(config.block_duration_minutes >= 1)) errors.push("Durasi blok minimal 1 menit");
  if (!(config.isi_ms > 0)) errors.push("ISI harus lebih dari 0 ms");
  if (!(config.stimulus_duration_ms > 0)) errors.push("Durasi stimulus harus lebih dari 0 ms");
  if (config.isi_ms <= config.stimulus_duration_ms) {
    errors.push("ISI harus lebih besar dari durasi stimulus");
  }
  if (isNaN(config.target_ratio) || config.target_ratio <= 0 || config.target_ratio >= 0.9) {
    errors.push("Rasio target harus antara 0 dan 0,9 (contoh: 0,25)");
  }
  return errors;
}

/** Cek cepat konfigurasi (tanpa popup) untuk menampilkan peringatan di layar. */
function getConfigWarnings(config) {
  const warnings = [];
  const trials = calculateTrialCount(config.block_duration_minutes, config.isi_ms);
  if (trials < 20) {
    warnings.push(
      `Blok hanya berisi ${trials} trial (≈${Math.round((trials * config.isi_ms) / 1000)} detik dibaca). ` +
        "Untuk rekaman EEG, minimal 20-30 trial per blok lebih aman."
    );
  }
  const targets = Math.round(trials * config.target_ratio);
  if (targets > 0 && targets < 6) {
    warnings.push(`Jumlah target per blok hanya ${targets}. Statistik hit rate jadi kurang stabil.`);
  }
  if (config.n_levels.length > 5) {
    warnings.push("Jumlah tingkat N cukup banyak — pastikan partisipan kuat sampai blok terakhir.");
  }
  return warnings;
}
