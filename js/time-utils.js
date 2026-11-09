// ================================================================
// time-utils.js — util waktu untuk log & sinkronisasi Mind Monitor
// ================================================================

function pad(n, width = 2) {
  return String(n).padStart(width, "0");
}

// Waktu LOKAL laptop, format sama dengan Mind Monitor:
// "YYYY-MM-DD HH:MM:SS.mmm"
function localTimestamp(dateObj = new Date()) {
  const d = dateObj;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  );
}

// Waktu UTC ISO 8601 ("2026-11-02T06:28:03.811Z") untuk kolom timestamp_iso.
// Berguna kalau data digabung lintas mesin / zona waktu.
function isoTimestamp(dateObj = new Date()) {
  return dateObj.toISOString();
}
