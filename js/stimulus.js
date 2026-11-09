// ================================================================
// stimulus.js — Generate stimulus sequence untuk tiap blok
// ================================================================
// Dua jenis stimulus:
//   - letters / digits : satu karakter per trial (B, D, ... / 1-8)
//   - grid3x3          : kotak 3x3, satu sel menyala per trial ("r2c3")
//
// ATURAN PENTING (dipilih peneliti): TIDAK ADA kemunculan "kebetulan sama"
// yang bukan target. Kalau posisi sekarang sama dengan n langkah lalu,
// trial itu PASTI target (partisipan wajib menekan SPASI).

const GRID_SIZE = 3;

/**
 * Semua sel grid 3x3 dalam format "r{baris}c{kolom}", baris/kolom 1-3.
 * Urutan baris demi baris: r1c1..r1c3, r2c1..r2c3, r3c1..r3c3.
 */
function buildGridCells(size = GRID_SIZE) {
  const cells = [];
  for (let r = 1; r <= size; r++) {
    for (let c = 1; c <= size; c++) {
      cells.push(`r${r}c${c}`);
    }
  }
  return cells;
}

/** Ambil {row, col} dari kode sel "r2c3". Null kalau bukan format sel. */
function parseCell(code) {
  const m = /^r(\d+)c(\d+)$/.exec(code || "");
  if (!m) return null;
  return { row: parseInt(m[1], 10), col: parseInt(m[2], 10) };
}

/**
 * Generate sequence of stimuli untuk 1 blok n-back
 *
 * @param {number} n - tingkat n-back (0, 1, 2, dst)
 * @param {number} totalTrials - total trial dalam blok
 * @param {number} targetRatio - proporsi target (0-1)
 * @param {string[]} pool - kumpulan stimulus yang tersedia
 * @param {string|null} targetStim - untuk 0-back: stimulus target tetap
 *                                   (huruf / angka / kode sel). null = pool[0].
 * @returns {Array<{stimulus, isTarget, n_level, trial_index}>}
 */
function generateSequence(n, totalTrials, targetRatio, pool, targetStim = null) {
  const sequence = [];
  const numTargets = Math.round(totalTrials * targetRatio);
  const target0 = targetStim || (pool.includes("r2c2") ? "r2c2" : pool[0]);

  // Posisi target diacak; n trial pertama tidak boleh jadi target karena
  // belum punya "n langkah sebelumnya" untuk dibandingkan.
  const eligiblePositions = [];
  const minPosition = n === 0 ? 0 : n;
  for (let i = minPosition; i < totalTrials; i++) {
    eligiblePositions.push(i);
  }
  shuffleArray(eligiblePositions);
  const targetPositions = new Set(eligiblePositions.slice(0, numTargets));

  for (let i = 0; i < totalTrials; i++) {
    let stimulus;
    const isTarget = targetPositions.has(i);

    if (n === 0) {
      // 0-back: target = stimulus tetap, lainnya = apa pun selain target
      if (isTarget) {
        stimulus = target0;
      } else {
        const nonTargets = pool.filter((s) => s !== target0);
        stimulus = nonTargets[Math.floor(Math.random() * nonTargets.length)];
      }
    } else {
      const prev = sequence[i - n] ? sequence[i - n].stimulus : null;
      if (isTarget && prev) {
        stimulus = prev;
      } else {
        // Non-target WAJIB beda dari n langkah lalu (aturan anti false-target)
        const available = prev ? pool.filter((s) => s !== prev) : pool.slice();
        stimulus = available[Math.floor(Math.random() * available.length)];
      }
    }

    sequence.push({
      stimulus,
      isTarget,
      n_level: n,
      trial_index: i,
    });
  }

  return sequence;
}

/** @alias — nama alternatif, tetap kompatibel dengan pemanggilan lama */
const generateGridSequence = generateSequence;

/**
 * Rencana urutan blok berdasarkan kondisi eksperimen
 */
function planBlockOrder(nLevels, condition) {
  if (condition === "menaik") {
    return [...nLevels].sort((a, b) => a - b);
  } else if (condition === "acak") {
    const shuffled = [...nLevels];
    shuffleArray(shuffled);
    return shuffled;
  }
  return [...nLevels];
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function calculateTrialCount(blockDurationMinutes, isiMs) {
  const blockMs = blockDurationMinutes * 60 * 1000;
  return Math.floor(blockMs / isiMs);
}

/**
 * Pilih stimulus target 0-back secara acak dari pool
 * (huruf/angka: acak dari pool; grid 3x3: acak dari 9 sel)
 */
function randomTargetStimulus(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** @alias — nama lama */
const randomTargetLetter = randomTargetStimulus;
