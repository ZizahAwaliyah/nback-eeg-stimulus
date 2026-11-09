// ================================================================
// experiment.js — Menjalankan blok eksperimen (stimulus timing & respons)
// ================================================================
// Inti yang dijaga ketat di sini: kolom CSV response_ts dan reaction_time_ms.
// - Stimulus MUNCUL → dicatat localTimestamp() (untuk sinkron Mind Monitor)
//   sekaligus isoTimestamp() (arsip UTC).
// - Respons SPASI / klik sel → response_ts = localTimestamp() saat itu juga.
// - reaction_time_ms = selisih nyata (performance.now()) onset → respons, dibulatkan ke ms.
// - Jadwal ISI memakai satu timer per trial (bukan tumpukan timer), sehingga
//   kemunculan stimulus tidak bergeser makin lambat di tengah blok.

class BlockRunner {
  constructor(sequence, config, blockIndex, blockN, logger, isPractice = false) {
    this.sequence = sequence;
    this.config = config;
    this.blockIndex = blockIndex;
    this.blockN = blockN;
    this.logger = logger;
    this.isPractice = isPractice;

    this.currentTrialIdx = 0;
    this.currentStimulusOnset = null;      // performance.now() saat stimulus muncul
    this.currentStimulusOnsetIso = null;   // timestamp lokal saat stimulus muncul
    this.currentStimulusOnsetUtc = null;   // timestamp ISO UTC saat stimulus muncul
    this.currentResponse = null;
    this.currentResponseTs = null;
    this.currentRtMs = null;

    this.blockStartTs = null;
    this.timerInterval = null;
    this.stimulusTimeout = null;
    this.isiTimeout = null;
    this.keyListener = null;
    this.gridCellListener = null;
    this.onComplete = null;
  }

