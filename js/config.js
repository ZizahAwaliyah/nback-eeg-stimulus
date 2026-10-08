// ================================================================
// config.js — Manajemen preset dan konfigurasi default
// ================================================================

const DEFAULT_CONFIG = {
  researcher: "",
  n_levels: [0, 1, 2],
  block_duration_minutes: 4,
  isi_ms: 2000,
  stimulus_duration_ms: 500,
  target_ratio: 0.25,
  stimulus_type: "letters",
  enable_fatigue_scale: true,
  enable_practice: true,       // latihan 5 trial per N level di sesi pertama
  practice_trials: 5,
};

const STIMULUS_POOLS = {
  letters: ["B", "D", "F", "G", "H", "J", "K", "L"],
  digits: ["1", "2", "3", "4", "5", "6", "7", "8"],
};

const AVAILABLE_PRESETS = [
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
    return DEFAULT_CONFIG;
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

function applyConfigToForm(config) {
  document.getElementById("researcher-name").value = config.researcher || "";
  document.getElementById("n-levels").value = (config.n_levels || [0, 1, 2]).join(",");
  document.getElementById("block-duration").value = config.block_duration_minutes;
  document.getElementById("isi").value = config.isi_ms;
  document.getElementById("stim-duration").value = config.stimulus_duration_ms;
  document.getElementById("target-ratio").value = config.target_ratio;
  document.getElementById("stimulus-type").value = config.stimulus_type;
  document.getElementById("enable-fatigue").checked = config.enable_fatigue_scale;
  document.getElementById("enable-practice").checked = config.enable_practice !== false;
}

function readConfigFromForm() {
  return {
    researcher: document.getElementById("researcher-name").value.trim(),
    participant_id: document.getElementById("participant-id").value.trim(),
    session: document.getElementById("session").value,
    condition: document.getElementById("condition").value,
    n_levels: document
      .getElementById("n-levels")
      .value.split(",")
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !isNaN(n)),
    block_duration_minutes: parseFloat(document.getElementById("block-duration").value),
    isi_ms: parseInt(document.getElementById("isi").value, 10),
    stimulus_duration_ms: parseInt(document.getElementById("stim-duration").value, 10),
    target_ratio: parseFloat(document.getElementById("target-ratio").value),
    stimulus_type: document.getElementById("stimulus-type").value,
    enable_fatigue_scale: document.getElementById("enable-fatigue").checked,
    enable_practice: document.getElementById("enable-practice").checked,
    practice_trials: 5,
  };
}

function validateConfig(config) {
  const errors = [];
  if (!config.participant_id) errors.push("Kode partisipan harus diisi");
  if (!config.researcher) errors.push("Nama peneliti harus diisi");
  if (!config.n_levels.length) errors.push("Tingkat N harus diisi (contoh: 0,1,2)");
  if (config.block_duration_minutes < 1) errors.push("Durasi blok minimal 1 menit");
  if (config.isi_ms <= config.stimulus_duration_ms) {
    errors.push("ISI harus lebih besar dari durasi stimulus");
  }
  return errors;
}
