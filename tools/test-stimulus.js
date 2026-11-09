// Uji logika generateSequence untuk mode kotak 3x3 (dijalankan di Node, tanpa browser).
const fs = require("fs");
const path = "C:/Documents/RPL/nback-eeg-stimulus/js/stimulus.js";
const src = fs.readFileSync(path, "utf8");
eval(src);

function check(n, totalTrials, ratio, label) {
  const pool = buildGridCells(3);
  let targetMismatch = 0, accidentalRepeat = 0, targetCount = 0, firstNTargets = 0;
  const RUNS = 200;
  for (let r = 0; r < RUNS; r++) {
    const seq = generateSequence(n, totalTrials, ratio, pool, null);
    // 1) Semua target harus sama dengan n langkah sebelumnya
    for (let i = 0; i < seq.length; i++) {
      if (seq[i].isTarget) {
        targetCount++;
        if (n > 0 && (i < n || seq[i].stimulus !== seq[i - n].stimulus)) targetMismatch++;
        if (n === 0) { /* 0-back: target = stim tetap, tidak dibandingkan */ }
      } else if (n > 0 && i >= n && seq[i].stimulus === seq[i - n].stimulus) {
        accidentalRepeat++; // non-target tapi posisinya sama = TIDAK BOLEH ADA
      }
    }
    // 2) n trial pertama tidak boleh jadi target
    for (let i = 0; i < n; i++) if (seq[i].isTarget) firstNTargets++;
  }
  const expectedPerBlock = Math.round(totalTrials * ratio);
  console.log(
    `${label}: target/run=${expectedPerBlock}, ` +
    `target yang tidak cocok dengan n-lalu=${targetMismatch}, ` +
    `kemunculan ulang tak bertarget=${accidentalRepeat}, ` +
    `target di n trial pertama=${firstNTargets}`
  );
}

check(1, 120, 0.25, "1-back (120 trial)");
check(2, 120, 0.25, "2-back (120 trial)");
check(3, 120, 0.25, "3-back (120 trial)");
check(0, 120, 0.25, "0-back (120 trial)");

// 3) Cek distribusi posisi: pastikan tidak selalu sel yang sama
const pool = buildGridCells(3);
const seq = generateSequence(2, 120, 0.25, pool, null);
const counts = {};
seq.forEach((t) => { counts[t.stimulus] = (counts[t.stimulus] || 0) + 1; });
console.log("Sebaran 9 sel pada 1 blok 2-back:", JSON.stringify(counts));
console.log("Jumlah sel terpakai:", Object.keys(counts).length, "dari 9");
console.log("Urutan 20 trial pertama:", seq.slice(0, 20).map((t) => t.stimulus + (t.isTarget ? "*" : "")).join(" "));
