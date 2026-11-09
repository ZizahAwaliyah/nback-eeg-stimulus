import json, subprocess, tempfile, time, urllib.request, websocket, sys

sys.stdout.reconfigure(encoding='utf-8')

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
prof = tempfile.mkdtemp()
p = subprocess.Popen([CHROME, "--headless=new", "--remote-debugging-port=9462",
                      f"--user-data-dir={prof}", "--no-first-run", "--disable-gpu",
                      "--remote-allow-origins=*", "http://127.0.0.1:8080/nback-3x3.html"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3)

tabs = json.load(urllib.request.urlopen("http://127.0.0.1:9462/json"))
page = [t for t in tabs if "127.0.0.1:8080" in t.get("url", "")][0]
ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=30)
i = [0]

def send_cmd(method, params=None):
    i[0] += 1
    ws.send(json.dumps({"id": i[0], "method": method, "params": params or {}}))
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == i[0]:
            return r

send_cmd("Console.enable")
send_cmd("Runtime.enable")

def ev(expr):
    res = send_cmd("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    result = res.get("result", {})
    if result.get("exceptionDetails"):
        return "EXC: " + str(result["exceptionDetails"])
    return result.get("result", {}).get("value")

# Konfigurasi aktif
ev("""
  activeConfig = {
    researcher: 'Mutiah Arinil',
    participant_name: 'TEST01',
    session: 'S1',
    condition: 'menaik',
    n_levels: [0, 1],
    block_duration_minutes: 1,
    isi_ms: 500,
    stimulus_duration_ms: 250,
    target_ratio: 0.35,
    stimulus_type: 'grid3x3',
    enable_click_response: true
  };
  totalTrials = 6;
  isiMs = 500;
  stimDurationMs = 250;
  blockOrder = [0, 1];
  currentBlockIndex = 0;
  currentN = 0;
  experimentLogger = new ExperimentLogger(activeConfig);
""")

print("=== Menjalankan Blok 1: 0-Back Ground Truth (6 Trial) ===")
ev("setPhase('real_test')")

for t in range(6):
    time.sleep(0.06)
    # Cek apakah trial ini target (kotak tengah / index 4)
    targetPos = ev("sequence[currentTrial - 1]")
    if targetPos == 4:
        # Simulasi subjek menekan SPASI dengan RT ~210ms
        time.sleep(0.12)
        ev("recordMatch('spacebar')")
    time.sleep(0.35)

time.sleep(0.4)
print("Hasil Blok 0-Back:", ev("document.getElementById('feedback-display')?.innerText.split('\\n')[0]"))

print("\n=== Menjalankan Blok 2: 1-Back (6 Trial) ===")
ev("""
  currentBlockIndex = 1;
  currentN = 1;
  totalTrials = 6;
  isiMs = 500;
  stimDurationMs = 250;
  setPhase('real_test');
""")

for t in range(6):
    time.sleep(0.06)
    currIdx = ev("currentTrial - 1")
    seq = ev("sequence")
    if currIdx >= 1 and seq[currIdx] == seq[currIdx - 1]:
        # Simulasi subjek menekan SPASI saat 1-back cocok
        time.sleep(0.13)
        ev("recordMatch('spacebar')")
    time.sleep(0.35)

time.sleep(0.4)
print("Hasil Blok 1-Back:", ev("document.getElementById('feedback-display')?.innerText.split('\\n')[0]"))

csv = ev("experimentLogger.toCSV()")
ws.close()
p.terminate()

print("\n=== OUTPUT LENGKAP CSV HASIL EKSPERIMEN ===")
print(csv)
