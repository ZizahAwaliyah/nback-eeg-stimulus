# N-Back EEG Stimulus Platform

Platform stimulus N-back untuk pengumpulan data EEG. Dirancang untuk digunakan bersama oleh tim peneliti dengan desain penelitian yang mirip.

## Fitur

- Vanilla HTML/CSS/JavaScript, tidak butuh backend
- Sistem preset per peneliti untuk mempercepat setup rekaman
- Parameter eksperimen fleksibel (tingkat N, durasi blok, ISI, dll)
- Log respons lengkap dengan waktu reaksi
- Skala kelelahan KSS 1-9 (opsional, per blok)
- Countdown 3-2-1 sebagai penanda sinkron dengan Mind Monitor
- Ekspor data ke CSV dan JSON

## Struktur Repository

```
nback-eeg-stimulus/
├── index.html            # halaman utama
├── css/
│   └── style.css
├── js/
│   ├── config.js         # preset & konfigurasi
│   ├── stimulus.js       # generate stimulus sequence
│   ├── logger.js         # pencatatan data
│   ├── experiment.js     # eksekusi blok
│   └── main.js           # orchestrator
├── presets/
│   ├── azizah.json       # preset per peneliti
│   └── template.json
├── vercel.json           # config deploy
└── README.md
```

## Menjalankan di Lokal

Karena web memuat file JSON dari folder `presets/`, browser modern akan **memblokir fetch** kalau file HTML dibuka langsung (`file://`). Kamu harus menjalankan server lokal sederhana.

### Opsi 1: Python (paling praktis)

```bash
cd nback-eeg-stimulus
python3 -m http.server 8000
```

Lalu buka browser di `http://localhost:8000`.

### Opsi 2: Node.js

```bash
npx serve
```

### Opsi 3: VS Code Live Server extension

Klik kanan `index.html` → "Open with Live Server".

## Deploy ke Vercel

