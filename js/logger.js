// ================================================================
// logger.js — Pencatatan data dan ekspor ke CSV/JSON
// ================================================================
// Kolom CSV (15 kolom, urutan tetap):
//   timestamp_local, timestamp_iso, researcher, participant_name, session,
//   condition, block_index, block_n, trial_num, stimulus, is_target,
//   response, response_ts, reaction_time_ms, correct
//
// - timestamp_local : waktu laptop saat stimulus MUNCUL, format sama dengan
//                     kolom TimeStamp Mind Monitor → dipakai untuk sinkronisasi.
// - timestamp_iso   : waktu UTC yang sama, untuk arsip lintas zona waktu.
// - response_ts     : waktu laptop saat SPASI ditekan (kosong kalau tidak ada respons).
// - reaction_time_ms: selisih response_ts - timestamp_local dalam milidetik.

class ExperimentLogger {
  constructor(config) {
    this.config = config;
    this.sessionStart = localTimestamp();
    this.trials = [];
    this.fatigueRatings = [];
    this.blockMarkers = [];
    this.targetStimPerBlock = {}; // 0-back: stimulus target tetap per blok
  }

  logTrial(trial) {
    this.trials.push({
      timestamp_local: trial.stim_onset_ts,
      timestamp_iso: trial.stim_onset_iso || "",
      researcher: this.config.researcher,
      participant_name: this.config.participant_name,
      session: this.config.session,
      condition: this.config.condition,
      block_index: trial.block_index,
      block_n: trial.block_n,
      trial_num: trial.trial_num,
      stimulus: trial.stimulus,
      is_target: trial.is_target,
      response: trial.response || "",
      response_ts: trial.response_ts || "",
      reaction_time_ms: trial.reaction_time_ms ?? "",
      correct: trial.correct,
    });
  }

  logFatigue(rating) {
    this.fatigueRatings.push(rating);
  }

  logBlockMarker(marker) {
    this.blockMarkers.push(marker);
  }

  setTargetStimulus(blockIndex, stimulus) {
    this.targetStimPerBlock[blockIndex] = stimulus;
  }

  getBlockSummary(blockIndex) {
    const blockTrials = this.trials.filter((t) => t.block_index === blockIndex);
    const targets = blockTrials.filter((t) => t.is_target);
    const nonTargets = blockTrials.filter((t) => !t.is_target);
    const hits = targets.filter((t) => t.response === "spacebar" && t.correct);
    const misses = targets.filter((t) => t.response !== "spacebar");
    const falseAlarms = nonTargets.filter((t) => t.response === "spacebar");
    const correctRejections = nonTargets.filter((t) => t.response !== "spacebar");
    const rts = hits.map((t) => parseFloat(t.reaction_time_ms)).filter((rt) => !isNaN(rt));
    const meanRT = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null;
    const total = blockTrials.length;
    const accuracy = total ? (hits.length + correctRejections.length) / total : 0;
    const hitRate = targets.length ? hits.length / targets.length : 0;
    const faRate = nonTargets.length ? falseAlarms.length / nonTargets.length : 0;

    return {
      block_n: blockTrials[0]?.block_n,
      total_trials: total,
      targets: targets.length,
      hits: hits.length,
      misses: misses.length,
      false_alarms: falseAlarms.length,
      correct_rejections: correctRejections.length,
      accuracy: accuracy,
      hit_rate: hitRate,
      false_alarm_rate: faRate,
      mean_rt_ms: meanRT,
      dprime: computeDPrime(hitRate, faRate),
    };
  }

  /** Semua trial (tanpa latihan) — dipakai untuk ringkasan akhir. */
  getAllTrials() {
    return this.trials.slice();
  }

