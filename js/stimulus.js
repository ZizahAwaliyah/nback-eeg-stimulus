// ================================================================
// stimulus.js — Generate stimulus sequence untuk tiap blok
// ================================================================
// Perubahan: target letter 0-back BISA DIKUSTOMISASI (bukan selalu pool[0])

/**
 * Generate sequence of stimuli untuk 1 blok n-back
 *
 * @param {number} n - tingkat n-back (0, 1, 2, dst)
 * @param {number} totalTrials - total trial dalam blok
 * @param {number} targetRatio - proporsi target (0-1)
 * @param {string[]} pool - kumpulan stimulus yang tersedia
 * @param {string|null} targetLetter - untuk 0-back: huruf target (kalau null, pakai pool[0])
 * @returns {Array<{stimulus, isTarget, n_level, trial_index}>}
 */
function generateSequence(n, totalTrials, targetRatio, pool, targetLetter = null) {
  const sequence = [];
  const numTargets = Math.round(totalTrials * targetRatio);
  const target0 = targetLetter || pool[0];

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
      if (isTarget) {
        stimulus = target0;
      } else {
        const nonTargets = pool.filter((s) => s !== target0);
        stimulus = nonTargets[Math.floor(Math.random() * nonTargets.length)];
      }
    } else {
      if (isTarget && sequence[i - n]) {
        stimulus = sequence[i - n].stimulus;
      } else {
        const forbidden = sequence[i - n] ? sequence[i - n].stimulus : null;
        const available = pool.filter((s) => s !== forbidden);
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
 * Pilih huruf target 0-back secara acak dari pool
 */
function randomTargetLetter(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}