1. Push repo ini ke GitHub.
2. Buka [vercel.com](https://vercel.com) dan login dengan akun GitHub.
3. Klik **Add New Project** → pilih repo ini.
4. Klik **Deploy** (tidak perlu konfigurasi tambahan, `vercel.json` sudah disiapkan).
5. Selesai! URL akan otomatis dibuatkan.

Setiap kali kamu push ke branch `main`, Vercel akan otomatis re-deploy.

## Cara Pakai untuk Peneliti Baru

### 1. Buat File Preset

Salin `presets/template.json` menjadi `presets/[nama-kamu].json`. Contoh:

```bash
cp presets/template.json presets/rina.json
```

Edit isinya sesuai desain penelitianmu:

```json
{
  "researcher": "Rina Yuliana",
  "n_levels": [1, 2, 3],
  "block_duration_minutes": 4,
  "isi_ms": 2000,
  "stimulus_duration_ms": 400,
  "target_ratio": 0.30,
  "stimulus_type": "digits",
  "enable_fatigue_scale": false
}
```

### 2. Daftarkan Preset ke Dropdown

Edit `js/config.js`, tambahkan preset kamu ke `AVAILABLE_PRESETS`:

```javascript
const AVAILABLE_PRESETS = [
  { id: "azizah", name: "Azizah (0/1/2-back, 5 menit)", file: "presets/azizah.json" },
  { id: "rina", name: "Rina (1/2/3-back, 4 menit)", file: "presets/rina.json" },
  { id: "template", name: "Template Kosong", file: "presets/template.json" },
];
```

### 3. Commit & Push

```bash
git add presets/rina.json js/config.js
git commit -m "Add preset for Rina"
git push
```

Vercel akan re-deploy otomatis.

## Parameter Preset

| Field | Tipe | Contoh | Keterangan |
|-------|------|--------|-----------|
| `researcher` | string | "Azizah" | Nama peneliti (masuk ke log CSV) |
| `n_levels` | array | `[0, 1, 2]` | Tingkat N yang akan diuji |
| `block_duration_minutes` | number | 5 | Durasi tiap blok dalam menit |
| `isi_ms` | number | 2500 | Interstimulus interval dalam ms |
| `stimulus_duration_ms` | number | 500 | Berapa lama stimulus muncul di layar |
| `target_ratio` | number | 0.25 | Proporsi target (0-1) |
| `stimulus_type` | string | "letters" | "letters" atau "digits" |
| `enable_fatigue_scale` | boolean | true | Aktifkan skala kelelahan KSS |

## Alur Eksperimen

1. **Setup** — pilih preset, isi identitas partisipan/sesi/kondisi
2. **Instruksi** — layar penjelasan tugas untuk partisipan
3. **Skala Kelelahan (opsional)** — KSS 1-9 sebelum blok
4. **Countdown 3-2-1** — penanda waktu untuk sinkron Mind Monitor
5. **Blok Eksperimen** — stimulus muncul, partisipan tekan SPASI jika cocok
6. **Skala Kelelahan (opsional)** — KSS 1-9 sesudah blok
7. **Ulang** langkah 2-6 untuk tiap tingkat N
8. **Ringkasan Kinerja & Download CSV**

## Sinkronisasi dengan Mind Monitor

Web menggunakan **timestamp-based synchronization** (Opsi 2 dari diskusi awal).

### Sebelum Rekaman

1. Pastikan **jam laptop dan HP (Mind Monitor)** sudah sinkron via NTP.
   - macOS/Linux: biasanya otomatis
   - Windows: Settings → Time & Language → aktifkan "Set time automatically"
   - Android: Settings → System → Date & time → aktifkan "Use network-provided time"

2. Mulai rekam di Mind Monitor **sebelum** menjalankan web.

### Selama Countdown

Layar countdown menampilkan pesan:
> **Tap tombol Marker di Mind Monitor bersamaan dengan angka 1**

Peneliti (bukan partisipan) menekan Marker di Mind Monitor tepat saat countdown menunjukkan angka 1. Ini menciptakan penanda waktu yang mudah dicocokkan saat analisis.

### Saat Analisis

File CSV dari web berisi kolom `timestamp_iso` untuk setiap trial. File CSV dari Mind Monitor berisi kolom `TimeStamp`. Cocokkan keduanya berdasarkan waktu blok mulai/selesai.

Contoh Python:
```python
import pandas as pd

web_log = pd.read_csv("P01_S1_menaik_2026-09-28T09-15-30.csv")
eeg_log = pd.read_csv("MuseS_2026-09-28--09-15-15.csv")

# Ambil blok pertama dari web log
block1 = web_log[web_log["block_index"] == 0]
block1_start = pd.to_datetime(block1["timestamp_iso"].min())
block1_end = pd.to_datetime(block1["timestamp_iso"].max())

# Segmentasi EEG berdasarkan waktu
eeg_log["TimeStamp"] = pd.to_datetime(eeg_log["TimeStamp"])
eeg_block1 = eeg_log[(eeg_log["TimeStamp"] >= block1_start) & (eeg_log["TimeStamp"] <= block1_end)]
```

## Format File Output

### CSV (respons trial-level)

Kolom yang tersedia:
- `timestamp_iso` — waktu stimulus muncul (ISO 8601 UTC)
- `researcher` — nama peneliti
- `participant_id` — kode partisipan
- `session` — S1 atau S2
- `condition` — menaik atau acak
- `block_index` — indeks blok (0, 1, 2, ...)
- `block_n` — tingkat N blok ini
- `trial_num` — nomor trial dalam blok
- `stimulus` — huruf/angka yang muncul
- `is_target` — true/false apakah trial ini target
- `response` — spacebar atau kosong
- `response_ts` — waktu respons (ISO 8601)
- `reaction_time_ms` — waktu reaksi dari onset stimulus
- `correct` — true/false

### JSON (data lengkap termasuk skala kelelahan & marker blok)

Format:
```json
{
  "session_metadata": { ... },
  "trials": [ ... ],
  "fatigue_ratings": [ ... ],
  "block_markers": [ ... ]
}
```

## Kolaborasi

Repo ini di-maintain oleh 4 peneliti EEG UNHAS:
- Azizah Awaliyah — Deteksi kontaminasi urutan
- (Nama peneliti 2)
- (Nama peneliti 3)
- (Nama peneliti 4)

Silakan buka pull request untuk perbaikan bug atau fitur baru.

## Lisensi

Repository ini bersifat internal untuk keperluan penelitian Lab AIMP, Teknik Informatika, Universitas Hasanuddin.
