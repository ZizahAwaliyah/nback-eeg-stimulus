function pad(n, width = 2) {
  return String(n).padStart(width, "0");
}

function localTimestamp(dateObj = new Date()) {
  const d = dateObj;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  );
}