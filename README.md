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
│   ├── irgi.json
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
| `stimulus_type` | string | "letters" | "letters", "digits", atau "grid3x3" |
| `enable_fatigue_scale` | boolean | true | Aktifkan skala kelelahan KSS |
| `condition` | string | "menaik" | Urutan blok: "menaik" atau "acak" |
| `enable_practice` | boolean | true | Aktifkan latihan (data latihan tidak dicatat) |
| `practice_trials` | number | 15 | Trial latihan per tingkat. `0` = sepanjang blok sebenarnya |
| `practice_placement` | string | "before_session" | `"per_block"` = latihan tepat sebelum tiap blok; `"before_session"` = semua latihan di awal sesi |
| `rest_seconds` | number | 120 | Istirahat terhitung mundur di antara blok. `0` = tanpa timer |
| `dark_theme` | boolean | true | Latar abu-abu gelap selama sesi |
| `show_fixation` | boolean | true | Tanda `+` di tengah layar di antara stimulus (huruf/angka) |
| `hide_block_feedback` | boolean | true | Skor per blok tidak diperlihatkan ke partisipan (tetap ada di layar akhir dan berkas) |
| `minimal_block_screen` | boolean | true | Saat blok, sembunyikan timer, nomor trial, dan teks bawah |
| `lead_in_ms` | number | 1000 | Jeda tanda `+` sesudah hitung mundur, sebelum stimulus pertama (latihan & blok). `0` = stimulus langsung muncul. Penanda `start` blok tetap dicatat sesaat setelah hitung mundur |
| `autosave_per_block` | boolean | true | Simpan satu CSV setiap blok selesai ke `Data/<nama>_<DD-MM-YYYY>/` di folder yang dipilih di layar setup (Chrome/Edge). Kolom CSV sama dengan CSV gabungan |

Opsi tambahan di atas default-nya mati (`false`/`0`/`"per_block"`), jadi preset lama berperilaku sama seperti sebelumnya. Semuanya juga bisa diubah di kartu **4. Opsi Tambahan** di layar setup.

## Alur Eksperimen

1. **Setup** — pilih preset, isi identitas partisipan/sesi/kondisi
2. **Latihan awal (opsional, `practice_placement: "before_session"`)** — instruksi + latihan untuk tiap tingkat, berurutan
3. **Instruksi** — layar penjelasan tugas untuk partisipan (mulai blok ke-2, digabung dengan hitung mundur istirahat bila `rest_seconds` > 0)
4. **Latihan (opsional, `practice_placement: "per_block"`)**
5. **Skala Kelelahan (opsional)** — KSS 1-9 sebelum blok
6. **Countdown 3-2-1** — penanda waktu untuk sinkron Mind Monitor; untuk 0-back sekaligus menampilkan huruf sasaran
7. **Blok Eksperimen** — stimulus muncul, partisipan tekan SPASI jika cocok
8. **Ringkasan blok** (dilewati bila `hide_block_feedback`) dan **Skala Kelelahan** sesudah blok (opsional)
9. **Ulang** langkah 3-8 untuk tiap tingkat N
10. **Ringkasan Kinerja & Download CSV**

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

Pakai kolom **`timestamp_local`**, bukan `timestamp_iso`. `timestamp_local` adalah jam lokal laptop dengan format yang sama dengan kolom `TimeStamp` Mind Monitor (`YYYY-MM-DD HH:MM:SS.mmm`). `timestamp_iso` adalah jam UTC (berakhiran `Z`); kalau dibandingkan langsung dengan `TimeStamp` Mind Monitor hasilnya meleset sebanyak selisih zona waktu, dan pandas menolak membandingkan waktu yang punya zona dengan yang tidak.

Batas blok paling tepat diambil dari `block_markers` di berkas JSON (event `start` dan `end`), karena trial terakhir baru berakhir satu ISI setelah stimulusnya muncul.

Contoh Python:
```python
import json
import pandas as pd

with open("Budi_S1_menaik_20260928_091530.json") as f:
    sesi = json.load(f)
eeg = pd.read_csv("mindMonitor_2026-09-28--09-15-15.csv")
eeg["TimeStamp"] = pd.to_datetime(eeg["TimeStamp"])

markers = pd.DataFrame(sesi["block_markers"])
markers["timestamp"] = pd.to_datetime(markers["timestamp"])

for blok, m in markers.groupby("block_index"):
    mulai = m.loc[m["event"] == "start", "timestamp"].iloc[0]
    selesai = m.loc[m["event"] == "end", "timestamp"].iloc[0]
    n = m["block_n"].iloc[0]
    eeg_blok = eeg[(eeg["TimeStamp"] >= mulai) & (eeg["TimeStamp"] < selesai)]
    print(f"blok {blok} ({n}-back): {len(eeg_blok)} baris EEG")
```

Kalau hanya punya CSV, `timestamp_local` trial pertama tiap blok adalah waktu stimulus pertama muncul:
```python
web = pd.read_csv("Budi_S1_menaik_20260928_091530.csv")
web["timestamp_local"] = pd.to_datetime(web["timestamp_local"])
mulai_blok = web.groupby("block_index")["timestamp_local"].min()
```

## Format File Output

### CSV (respons trial-level)

Kolom yang tersedia (urutan sesuai berkas):
- `timestamp_local` — waktu stimulus muncul, jam lokal laptop, format sama dengan `TimeStamp` Mind Monitor
- `timestamp_iso` — waktu yang sama dalam UTC (ISO 8601, berakhiran `Z`)
- `researcher` — nama peneliti
- `participant_name` — nama partisipan
- `session` — S1 atau S2
- `condition` — menaik atau acak
- `block_index` — indeks blok (0, 1, 2, ...)
- `block_n` — tingkat N blok ini
- `trial_num` — nomor trial dalam blok
- `stimulus` — huruf/angka yang muncul
- `is_target` — true/false apakah trial ini target
- `response` — `spacebar`, `click`, atau kosong
- `response_ts` — waktu respons, jam lokal laptop (format sama dengan `timestamp_local`)
- `reaction_time_ms` — waktu reaksi dari onset stimulus
- `correct` — true/false

### JSON (data lengkap termasuk skala kelelahan & marker blok)

Format:
```json
{
  "session_metadata": { ... },
  "trials": [ ... ],
  "fatigue_ratings": [ ... ],
  "block_markers": [ ... ],
  "rest_periods": [ ... ]
}
```

`session_metadata.target_stimulus_per_block` mencatat huruf sasaran tiap blok 0-back. `rest_periods` mencatat awal dan akhir istirahat antarblok (kosong kalau `rest_seconds` = 0).

## Kolaborasi

Repo ini di-maintain oleh 4 peneliti EEG UNHAS:
- Azizah Awaliyah — Deteksi kontaminasi urutan
- (Nama peneliti 2)
- (Nama peneliti 3)
- (Nama peneliti 4)

Silakan buka pull request untuk perbaikan bug atau fitur baru.

## Lisensi

Repository ini bersifat internal untuk keperluan penelitian Lab AIMP, Teknik Informatika, Universitas Hasanuddin.
