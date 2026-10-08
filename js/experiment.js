// ================================================================
// experiment.js — Menjalankan blok eksperimen (stimulus timing & keypress)
// ================================================================
// Perubahan dari versi lama:
// - RT direkam saat SPASI DITEKAN (bukan di akhir ISI)
// - Response window diperluas sampai akhir ISI (bukan hanya saat stimulus visible)
// - Visual key press indicator (SPASI di layar menyala saat ditekan)
// - 0-back target bisa dikustomisasi per blok (bukan selalu "B")
// - Timestamp pakai waktu lokal (localTimestamp dari time-utils.js)

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
    this.currentStimulusOnsetIso = null;   // timestamp iso saat stimulus muncul
    this.currentResponse = null;
    this.currentResponseTs = null;
    this.currentRtMs = null;               // RT direkam langsung saat tekan
    this.blockStartTs = null;
    this.timerInterval = null;
    this.stimulusTimeout = null;
    this.isiTimeout = null;
    this.keyListener = null;
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

    // Update UI header
    const labelPrefix = this.isPractice ? "LATIHAN " : "";
    document.getElementById("block-info-n").textContent = labelPrefix + this.blockN;
    document.getElementById("block-info-total").textContent = this.sequence.length;
    document.getElementById("block-n-back-display").textContent =
      this.blockN === 0 ? "huruf target" : `${this.blockN} langkah sebelumnya`;

    // Timer countdown
    const totalMs = this.sequence.length * this.config.isi_ms;
    const endTime = Date.now() + totalMs;
    this.timerInterval = setInterval(() => {
      const remaining = Math.max(0, endTime - Date.now());
      const mm = Math.floor(remaining / 60000);
      const ss = Math.floor((remaining % 60000) / 1000);
      document.getElementById("block-info-timer").textContent =
        `${pad(mm)}:${pad(ss)}`;
    }, 200);

    // Keyboard listener - DIAKTIFKAN SELAMA SELURUH TRIAL (termasuk setelah stimulus hilang)
    this.keyListener = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        // Hanya catat respons pertama per trial
        if (this.currentStimulusOnset !== null && this.currentResponse === null) {
          const now = performance.now();
          this.currentRtMs = Math.round(now - this.currentStimulusOnset);
          this.currentResponse = "spacebar";
          this.currentResponseTs = localTimestamp();
          this.showKeyPressFeedback();
        }
      }
    };
    document.addEventListener("keydown", this.keyListener);

    return new Promise((resolve) => {
      this.onComplete = resolve;
      this.runNextTrial();
    });
  }

  // Visual feedback: tombol SPASI di layar menyala sebentar
  showKeyPressFeedback() {
    const keyIndicator = document.getElementById("key-indicator");
    if (!keyIndicator) return;
    keyIndicator.classList.add("pressed");
    setTimeout(() => {
      keyIndicator.classList.remove("pressed");
    }, 150);
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

    const stimulusEl = document.getElementById("stimulus-display");
    stimulusEl.textContent = trial.stimulus;
    stimulusEl.classList.remove("hidden");
    this.currentStimulusOnset = performance.now();
    this.currentStimulusOnsetIso = localTimestamp();

    // Sembunyikan stimulus setelah stimulus_duration_ms
    this.stimulusTimeout = setTimeout(() => {
      stimulusEl.classList.add("hidden");
    }, this.config.stimulus_duration_ms);

    // Setelah ISI selesai, log trial dan lanjut ke trial berikutnya
    this.isiTimeout = setTimeout(() => {
      const correct =
        (trial.isTarget && this.currentResponse === "spacebar") ||
        (!trial.isTarget && this.currentResponse !== "spacebar");

      if (!this.isPractice) {
        this.logger.logTrial({
          block_index: this.blockIndex,
          block_n: this.blockN,
          trial_num: this.currentTrialIdx + 1,
          stimulus: trial.stimulus,
          is_target: trial.isTarget,
          stim_onset_ts: this.currentStimulusOnsetIso,
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
    document.removeEventListener("keydown", this.keyListener);

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

function playBeep(frequency = 800, duration = 150, volume = 0.3) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, duration);
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
        playBeep(1000, 300); // beep lebih tinggi & panjang saat mulai
        setTimeout(resolve, 300);
      }
    }, 1000);
  });
}

// ================================================================
// INSTRUKSI & QUICK TIPS per tingkat N
// ================================================================

function buildInstructions(n, targetLetter = null) {
  const container = document.getElementById("instructions-body");
  const tipsContainer = document.getElementById("tips-body");
  container.innerHTML = "";
  tipsContainer.innerHTML = "";

  // Instruksi utama
  if (n === 0) {
    container.innerHTML = `
      <p>Anda akan melihat huruf muncul satu per satu di layar.</p>
      <p>Tekan <strong>SPASI</strong> setiap kali huruf yang muncul adalah <strong>huruf target</strong> berikut:</p>
      <div class="target-letter-display">${targetLetter || "B"}</div>
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

  // Quick Tips per tingkat N
  const tipsMap = {
    0: [
      "Fokus hanya pada huruf target yang ditampilkan di atas",
      "Jangan pedulikan huruf-huruf lain yang bukan target",
      "Tekan SPASI segera begitu melihat huruf target",
      "Bangun ritme: lihat, kenali, respon",
    ],
    1: [
      "Hanya ingat satu huruf terakhir",
      "Tanyakan: \"Apakah huruf ini sama dengan huruf sebelumnya?\"",
      "Bangun ritme stabil: amati, bandingkan, respon",
      "Mode ringan untuk melatih fokus",
    ],
    2: [
      "Ingat dua huruf terakhir dan update terus-menerus",
      "Tanyakan: \"Apakah huruf ini sama dengan huruf 2 langkah lalu?\"",
      "Jangan panik kalau miss, fokus pada ritme berikutnya",
      "Butuh konsentrasi lebih tinggi dari 1-back",
    ],
    3: [
      "Ingat tiga huruf terakhir dan update terus-menerus",
      "Tanyakan: \"Apakah huruf ini sama dengan huruf 3 langkah lalu?\"",
      "Tingkat tersulit, miss adalah hal normal",
      "Fokus pada akurasi, bukan kecepatan",
    ],
  };

  const tips = tipsMap[n] || tipsMap[2];
  const title = n === 0 ? "0-Back Tips" : `${n}-Back Quick Tips`;
  tipsContainer.innerHTML = `
    <h3>${title}</h3>
    <ul>
      ${tips.map((t) => `<li>${t}</li>`).join("")}
    </ul>
  `;

  document.getElementById("current-n-display").textContent = n;
}