  async start() {
    this.blockStartTs = localTimestamp();
    if (!this.isPractice) {
      this.logger.logBlockMarker({
        block_index: this.blockIndex,
        block_n: this.blockN,
        event: "start",
        timestamp: this.blockStartTs,
      });
    }

    // Header blok di layar
    const labelPrefix = this.isPractice ? "LATIHAN " : "";
    const infoN = document.getElementById("block-info-n");
    if (infoN) infoN.textContent = labelPrefix + this.blockN;
    document.getElementById("block-info-total").textContent = this.sequence.length;
    document.getElementById("block-n-back-display").textContent = this.blockDescription();

    // Pastikan papan 3x3 tampil sejak awal blok dimulai
    const isGrid = this.config.stimulus_type === "grid3x3";
    const grid = document.getElementById("grid-3x3");
    const stimulusEl = document.getElementById("stimulus-display");
    if (isGrid) {
      if (grid) grid.classList.remove("hidden");
      if (stimulusEl) stimulusEl.classList.add("hidden");
      this.clearGrid();
    }

    // Timer durasi blok
    const totalMs = this.sequence.length * this.config.isi_ms;
    const endTime = Date.now() + totalMs;
    this.timerInterval = setInterval(() => {
      const remaining = Math.max(0, endTime - Date.now());
      const mm = Math.floor(remaining / 60000);
      const ss = Math.floor((remaining % 60000) / 1000);
      document.getElementById("block-info-timer").textContent = `${pad(mm)}:${pad(ss)}`;
    }, 200);

    // --- Perekam respons ---
    // SPASI dan klik sel lewat jalur yang sama supaya aturannya identik:
    // hanya respons PERTAMA per trial yang dicatat.
    const recordResponse = (source) => {
      if (this.currentStimulusOnset === null) return;  // belum ada stimulus / sudah lewat
      if (this.currentResponse !== null) return;       // trial ini sudah ada respons
      this.currentRtMs = Math.round(performance.now() - this.currentStimulusOnset);
      this.currentResponse = source === "click" ? "click" : "spacebar";
      this.currentResponseTs = localTimestamp();
      this.showKeyPressFeedback();
    };

    this.keyListener = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        recordResponse("spacebar");
      }
    };
    document.addEventListener("keydown", this.keyListener);

    // Klik / tap area kotak 3x3 juga dihitung sebagai respons
    const grid = document.getElementById("grid-3x3");
    if (grid && this.config.enable_click_response) {
      grid.classList.add("clickable");
      this.gridCellListener = (e) => {
        e.preventDefault();
        recordResponse("click");
      };
      grid.addEventListener("pointerdown", this.gridCellListener);
    }

    return new Promise((resolve) => {
      this.onComplete = resolve;
      this.runNextTrial();
    });
  }

  /** Teks tugas untuk footer blok. */
  blockDescription() {
    const isGrid = this.config.stimulus_type === "grid3x3";
    if (this.blockN === 0) return isGrid ? "kotak target" : "stimulus target";
    return `${this.blockN} langkah sebelumnya`;
  }

  /** Umpan balik visual saat respons tercatat. */
  showKeyPressFeedback() {
    const keyIndicator = document.getElementById("key-indicator");
    if (!keyIndicator) return;
    keyIndicator.classList.add("pressed");
    setTimeout(() => {
      keyIndicator.classList.remove("pressed");
    }, 150);
  }

  /** Matikan semua sel grid 3x3. */
  clearGrid() {
    document.querySelectorAll("#grid-3x3 .grid-cell").forEach((c) => c.classList.remove("active"));
  }

  /** Tampilkan stimulus trial: nyalakan satu sel (grid3x3) atau satu karakter. */
  renderStimulus(stimulusCode) {
    const isGrid = this.config.stimulus_type === "grid3x3";
    const stimulusEl = document.getElementById("stimulus-display");
    const gridEl = document.getElementById("grid-3x3");

    if (isGrid) {
      if (gridEl) gridEl.classList.remove("hidden");
      if (stimulusEl) {
        stimulusEl.textContent = "";
        stimulusEl.classList.add("hidden");
      }
      this.clearGrid();
      const parsed = parseCell(stimulusCode);
      if (parsed && gridEl) {
        const cell = gridEl.querySelector(
          `.grid-cell[data-row="${parsed.row}"][data-col="${parsed.col}"]`
        );
        if (cell) cell.classList.add("active");
      }
    } else {
      if (gridEl) gridEl.classList.add("hidden");
      if (stimulusEl) {
        stimulusEl.textContent = stimulusCode;
        stimulusEl.classList.remove("hidden");
      }
    }
  }

  hideStimulus() {
    const stimulusEl = document.getElementById("stimulus-display");
    if (stimulusEl) stimulusEl.classList.add("hidden");
    // Matikan kotak yang sedang menyala biru, tetapi papan 3x3 tetap tampil di layar
    this.clearGrid();
  }

  runNextTrial() {
    if (this.currentTrialIdx >= this.sequence.length) {
      return this.finishBlock();
    }

    const trial = this.sequence[this.currentTrialIdx];
    this.currentResponse = null;
    this.currentResponseTs = null;
    this.currentRtMs = null;

    document.getElementById("block-info-trial").textContent = this.currentTrialIdx + 1;

    this.renderStimulus(trial.stimulus);
    this.currentStimulusOnset = performance.now();
    this.currentStimulusOnsetIso = localTimestamp();
    this.currentStimulusOnsetUtc = isoTimestamp();

    // Stimulus hilang setelah stimulus_duration_ms
    this.stimulusTimeout = setTimeout(() => {
      this.hideStimulus();
    }, this.config.stimulus_duration_ms);

    // Akhir trial: catat, lalu lanjut trial berikutnya (satu timer saja per trial)
    this.isiTimeout = setTimeout(() => {
      const correct =
        (trial.isTarget && this.currentResponse !== null) ||
        (!trial.isTarget && this.currentResponse === null);

      if (!this.isPractice) {
        this.logger.logTrial({
          block_index: this.blockIndex,
          block_n: this.blockN,
          trial_num: this.currentTrialIdx + 1,
          stimulus: trial.stimulus,
          is_target: trial.isTarget,
          stim_onset_ts: this.currentStimulusOnsetIso,
          stim_onset_iso: this.currentStimulusOnsetUtc,
          response: this.currentResponse,
          response_ts: this.currentResponseTs,
          reaction_time_ms: this.currentRtMs,
          correct: correct,
        });
      }

      this.currentStimulusOnset = null;
      this.currentTrialIdx++;
      this.runNextTrial();
    }, this.config.isi_ms);
  }

  finishBlock() {
    clearInterval(this.timerInterval);
    clearTimeout(this.stimulusTimeout);
    clearTimeout(this.isiTimeout);
    if (this.keyListener) document.removeEventListener("keydown", this.keyListener);

    const grid = document.getElementById("grid-3x3");
    if (grid) {
      grid.classList.remove("clickable");
      grid.classList.add("hidden");
      if (this.gridCellListener) grid.removeEventListener("pointerdown", this.gridCellListener);
    }
    this.hideStimulus();

    if (!this.isPractice) {
      this.logger.logBlockMarker({
        block_index: this.blockIndex,
        block_n: this.blockN,
        event: "end",
        timestamp: localTimestamp(),
      });
    }

    if (this.onComplete) this.onComplete();
  }
}

