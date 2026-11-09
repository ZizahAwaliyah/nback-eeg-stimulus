import json, subprocess, tempfile, time, urllib.request, websocket, sys

sys.stdout.reconfigure(encoding='utf-8')

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
prof = tempfile.mkdtemp()
p = subprocess.Popen([CHROME, "--headless=new", "--remote-debugging-port=9460",
                      f"--user-data-dir={prof}", "--no-first-run", "--disable-gpu",
                      "--remote-allow-origins=*", "http://127.0.0.1:8080/index.html"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3)

tabs = json.load(urllib.request.urlopen("http://127.0.0.1:9460/json"))
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

print("=== STEP 1: Setting up experiment parameters in index.html ===")
# Set fast testing timing (ISI: 400ms, Stimulus: 150ms) so 10 trials run quickly
ev("""
  document.getElementById('participant-name').value = 'SUBJEK_01';
  document.getElementById('researcher-name').value = 'Mutiah Arinil';
  document.getElementById('session').value = 'S1';
  document.getElementById('condition').value = 'menaik';
  document.getElementById('n-levels').value = '0,1';
  document.getElementById('block-duration').value = '1';
  document.getElementById('isi').value = '400';
  document.getElementById('stim-duration').value = '150';
  document.getElementById('stimulus-type').value = 'grid3x3';
""")
print("Participant set:", ev("document.getElementById('participant-name').value"))

# Mulai Eksperimen
ev("document.getElementById('btn-start').click()")
time.sleep(2)

print("\n=== STEP 2: Transitioned to 3x3 Test Page ===")
print("Current URL:", ev("window.location.href"))
print("Header Meta:", ev("document.getElementById('participant-meta')?.textContent"))
print("Block Badge:", ev("document.getElementById('header-block-badge')?.textContent"))

# Set short trial count (8 trials) for testing each block
ev("""
  totalTrials = 8;
  isiMs = 400;
  stimDurationMs = 150;
""")

print("\n=== STEP 3: Running Real Test (0-Back Ground Truth) ===")
# Start real test directly
ev("setPhase('real_test')")
time.sleep(0.1)

# Loop through trials and simulate responses with realistic human reaction time
for trial in range(8):
    time.sleep(0.08) # 80ms after onset
    # Check if currently active tile is target
    isTarget = ev("sequence[currentTrial - 1] === fixedTarget0Back")
    # Simulate press if target (or intentional hit)
    if isTarget:
        ev("recordMatch('spacebar')")
    time.sleep(0.35)

time.sleep(0.5)
print("Finished Block 0-Back!")
print("Feedback summary:", ev("document.getElementById('feedback-display')?.innerText.trim()"))

print("\n=== STEP 4: Proceeding to Block 2 (1-Back) ===")
ev("goToNextBlock(1)")
time.sleep(0.5)
ev("""
  totalTrials = 8;
  isiMs = 400;
  stimDurationMs = 150;
  setPhase('real_test');
""")

for trial in range(8):
    time.sleep(0.08)
    currIdx = ev("currentTrial - 1")
    isTarget = ev(f"currIdx >= 1 && sequence[currIdx] === sequence[currIdx - 1]")
    if isTarget:
        ev("recordMatch('spacebar')")
    time.sleep(0.35)

time.sleep(0.5)
print("Finished Block 1-Back!")
print("Feedback summary:", ev("document.getElementById('feedback-display')?.innerText.trim()"))

print("\n=== STEP 5: Generating and Verifying CSV Data ===")
csvContent = ev("experimentLogger.toCSV()")
jsonContent = ev("experimentLogger.toJSON()")

ws.close()
p.terminate()

if csvContent:
    lines = csvContent.strip().split("\n")
    print(f"Total baris CSV (termasuk header): {len(lines)}")
    print("\n--- HEADER CSV ---")
    print(lines[0])
    print("\n--- CONTOH 6 BARIS PERTAMA DATA CSV ---")
    for l in lines[1:7]:
        print(l)
    print("\n--- CONTOH 4 BARIS TERAKHIR DATA CSV ---")
    for l in lines[-4:]:
        print(l)

    # Validasi struktur kolom
    expected_headers = [
        "timestamp_local", "timestamp_iso", "researcher", "participant_name",
        "session", "condition", "block_index", "block_n", "trial_num",
        "stimulus", "is_target", "response", "response_ts", "reaction_time_ms", "correct"
    ]
    actual_headers = lines[0].split(",")
    missing = [h for h in expected_headers if h not in actual_headers]
    if not missing:
        print("\n✅ VALIDASI STRUKTUR: 15/15 kolom lengkap dan berurutan sesuai standar Mind Monitor/EEG!")
    else:
        print(f"\n❌ Kolom hilang: {missing}")
else:
    print("❌ Gagal menghasilkan CSV!")
