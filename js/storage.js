// ================================================================
// storage.js — Simpan berkas langsung ke folder di laptop (Chrome/Edge)
// ================================================================
// Struktur folder:
//   <lokasi yang dipilih peneliti>/Data/<nama responden>_<DD-MM-YYYY>/
//     <nama>_<sesi>_<HH.MM>_blok1_0-back.csv      ← disimpan otomatis tiap blok selesai
//     <nama>_<sesi>_<HH.MM>_semua-blok.csv        ← tombol simpan di akhir sesi
//     <nama>_<sesi>_<HH.MM>.json / _laporan.txt / CHECKLIST_DOKUMENTASI.txt
//
// Lokasi folder dipilih sekali lewat showDirectoryPicker dan diingat di IndexedDB,
// sehingga sesi berikutnya cukup memberi izin ulang (klik "Mulai Eksperimen").
// Isi CSV per blok = kolom & urutan yang sama dengan CSV gabungan.

let dataRootHandle = null;       // folder induk pilihan peneliti (berisi / akan berisi "Data")
let participantDirHandle = null; // Data/<nama>_<tanggal>/ untuk sesi yang sedang berjalan
let sessionFileBase = null;      // <nama>_<sesi>_<HH.MM>
let participantFolderLabel = null;
const autosaveLog = [];          // { label, file, ok, error } untuk ditampilkan di layar hasil

function folderPickerSupported() {
  return typeof window.showDirectoryPicker === "function";
}