// ================================================================
// COUNTDOWN dengan AUDIO BEEP di setiap angka
// ================================================================

// Satu AudioContext dipakai ulang: browser membatasi jumlah AudioContext,
// dan membuat yang baru tiap beep bisa bikin suara telat/hilang.
let sharedAudioContext = null;

function getAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioContext) sharedAudioContext = new Ctx();
  if (sharedAudioContext.state === "suspended") sharedAudioContext.resume().catch(() => {});
  return sharedAudioContext;
}

function playBeep(frequency = 800, duration = 150, volume = 0.3) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration / 1000);
  } catch (e) {
    console.warn("Audio beep failed:", e);
  }
}

function runCountdown(seconds = 3) {
  return new Promise((resolve) => {
    const display = document.getElementById("countdown-display");
    let count = seconds;
    display.textContent = count;
    playBeep(600, 150); // beep untuk angka pertama (3)

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        display.textContent = count;
        playBeep(600, 150); // beep untuk 2 dan 1
      } else {
        clearInterval(interval);
        display.textContent = "0";
        playBeep(1000, 300); // beep lebih tinggi & panjang saat blok mulai
        setTimeout(resolve, 300);
      }
    }, 1000);
  });
}

// ================================================================
// INSTRUKSI & QUICK TIPS per jenis stimulus / tingkat N
// ================================================================

