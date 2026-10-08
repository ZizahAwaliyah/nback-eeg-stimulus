// ================================================================
// logger.js — Pencatatan data dan ekspor ke CSV/JSON
// ================================================================
// Perubahan: timestamp pakai waktu lokal (format sama dengan Mind Monitor)

class ExperimentLogger {
  constructor(config) {
    this.config = config;
    this.sessionStart = localTimestamp();
    this.trials = [];
    this.fatigueRatings = [];
    this.blockMarkers = [];
    this.targetLetterPerBlock = {}; // untuk 0-back: catat target letter per blok
  }

  logTrial(trial) {
    this.trials.push({
      timestamp_local: trial.stim_onset_ts,
      researcher: this.config.researcher,
      participant_id: this.config.participant_id,
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

  setTargetLetter(blockIndex, letter) {
    this.targetLetterPerBlock[blockIndex] = letter;
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
    };
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
          participant_id: this.config.participant_id,
          session: this.config.session,
          condition: this.config.condition,
          session_start_local: this.sessionStart,
          session_end_local: localTimestamp(),
          config: this.config,
          target_letter_per_block: this.targetLetterPerBlock,
        },
        trials: this.trials,
        fatigue_ratings: this.fatigueRatings,
        block_markers: this.blockMarkers,
      },
      null,
      2
    );
  }

  generateFilename(extension) {
    const now = new Date();
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_` +
               `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `${this.config.participant_id}_${this.config.session}_${this.config.condition}_${ts}.${extension}`;
  }

  downloadCSV() {
    const csv = this.toCSV();
    downloadFile(csv, this.generateFilename("csv"), "text/csv");
  }

  downloadJSON() {
    const json = this.toJSON();
    downloadFile(json, this.generateFilename("json"), "application/json");
  }
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