// ---------- IndexedDB kecil untuk mengingat folder ----------

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("nback-eeg-storage", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("handles");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const req = db.transaction("handles").objectStore("handles").get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("handles", "readwrite");
    tx.objectStore("handles").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Memilih & mengizinkan folder ----------

async function restoreDataRoot() {
  if (!folderPickerSupported()) return;
  try {
    dataRootHandle = await idbGet("dataRoot");
  } catch (err) {
    console.warn("Tidak bisa membaca folder tersimpan:", err);
  }
  updateDataRootLabel();
}

async function pickDataRoot() {
  if (!folderPickerSupported()) return;
  try {
    dataRootHandle = await window.showDirectoryPicker({ id: "nback-data", mode: "readwrite" });
    try {
      await idbSet("dataRoot", dataRootHandle);
    } catch (err) {
      console.warn("Folder tidak bisa diingat untuk sesi berikutnya:", err);
    }
  } catch (err) {
    if (err?.name !== "AbortError") alert(`Gagal memilih folder: ${err.message}`);
  }
  updateDataRootLabel();
  if (typeof updateSetupSummary === "function") updateSetupSummary();
}

/** Harus dipanggil langsung dari klik (sebelum await lain) supaya browser mau meminta izin. */
async function ensureDataRootPermission() {
  if (!dataRootHandle) return false;
  const opts = { mode: "readwrite" };
  try {
    if ((await dataRootHandle.queryPermission(opts)) === "granted") return true;
    return (await dataRootHandle.requestPermission(opts)) === "granted";
  } catch (err) {
    console.warn("Izin folder gagal:", err);
    return false;
  }
}

function updateDataRootLabel() {
  const label = document.getElementById("data-root-label");
  if (!label) return;
  if (!folderPickerSupported()) {
    label.textContent = "Browser ini tidak mendukung. Pakai Chrome atau Edge.";
    return;
  }
  label.textContent = dataRootHandle ? `${dataRootHandle.name}/Data/` : "Belum dipilih";
}

// ---------- Nama folder & berkas ----------

function participantFolderName(name, date = new Date()) {
  const tgl = `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
  return `${sanitizeFilenamePart(name || "partisipan")}_${tgl}`;
}

function buildSessionFileBase(config, date = new Date()) {
  return `${sanitizeFilenamePart(config.participant_name)}_${config.session}_${pad(date.getHours())}.${pad(date.getMinutes())}`;
}

function blockCsvFilename(blockIndex, n) {
  const base = sessionFileBase || (currentConfig ? buildSessionFileBase(currentConfig) : "data");
  return `${base}_blok${blockIndex + 1}_${n}-back.csv`;
}

/** Buat Data/<nama>_<tanggal>/ di folder induk. Dipanggil sekali saat sesi dimulai. */
async function prepareParticipantFolder(config) {
  const dataDir = await dataRootHandle.getDirectoryHandle("Data", { create: true });
  const folder = participantFolderName(config.participant_name);
  participantDirHandle = await dataDir.getDirectoryHandle(folder, { create: true });
  participantFolderLabel = `${dataRootHandle.name}/Data/${folder}`;
  return participantDirHandle;
}

async function writeFileToFolder(dirHandle, filename, content) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

// ---------- CSV per blok ----------

/** Simpan otomatis CSV satu blok. Tidak pernah melempar error ke alur sesi. */
async function autosaveBlock(blockIndex) {
  if (!currentConfig?.autosave_per_block || !participantDirHandle) return;
  const n = blockOrder[blockIndex];
  const file = blockCsvFilename(blockIndex, n);
  const entry = { kind: "block", label: `Blok ${blockIndex + 1} · ${n}-back`, file, ok: false, error: null };
  try {
    await writeFileToFolder(participantDirHandle, file, currentLogger.toCSV(currentLogger.getBlockTrials(blockIndex)));
    entry.ok = true;
  } catch (err) {
    entry.error = err.message;
    console.error("Simpan otomatis gagal:", err);
  }
  // Blok yang diulang menimpa berkas yang sama; catatan statusnya juga diganti.
  const prev = autosaveLog.findIndex((e) => e.file === file);
  if (prev >= 0) autosaveLog.splice(prev, 1, entry);
  else autosaveLog.push(entry);
}

/** Tombol "CSV satu tingkat saja" di layar hasil: ke folder sesi kalau ada, kalau tidak diunduh. */
async function saveSingleBlockCsv(blockIndex) {
  const n = blockOrder[blockIndex];
  const file = blockCsvFilename(blockIndex, n);
  const csv = currentLogger.toCSV(currentLogger.getBlockTrials(blockIndex));
  if (!csv) {
    alert(`Blok ${blockIndex + 1} belum berisi data.`);
    return;
  }
  if (participantDirHandle) {
    try {
      await writeFileToFolder(participantDirHandle, file, csv);
      setExportStatus(`Tersimpan: ${participantFolderLabel}/${file}`);
      return;
    } catch (err) {
      console.warn("Gagal menulis ke folder, beralih ke unduhan:", err);
    }
  }
  downloadFile(csv, file, "text/csv");
}

function setExportStatus(text) {
  const el = document.getElementById("autosave-status");
  if (!el) return;
  el.insertAdjacentHTML("beforeend", `<li class="issue-ok"><span aria-hidden="true">✓</span>${escapeHtml(text)}</li>`);
}

/** Isi tombol per tingkat + status simpan otomatis di layar hasil. */
function renderExportPanel() {
  const box = document.getElementById("per-block-export");
  if (box) {
    box.innerHTML = blockOrder
      .map((n, idx) => `<button type="button" class="btn-secondary btn-small" data-block="${idx}">${n}-back</button>`)
      .join("");
    box.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => saveSingleBlockCsv(parseInt(b.dataset.block, 10)))
    );
  }
  const folderName = document.getElementById("doc-folder-name");
  if (folderName && participantFolderLabel) folderName.textContent = participantFolderLabel;

  const status = document.getElementById("autosave-status");
  if (status) {
    status.innerHTML = autosaveLog
      .map((e) =>
        e.ok
          ? `<li class="issue-ok"><span aria-hidden="true">✓</span>${escapeHtml(e.label)} tersimpan otomatis: ${escapeHtml(e.file)}</li>`
          : `<li class="issue-error"><span aria-hidden="true">!</span>${escapeHtml(e.label)} GAGAL disimpan otomatis (${escapeHtml(e.error)}). Simpan manual lewat tombol di atas.</li>`
      )
      .join("");
    if (participantFolderLabel && autosaveLog.length) {
      status.insertAdjacentHTML("afterbegin", `<li class="issue-info"><span aria-hidden="true">i</span>Folder: ${escapeHtml(participantFolderLabel)}</li>`);
    }
  }
}