function buildInstructions(n, targetStim = null) {
  const container = document.getElementById("instructions-body");
  const tipsContainer = document.getElementById("tips-body");
  const isGrid = currentConfig && currentConfig.stimulus_type === "grid3x3";
  container.innerHTML = "";
  tipsContainer.innerHTML = "";

  if (isGrid) {
    // ---------- Instruksi mode kotak 3x3 ----------
    if (n === 0) {
      const targetCell = parseCell(targetStim) || { row: 2, col: 2 };
      container.innerHTML = `
        <p>Anda akan melihat <strong>satu kotak menyala</strong> di dalam kotak 3×3.</p>
        <p>Tekan <strong>SPASI</strong> setiap kali kotak yang menyala adalah <strong>kotak target</strong> di bawah ini:</p>
        <div class="target-grid-wrapper">
          <div class="grid-3x3 grid-preview">
            ${buildGridPreviewHtml(targetCell.row, targetCell.col)}
          </div>
        </div>
        <p>Kalau kotak lain yang menyala, <strong>jangan tekan apa-apa</strong>, tunggu kotak berikutnya.</p>
      `;
      document.getElementById("n-back-word").textContent = "adalah kotak target";
    } else {
      container.innerHTML = `
        <p>Anda akan melihat <strong>satu kotak menyala</strong> di dalam kotak 3×3, posisinya berganti-ganti.</p>
        <p>Tugas Anda: bandingkan posisi kotak sekarang dengan posisi <strong>${n} langkah sebelumnya</strong>.</p>
        <p>Kalau posisinya <strong>sama</strong> dengan ${n} langkah lalu, tekan <strong>SPASI</strong>.</p>
        <p>Kalau berbeda, jangan tekan apa-apa dan tunggu kotak berikutnya.</p>
      `;
      document.getElementById("n-back-word").textContent = `${n} langkah`;
    }

    const tipsMap = {
      1: [
        "Cukup mengingat satu posisi terakhir",
        'Tanyakan: "apakah posisi ini sama dengan kotak sebelumnya?"',
        "Kalau sama, tekan SPASI secepat mungkin",
        "Kalau ragu, jangan tekan dulu — tunggu kotak berikutnya",
      ],
      2: [
        "Simpan dua posisi terakhir, lalu perbarui terus",
        'Tanyakan: "apakah posisi ini sama dengan dua kotak lalu?"',
        "Jangan panik kalau kelewatan, fokus ke kotak berikutnya",
        "Butuh konsentrasi lebih tinggi daripada 1 langkah",
      ],
      3: [
        "Simpan tiga posisi terakhir dan perbarui terus-menerus",
        'Tanyakan: "apakah posisi ini sama dengan tiga kotak lalu?"',
        "Tingkat tersulit, kelewatan itu normal",
        "Utamakan ketepatan daripada kecepatan",
      ],
    };
    const tips = tipsMap[n] || [
      `Ingat ${n} posisi terakhir, lalu bandingkan dengan posisi yang baru muncul`,
      "Jangan menebak kalau tidak yakin",
      "Kalau kelewatan, jangan mengulang manual — lanjut ke kotak berikutnya",
      "Utamakan ketepatan daripada kecepatan",
    ];
    tipsContainer.innerHTML = `
      <h3>Tips ${n}-back (mode kotak 3×3)</h3>
      <ul>${tips.map((t) => `<li>${t}</li>`).join("")}</ul>
      <p class="note">Tidak ada posisi yang muncul ulang tanpa alasan: kalau posisinya sama dengan ${n} langkah lalu, itu memang <strong>harus</strong> ditekan SPASI.</p>
    `;
  } else {
    // ---------- Instruksi lama (huruf/angka), tetap dipertahankan ----------
    if (n === 0) {
      container.innerHTML = `
        <p>Anda akan melihat huruf muncul satu per satu di layar.</p>
        <p>Tekan <strong>SPASI</strong> setiap kali huruf yang muncul adalah <strong>huruf target</strong> berikut:</p>
        <div class="target-letter-display">${targetStim || "B"}</div>
        <p>Jika huruf lain muncul, <strong>jangan tekan apa-apa</strong> dan tunggu huruf berikutnya.</p>
      `;
      document.getElementById("n-back-word").textContent = "adalah huruf target";
    } else {
      container.innerHTML = `
        <p>Anda akan melihat huruf muncul satu per satu di layar.</p>
        <p>Tugas Anda: bandingkan huruf sekarang dengan huruf <strong>${n} langkah sebelumnya</strong>.</p>
        <p>Jika huruf sekarang <strong>sama</strong> dengan yang muncul ${n} langkah sebelumnya, tekan <strong>SPASI</strong>.</p>
        <p>Jika berbeda, jangan tekan apa-apa dan tunggu huruf berikutnya.</p>
      `;
      document.getElementById("n-back-word").textContent = `${n} langkah`;
    }

    const tipsMap = {
      0: [
        "Fokus hanya pada huruf target yang ditampilkan di atas",
        "Jangan pedulikan huruf-huruf lain yang bukan target",
        "Tekan SPASI segera begitu melihat huruf target",
        "Bangun ritme: lihat, kenali, respon",
      ],
      1: [
        "Hanya ingat satu huruf terakhir",
        'Tanyakan: "Apakah huruf ini sama dengan huruf sebelumnya?"',
        "Bangun ritme stabil: amati, bandingkan, respon",
        "Mode ringan untuk melatih fokus",
      ],
      2: [
        "Ingat dua huruf terakhir dan update terus-menerus",
        'Tanyakan: "Apakah huruf ini sama dengan huruf 2 langkah lalu?"',
        "Jangan panik kalau miss, fokus pada ritme berikutnya",
        "Butuh konsentrasi lebih tinggi dari 1-back",
      ],
      3: [
        "Ingat tiga huruf terakhir dan update terus-menerus",
        'Tanyakan: "Apakah huruf ini sama dengan huruf 3 langkah lalu?"',
        "Tingkat tersulit, miss adalah hal normal",
        "Fokus pada akurasi, bukan kecepatan",
      ],
    };
    const tips = tipsMap[n] || tipsMap[2];
    const title = n === 0 ? "0-Back Tips" : `${n}-Back Quick Tips`;
    tipsContainer.innerHTML = `
      <h3>${title}</h3>
      <ul>${tips.map((t) => `<li>${t}</li>`).join("")}</ul>
    `;
  }

  document.getElementById("current-n-display").textContent = n;
}

/** HTML sel-sel kotak 3x3 untuk pratinjau target di layar instruksi. */
function buildGridPreviewHtml(activeRow, activeCol, size = GRID_SIZE) {
  let html = "";
  for (let r = 1; r <= size; r++) {
    for (let c = 1; c <= size; c++) {
      const active = r === activeRow && c === activeCol ? " active" : "";
      html += `<div class="grid-cell${active}"></div>`;
    }
  }
  return html;
}