  toCSV() {
    if (!this.trials.length) return "";
    const headers = Object.keys(this.trials[0]);
    const rows = [headers.join(",")];
    this.trials.forEach((trial) => {
      const row = headers
        .map((h) => {
          const v = trial[h];
          const s = String(v ?? "");
          return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",");
      rows.push(row);
    });
    return rows.join("\n");
  }

  toJSON() {
    return JSON.stringify(
      {
        session_metadata: {
          researcher: this.config.researcher,
          participant_name: this.config.participant_name,
          session: this.config.session,
          condition: this.config.condition,
          session_start_local: this.sessionStart,
          session_end_local: localTimestamp(),
          config: this.config,
          target_stimulus_per_block: this.targetStimPerBlock,
          timezone_offset_minutes: new Date().getTimezoneOffset(),
        },
        trials: this.trials,
        fatigue_ratings: this.fatigueRatings,
        block_markers: this.blockMarkers,
      },
      null,
      2
    );
  }

  /** Ringkasan sederhana untuk laporan otomatis setelah sesi. */
  buildReportText() {
    const lines = [];
    lines.push("LAPORAN SESI N-BACK");
    lines.push("===================");
    lines.push(`Partisipan    : ${this.config.participant_name}`);
    lines.push(`Peneliti      : ${this.config.researcher}`);
    lines.push(`Sesi/Kondisi  : ${this.config.session} / ${this.config.condition}`);
    lines.push(
      `Jenis stimulus: ${STIMULUS_TYPE_LABELS[this.config.stimulus_type] || this.config.stimulus_type}`
    );
    lines.push(
      `Parameter     : ISI ${this.config.isi_ms} ms, stimulus ${this.config.stimulus_duration_ms} ms, ` +
        `target ${Math.round(this.config.target_ratio * 100)}%, durasi blok ${this.config.block_duration_minutes} menit`
    );
    lines.push(`Mulai (lokal) : ${this.sessionStart}`);
    lines.push("");

    const nLevels = [];
    this.trials.forEach((t) => {
      if (!nLevels.includes(t.block_n)) nLevels.push(t.block_n);
    });
    nLevels.sort((a, b) => a - b);

    nLevels.forEach((n) => {
      const blockIdx = this.trials.find((t) => t.block_n === n)?.block_index;
      const s = this.getBlockSummary(blockIdx);
      lines.push(
        `Blok ${blockIdx + 1} (${n}-back): trial ${s.total_trials}, target ${s.targets}, ` +
          `hit ${s.hits}, miss ${s.misses}, false alarm ${s.false_alarms}, ` +
          `akurasi ${(s.accuracy * 100).toFixed(1)}%, hit rate ${(s.hit_rate * 100).toFixed(1)}%, ` +
          `FA rate ${(s.false_alarm_rate * 100).toFixed(1)}%, ` +
          `rata-rata RT ${s.mean_rt_ms ?? "N/A"} ms, d' ${s.dprime ?? "N/A"}`
      );
    });

    const total = this.trials.length;
    const correct = this.trials.filter((t) => t.correct === true || t.correct === "true").length;
    lines.push("");
    lines.push(`Total trial tercatat: ${total}`);
    lines.push(`Akurasi keseluruhan : ${total ? ((correct / total) * 100).toFixed(1) : 0}%`);
    lines.push("Catatan penting:");
    lines.push(
      "baris trial yang kolom respons-nya kosong berarti TIDAK ADA respons SPASI yang terekam."
    );
    lines.push(
      "Kalau peneliti yakin partisipan menekan SPASI, cek apakah fokus ada di jendela browser " +
        "(fullscreen) saat kejadian."
    );
    if (this.fatigueRatings.length) {
      lines.push("");
      lines.push("Skala kelelahan (KSS):");
      this.fatigueRatings.forEach((f) => {
        lines.push(
          `  blok ${f.block_index + 1} (${f.block_n}-back) ${f.timing === "pre" ? "sebelum" : "sesudah"}: ${f.kss_value}`
        );
      });
    }
    return lines.join("\n");
  }

  generateFilename(extension) {
    const now = new Date();
    const ts =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_` +
      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `${sanitizeFilenamePart(this.config.participant_name)}_${this.config.session}_${this.config.condition}_${ts}.${extension}`;
  }

  downloadCSV() {
    const csv = this.toCSV();
    downloadFile(csv, this.generateFilename("csv"), "text/csv");
  }

  downloadJSON() {
    const json = this.toJSON();
    downloadFile(json, this.generateFilename("json"), "application/json");
  }

  downloadReport() {
    downloadFile(
      this.buildReportText(),
      this.generateFilename("txt"),
      "text/plain"
    );
  }
}

/** Buang karakter yang tidak aman untuk nama file (spasi → "_"). */
function sanitizeFilenamePart(text) {
  return String(text || "partisipan")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_");
}

/**
 * d' (d-prime) = kemampuan membedakan target vs non-target.
 * Pakai koreksi log-linear (tambah 0,5) supaya nilai 0% atau 100% tidak error.
 */
function computeDPrime(hitRate, faRate) {
  const nTarget = 1;
  const clamp = (p) => Math.min(Math.max(p, 1 / (2 * nTarget) * 0.5), 1 - 1 / (2 * nTarget) * 0.5);
  const z = (p) => {
    // aproksimasi invers fungsi distribusi normal (Abramowitz & Stegun 26.2.23)
    const c0 = 2.515517, c1 = 0.802853, c2 = 0.010328, d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;
    const sign = p < 0.5 ? -1 : 1;
    const q = sign === 1 ? 1 - p : p;
    const t = Math.sqrt(-2 * Math.log(q));
    const num = c0 + c1 * t + c2 * t * t;
    const den = 1 + d1 * t + d2 * t * t + d3 * t * t * t;
    return sign * (t - num / den);
  };
  if (isNaN(hitRate) || isNaN(faRate)) return null;
  return Math.round((z(clamp(hitRate)) - z(clamp(faRate))) * 100) / 100;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
