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
    // Hasil tiap trial di memori runner ini saja (dipakai untuk skor latihan).
    // Latihan TIDAK pernah dikirim ke logger, jadi tidak masuk CSV/JSON.
    this.results = [];
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

    // Layar blok minimal: hanya stimulus (dan fiksasi) yang tampil, supaya tampilan
    // semua tingkat identik dan mata tidak melirik ke timer/nomor trial.
    const blockScreen = document.getElementById("screen-block");
    if (blockScreen) blockScreen.classList.toggle("minimal", this.config.minimal_block_screen === true);

    // Pastikan papan 3x3 tampil sejak awal blok dimulai
    const isGrid = this.config.stimulus_type === "grid3x3";
    const grid = document.getElementById("grid-3x3");
    const stimulusEl = document.getElementById("stimulus-display");
    // Mode huruf/angka: papan 3x3 dikeluarkan dari tata letak. Sebelumnya papan hanya
    // "visibility: hidden" sehingga tetap memakan tempat dan huruf bergeser ke kanan
    // dari tengah layar.
    if (grid) grid.style.display = isGrid ? "" : "none";
    if (isGrid) {
      if (grid) grid.classList.remove("hidden");
      if (stimulusEl) stimulusEl.classList.add("hidden");
      this.clearGrid();
    }

    // Jeda awal: tanda "+" sebentar sebelum stimulus pertama, supaya partisipan
    // tidak kaget ketika huruf langsung muncul begitu hitung mundur mencapai 0.
    // Penanda "start" blok di atas tetap dicatat di titik yang sama seperti sebelumnya.
    const leadInMs = Math.max(0, parseInt(this.config.lead_in_ms, 10) || 0);

    // Timer durasi blok
    const totalMs = this.sequence.length * this.config.isi_ms + leadInMs;
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
    // (variabel `grid` sudah dideklarasikan di atas; deklarasi ulang membuat
    //  seluruh experiment.js gagal dimuat dan mode huruf/angka tidak jalan)
    if (isGrid && grid && this.config.enable_click_response) {
      grid.classList.add("clickable");
      this.gridCellListener = (e) => {
        e.preventDefault();
        recordResponse("click");
      };
      grid.addEventListener("pointerdown", this.gridCellListener);
    }

    return new Promise((resolve) => {
      this.onComplete = resolve;
      if (leadInMs > 0) {
        // Respons selama jeda diabaikan (currentStimulusOnset masih null).
        if (isGrid) this.clearGrid();
        else this.showFixation();
        this.isiTimeout = setTimeout(() => this.runNextTrial(), leadInMs);
      } else {
        this.runNextTrial();
      }
    });
  }

  /** Teks tugas untuk footer blok. */
  blockDescription() {
    const isGrid = this.config.stimulus_type === "grid3x3";
    const unit = isGrid ? "kotak" : this.config.stimulus_type === "digits" ? "angka" : "huruf";
    if (this.blockN === 0) return `${unit} target`;
    return `${unit} ${this.blockN} langkah sebelumnya`;
  }

  /** Tanda fiksasi "+" di tengah layar (mode huruf/angka saja). */
  showFixation() {
    const el = document.getElementById("stimulus-display");
    if (!el) return;
    el.textContent = "+";
    el.classList.add("fixation");
    el.classList.remove("hidden");
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
        stimulusEl.classList.remove("fixation");
        stimulusEl.classList.remove("hidden");
      }
    }
  }

  hideStimulus() {
    const stimulusEl = document.getElementById("stimulus-display");
    const isGrid = this.config.stimulus_type === "grid3x3";
    if (!isGrid && this.config.show_fixation && this.currentTrialIdx < this.sequence.length) {
      this.showFixation();
    } else if (stimulusEl) {
      stimulusEl.classList.add("hidden");
      stimulusEl.classList.remove("fixation");
    }
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

      this.results.push({
        is_target: trial.isTarget,
        response: this.currentResponse,
        reaction_time_ms: this.currentRtMs,
        correct: correct,
      });

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
    const blockScreen = document.getElementById("screen-block");
    if (blockScreen) blockScreen.classList.remove("minimal");

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

/**
 * @param {number} seconds
 * @param {{showMarker?: boolean, targetStim?: string|null, label?: string}} opts
 *   showMarker : tampilkan pengingat tombol Marker Mind Monitor (blok sebenarnya saja,
 *                supaya tidak ada marker nyasar saat latihan)
 *   targetStim : huruf sasaran 0-back. Ditampilkan HANYA di layar hitung mundur,
 *                tidak selama blok, supaya tampilan blok sama di semua tingkat.
 */
function runCountdown(seconds = 3, opts = {}) {
  const { showMarker = true, targetStim = null, label = "Blok akan mulai dalam..." } = opts;
  const markerEl = document.getElementById("marker-info");
  if (markerEl) markerEl.style.display = showMarker ? "block" : "none";
  const targetBox = document.getElementById("countdown-target");
  if (targetBox) {
    targetBox.style.display = targetStim ? "block" : "none";
    document.getElementById("countdown-target-letter").textContent = targetStim || "";
  }
  const labelEl = document.getElementById("countdown-label");
  if (labelEl) labelEl.textContent = label;

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

  // Tampilan minimal: satu kartu berisi penjelasan singkat, pratinjau target (0-back),
  // lalu satu baris tips di bawah garis pemisah.
  const unit = isGrid ? "kotak" : "huruf";
  let tip;

  if (n === 0) {
    let targetHtml;
    if (isGrid) {
      const targetCell = parseCell(targetStim) || { row: 2, col: 2 };
      targetHtml = `
        <div class="target-grid-wrapper">
          <div class="grid-3x3 grid-preview">
            ${buildGridPreviewHtml(targetCell.row, targetCell.col)}
          </div>
        </div>`;
      tip = `Fokus pada kotak target, tekan <strong>SPASI</strong> dengan cepat, dan abaikan kotak lainnya.`;
    } else {
      const letter = targetStim || "B";
      targetHtml = `<div class="target-letter-display">${letter}</div>`;
      tip = `Fokus pada huruf target "${letter}", tekan <strong>SPASI</strong> dengan cepat, dan abaikan huruf lainnya.`;
    }
    container.innerHTML = `
      <p>${isGrid ? "Anda akan melihat satu kotak menyala di dalam kotak 3×3." : "Anda akan melihat huruf muncul satu per satu di layar."}</p>
      <p>Tekan <strong>SPASI</strong> jika ${isGrid ? "kotak target menyala" : "muncul huruf target"}:</p>
      ${targetHtml}
      <p>Jika ${unit} lain ${isGrid ? "yang menyala" : "muncul"}, jangan tekan apa-apa dan tunggu ${unit} berikutnya.</p>
    `;
  } else {
    const what = isGrid ? "posisi kotak" : "huruf";
    container.innerHTML = `
      <p>${isGrid ? "Anda akan melihat satu kotak menyala di dalam kotak 3×3, posisinya berganti-ganti." : "Anda akan melihat huruf muncul satu per satu di layar."}</p>
      <p>Tekan <strong>SPASI</strong> jika ${what} sekarang sama dengan ${what} <strong>${n} langkah sebelumnya</strong>.</p>
      <p>Jika berbeda, jangan tekan apa-apa dan tunggu ${unit} berikutnya.</p>
    `;
    const tipsMap = {
      1: `Cukup ingat satu ${unit} terakhir, lalu bandingkan dengan ${unit} yang baru muncul.`,
      2: `Ingat dua ${unit} terakhir dan perbarui terus; kalau kelewatan, fokus ke ${unit} berikutnya.`,
      3: `Ingat tiga ${unit} terakhir; kelewatan itu normal, utamakan ketepatan daripada kecepatan.`,
    };
    tip = tipsMap[n] || `Ingat ${n} ${unit} terakhir dan utamakan ketepatan daripada kecepatan.`;
  }

  tipsContainer.innerHTML = `Tips: ${tip}`;
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
